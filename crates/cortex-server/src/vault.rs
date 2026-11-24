//! API key vault. Plaintext keys (`sk-pocket-<43 base62>`) are shown exactly once;
//! only SHA-256 hashes are kept. Per-key usage analytics + revocation.

use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

pub const KEY_PREFIX: &str = "sk-pocket-";

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn hash(key: &str) -> String {
    Sha256::digest(key.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct KeyRecord {
    pub id: String,
    pub name: String,
    /// last 4 chars of the key, for display (`sk-pocket-…aB3x`)
    pub hint: String,
    pub created_at: u64,
    pub last_used_at: Option<u64>,
    pub revoked: bool,
    pub requests: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    #[serde(skip)]
    hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub ts: u64,
    pub key_id: Option<String>,
    pub method: String,
    pub path: String,
    pub status: u16,
}

#[derive(Default)]
pub struct KeyVault {
    keys: Mutex<HashMap<String, KeyRecord>>,
    log: Mutex<VecDeque<LogEntry>>,
}

impl KeyVault {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `(plaintext_key, record)`. The plaintext is never retrievable again.
    pub fn generate(&self, name: &str) -> (String, KeyRecord) {
        let mut rng = rand::thread_rng();
        let secret: String = (&mut rng)
            .sample_iter(&Alphanumeric)
            .take(43)
            .map(char::from)
            .collect();
        let id: String = (&mut rng)
            .sample_iter(&Alphanumeric)
            .take(8)
            .map(char::from)
            .collect();
        let key = format!("{KEY_PREFIX}{secret}");
        let rec = KeyRecord {
            id: id.clone(),
            name: name.to_string(),
            hint: secret[secret.len() - 4..].to_string(),
            created_at: now(),
            last_used_at: None,
            revoked: false,
            requests: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            hash: hash(&key),
        };
        self.keys.lock().unwrap().insert(id, rec.clone());
        (key, rec)
    }

    /// Verify a presented key; returns the key id when valid and not revoked.
    pub fn verify(&self, presented: &str) -> Option<String> {
        if !presented.starts_with(KEY_PREFIX) {
            return None;
        }
        let h = hash(presented);
        let mut keys = self.keys.lock().unwrap();
        let rec = keys
            .values_mut()
            .find(|r| !r.revoked && constant_time_eq(r.hash.as_bytes(), h.as_bytes()))?;
        rec.last_used_at = Some(now());
        rec.requests += 1;
        Some(rec.id.clone())
    }

    pub fn revoke(&self, id: &str) -> bool {
        self.keys
            .lock()
            .unwrap()
            .get_mut(id)
            .map(|r| r.revoked = true)
            .is_some()
    }

    pub fn record_usage(&self, id: &str, prompt: u64, completion: u64) {
        if let Some(r) = self.keys.lock().unwrap().get_mut(id) {
            r.prompt_tokens += prompt;
            r.completion_tokens += completion;
        }
    }

    pub fn list(&self) -> Vec<KeyRecord> {
        let mut v: Vec<_> = self.keys.lock().unwrap().values().cloned().collect();
        v.sort_by_key(|r| std::cmp::Reverse(r.created_at));
        v
    }

    pub fn push_log(&self, e: LogEntry) {
        let mut l = self.log.lock().unwrap();
        if l.len() >= 200 {
            l.pop_front();
        }
        l.push_back(e);
    }

    pub fn logs(&self) -> Vec<LogEntry> {
        self.log.lock().unwrap().iter().rev().cloned().collect()
    }

    pub fn log_now(&self, key_id: Option<String>, method: &str, path: &str, status: u16) {
        self.push_log(LogEntry {
            ts: now(),
            key_id,
            method: method.into(),
            path: path.into(),
            status,
        });
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_verify_revoke() {
        let v = KeyVault::new();
        let (key, rec) = v.generate("Cursor");
        assert!(key.starts_with("sk-pocket-"));
        assert_eq!(key.len(), KEY_PREFIX.len() + 43);
        assert_eq!(v.verify(&key), Some(rec.id.clone()));
        assert_eq!(v.verify("sk-pocket-nope"), None);
        assert_eq!(v.verify("garbage"), None);
        v.record_usage(&rec.id, 10, 20);
        let r = &v.list()[0];
        assert_eq!(
            (r.requests, r.prompt_tokens, r.completion_tokens),
            (1, 10, 20)
        );
        assert!(v.revoke(&rec.id));
        assert_eq!(v.verify(&key), None);
    }

    #[test]
    fn plaintext_not_serialised() {
        let v = KeyVault::new();
        let (key, _) = v.generate("x");
        let json = serde_json::to_string(&v.list()).unwrap();
        assert!(!json.contains(&key[KEY_PREFIX.len()..]));
        assert!(!json.contains("hash"));
    }

    #[test]
    fn keys_are_unique() {
        let v = KeyVault::new();
        assert_ne!(v.generate("a").0, v.generate("b").0);
    }
}
