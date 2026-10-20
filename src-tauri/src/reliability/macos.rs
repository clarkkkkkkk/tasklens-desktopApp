//! UserNotifications submission. Native macOS acceptance is required before release.
use super::journal::Result;
use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_foundation::{NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
    UNNotificationRequest, UNNotificationSettings, UNUserNotificationCenter,
};
use std::{ptr::NonNull, sync::mpsc, time::Duration};
pub fn permission() -> Result<String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let callback = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // The OS owns settings for the duration of this completion callback.
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let value = if status == UNAuthorizationStatus::Denied {
            "denied"
        } else if status == UNAuthorizationStatus::NotDetermined {
            "not requested"
        } else if status == UNAuthorizationStatus::Authorized {
            "authorized"
        } else {
            "system-managed/unknown"
        };
        let _ = tx.send(value.to_string());
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .getNotificationSettingsWithCompletionHandler(&callback);
    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "Notification permission query timed out.".into())
}
pub fn authorize() -> Result<()> {
    let (tx, rx) = mpsc::sync_channel(1);
    let callback = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        let _ = tx.send((granted.as_bool(), error.is_null()));
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert,
            &callback,
        );
    match rx.recv_timeout(Duration::from_secs(120)) {
        Ok((true,true))=>Ok(()),
        Ok(_)=>Err("Notification permission was denied or unavailable. Enable TaskLens in System Settings before activating.".into()),
        Err(_)=>Err("Notification authorization was not confirmed. Delivery remains inactive.".into())
    }
}
pub fn submit(id: &str, body: &str) -> Result<()> {
    if permission()? == "denied" {
        return Err("Notification permission denied by macOS.".into());
    }
    let content = unsafe { UNMutableNotificationContent::new() };
    content.setTitle(&NSString::from_str("TaskLens"));
    content.setBody(&NSString::from_str(body));
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(id),
        &content,
        None,
    );
    let (tx, rx) = mpsc::sync_channel(1);
    let callback = RcBlock::new(move |error: *mut NSError| {
        let _ = tx.send(error.is_null());
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .addNotificationRequest_withCompletionHandler(&request, Some(&callback));
    match rx.recv_timeout(Duration::from_secs(15)) {
        Ok(true) => Ok(()),
        Ok(false) => Err(
            "macOS rejected the notification request. Review system notification settings.".into(),
        ),
        Err(_) => Err(
            "Notification submission is uncertain: macOS did not acknowledge the request.".into(),
        ),
    }
}
