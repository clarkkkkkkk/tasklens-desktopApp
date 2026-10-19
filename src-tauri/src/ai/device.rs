//! Hardware facts for AI routing: CPU, memory and GPUs.
//!
//! Only what model selection needs is collected. No serial numbers, host or user names,
//! network addresses or storage contents. Every probe is best effort: an unknown value is
//! reported as `null` rather than guessed.
use crate::platform;
use serde_json::{json, Value};
use std::{path::PathBuf, time::Duration};

#[derive(Debug, Clone, PartialEq)]
pub struct Gpu {
    pub vendor: &'static str,
    pub name: String,
    pub vram_bytes: Option<u64>,
    pub vram_free_bytes: Option<u64>,
    pub integrated: bool,
}

impl Gpu {
    fn backends(&self) -> Vec<&'static str> {
        match self.vendor {
            "nvidia" => vec!["cuda", "vulkan"],
            "amd" if self.integrated => vec!["vulkan"],
            "amd" => vec!["rocm", "vulkan"],
            "intel" => vec!["intel", "vulkan"],
            "apple" => vec!["metal"],
            _ => vec![],
        }
    }
    fn to_json(&self) -> Value {
        json!({
            "vendor": self.vendor,
            "name": self.name,
            "vramBytes": self.vram_bytes,
            "vramFreeBytes": self.vram_free_bytes,
            "integrated": self.integrated,
            "backends": self.backends(),
        })
    }
}

pub fn vendor_from_pci(id: &str) -> &'static str {
    match id
        .trim()
        .trim_start_matches("0x")
        .to_ascii_lowercase()
        .as_str()
    {
        "10de" => "nvidia",
        "1002" | "1022" => "amd",
        "8086" => "intel",
        "106b" => "apple",
        _ => "other",
    }
}

/// Integrated graphics share system memory; their reported VRAM is only a carve-out.
pub fn looks_integrated(vendor: &str, name: &str, vram: Option<u64>) -> bool {
    let lower = name.to_ascii_lowercase();
    match vendor {
        "intel" => !lower.contains("arc"),
        "amd" => {
            lower.ends_with("radeon(tm) graphics")
                || lower.ends_with("radeon graphics")
                || lower.contains("vega 8")
                || vram.is_some_and(|v| v <= 2 * 1024 * 1024 * 1024 && !lower.contains("rx"))
        }
        "apple" => true,
        _ => false,
    }
}

/// `nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits`
pub fn parse_nvidia_smi(text: &str) -> Vec<Gpu> {
    const MIB: u64 = 1024 * 1024;
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split(',').map(str::trim);
            let name = parts.next().filter(|n| !n.is_empty())?.to_string();
            let total = parts.next().and_then(|v| v.parse::<u64>().ok());
            let free = parts.next().and_then(|v| v.parse::<u64>().ok());
            Some(Gpu {
                vendor: "nvidia",
                name,
                vram_bytes: total.map(|v| v * MIB),
                vram_free_bytes: free.map(|v| v * MIB),
                integrated: false,
            })
        })
        .collect()
}

/// `/proc/meminfo` → (total, available) in bytes.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_meminfo(text: &str) -> (Option<u64>, Option<u64>) {
    let field = |key: &str| {
        text.lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|v| v.parse::<u64>().ok())
            .map(|kb| kb * 1024)
    };
    (field("MemTotal:"), field("MemAvailable:"))
}

/// `/proc/cpuinfo` → (vendor, model, physical cores, logical cores).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_cpuinfo(text: &str) -> (Option<String>, Option<String>, Option<usize>, usize) {
    let value = |key: &str| {
        text.lines()
            .find(|l| l.split(':').next().map(str::trim) == Some(key))
            .and_then(|l| l.split_once(':'))
            .map(|(_, v)| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };
    let mut cores = std::collections::HashSet::new();
    let (mut physical_id, mut logical) = (String::new(), 0);
    for line in text.lines() {
        let Some((key, v)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "processor" => logical += 1,
            "physical id" => physical_id = v.trim().to_string(),
            "core id" => {
                cores.insert(format!("{physical_id}/{}", v.trim()));
            }
            _ => {}
        }
    }
    (
        value("vendor_id").map(|v| friendly_vendor(&v)),
        value("model name"),
        (!cores.is_empty()).then_some(cores.len()),
        logical,
    )
}

