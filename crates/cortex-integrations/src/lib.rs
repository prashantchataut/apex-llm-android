//! cortex-integrations — GitHub (PAT/OAuth token) + external provider routing.
#![forbid(unsafe_code)]

pub mod github;
pub mod router;

pub use github::GitHubClient;
pub use router::{Provider, ProviderRouter, Route};

#[derive(Debug, thiserror::Error)]
pub enum IntegrationError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("base64: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("utf8: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
    #[error("missing API key for {0}")]
    MissingKey(&'static str),
}
