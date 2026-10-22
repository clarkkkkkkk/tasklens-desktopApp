//! Only native code can read credentials. No file-backed or plaintext fallback.
use zeroize::Zeroizing;

const SERVICE: &str = "app.tasklens.desktop.groq";
const ACCOUNT: &str = "api-key";

#[derive(Debug, PartialEq)]
pub enum CredentialFailure {
    Missing,
    Unavailable,
}

#[cfg(any(windows, target_os = "linux"))]
fn entry() -> Result<keyring::Entry, CredentialFailure> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| CredentialFailure::Unavailable)
}

pub fn read() -> Result<Zeroizing<String>, CredentialFailure> {
    #[cfg(any(windows, target_os = "linux"))]
    return entry()?
        .get_password()
        .map(Zeroizing::new)
        .map_err(|e| match e {
            keyring::Error::NoEntry => CredentialFailure::Missing,
            _ => CredentialFailure::Unavailable,
        });
    #[cfg(not(any(windows, target_os = "linux")))]
    Err(CredentialFailure::Unavailable)
}

pub fn write(key: &str) -> Result<(), CredentialFailure> {
    #[cfg(any(windows, target_os = "linux"))]
    return entry()?
        .set_password(key)
        .map_err(|_| CredentialFailure::Unavailable);
    #[cfg(not(any(windows, target_os = "linux")))]
    Err(CredentialFailure::Unavailable)
}

pub fn remove() -> Result<(), CredentialFailure> {
    #[cfg(any(windows, target_os = "linux"))]
    return match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(CredentialFailure::Unavailable),
    };
    #[cfg(not(any(windows, target_os = "linux")))]
    Err(CredentialFailure::Unavailable)
}

#[cfg(all(test, any(windows, target_os = "linux")))]
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
pub struct OsStore;
impl Store for OsStore {
    fn read(&self) -> Result<Zeroizing<String>, CredentialFailure> {
        read()
    }
    fn write(&self, key: &str) -> Result<(), CredentialFailure> {
        write(key)
    }
    fn remove(&self) -> Result<(), CredentialFailure> {
        remove()
    }
}