/// `vm_stat` (macOS) → free + inactive + speculative bytes.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn parse_vm_stat(text: &str) -> Option<u64> {
    let page = text
        .lines()
        .next()
        .and_then(|l| l.split("page size of ").nth(1))
        .and_then(|v| v.split_whitespace().next())
        .and_then(|v| v.parse::<u64>().ok())?;
    let pages = |key: &str| {
        text.lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split(':').nth(1))
            .and_then(|v| v.trim().trim_end_matches('.').parse::<u64>().ok())
            .unwrap_or(0)
    };
    Some((pages("Pages free") + pages("Pages inactive") + pages("Pages speculative")) * page)
}

fn friendly_vendor(raw: &str) -> String {
    match raw {
        "AuthenticAMD" => "AMD".into(),
        "GenuineIntel" => "Intel".into(),
        other => other.to_string(),
    }
}

#[cfg(target_arch = "x86_64")]
fn cpuid_identity() -> (Option<String>, Option<String>) {
    use std::arch::x86_64::__cpuid;
    #[allow(unused_unsafe)]
    // SAFETY: CPUID is available on every x86_64 processor and has no side effects.
    unsafe {
        let leaf0 = __cpuid(0);
        let mut vendor = Vec::with_capacity(12);
        for reg in [leaf0.ebx, leaf0.edx, leaf0.ecx] {
            vendor.extend_from_slice(&reg.to_le_bytes());
        }
        let brand = (__cpuid(0x8000_0000).eax >= 0x8000_0004).then(|| {
            let mut bytes = Vec::with_capacity(48);
            for leaf in 0x8000_0002u32..=0x8000_0004 {
                let r = __cpuid(leaf);
                for reg in [r.eax, r.ebx, r.ecx, r.edx] {
                    bytes.extend_from_slice(&reg.to_le_bytes());
                }
            }
            String::from_utf8_lossy(&bytes)
                .trim_matches(char::from(0))
                .trim()
                .to_string()
        });
        (
            Some(friendly_vendor(&String::from_utf8_lossy(&vendor))),
            brand.filter(|b| !b.is_empty()),
        )
    }
}

#[cfg(not(target_arch = "x86_64"))]
fn cpuid_identity() -> (Option<String>, Option<String>) {
    (None, None)
}

fn cpu_features() -> Vec<&'static str> {
    #[allow(unused_mut)]
    let mut features = Vec::new();
    #[cfg(target_arch = "x86_64")]
    for (name, present) in [
        ("avx", std::is_x86_feature_detected!("avx")),
        ("avx2", std::is_x86_feature_detected!("avx2")),
        ("fma", std::is_x86_feature_detected!("fma")),
        ("f16c", std::is_x86_feature_detected!("f16c")),
        ("avx512f", std::is_x86_feature_detected!("avx512f")),
    ] {
        if present {
            features.push(name);
        }
    }
    #[cfg(target_arch = "aarch64")]
    features.push("neon");
    features
}

fn find_tool(name: &str) -> Option<PathBuf> {
    let file = platform::exe_name(name);
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if cfg!(windows) {
        if let Some(root) = std::env::var_os("SystemRoot") {
            dirs.insert(0, PathBuf::from(root).join("System32"));
        }
    }
    dirs.into_iter()
        .map(|d| d.join(&file))
        .find(|p| p.is_file())
}

fn nvidia_gpus() -> Vec<Gpu> {
    find_tool("nvidia-smi")
        .and_then(|tool| {
            platform::capture(
                &tool,
                &[
                    "--query-gpu=name,memory.total,memory.free",
                    "--format=csv,noheader,nounits",
                ],
                Duration::from_secs(4),
            )
        })
        .map(|text| parse_nvidia_smi(&text))
        .unwrap_or_default()
}

