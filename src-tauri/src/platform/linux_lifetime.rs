//! Linux delivers PDEATHSIG when the *creating thread* exits. Tokio blocking
//! workers retire, so long-lived model processes must be created by a permanent
//! thread. It stays alive with TaskLens; crash/exit cleanup still comes from the OS.
use std::{
    io,
    process::{Child, Command},
    sync::{mpsc, OnceLock},
};

struct Request {
    command: Command,
    response: mpsc::SyncSender<io::Result<Child>>,
}

pub(super) fn spawn(command: Command) -> io::Result<Child> {
    static LAUNCHER: OnceLock<Result<mpsc::Sender<Request>, String>> = OnceLock::new();
    let launcher = LAUNCHER
        .get_or_init(|| {
            let (sender, receiver) = mpsc::channel::<Request>();
            std::thread::Builder::new()
                .name("tasklens-runtime-launcher".into())
                .spawn(move || {
                    for mut request in receiver {
                        let result = request.command.spawn();
                        // A disappearing caller must not leave a successful child orphaned.
                        if let Err(mpsc::SendError(Ok(mut child))) = request.response.send(result) {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                })
                .map_err(|error| error.to_string())?;
            Ok(sender)
        })
        .as_ref()
        .map_err(|error| io::Error::other(error.clone()))?;
    let (response, result) = mpsc::sync_channel(1);
    launcher
        .send(Request { command, response })
        .map_err(|_| io::Error::other("Runtime launcher is unavailable"))?;
    result
        .recv()
        .map_err(|_| io::Error::other("Runtime launcher did not respond"))?
}
