//! cortex-hf-hub — find GGUF models on Hugging Face, badge them against the
//! device profile, and download them with resumable Range segments + SHA256.
#![forbid(unsafe_code)]

pub mod download;
pub mod media;
pub mod scoring;

use serde::{Deserialize, Serialize};

pub use scoring::{score, Compatibility, ScoreInput};

/// Families we surface in the curated browse view.
pub const CURATED_QUERIES: &[&str] = &[
    "Llama-3.2 GGUF",
    "Qwen2.5 GGUF",
    "Qwen3 GGUF",
    "DeepSeek-R1-Distill GGUF",
    "gemma GGUF",
    "SmolLM2 GGUF",
    "Phi-4 GGUF",
];

#[derive(Debug, thiserror::Error)]
pub enum HubError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("sha256 mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelFile {
    pub filename: String,
    pub size_bytes: u64,
    /// LFS sha256 when the hub reports it.
    pub sha256: Option<String>,
}

impl ModelFile {
    pub fn is_gguf(&self) -> bool {
        self.filename.to_ascii_lowercase().ends_with(".gguf")
    }
    /// Split multi-part GGUFs (`-00001-of-00003.gguf`) are not loadable as one file by the UI yet.
    pub fn is_split(&self) -> bool {
        self.filename.contains("-of-0")
    }
    pub fn resolve_url(&self, repo_id: &str) -> String {
        format!(
            "https://huggingface.co/{repo_id}/resolve/main/{}?download=true",
            self.filename
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelCard {
    pub repo_id: String,
    pub downloads: u64,
    pub likes: u64,
    pub files: Vec<ModelFile>,
}

#[derive(Debug, Deserialize)]
struct SearchHit {
    id: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    likes: u64,
}

#[derive(Debug, Deserialize)]
struct TreeEntry {
    #[serde(rename = "type")]
    kind: String,
    path: String,
    #[serde(default)]
    size: u64,
    lfs: Option<LfsInfo>,
}

#[derive(Debug, Deserialize)]
struct LfsInfo {
    oid: Option<String>,
    size: Option<u64>,
}

pub struct HfClient {
    http: reqwest::Client,
    base: String,
    token: Option<String>,
}

impl HfClient {
    pub fn new(token: Option<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            base: "https://huggingface.co".into(),
            token,
        }
    }

    fn get(&self, url: &str) -> reqwest::RequestBuilder {
        let r = self
            .http
            .get(url)
            .header("User-Agent", "apex-llm-android/0.1");
        match &self.token {
            Some(t) => r.bearer_auth(t),
            None => r,
        }
    }

    /// Search GGUF repos sorted by downloads.
    pub async fn search(&self, query: &str, limit: u32) -> Result<Vec<ModelCard>, HubError> {
        let url = format!("{}/api/models", self.base);
        let hits: Vec<SearchHit> = self
            .get(&url)
            .query(&[
                ("search", query),
                ("filter", "gguf"),
                ("sort", "downloads"),
                ("limit", &limit.to_string()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(hits
            .into_iter()
            .map(|h| ModelCard {
                repo_id: h.id,
                downloads: h.downloads,
                likes: h.likes,
                files: vec![],
            })
            .collect())
    }

    /// List `.gguf` files (single-file only) of a repo with sizes + sha256.
    pub async fn files(&self, repo_id: &str) -> Result<Vec<ModelFile>, HubError> {
        let url = format!("{}/api/models/{repo_id}/tree/main", self.base);
        let entries: Vec<TreeEntry> = self
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(entries
            .into_iter()
            .filter(|e| e.kind == "file")
            .map(|e| ModelFile {
                filename: e.path,
                size_bytes: e.lfs.as_ref().and_then(|l| l.size).unwrap_or(e.size),
                sha256: e.lfs.and_then(|l| l.oid),
            })
            .filter(|f| f.is_gguf() && !f.is_split())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gguf_filters() {
        let f = ModelFile {
            filename: "m-Q4_K_M.gguf".into(),
            size_bytes: 1,
            sha256: None,
        };
        assert!(f.is_gguf() && !f.is_split());
        let s = ModelFile {
            filename: "m-00001-of-00003.gguf".into(),
            size_bytes: 1,
            sha256: None,
        };
        assert!(s.is_split());
        assert!(f
            .resolve_url("a/b")
            .starts_with("https://huggingface.co/a/b/resolve/main/"));
    }
}