/// Display adapters from the registry, refined with nvidia-smi when it is present.
#[cfg(windows)]
fn platform_gpus() -> Vec<Gpu> {
    let mut gpus = windows::display_adapters();
    for nvidia in nvidia_gpus() {
        if let Some(known) = gpus
            .iter_mut()
            .find(|g| g.vendor == "nvidia" && g.name == nvidia.name)
        {
            known.vram_bytes = nvidia.vram_bytes.or(known.vram_bytes);
            known.vram_free_bytes = nvidia.vram_free_bytes;
        } else {
            gpus.push(nvidia);
        }
    }
    gpus
}

#[cfg(target_os = "linux")]
fn platform_gpus() -> Vec<Gpu> {
    let mut gpus = Vec::new();
    let nvidia = nvidia_gpus();
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return nvidia;
    };
    let mut cards: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.strip_prefix("card")
                .is_some_and(|n| n.chars().all(|c| c.is_ascii_digit()))
        })
        .map(|e| e.path().join("device"))
        .collect();
    cards.sort();
    let read = |p: PathBuf| {
        std::fs::read_to_string(p)
            .ok()
            .map(|s| s.trim().to_string())
    };
    for device in cards {
        let vendor = vendor_from_pci(&read(device.join("vendor")).unwrap_or_default());
        if vendor == "nvidia" && !nvidia.is_empty() {
            continue;
        }
        let total = read(device.join("mem_info_vram_total")).and_then(|v| v.parse().ok());
        let used: Option<u64> =
            read(device.join("mem_info_vram_used")).and_then(|v| v.parse().ok());
        let name = read(device.join("product_name")).unwrap_or_else(|| {
            match vendor {
                "amd" => "AMD Radeon GPU",
                "intel" => "Intel graphics",
                "nvidia" => "NVIDIA GPU",
                _ => "GPU",
            }
            .to_string()
        });
        gpus.push(Gpu {
            vendor,
            integrated: looks_integrated(vendor, &name, total),
            name,
            vram_bytes: total,
            vram_free_bytes: total.zip(used).map(|(t, u)| t.saturating_sub(u)),
        });
    }
    gpus.extend(nvidia);
    gpus
}

#[cfg(target_os = "macos")]
fn platform_gpus() -> Vec<Gpu> {
    if cfg!(target_arch = "aarch64") {
        // Apple Silicon: one GPU sharing system memory, reached through Metal.
        vec![Gpu {
            vendor: "apple",
            name: "Apple GPU".into(),
            vram_bytes: None,
            vram_free_bytes: None,
            integrated: true,
        }]
    } else {
        Vec::new()
    }
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn platform_gpus() -> Vec<Gpu> {
    Vec::new()
}

struct Cpu {
    vendor: Option<String>,
    model: Option<String>,
    physical: Option<usize>,
    logical: usize,
}

fn cpu_and_memory() -> (Cpu, Option<u64>, Option<u64>) {
    let (vendor, model) = cpuid_identity();
    let logical = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    #[allow(unused_mut)]
    let mut cpu = Cpu {
        vendor,
        model,
        physical: None,
        logical,
    };
    #[cfg(windows)]
    {
        cpu.physical = windows::physical_cores();
        let (total, available) = windows::memory();
        (cpu, total, available)
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(text) = std::fs::read_to_string("/proc/cpuinfo") {
            let (vendor, model, physical, count) = parse_cpuinfo(&text);
            cpu.vendor = cpu.vendor.or(vendor);
            cpu.model = cpu.model.or(model);
            cpu.physical = physical;
            if count > 0 {
                cpu.logical = count;
            }
        }
        let (total, available) = std::fs::read_to_string("/proc/meminfo")
            .map(|t| parse_meminfo(&t))
            .unwrap_or((None, None));
        (cpu, total, available)
    }
    #[cfg(target_os = "macos")]
    {
        let sysctl = |key: &str| {
            platform::capture(
                std::path::Path::new("/usr/sbin/sysctl"),
                &["-n", key],
                Duration::from_secs(2),
            )
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        };
        cpu.model = cpu.model.or_else(|| sysctl("machdep.cpu.brand_string"));
        if cpu.vendor.is_none() && cpu.model.as_deref().is_some_and(|m| m.starts_with("Apple")) {
            cpu.vendor = Some("Apple".into());
        }
        cpu.physical = sysctl("hw.physicalcpu").and_then(|v| v.parse().ok());
        let total = sysctl("hw.memsize").and_then(|v| v.parse().ok());
        let available = platform::capture(
            std::path::Path::new("/usr/bin/vm_stat"),
            &[],
            Duration::from_secs(2),
        )
        .and_then(|t| parse_vm_stat(&t));
        (cpu, total, available)
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        (cpu, None, None)
    }
}

pub fn profile() -> Value {
    let (cpu, total, available) = cpu_and_memory();
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "linux" => "linux",
        _ => "unknown",
    };
    let gpus: Vec<Value> = platform_gpus().iter().map(Gpu::to_json).collect();
    json!({
        "source": "native",
        "os": os,
        "arch": std::env::consts::ARCH,
        "cpu": {
            "vendor": cpu.vendor,
            "model": cpu.model,
            "logicalCores": cpu.logical,
            "physicalCores": cpu.physical,
            "features": cpu_features(),
        },
        "memory": { "totalBytes": total, "availableBytes": available },
        "gpus": gpus,
    })
}

