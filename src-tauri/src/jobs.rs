//! Cancellation registry shared by OCR and local model jobs.
//!
//! The webview generates a UUID per request. Cancelling an ID that has not registered
//! yet is remembered (bounded), so a cancel that races ahead of its job still wins.
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[derive(Default)]
pub struct Jobs {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
    early: Mutex<HashSet<String>>,
}

pub struct JobGuard<'a> {
    jobs: &'a Jobs,
    id: String,
    pub cancel: Arc<AtomicBool>,
}

impl Drop for JobGuard<'_> {
    fn drop(&mut self) {
        self.jobs.active.lock().unwrap().remove(&self.id);
    }
}

pub fn valid_id(id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| "Invalid processing request.".to_string())
}

impl Jobs {
    pub fn register(&self, id: &str) -> Result<JobGuard<'_>, String> {
        valid_id(id)?;
        let flag = Arc::new(AtomicBool::new(self.early.lock().unwrap().remove(id)));
        let mut active = self.active.lock().unwrap();
        if active.contains_key(id) {
            return Err("This request is already running.".into());
        }
        active.insert(id.to_string(), flag.clone());
        Ok(JobGuard {
            jobs: self,
            id: id.to_string(),
            cancel: flag,
        })
    }

    pub fn cancel(&self, id: &str) -> Result<(), String> {
        valid_id(id)?;
        if let Some(flag) = self.active.lock().unwrap().get(id) {
            flag.store(true, Ordering::SeqCst);
            return Ok(());
        }
        let mut early = self.early.lock().unwrap();
        if early.len() >= 64 {
            early.clear();
        }
        early.insert(id.to_string());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "5f1c9a5e-7d2f-4b8e-9a51-6f0f2a9b1c3d";
    #[test]
    fn cancel_before_register_is_honoured() {
        let jobs = Jobs::default();
        jobs.cancel(ID).unwrap();
        assert!(jobs.register(ID).unwrap().cancel.load(Ordering::SeqCst));
    }
    #[test]
    fn rejects_non_uuid_and_duplicates() {
        let jobs = Jobs::default();
        assert!(jobs.register("../etc").is_err());
        let _guard = jobs.register(ID).unwrap();
        assert!(jobs.register(ID).is_err());
    }
}
