//! Passive OS signals only. Never initiate an Internet probe or inspect network identifiers.
use std::time::Duration;
#[cfg(target_os = "linux")]
pub fn read() -> &'static str {
    let query = || -> zbus::Result<&'static str> {
        let connection = zbus::blocking::connection::Builder::system()?
            .method_timeout(Duration::from_secs(2))
            .build()?;
        let proxy = zbus::blocking::Proxy::new(
            &connection,
            "org.freedesktop.NetworkManager",
            "/org/freedesktop/NetworkManager",
            "org.freedesktop.NetworkManager",
        )?;
        let connectivity: u32 = proxy.get_property("Connectivity")?;
        let state: u32 = proxy.get_property("State").unwrap_or(0);
        Ok(match connectivity {
            4 => "online",
            1 | 2 | 3 => "offline",
            0 if matches!(state, 10 | 20) => "offline",
            _ => "unknown",
        })
    };
    query().unwrap_or("unknown")
}
#[cfg(windows)]
struct RuntimeApartment(bool);
#[cfg(windows)]
impl RuntimeApartment {
    fn new() -> Self {
        // Every worker using WinRT owns a balanced apartment initialization.
        Self(
            unsafe {
                windows::Win32::System::WinRT::RoInitialize(
                    windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
                )
            }
            .is_ok(),
        )
    }
}
#[cfg(windows)]
impl Drop for RuntimeApartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                windows::Win32::System::WinRT::RoUninitialize();
            }
        }
    }
}
#[cfg(windows)]
pub fn read() -> &'static str {
    let _apartment = RuntimeApartment::new();
    use windows::Networking::Connectivity::{NetworkConnectivityLevel, NetworkInformation};
    match NetworkInformation::GetInternetConnectionProfile()
        .and_then(|p| p.GetNetworkConnectivityLevel())
    {
        Ok(NetworkConnectivityLevel::InternetAccess) => "online",
        Ok(NetworkConnectivityLevel::None) => "offline",
        _ => "unknown",
    }
}
#[cfg(not(any(windows, target_os = "linux")))]
pub fn read() -> &'static str {
    "unknown"
}

pub fn watch(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || {
        #[cfg(windows)]
        let _apartment = RuntimeApartment::new();
        // Windows raises changes independently of the conservative positive-state timer.
        #[cfg(windows)]
        let _subscription = {
            use windows::Networking::Connectivity::{
                NetworkInformation, NetworkStatusChangedEventHandler,
            };
            let handle = app.clone();
            NetworkInformation::NetworkStatusChanged(&NetworkStatusChangedEventHandler::new(
                move |_| {
                    let state = read();
                    if state != "online" {
                        let app = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            app.state::<super::Groq>()
                                .update_connectivity(state, &app)
                                .await;
                        });
                    }
                    Ok(())
                },
            ))
            .ok()
        };
        let mut positive_since = None;
        loop {
            let raw = read();
            let state = if raw == "online" {
                let since = positive_since.get_or_insert_with(std::time::Instant::now);
                if since.elapsed() >= Duration::from_secs(2) {
                    "online"
                } else {
                    "unknown"
                }
            } else {
                positive_since = None;
                raw
            };
            tauri::async_runtime::block_on(
                app.state::<super::Groq>().update_connectivity(state, &app),
            );
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}