#[cfg(windows)]
mod windows {
    use super::{looks_integrated, vendor_from_pci, Gpu};
    use windows_sys::Win32::System::{
        Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_ANY},
        SystemInformation::{
            GetLogicalProcessorInformationEx, GlobalMemoryStatusEx, RelationProcessorCore,
            MEMORYSTATUSEX,
        },
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Raw registry value bytes, or None when absent.
    fn value(subkey: &str, name: &str) -> Option<Vec<u8>> {
        let (key, name) = (wide(subkey), wide(name));
        let mut len = 0u32;
        // SAFETY: valid NUL-terminated strings; the first call only queries the size.
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                key.as_ptr(),
                name.as_ptr(),
                RRF_RT_ANY,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut len,
            )
        };
        if status != 0 || len == 0 || len > 4096 {
            return None;
        }
        let mut buf = vec![0u8; len as usize];
        // SAFETY: `buf` holds `len` bytes, as reported by the size query.
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                key.as_ptr(),
                name.as_ptr(),
                RRF_RT_ANY,
                std::ptr::null_mut(),
                buf.as_mut_ptr().cast(),
                &mut len,
            )
        };
        (status == 0).then(|| {
            buf.truncate(len as usize);
            buf
        })
    }

    fn string(subkey: &str, name: &str) -> Option<String> {
        let bytes = value(subkey, name)?;
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .take_while(|&u| u != 0)
            .collect();
        Some(String::from_utf16_lossy(&units).trim().to_string()).filter(|s| !s.is_empty())
    }

    fn number(subkey: &str, name: &str) -> Option<u64> {
        let bytes = value(subkey, name)?;
        match bytes.len() {
            8 => Some(u64::from_le_bytes(bytes[..8].try_into().ok()?)),
            4 => Some(u32::from_le_bytes(bytes[..4].try_into().ok()?) as u64),
            _ => None,
        }
        .filter(|&v| v > 0)
    }

    /// Display adapters registered under the display device class.
    pub fn display_adapters() -> Vec<Gpu> {
        const CLASS: &str =
            r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        let mut gpus: Vec<Gpu> = Vec::new();
        for index in 0..16 {
            let key = format!(r"{CLASS}\{index:04}");
            let Some(name) = string(&key, "DriverDesc") else {
                continue;
            };
            let device = string(&key, "MatchingDeviceId")
                .unwrap_or_default()
                .to_ascii_lowercase();
            // Physical PCI adapters only; skips remote-display and virtual adapters.
            let Some(ven) = device
                .strip_prefix(r"pci\ven_")
                .map(|rest| rest.chars().take(4).collect::<String>())
            else {
                continue;
            };
            let vendor = vendor_from_pci(&ven);
            let vram = number(&key, "HardwareInformation.qwMemorySize")
                .or_else(|| number(&key, "HardwareInformation.MemorySize"));
            if gpus.iter().any(|g| g.name == name) {
                continue;
            }
            gpus.push(Gpu {
                vendor,
                integrated: looks_integrated(vendor, &name, vram),
                name,
                vram_bytes: vram,
                vram_free_bytes: None,
            });
        }
        gpus
    }

    pub fn memory() -> (Option<u64>, Option<u64>) {
        // SAFETY: MEMORYSTATUSEX is plain data; dwLength must be set before the call.
        unsafe {
            let mut status: MEMORYSTATUSEX = std::mem::zeroed();
            status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
            if GlobalMemoryStatusEx(&mut status) == 0 {
                return (None, None);
            }
            (Some(status.ullTotalPhys), Some(status.ullAvailPhys))
        }
    }

    pub fn physical_cores() -> Option<usize> {
        let mut len = 0u32;
        // SAFETY: the first call queries the buffer size; the second fills a buffer of that size.
        unsafe {
            GetLogicalProcessorInformationEx(RelationProcessorCore, std::ptr::null_mut(), &mut len);
            if len == 0 || len > 1 << 20 {
                return None;
            }
            let mut buf = vec![0u8; len as usize];
            if GetLogicalProcessorInformationEx(
                RelationProcessorCore,
                buf.as_mut_ptr().cast(),
                &mut len,
            ) == 0
            {
                return None;
            }
            // Records are variable-sized: { Relationship: u32, Size: u32, ... }.
            let (mut offset, mut count) = (0usize, 0usize);
            while offset + 8 <= len as usize {
                let size =
                    u32::from_le_bytes(buf[offset + 4..offset + 8].try_into().ok()?) as usize;
                if size == 0 {
                    break;
                }
                count += 1;
                offset += size;
            }
            (count > 0).then_some(count)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nvidia_smi_csv() {
        let gpus = parse_nvidia_smi("NVIDIA GeForce GTX 1650, 4096, 3512\n");
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce GTX 1650");
        assert_eq!(gpus[0].vram_bytes, Some(4096 * 1024 * 1024));
        assert_eq!(gpus[0].vram_free_bytes, Some(3512 * 1024 * 1024));
        assert!(parse_nvidia_smi("").is_empty());
    }

    #[test]
    fn parses_linux_memory_and_cpu() {
        let (total, available) = parse_meminfo(
            "MemTotal:       32768000 kB\nMemFree: 1 kB\nMemAvailable:   16384000 kB\n",
        );
        assert_eq!(total, Some(32768000 * 1024));
        assert_eq!(available, Some(16384000 * 1024));
        let info = "processor\t: 0\nvendor_id\t: AuthenticAMD\nmodel name\t: AMD Ryzen 5 3600 6-Core Processor\nphysical id\t: 0\ncore id\t: 0\n\nprocessor\t: 1\nphysical id\t: 0\ncore id\t: 0\n\nprocessor\t: 2\nphysical id\t: 0\ncore id\t: 1\n";
        let (vendor, model, physical, logical) = parse_cpuinfo(info);
        assert_eq!(vendor.as_deref(), Some("AMD"));
        assert_eq!(model.as_deref(), Some("AMD Ryzen 5 3600 6-Core Processor"));
        assert_eq!((physical, logical), (Some(2), 3));
    }

    #[test]
    fn parses_vm_stat() {
        let text = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               1000.\nPages active:                             5.\nPages inactive:                           500.\nPages speculative:                        100.\n";
        assert_eq!(parse_vm_stat(text), Some(1600 * 16384));
    }

    #[test]
    fn classifies_vendors_and_integrated_graphics() {
        assert_eq!(vendor_from_pci("0x10de"), "nvidia");
        assert_eq!(vendor_from_pci("1002"), "amd");
        assert!(looks_integrated("intel", "Intel(R) UHD Graphics 630", None));
        assert!(!looks_integrated("intel", "Intel(R) Arc(TM) A770", None));
        assert!(looks_integrated("amd", "AMD Radeon(TM) Graphics", None));
        assert!(!looks_integrated(
            "amd",
            "AMD Radeon RX 6700 XT",
            Some(12 << 30)
        ));
        assert!(!looks_integrated(
            "nvidia",
            "NVIDIA GeForce GTX 1650",
            Some(4 << 30)
        ));
    }
}

#[cfg(test)]
mod live {
    #[test]
    #[ignore = "prints this machine's profile; run with --ignored --nocapture"]
    fn prints_this_device() {
        println!(
            "{}",
            serde_json::to_string_pretty(&super::profile()).unwrap()
        );
    }
}
