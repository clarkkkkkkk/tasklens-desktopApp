//! Minimal HTTP/1.1 client for the TaskLens-managed llama.cpp server.
//!
//! It accepts only a port: the address is hard-coded to IPv4 loopback, there is no DNS,
//! TLS or redirect handling, so this module cannot reach any host other than this computer.
use std::{
    io::{self, BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpStream},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

pub const CANCELLED_IO: &str = "tasklens-cancelled";

struct Cancellable<'a> {
    stream: TcpStream,
    cancel: Option<&'a AtomicBool>,
    deadline: Instant,
}

impl Read for Cancellable<'_> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            match self.stream.read(buf) {
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                    ) =>
                {
                    if self.cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
                        return Err(io::Error::new(io::ErrorKind::Interrupted, CANCELLED_IO));
                    }
                    if Instant::now() > self.deadline {
                        return Err(io::Error::new(io::ErrorKind::TimedOut, "deadline"));
                    }
                }
                other => return other,
            }
        }
    }
}

pub struct Request<'a> {
    pub port: u16,
    pub method: &'a str,
    pub path: &'a str,
    /// Bearer key for TaskLens's own llama-server; `None` for servers without one (Ollama).
    pub api_key: Option<&'a str>,
    pub body: Option<&'a [u8]>,
    pub timeout: Duration,
    pub cancel: Option<&'a AtomicBool>,
}

/// Sends a request and streams the decoded body to `sink`. Returns the HTTP status.
/// Dropping the connection on cancellation makes llama.cpp stop generating.
pub fn send(
    request: Request<'_>,
    mut sink: impl FnMut(&[u8]) -> io::Result<()>,
) -> io::Result<u16> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, request.port));
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(Duration::from_millis(200)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    stream.set_nodelay(true)?;
    let body = request.body.unwrap_or_default();
    let authorization = request
        .api_key
        .map(|key| format!("Authorization: Bearer {key}\r\n"))
        .unwrap_or_default();
    let head = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n{}Content-Type: application/json\r\nAccept: application/json, text/event-stream, application/x-ndjson\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        request.method,
        request.path,
        request.port,
        authorization,
        body.len()
    );
    let mut writer = stream.try_clone()?;
    writer.write_all(head.as_bytes())?;
    writer.write_all(body)?;
    writer.flush()?;
    let mut reader = BufReader::new(Cancellable {
        stream,
        cancel: request.cancel,
        deadline: Instant::now() + request.timeout,
    });
    let mut line = Vec::new();
    reader.read_until(b'\n', &mut line)?;
    let status = String::from_utf8_lossy(&line)
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "bad status line"))?;
    let (mut chunked, mut length) = (false, None);
    loop {
        line.clear();
        if reader.read_until(b'\n', &mut line)? == 0 {
            break;
        }
        let header = String::from_utf8_lossy(&line).trim().to_ascii_lowercase();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            match name.trim() {
                "transfer-encoding" => chunked = value.contains("chunked"),
                "content-length" => length = value.trim().parse::<usize>().ok(),
                _ => {}
            }
        }
    }
    let mut buffer = vec![0u8; 16 * 1024];
    if chunked {
        loop {
            line.clear();
            reader.read_until(b'\n', &mut line)?;
            let size_text = String::from_utf8_lossy(&line);
            let size_text = size_text.trim().split(';').next().unwrap_or_default();
            let mut remaining = usize::from_str_radix(size_text, 16)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "bad chunk size"))?;
            if remaining == 0 {
                break;
            }
            while remaining > 0 {
                let take = remaining.min(buffer.len());
                reader.read_exact(&mut buffer[..take])?;
                sink(&buffer[..take])?;
                remaining -= take;
            }
            line.clear();
            reader.read_until(b'\n', &mut line)?;
        }
    } else if let Some(mut remaining) = length {
        while remaining > 0 {
            let take = remaining.min(buffer.len());
            reader.read_exact(&mut buffer[..take])?;
            sink(&buffer[..take])?;
            remaining -= take;
        }
    } else {
        loop {
            let n = reader.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            sink(&buffer[..n])?;
        }
    }
    Ok(status)
}

/// Splits a server-sent-events byte stream into `data:` payloads.
#[derive(Default)]
pub struct SseParser {
    pending: Vec<u8>,
}

impl SseParser {
    pub fn push(
        &mut self,
        bytes: &[u8],
        mut on_data: impl FnMut(&str) -> io::Result<()>,
    ) -> io::Result<()> {
        self.pending.extend_from_slice(bytes);
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=end).collect();
            let text = String::from_utf8_lossy(&line);
            if let Some(data) = text.trim_end().strip_prefix("data:") {
                on_data(data.trim_start())?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn serve(response: &'static [u8]) -> u16 {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = socket.read(&mut buf);
            socket.write_all(response).unwrap();
        });
        port
    }

    fn get(port: u16) -> (u16, Vec<u8>) {
        let mut body = Vec::new();
        let status = send(
            Request {
                port,
                method: "GET",
                path: "/health",
                api_key: Some("k"),
                body: None,
                timeout: Duration::from_secs(5),
                cancel: None,
            },
            |b| {
                body.extend_from_slice(b);
                Ok(())
            },
        )
        .unwrap();
        (status, body)
    }

    #[test]
    fn decodes_chunked_and_length_bodies() {
        let port = serve(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n");
        assert_eq!(get(port), (200, b"hello world".to_vec()));
        let port = serve(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 2\r\n\r\n{}");
        assert_eq!(get(port), (503, b"{}".to_vec()));
    }

    #[test]
    fn parses_split_sse_events() {
        let mut parser = SseParser::default();
        let mut events = Vec::new();
        for part in ["data: {\"content\":\"a\"}\n\nda", "ta: {\"stop\":true}\n\n"] {
            parser
                .push(part.as_bytes(), |d| {
                    events.push(d.to_string());
                    Ok(())
                })
                .unwrap();
        }
        assert_eq!(events, vec!["{\"content\":\"a\"}", "{\"stop\":true}"]);
    }
}
