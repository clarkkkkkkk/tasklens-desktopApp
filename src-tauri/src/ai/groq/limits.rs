//! Advisory per-profile limits. Contains no keys, source text, or extraction results.
use super::{Failure, Result};
use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path};

pub const CONSENT_VERSION: u32 = 1;
#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub credential_enabled: bool,
    pub resume_required: bool,
    pub consent_version: u32,
    pub removal_incomplete: bool,
    pub day: String,
    pub daily: u32,
    pub recent: Vec<i64>,
    pub cooldown_until: i64,
}
impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        match std::fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| Failure::storage()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(_) => Err(Failure::storage()),
        }
    }
    pub fn save(&self, path: &Path) -> Result<()> {
        let parent = path.parent().ok_or_else(Failure::storage)?;
        std::fs::create_dir_all(parent).map_err(|_| Failure::storage())?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| Failure::storage())?;
        serde_json::to_writer(&mut temp, self).map_err(|_| Failure::storage())?;
        temp.flush().map_err(|_| Failure::storage())?;
        temp.as_file().sync_all().map_err(|_| Failure::storage())?;
        temp.persist(path).map_err(|_| Failure::storage())?;
        Ok(())
    }
    pub fn refresh(&mut self, now: i64, day: &str) {
        // A backwards wall-clock/day change must not reset a used quota.
        if self.day.is_empty() || day > self.day.as_str() {
            self.day = day.into();
            self.daily = 0;
        }
        self.recent.retain(|time| *time > now - 60_000);
    }
    pub fn next_allowed(&self, now: i64) -> Result<i64> {
        if self.daily >= 10 {
            return Err(Failure::new("GROQ_DAILY_LIMIT", "TaskLens has used its ten daily Groq attempts. Retry on the next local calendar day."));
        }
        let minute = if self.recent.len() >= 2 {
            self.recent[0] + 60_000
        } else {
            now
        };
        Ok(minute.max(self.cooldown_until).max(now))
    }
    pub fn reserve(&mut self, path: &Path, now: i64, day: &str) -> Result<()> {
        self.refresh(now, day);
        let next = self.next_allowed(now)?;
        if next > now {
            return Err(Failure::rate(next));
        }
        self.daily += 1;
        self.recent.push(now);
        // Fail closed; retain the reservation in memory if writing failed.
        self.save(path)
    }
}
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}
pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Groq reset values are durations (e.g. 2m59.56s), not Unix timestamps.
pub fn duration_ms(value: &str) -> Option<i64> {
    let mut total = 0f64;
    let mut number = String::new();
    let mut found = false;
    for c in value.chars() {
        if c.is_ascii_digit() || c == '.' {
            number.push(c);
            continue;
        }
        let multiplier = match c {
            'h' => 3_600_000.,
            'm' => 60_000.,
            's' => 1000.,
            _ => return None,
        };
        let part: f64 = number.parse().ok()?;
        if !part.is_finite() || part < 0. {
            return None;
        }
        total += part * multiplier;
        number.clear();
        found = true;
    }
    if !number.is_empty() || !found || total > 7. * 86_400_000. {
        return None;
    }
    Some(total.ceil() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_attempts_and_enforces_rolling_and_daily_limits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("usage.json");
        let mut c = Config::default();
        c.reserve(&path, 100_000, "2026-10-22").unwrap();
        c.reserve(&path, 101_000, "2026-10-22").unwrap();
        assert_eq!(c.next_allowed(102_000).unwrap(), 160_000);
        let mut c = Config::load(&path).unwrap();
        assert_eq!(c.daily, 2);
        for i in 1..=8 {
            c.reserve(&path, 200_000 + i * 61_000, "2026-10-22")
                .unwrap();
        }
        assert_eq!(
            c.next_allowed(900_000).unwrap_err().code,
            "GROQ_DAILY_LIMIT"
        );
        c.refresh(900_000, "2026-10-21");
        assert_eq!(c.daily, 10);
        c.reserve(&path, 1_000_000, "2026-10-23").unwrap();
        assert_eq!(c.daily, 1);
        let raw = std::fs::read_to_string(path).unwrap();
        assert!(!raw.contains("api-key"));
        assert!(!raw.contains("source"));
    }
    #[test]
    fn malformed_config_does_not_reset_usage() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("usage.json");
        std::fs::write(&path, "broken").unwrap();
        assert!(Config::load(&path).is_err());
    }
    #[test]
    fn parses_reset_durations() {
        assert_eq!(duration_ms("2m59.56s"), Some(179560));
        assert_eq!(duration_ms("7.66s"), Some(7660));
        assert_eq!(duration_ms("oops"), None);
        assert_eq!(duration_ms("NaNs"), None);
    }
}
