//! Durable delivery state. This database is NOT yet the task repository.
use chrono::{DateTime, Duration, LocalResult, NaiveDate, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

pub type Result<T> = std::result::Result<T, String>;
fn db(error: rusqlite::Error) -> String {
    // Do not include SQL values, task titles or source content in errors/logging.
    format!(
        "Reminder journal unavailable ({:?}). Delivery is paused; free disk space and retry.",
        error.sqlite_error_code()
    )
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub title: String,
    pub status: String,
    pub date: Option<String>,
    pub time: Option<String>,
    pub arrival_time: Option<String>,
    pub anchor_confirmed: bool,
    pub date_confirmed: bool,
    pub reminders: Vec<Trigger>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Trigger {
    pub id: String,
    pub datetime: String,
    pub enabled: bool,
    pub approval: Option<Approval>,
    #[serde(default)]
    pub custom_approved: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Approval {
    pub timezone: String,
    pub anchor_instant: String,
    pub occurrence: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub fingerprint: String,
    pub action_id: String,
    pub reminder_id: String,
    pub at: String,
    pub timezone: String,
    pub state: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub revision: i64,
    pub activated: bool,
    pub paused: bool,
    pub include_title: bool,
    pub background: bool,
    pub upcoming: Vec<Occurrence>,
    pub history: Vec<Occurrence>,
    pub needs_confirmation: Vec<String>,
    pub warning: Option<String>,
    pub availability: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub revision: i64,
    pub eligible: i64,
    pub needs_confirmation: Vec<String>,
    pub token: String,
}
pub struct Journal {
    pub connection: Connection,
    pub issues: Vec<String>,
    pub titles: std::collections::HashMap<String, String>,
}
fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn instant(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| "Invalid reminder instant.".into())
}
fn local_instant(date: NaiveDate, time: NaiveTime, zone: Tz) -> Result<DateTime<Utc>> {
    match zone.from_local_datetime(&date.and_time(time)) {
        LocalResult::Single(v) => Ok(v.with_timezone(&Utc)),
        LocalResult::Ambiguous(_, _) => Err("Daylight-saving time repeats this time. Confirm an unambiguous time before activating reminders.".into()),
        LocalResult::None => Err("This local time does not exist because of daylight saving. Correct the time before activating reminders.".into()),
    }
}
fn eligible(item: &Item, trigger: &Trigger, zone: Tz) -> Result<DateTime<Utc>> {
    if item.id.is_empty()
        || item.id.len() > 200
        || item.title.chars().count() > 180
        || trigger.id.len() > 200
    {
        return Err("Invalid reminder identity.".into());
    }
    if !item.date_confirmed {
        return Err("Confirm the reminder date before activation.".into());
    }
    let date = item
        .date
        .as_deref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .ok_or("Confirm the reminder date.")?;
    let anchor_time = item
        .arrival_time
        .as_deref()
        .filter(|v| !v.is_empty())
        .or(item.time.as_deref().filter(|v| !v.is_empty()));
    let expected = if trigger.id == "night" {
        local_instant(
            date.pred_opt().ok_or("Invalid reminder date.")?,
            NaiveTime::from_hms_opt(20, 0, 0).unwrap(),
            zone,
        )?
    } else if trigger.id == "hour" || trigger.id == "quarter" {
        if !item.anchor_confirmed {
            return Err(
                "Confirm the event or arrival time before enabling relative reminders.".into(),
            );
        }
        let time = anchor_time
            .and_then(|t| NaiveTime::parse_from_str(t, "%H:%M").ok())
            .ok_or("Relative reminders need a confirmed time; no 9 AM fallback is used.")?;
        let anchor = match zone.from_local_datetime(&date.and_time(time)) {
            LocalResult::Ambiguous(a, b) => {
                let approval=trigger.approval.as_ref().ok_or("This time occurs twice. Edit the item and choose the first or second occurrence.")?;
                if approval.timezone != zone.name() {
                    return Err("Confirm the daylight-saving occurrence for this timezone.".into());
                }
                let chosen = instant(&approval.anchor_instant)?;
                let expected = match approval.occurrence.as_str() {
                    "first" => a.with_timezone(&Utc),
                    "second" => b.with_timezone(&Utc),
                    _ => return Err("Invalid occurrence choice.".into()),
                };
                if chosen != expected {
                    return Err("The occurrence choice does not match this date and time.".into());
                }
                chosen
            }
            _ => local_instant(date, time, zone)?,
        };
        anchor - Duration::minutes(if trigger.id == "hour" { 60 } else { 15 })
    } else {
        if !trigger.custom_approved {
            return Err("Edit and save this custom reminder to approve its displayed instant before native delivery.".into());
        }
        // An explicit editor save approves this exact instant; no event-end or implicit anchor is invented.
        instant(&trigger.datetime)?
    };
    let saved = instant(&trigger.datetime)?;
    if saved != expected {
        return Err("Saved reminder differs from its current date, time or timezone. Review and save its schedule again.".into());
    }
    Ok(saved)
}
impl Journal {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|_| "Cannot create private reminder storage.".to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
                    .map_err(|_| "Cannot restrict reminder directory permissions.".to_string())?;
            }
        }
        if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Refusing a symlinked reminder database. Delivery remains paused.".into());
        }
        let connection = Connection::open(path).map_err(db)?;
        let migrations_exist: bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",[],|r|r.get(0)).map_err(db)?;
        if migrations_exist {
            let version: i64 = connection
                .query_row(
                    "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
                    [],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if version > 1 {
                return Err("This reminder database needs a newer TaskLens version. Delivery is paused and the file has been preserved.".into());
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|_| "Cannot restrict reminder database permissions.".to_string())?;
        }
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE;
          CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS device(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,activated INTEGER NOT NULL DEFAULT 0,paused INTEGER NOT NULL DEFAULT 1,include_title INTEGER NOT NULL DEFAULT 0,background INTEGER NOT NULL DEFAULT 0,preview TEXT,warning TEXT);
          INSERT OR IGNORE INTO device(id) VALUES(1);
          CREATE TABLE IF NOT EXISTS occurrences(fingerprint TEXT PRIMARY KEY,action_id TEXT NOT NULL,reminder_id TEXT NOT NULL,at INTEGER NOT NULL,timezone TEXT NOT NULL,signature TEXT NOT NULL,state TEXT NOT NULL,covered_by TEXT);
          CREATE INDEX IF NOT EXISTS due_occurrences ON occurrences(state,at);
          CREATE INDEX IF NOT EXISTS occurrence_signature ON occurrences(signature);
          CREATE TABLE IF NOT EXISTS summaries(id TEXT PRIMARY KEY,state TEXT NOT NULL,created INTEGER NOT NULL);
          INSERT OR IGNORE INTO schema_migrations VALUES(1);") .map_err(db)?;
        connection.execute_batch("BEGIN IMMEDIATE; UPDATE device SET paused=1,preview=NULL,revision=revision+1 WHERE id=1; UPDATE occurrences SET state='unknown' WHERE state='dispatching'; UPDATE summaries SET state='unknown' WHERE state='dispatching'; COMMIT;").map_err(db)?;
        Ok(Self {
            connection,
            issues: vec![],
            titles: Default::default(),
        })
    }
    pub fn pause(&mut self) -> Result<String> {
        let token = uuid::Uuid::new_v4().to_string();
        self.connection.execute("UPDATE device SET paused=1,preview=?1,revision=revision+1,warning='Task data changed. Delivery is paused until reconciliation succeeds.' WHERE id=1", [&token]).map_err(db)?;
        Ok(token)
    }
    pub fn reconcile(
        &mut self,
        token: &str,
        items: Vec<Item>,
        enabled: bool,
        zone: &str,
        now: DateTime<Utc>,
    ) -> Result<()> {
        if items.len() > 10000 {
            return Err("Too many tasks to register reminders safely.".into());
        }
        let zone: Tz = zone
            .parse()
            .map_err(|_| "The device timezone is unavailable. Delivery remains paused.")?;
        let mut seen = std::collections::HashSet::new();
        if items
            .iter()
            .any(|i| !seen.insert(i.id.clone()) || i.reminders.len() > 20)
        {
            return Err(
                "Duplicate task IDs or excessive reminders. Delivery remains paused.".into(),
            );
        }
        let tx = self.connection.transaction().map_err(db)?;
        let current: Option<String> = tx
            .query_row("SELECT preview FROM device WHERE id=1", [], |r| r.get(0))
            .map_err(db)?;
        if current.as_deref() != Some(token) {
            return Err(
                "Task data changed during reminder reconciliation. Retry from the latest tasks."
                    .into(),
            );
        }
        let activated: bool = tx
            .query_row("SELECT activated FROM device WHERE id=1", [], |r| r.get(0))
            .map_err(db)?;
        let mut keep = std::collections::HashSet::new();
        let mut issues = Vec::new();
        self.titles.clear();
        for item in items.iter().filter(|i| i.status == "confirmed") {
            self.titles.insert(item.id.clone(), item.title.clone());
            for trigger in item.reminders.iter().filter(|r| r.enabled && enabled) {
                // Signature ignores notes/title/updatedAt and the machine timezone. An existing approved instant is immutable.
                let signature = hash(
                    &serde_json::to_string(&(
                        &item.id,
                        &trigger.id,
                        &trigger.datetime,
                        &item.date,
                        &item.time,
                        &item.arrival_time,
                        item.anchor_confirmed,
                        item.date_confirmed,
                        &trigger.approval,
                        trigger.custom_approved,
                    ))
                    .map_err(|_| "Invalid reminder.")?,
                );
                let existing: Option<String> = tx
                    .query_row(
                        "SELECT fingerprint FROM occurrences WHERE signature=?1",
                        [&signature],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(db)?;
                if let Some(fingerprint) = existing {
                    // Cancelled future registrations can be enabled again; submitted/unknown history never replays.
                    tx.execute("UPDATE occurrences SET state=CASE WHEN ?1 THEN 'pending' ELSE 'unapproved' END WHERE fingerprint=?2 AND state='cancelled' AND at>?3", params![activated,fingerprint,now.timestamp()]).map_err(db)?;
                    keep.insert(fingerprint);
                    continue;
                }
                let at = match eligible(item, trigger, zone) {
                    Ok(at) => at,
                    Err(reason) => {
                        issues.push(format!("{} · {}: {}", item.title, trigger.id, reason));
                        continue;
                    }
                };
                let fingerprint = hash(
                    &serde_json::to_string(&(&item.id, &trigger.id, at.timestamp(), zone.name()))
                        .map_err(|_| "Invalid reminder identity.")?,
                );
                let state = if !activated {
                    "unapproved"
                } else if at <= now {
                    "historical"
                } else {
                    "pending"
                };
                tx.execute("INSERT OR IGNORE INTO occurrences(fingerprint,action_id,reminder_id,at,timezone,signature,state) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![fingerprint,item.id,trigger.id,at.timestamp(),zone.name(),signature,state]).map_err(db)?;
                keep.insert(fingerprint);
            }
        }
        let active: Vec<String> = {
            let mut stmt = tx
                .prepare(
                    "SELECT fingerprint FROM occurrences WHERE state IN ('pending','unapproved')",
                )
                .map_err(db)?;
            let rows = stmt.query_map([], |r| r.get(0)).map_err(db)?;
            rows.collect::<std::result::Result<Vec<_>, _>>()
                .map_err(db)?
        };
        for fingerprint in active {
            if !keep.contains(&fingerprint) {
                tx.execute(
                    "UPDATE occurrences SET state='cancelled' WHERE fingerprint=?1",
                    [fingerprint],
                )
                .map_err(db)?;
            }
        }
        tx.execute(
            "UPDATE device SET paused=0,preview=NULL,warning=NULL,revision=revision+1 WHERE id=1",
            [],
        )
        .map_err(db)?;
        tx.commit().map_err(db)?;
        self.issues = issues;
        Ok(())
    }
    pub fn preview(&mut self, now: DateTime<Utc>) -> Result<Preview> {
        let token = uuid::Uuid::new_v4().to_string();
        self.connection
            .execute("UPDATE device SET preview=?1 WHERE id=1", [&token])
            .map_err(db)?;
        let revision = self
            .connection
            .query_row("SELECT revision FROM device WHERE id=1", [], |r| r.get(0))
            .map_err(db)?;
        let eligible=self.connection.query_row("SELECT count(*) FROM occurrences WHERE state IN ('unapproved','pending') AND at>?1",[now.timestamp()],|r|r.get(0)).map_err(db)?;
        Ok(Preview {
            revision,
            eligible,
            needs_confirmation: self.issues.clone(),
            token,
        })
    }
    pub fn activate(&mut self, token: &str, revision: i64, now: DateTime<Utc>) -> Result<()> {
        let tx = self.connection.transaction().map_err(db)?;
        let matches: bool = tx
            .query_row(
                "SELECT preview=?1 AND revision=?2 AND paused=0 FROM device WHERE id=1",
                params![token, revision],
                |r| r.get(0),
            )
            .map_err(db)?;
        if !matches {
            return Err(
                "The activation preview is stale. Review the current schedules again.".into(),
            );
        }
        tx.execute("UPDATE occurrences SET state=CASE WHEN at>?1 THEN 'pending' ELSE 'historical' END WHERE state='unapproved'",[now.timestamp()]).map_err(db)?;
        tx.execute(
            "UPDATE device SET activated=1,preview=NULL,revision=revision+1 WHERE id=1",
            [],
        )
        .map_err(db)?;
        tx.commit().map_err(db)
    }
    pub fn disable(&mut self) -> Result<()> {
        self.connection.execute_batch("BEGIN IMMEDIATE; UPDATE device SET activated=0,preview=NULL,revision=revision+1 WHERE id=1; UPDATE occurrences SET state='cancelled' WHERE state='pending'; COMMIT;").map_err(db)
    }
    pub fn status(&self) -> Result<Status> {
        let mut status=self.connection.query_row("SELECT revision,activated,paused,include_title,background,warning FROM device WHERE id=1",[],|r|Ok(Status {revision:r.get(0)?,activated:r.get(1)?,paused:r.get(2)?,include_title:r.get(3)?,background:r.get(4)?,warning:r.get(5)?,upcoming:vec![],history:vec![],needs_confirmation:self.issues.clone(),availability:"system-managed/unknown".into()})).map_err(db)?;
        let mut stmt=self.connection.prepare("SELECT fingerprint,action_id,reminder_id,at,timezone,state FROM occurrences ORDER BY CASE WHEN state='pending' THEN 0 ELSE 1 END, CASE WHEN state='pending' THEN at ELSE -at END LIMIT 200").map_err(db)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Occurrence {
                    fingerprint: r.get(0)?,
                    action_id: r.get(1)?,
                    reminder_id: r.get(2)?,
                    at: DateTime::from_timestamp(r.get(3)?, 0)
                        .unwrap_or_default()
                        .to_rfc3339(),
                    timezone: r.get(4)?,
                    state: r.get(5)?,
                })
            })
            .map_err(db)?;
        for row in rows {
            let row = row.map_err(db)?;
            if row.state == "pending" {
                status.upcoming.push(row);
            } else {
                status.history.push(row);
            }
        }
        status.upcoming.sort_by(|a, b| a.at.cmp(&b.at));
        Ok(status)
    }
    pub fn wait_duration(&self, now: DateTime<Utc>) -> std::time::Duration {
        // Wake at the nearest deadline or at most every 30 s for wall-clock changes.
        let next: Option<i64> = self.connection.query_row("SELECT MIN(at) FROM occurrences WHERE state='pending' AND (SELECT activated AND NOT paused FROM device WHERE id=1)",[],|r|r.get(0)).ok().flatten();
        let millis = next
            .map(|at| (at * 1000 - now.timestamp_millis()).clamp(250, 30000) as u64)
            .unwrap_or(30000);
        std::time::Duration::from_millis(millis)
    }
    /// Claim on the serialized storage thread, before any OS call. No retry of uncertain delivery.
    pub fn claim(&mut self, now: DateTime<Utc>, resumed: bool) -> Result<Option<Dispatch>> {
        let (activated, paused, include_title): (bool, bool, bool) = self
            .connection
            .query_row(
                "SELECT activated,paused,include_title FROM device WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(db)?;
        if !activated || paused {
            return Ok(None);
        }
        let tx = self.connection.transaction().map_err(db)?;
        let cutoff = now.timestamp() - if resumed { 0 } else { 30 };
        tx.execute(
            "UPDATE occurrences SET state='missed' WHERE state='pending' AND at<?1",
            [cutoff],
        )
        .map_err(db)?;
        let misses:i64=tx.query_row("SELECT count(*) FROM occurrences WHERE state='missed' AND covered_by IS NULL AND at>=?1",[now.timestamp()-86400],|r|r.get(0)).map_err(db)?;
        let dispatch = if misses > 0 {
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO summaries VALUES(?1,'dispatching',?2)",
                params![id, now.timestamp()],
            )
            .map_err(db)?;
            tx.execute("UPDATE occurrences SET covered_by=?1 WHERE state='missed' AND covered_by IS NULL AND at>=?2",params![id,now.timestamp()-86400]).map_err(db)?;
            Some(Dispatch {
                id,
                action_id: None,
                title: None,
                summary: true,
            })
        } else {
            let due:Option<(String,String)>=tx.query_row("SELECT fingerprint,action_id FROM occurrences WHERE state='pending' AND at<=?1 ORDER BY at LIMIT 1",[now.timestamp()],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(db)?;
            if let Some((id, action_id)) = due {
                tx.execute(
                    "UPDATE occurrences SET state='dispatching' WHERE fingerprint=?1",
                    [&id],
                )
                .map_err(db)?;
                let title = if include_title {
                    self.titles.get(&action_id).cloned()
                } else {
                    None
                };
                Some(Dispatch {
                    id,
                    action_id: Some(action_id),
                    title,
                    summary: false,
                })
            } else {
                None
            }
        };
        tx.commit().map_err(db)?;
        Ok(dispatch)
    }
    pub fn finish(&mut self, dispatch: &Dispatch, outcome: &str) -> Result<()> {
        if !["submitted", "failed", "unknown"].contains(&outcome) {
            return Err("Invalid notification outcome.".into());
        }
        self.connection
            .execute(
                if dispatch.summary {
                    "UPDATE summaries SET state=?1 WHERE id=?2 AND state='dispatching'"
                } else {
                    "UPDATE occurrences SET state=?1 WHERE fingerprint=?2 AND state='dispatching'"
                },
                params![outcome, dispatch.id],
            )
            .map_err(db)?;
        self.connection.execute("UPDATE device SET revision=revision+1,warning=?1 WHERE id=1",[if outcome=="submitted" {None}else{Some("Notification submission failed or is uncertain. Review system notification settings; this occurrence will not be replayed automatically.")}]).map_err(db)?;
        Ok(())
    }
}
pub struct Dispatch {
    pub id: String,
    pub action_id: Option<String>,
    pub title: Option<String>,
    pub summary: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        path: std::path::PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            Self {
                path: std::env::temp_dir().join(format!(
                    "tasklens-reminder-test-{}/storage/tasklens.sqlite3",
                    uuid::Uuid::new_v4()
                )),
            }
        }
        fn open(&self) -> Journal {
            Journal::open(&self.path).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.path.parent().unwrap().parent().unwrap());
        }
    }
    fn now() -> DateTime<Utc> {
        instant("2026-10-20T00:00:00Z").unwrap()
    }
    fn item() -> Item {
        Item {
            id: "a".into(),
            title: "Private title".into(),
            status: "confirmed".into(),
            date: Some("2026-10-21".into()),
            time: Some("10:00".into()),
            arrival_time: Some("09:30".into()),
            anchor_confirmed: true,
            date_confirmed: true,
            reminders: vec![Trigger {
                id: "quarter".into(),
                datetime: "2026-10-21T01:15:00Z".into(),
                enabled: true,
                approval: None,
                custom_approved: false,
            }],
        }
    }
    fn reconcile(j: &mut Journal, items: Vec<Item>, at: DateTime<Utc>) {
        let token = j.pause().unwrap();
        j.reconcile(&token, items, true, "Asia/Manila", at).unwrap();
    }
    fn activate(j: &mut Journal) {
        let p = j.preview(now()).unwrap();
        j.activate(&p.token, p.revision, now()).unwrap();
    }
    #[test]
    fn legacy_never_activates_implicitly() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        assert!(!j.status().unwrap().activated);
        assert!(j.claim(now() + Duration::days(2), false).unwrap().is_none());
    }
    #[test]
    fn arrival_precedes_start_not_end() {
        assert_eq!(
            eligible(&item(), &item().reminders[0], chrono_tz::Asia::Manila).unwrap(),
            instant("2026-10-21T01:15:00Z").unwrap()
        );
    }
    #[test]
    fn no_implicit_nine_am() {
        let mut a = item();
        a.time = None;
        a.arrival_time = None;
        assert!(eligible(&a, &a.reminders[0], chrono_tz::Asia::Manila)
            .unwrap_err()
            .contains("confirmed time"));
        a.reminders[0].id = "night".into();
        a.reminders[0].datetime = "2026-10-20T12:00:00Z".into();
        assert!(eligible(&a, &a.reminders[0], chrono_tz::Asia::Manila).is_ok());
    }
    #[test]
    fn dst_gaps_and_folds_are_not_guessed() {
        for date in ["2026-03-08", "2026-11-01"] {
            let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
            let t =
                NaiveTime::from_hms_opt(if date.contains("03") { 2 } else { 1 }, 30, 0).unwrap();
            assert!(local_instant(d, t, chrono_tz::America::New_York).is_err());
        }
    }
    #[test]
    fn claim_is_durable_and_never_replayed() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        let due = instant(&item().reminders[0].datetime).unwrap();
        let d = j.claim(due, false).unwrap().unwrap();
        assert!(d.title.is_none());
        drop(j);
        let mut j = f.open();
        assert_eq!(j.status().unwrap().history[0].state, "unknown");
        reconcile(&mut j, vec![item()], due);
        assert!(j.claim(due, false).unwrap().is_none());
    }
    #[test]
    fn notes_title_and_timezone_changes_do_not_duplicate() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        let original = j.status().unwrap().upcoming[0].fingerprint.clone();
        let token = j.pause().unwrap();
        let mut a = item();
        a.title = "Edited title".into();
        j.reconcile(&token, vec![a], true, "America/New_York", now())
            .unwrap();
        assert_eq!(j.status().unwrap().upcoming[0].fingerprint, original);
    }
    #[test]
    fn completion_cancels_and_global_disable_stops_delivery() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        let mut a = item();
        a.status = "completed".into();
        reconcile(&mut j, vec![a], now());
        assert!(j.status().unwrap().upcoming.is_empty());
        reconcile(&mut j, vec![item()], now());
        assert_eq!(j.status().unwrap().upcoming.len(), 1);
        j.disable().unwrap();
        assert!(j.claim(now() + Duration::days(2), true).unwrap().is_none());
    }
    #[test]
    fn edits_invalidate_obsolete_trigger() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        let mut a = item();
        a.arrival_time = Some("09:45".into());
        a.reminders[0].datetime = "2026-10-21T01:30:00Z".into();
        reconcile(&mut j, vec![a], now());
        assert_eq!(j.status().unwrap().upcoming.len(), 1);
        assert!(j
            .status()
            .unwrap()
            .history
            .iter()
            .any(|o| o.state == "cancelled"));
    }
    #[test]
    fn pause_and_stale_approval_block_dispatch() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        let p = j.preview(now()).unwrap();
        j.pause().unwrap();
        assert!(j.activate(&p.token, p.revision, now()).is_err());
        assert!(j.claim(now() + Duration::days(2), true).unwrap().is_none());
    }
    #[test]
    fn missed_summary_is_private_and_deduplicated_across_restart() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        let late = instant("2026-10-21T02:00:00Z").unwrap();
        let d = j.claim(late, true).unwrap().unwrap();
        assert!(d.summary);
        assert!(d.title.is_none());
        j.finish(&d, "submitted").unwrap();
        drop(j);
        let mut j = f.open();
        reconcile(&mut j, vec![item()], late);
        assert!(j.claim(late, true).unwrap().is_none());
    }
    #[test]
    fn older_misses_remain_review_only() {
        let f = Fixture::new();
        let mut j = f.open();
        reconcile(&mut j, vec![item()], now());
        activate(&mut j);
        assert!(j.claim(now() + Duration::days(4), true).unwrap().is_none());
        assert_eq!(j.status().unwrap().history[0].state, "missed");
    }
    #[test]
    fn first_activation_does_not_catch_up_past_imports() {
        let f = Fixture::new();
        let mut j = f.open();
        let late = now() + Duration::days(2);
        reconcile(&mut j, vec![item()], late);
        let p = j.preview(late).unwrap();
        j.activate(&p.token, p.revision, late).unwrap();
        assert!(j.claim(late, false).unwrap().is_none());
        assert_eq!(j.status().unwrap().history[0].state, "historical");
    }
    #[test]
    fn failed_and_unknown_are_distinct_and_not_retried() {
        for outcome in ["failed", "unknown"] {
            let f = Fixture::new();
            let mut j = f.open();
            reconcile(&mut j, vec![item()], now());
            activate(&mut j);
            let due = instant(&item().reminders[0].datetime).unwrap();
            let d = j.claim(due, false).unwrap().unwrap();
            j.finish(&d, outcome).unwrap();
            assert!(j.claim(due, false).unwrap().is_none());
            assert_eq!(j.status().unwrap().history[0].state, outcome);
        }
    }
    #[test]
    fn rejected_reconciliation_remains_paused() {
        let f = Fixture::new();
        let mut j = f.open();
        let token = j.pause().unwrap();
        assert!(j
            .reconcile(&token, vec![item(), item()], true, "Asia/Manila", now())
            .is_err());
        assert!(j.status().unwrap().paused);
    }
    #[test]
    fn files_are_private_and_sqlite_foreign_keys_on() {
        let f = Fixture::new();
        let j = f.open();
        assert_eq!(
            j.connection
                .query_row("PRAGMA foreign_keys", [], |r| r.get::<_, i32>(0))
                .unwrap(),
            1
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&f.path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(f.path.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
    }
}

#[cfg(test)]
mod approval_tests {
    use super::*;
    #[test]
    fn repeated_time_requires_and_honors_an_explicit_occurrence() {
        let mut item = Item {
            id: "fold".into(),
            title: "Synthetic".into(),
            status: "confirmed".into(),
            date: Some("2026-11-01".into()),
            time: Some("01:30".into()),
            arrival_time: None,
            date_confirmed: true,
            anchor_confirmed: true,
            reminders: vec![],
        };
        let mut trigger = Trigger {
            id: "quarter".into(),
            datetime: "2026-11-01T05:15:00Z".into(),
            enabled: true,
            approval: None,
            custom_approved: false,
        };
        assert!(eligible(&item, &trigger, chrono_tz::America::New_York).is_err());
        trigger.approval = Some(Approval {
            timezone: "America/New_York".into(),
            anchor_instant: "2026-11-01T05:30:00Z".into(),
            occurrence: "first".into(),
        });
        assert!(eligible(&item, &trigger, chrono_tz::America::New_York).is_ok());
        trigger.approval = Some(Approval {
            timezone: "America/New_York".into(),
            anchor_instant: "2026-11-01T06:30:00Z".into(),
            occurrence: "second".into(),
        });
        trigger.datetime = "2026-11-01T06:15:00Z".into();
        assert!(eligible(&item, &trigger, chrono_tz::America::New_York).is_ok());
        item.date = Some("2026-11-02".into());
        assert!(eligible(&item, &trigger, chrono_tz::America::New_York).is_err());
    }
}

#[cfg(test)]
mod custom_approval_tests {
    use super::*;
    #[test]
    fn legacy_custom_instants_require_explicit_editor_approval() {
        let item = Item {
            id: "custom".into(),
            title: "Synthetic custom reminder".into(),
            status: "confirmed".into(),
            date: Some("2026-10-21".into()),
            time: None,
            arrival_time: None,
            date_confirmed: true,
            anchor_confirmed: false,
            reminders: vec![],
        };
        let mut trigger = Trigger {
            id: "requested-1".into(),
            datetime: "2026-10-20T15:45:00Z".into(),
            enabled: true,
            approval: None,
            custom_approved: false,
        };
        assert!(eligible(&item, &trigger, chrono_tz::Asia::Manila).is_err());
        trigger.custom_approved = true;
        assert_eq!(
            eligible(&item, &trigger, chrono_tz::Asia::Manila).unwrap(),
            instant(&trigger.datetime).unwrap()
        );
    }
}
