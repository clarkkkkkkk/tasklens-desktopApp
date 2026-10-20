mod journal;
#[cfg(target_os = "macos")]
mod macos;
use journal::{Dispatch, Item, Journal, Preview, Result, Status};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

type Operation = Box<dyn FnOnce(&mut Journal) + Send>;
#[derive(Default)]
pub struct Reliability {
    sender: Mutex<Option<mpsc::Sender<Operation>>>,
    error: Mutex<Option<String>>,
    activation: Mutex<Option<String>>,
    availability: Mutex<String>,
    stopping: AtomicBool,
}
fn main_window(window: &tauri::WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        Err("This command is restricted to the main window.".into())
    } else {
        Ok(())
    }
}
async fn work<T: Send + 'static>(
    state: &Reliability,
    operation: impl FnOnce(&mut Journal) -> Result<T> + Send + 'static,
) -> Result<T> {
    let sender = state
        .sender
        .lock()
        .map_err(|_| "Reminder worker unavailable.")?
        .clone()
        .ok_or_else(|| {
            state
                .error
                .lock()
                .ok()
                .and_then(|e| e.clone())
                .unwrap_or("Reminder worker has not started.".into())
        })?;
    tauri::async_runtime::spawn_blocking(move || {
        let (tx, rx) = mpsc::sync_channel(1);
        sender
            .send(Box::new(move |journal| {
                let _ = tx.send(operation(journal));
            }))
            .map_err(|_| "Reminder worker stopped. Delivery is paused.")?;
        rx.recv()
            .map_err(|_| "Reminder worker stopped before acknowledging the operation.")?
    })
    .await
    .map_err(|_| "Reminder worker interrupted.".to_string())?
}
fn emit(app: &tauri::AppHandle, journal: &Journal) {
    if let Ok(mut status) = journal.status() {
        let availability = app
            .state::<Reliability>()
            .availability
            .lock()
            .unwrap()
            .clone();
        if !availability.is_empty() {
            status.availability = availability;
        }
        let _ = app.emit_to("main", "reminder-status", status);
    }
}
pub fn initialize(app: &tauri::AppHandle) {
    let handle = app.clone();
    let (tx, rx) = mpsc::channel::<Operation>();
    *app.state::<Reliability>().sender.lock().unwrap() = Some(tx);
    std::thread::Builder::new()
        .name("tasklens-storage".into())
        .spawn(move || {
            let result = handle
                .path()
                .app_data_dir()
                .map_err(|_| "Application data directory unavailable.".into())
                .and_then(|p| Journal::open(&p.join("storage/tasklens.sqlite3")));
            let mut journal = match result {
                Ok(j) => j,
                Err(e) => {
                    *handle.state::<Reliability>().error.lock().unwrap() = Some(e);
                    *handle.state::<Reliability>().sender.lock().unwrap() = None;
                    return;
                }
            };
            let mut monotonic = Instant::now();
            let mut wall = chrono::Utc::now();
            let mut recovering = true;
            loop {
                if handle
                    .state::<Reliability>()
                    .stopping
                    .load(Ordering::SeqCst)
                {
                    break;
                }
                let wait = journal.wait_duration(chrono::Utc::now());
                match rx.recv_timeout(wait) {
                    Ok(operation) => {
                        operation(&mut journal);
                        emit(&handle, &journal);
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                if handle
                    .state::<Reliability>()
                    .stopping
                    .load(Ordering::SeqCst)
                {
                    break;
                }
                let now = chrono::Utc::now();
                let elapsed = monotonic.elapsed();
                let jump = (now - wall)
                    .num_milliseconds()
                    .abs_diff(elapsed.as_millis().min(i64::MAX as u128) as i64)
                    > 5000
                    || elapsed > wait + Duration::from_secs(5);
                monotonic = Instant::now();
                wall = now;
                match journal.claim(now, jump || recovering) {
                    Ok(Some(dispatch)) => {
                        let result = submit(&handle, &dispatch);
                        let outcome = match &result {
                            Ok(()) => "submitted",
                            Err(reason)
                                if reason.contains("ServiceUnknown")
                                    || reason.contains("AccessDenied")
                                    || reason.contains("denied") =>
                            {
                                "failed"
                            }
                            Err(_) => "unknown",
                        };
                        if journal.finish(&dispatch, outcome).is_err() {
                            let _ = journal.pause();
                        }
                        if let Err(reason) = result {
                            let _ = journal
                                .connection
                                .execute("UPDATE device SET warning=?1 WHERE id=1", [reason]);
                        }
                        emit(&handle, &journal);
                    }
                    Err(_) => {
                        let _ = journal.pause();
                        emit(&handle, &journal);
                    }
                    _ => {}
                }
                if journal.status().is_ok_and(|s| s.activated && !s.paused) {
                    recovering = false;
                }
            }
        })
        .expect("TaskLens could not create its storage worker");
}
fn submit(app: &tauri::AppHandle, dispatch: &Dispatch) -> Result<()> {
    let body = if dispatch.summary {
        "You have reminders to review in TaskLens."
    } else {
        dispatch
            .title
            .as_deref()
            .unwrap_or("A saved item needs your attention. Open TaskLens to review it.")
    };
    #[cfg(not(target_os = "macos"))]
    {
        let mut notification = notify_rust::Notification::new();
        notification
            .summary("TaskLens")
            .body(body)
            .appname("TaskLens")
            .timeout(15000)
            .action("default", "Open TaskLens");
        #[cfg(target_os = "linux")]
        notification.hint(notify_rust::Hint::DesktopEntry(
            "app.tasklens.desktop".into(),
        ));
        #[cfg(windows)]
        notification.app_id("app.tasklens.desktop");
        // Submission errors are returned to the durable journal, never swallowed by a plugin.
        let notification = notification.show().map_err(|e| {
            format!(
                "OS notification submission error: {}",
                e.to_string().chars().take(500).collect::<String>()
            )
        })?;
        #[cfg(target_os = "linux")]
        {
            let app = app.clone();
            let action = dispatch.action_id.clone();
            tauri::async_runtime::spawn(async move {
                // Bound the listener lifetime even if the desktop never sends a close event.
                let _ = tokio::time::timeout(
                    Duration::from_secs(900),
                    notification.wait_for_action_async(|response| {
                        if matches!(
                            response,
                            notify_rust::NotificationResponse::Default
                                | notify_rust::NotificationResponse::Action(_)
                        ) {
                            *app.state::<Reliability>().activation.lock().unwrap() = action;
                            reopen(&app);
                            let _ = app.emit_to("main", "reminder-open", ());
                        }
                    }),
                )
                .await;
            });
        }
        #[cfg(windows)]
        {
            drop(notification);
            let _ = app;
        }

        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        macos::submit(&dispatch.id, body)
    }
}
#[tauri::command]
pub async fn reminder_status(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
) -> Result<Status> {
    main_window(&window)?;
    let app = window.app_handle().clone();
    work(&state, move |j| {
        let mut status = j.status()?;
        #[cfg(target_os = "linux")]
        {
            status.availability = match notify_rust::get_server_information() {
                Ok(_) => "system-managed/unknown".into(),
                Err(_) => "unavailable notification service".into(),
            };
        }
        #[cfg(windows)]
        {
            status.availability = windows_permission();
        }
        #[cfg(target_os = "macos")]
        {
            status.availability =
                macos::permission().unwrap_or("unavailable authorization query".into());
        }
        *app.state::<Reliability>().availability.lock().unwrap() = status.availability.clone();
        Ok(status)
    })
    .await
}
#[tauri::command]
pub async fn reminder_pause(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
) -> Result<String> {
    main_window(&window)?;
    work(&state, |j| j.pause()).await
}
#[tauri::command]
pub async fn reminder_reconcile(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
    token: String,
    items: Vec<Item>,
    enabled: bool,
) -> Result<()> {
    main_window(&window)?;
    let zone = iana_time_zone::get_timezone()
        .map_err(|_| "Device timezone unavailable. Delivery remains paused.")?;
    work(&state, move |j| {
        j.reconcile(&token, items, enabled, &zone, chrono::Utc::now())
    })
    .await
}
#[tauri::command]
pub async fn reminder_preview(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
) -> Result<Preview> {
    main_window(&window)?;
    work(&state, |j| j.preview(chrono::Utc::now())).await
}
#[tauri::command]
pub async fn reminder_activate(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
    token: String,
    revision: i64,
) -> Result<()> {
    main_window(&window)?;
    work(&state, move |j| {
        #[cfg(target_os = "macos")]
        macos::authorize()?;
        #[cfg(windows)]
        if windows_permission() == "denied" {
            return Err("Windows notification settings deny TaskLens notifications.".into());
        }
        j.activate(&token, revision, chrono::Utc::now())
    })
    .await
}
#[tauri::command]
pub async fn reminder_disable(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
) -> Result<()> {
    main_window(&window)?;
    work(&state, |j| j.disable()).await
}
#[tauri::command]
pub async fn reminder_preferences(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
    include_title: bool,
    background: bool,
) -> Result<()> {
    main_window(&window)?;
    work(&state, move |j| {
        j.connection
            .execute(
                "UPDATE device SET include_title=?1,background=?2,revision=revision+1 WHERE id=1",
                rusqlite::params![include_title, background],
            )
            .map_err(|_| "Could not save device preferences.".to_string())?;
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn reminder_test(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Reliability>,
) -> Result<String> {
    main_window(&window)?;
    let status = work(&state, |j| j.status()).await?;
    if !status.activated || status.paused {
        return Err("Activate notifications and reconcile tasks before sending a test.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        submit(
            &app,
            &Dispatch {
                id: "test".into(),
                action_id: None,
                title: None,
                summary: false,
            },
        )
    })
    .await
    .map_err(|_| "Test notification interrupted.".to_string())??;
    Ok("Submitted to the OS. Visibility and acknowledgment are controlled by your desktop notification settings.".into())
}
#[tauri::command]
pub async fn lifecycle_finish(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Reliability>,
    quit: bool,
) -> Result<()> {
    main_window(&window)?;
    let background = if quit {
        false
    } else {
        work(&state, |j| Ok(j.status()?.background))
            .await
            .unwrap_or(false)
    };
    if background {
        window
            .hide()
            .map_err(|_| "Could not hide TaskLens.".to_string())?;
    } else {
        // Quit must remain possible even when journal storage is unavailable.
        // Restart always establishes a durable pause before task reconciliation.
        state.stopping.store(true, Ordering::SeqCst);
        app.exit(0);
    }
    Ok(())
}
pub fn reopen(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn tray(app: &tauri::AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    let open = MenuItem::with_id(app, "open", "Open TaskLens", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit TaskLens", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .tooltip("TaskLens")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => reopen(app),
            "quit" => {
                reopen(app);
                let _ = app.emit_to("main", "lifecycle-request", "quit");
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn reminder_take_activation(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Reliability>,
) -> Result<Option<String>> {
    main_window(&window)?;
    Ok(state
        .activation
        .lock()
        .map_err(|_| "Notification activation unavailable.")?
        .take())
}

#[cfg(windows)]
fn windows_permission() -> String {
    use windows::{
        core::HSTRING,
        UI::Notifications::{NotificationSetting, ToastNotificationManager},
    };
    match ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
        "app.tasklens.desktop",
    ))
    .and_then(|notifier| notifier.Setting())
    {
        Ok(NotificationSetting::Enabled) => "enabled by Windows settings".into(),
        Ok(_) => "denied".into(),
        Err(_) => "system-managed/unknown".into(),
    }
}

#[tauri::command]
pub fn reminder_time_options(
    window: tauri::WebviewWindow,
    date: String,
    time: String,
) -> Result<serde_json::Value> {
    use chrono::{LocalResult, NaiveDate, NaiveTime, TimeZone, Utc};
    main_window(&window)?;
    let timezone = iana_time_zone::get_timezone().map_err(|_| "Device timezone unavailable.")?;
    let zone: chrono_tz::Tz = timezone.parse().map_err(|_| "Unknown device timezone.")?;
    let date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|_| "Invalid date.")?;
    let time = NaiveTime::parse_from_str(&time, "%H:%M").map_err(|_| "Invalid time.")?;
    let (kind, instants) = match zone.from_local_datetime(&date.and_time(time)) {
        LocalResult::Single(a) => ("single", vec![a.with_timezone(&Utc).to_rfc3339()]),
        LocalResult::Ambiguous(a, b) => (
            "fold",
            vec![
                a.with_timezone(&Utc).to_rfc3339(),
                b.with_timezone(&Utc).to_rfc3339(),
            ],
        ),
        LocalResult::None => ("gap", vec![]),
    };
    Ok(serde_json::json!({"kind":kind,"timezone":timezone,"instants":instants}))
}

pub fn shutdown(app: &tauri::AppHandle) {
    app.state::<Reliability>()
        .stopping
        .store(true, Ordering::SeqCst);
}
