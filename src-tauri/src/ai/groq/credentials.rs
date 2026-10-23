//! Only native code can read credentials. No file-backed or plaintext fallback.
use zeroize::Zeroizing;

const ACCOUNT: &str = "api-key";

#[derive(Debug, PartialEq)]
pub enum CredentialFailure {
    Missing,
    Unavailable,
}

#[cfg(any(windows, target_os = "linux", target_os = "macos"))]
fn entry(service: &str) -> Result<keyring::Entry, CredentialFailure> {
    keyring::Entry::new(service, ACCOUNT).map_err(|_| CredentialFailure::Unavailable)
}

fn read(service: &str) -> Result<Zeroizing<String>, CredentialFailure> {
    #[cfg(any(windows, target_os = "linux", target_os = "macos"))]
    return entry(service)?
        .get_password()
        .map(Zeroizing::new)
        .map_err(|e| match e {
            keyring::Error::NoEntry => CredentialFailure::Missing,
            _ => CredentialFailure::Unavailable,
        });
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    Err(CredentialFailure::Unavailable)
}

fn write(service: &str, key: &str) -> Result<(), CredentialFailure> {
    #[cfg(any(windows, target_os = "linux", target_os = "macos"))]
    return entry(service)?
        .set_password(key)
        .map_err(|_| CredentialFailure::Unavailable);
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    Err(CredentialFailure::Unavailable)
}

fn remove(service: &str) -> Result<(), CredentialFailure> {
    #[cfg(any(windows, target_os = "linux", target_os = "macos"))]
    return match entry(service)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(CredentialFailure::Unavailable),
    };
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    Err(CredentialFailure::Unavailable)
}

#[cfg(all(test, any(windows, target_os = "linux", target_os = "macos")))]
mod tests {
    /// Run in separate processes with the same random service name to verify persistence.
    #[test]
    #[ignore = "explicit native credential-store acceptance; uses an isolated synthetic credential"]
    fn native_credential_acceptance() {
        let service = std::env::var("TASKLENS_CREDENTIAL_TEST_SERVICE")
            .expect("isolated service name required");
        assert!(service.starts_with("app.tasklens.desktop.groq.acceptance."));
        let entry = keyring::Entry::new(&service, "synthetic-test").unwrap();
        match std::env::var("TASKLENS_CREDENTIAL_TEST_PHASE").as_deref() {
            Ok("write") => entry
                .set_password("tasklens-native-acceptance-placeholder")
                .expect("secure write failed"),
            Ok("read") => assert_eq!(
                entry.get_password().expect("persistent read failed"),
                "tasklens-native-acceptance-placeholder"
            ),
            Ok("remove") => entry.delete_credential().expect("secure removal failed"),
            Ok("absent") => assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry))),
            _ => panic!("explicit acceptance phase required"),
        }
    }
}

/// Injectable for deterministic locked/unavailable storage tests; production uses OsStore.
pub trait Store: Send + Sync {
    fn read(&self) -> Result<Zeroizing<String>, CredentialFailure>;
    fn write(&self, key: &str) -> Result<(), CredentialFailure>;
    fn remove(&self) -> Result<(), CredentialFailure>;
}
pub struct OsStore {
    service: String,
}
impl OsStore {
    pub fn for_application(identifier: &str) -> Self {
        Self {
            service: format!("{identifier}.groq"),
        }
    }
}
impl Store for OsStore {
    fn read(&self) -> Result<Zeroizing<String>, CredentialFailure> {
        read(&self.service)
    }
    fn write(&self, key: &str) -> Result<(), CredentialFailure> {
        write(&self.service, key)
    }
    fn remove(&self) -> Result<(), CredentialFailure> {
        remove(&self.service)
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;
    #[test]
    fn acceptance_and_test_profiles_cannot_address_the_production_credential() {
        let production = OsStore::for_application("app.tasklens.desktop");
        assert_eq!(production.service, "app.tasklens.desktop.groq");
        assert_ne!(
            production.service,
            OsStore::for_application("app.tasklens.acceptance.123").service
        );
        assert_ne!(
            production.service,
            OsStore::for_application("app.tasklens.tests").service
        );
    }
}
