//! Minimal GitHub REST client: browse repos, read files into LLM context,
//! push generated code to a branch, create Gists. The token is held in memory only
//! (persist it in Android Keystore from the app layer — never in plain files).

use crate::IntegrationError;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const API: &str = "https://api.github.com";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Repo {
    pub full_name: String,
    pub private: bool,
    pub default_branch: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Contents {
    content: Option<String>,
    sha: String,
}

pub struct GitHubClient {
    http: reqwest::Client,
    token: String,
}

impl GitHubClient {
    pub fn new(token: impl Into<String>) -> Self {
        Self { http: reqwest::Client::new(), token: token.into() }
    }

    fn req(&self, m: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(m, format!("{API}{path}"))
            .bearer_auth(&self.token)
            .header("User-Agent", "apex-llm-android")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
    }

    pub async fn me(&self) -> Result<Value, IntegrationError> {
        Ok(self.req(reqwest::Method::GET, "/user").send().await?.error_for_status()?.json().await?)
    }

    pub async fn repos(&self) -> Result<Vec<Repo>, IntegrationError> {
        Ok(self
            .req(reqwest::Method::GET, "/user/repos?per_page=100&sort=pushed")
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    pub async fn read_file(&self, repo: &str, path: &str, git_ref: Option<&str>) -> Result<String, IntegrationError> {
        let mut url = format!("/repos/{repo}/contents/{path}");
        if let Some(r) = git_ref {
            url.push_str(&format!("?ref={r}"));
        }
        let c: Contents = self.req(reqwest::Method::GET, &url).send().await?.error_for_status()?.json().await?;
        let raw = c.content.unwrap_or_default().replace('\n', "");
        Ok(String::from_utf8(B64.decode(raw)?)?)
    }

    /// Create or update a file on `branch` (creates a commit).
    pub async fn put_file(&self, repo: &str, path: &str, branch: &str, message: &str, content: &str) -> Result<Value, IntegrationError> {
        // Fetch current sha when updating.
        let existing = self.req(reqwest::Method::GET, &format!("/repos/{repo}/contents/{path}?ref={branch}")).send().await?;
        let sha = if existing.status().is_success() { Some(existing.json::<Contents>().await?.sha) } else { None };
        let mut body = json!({ "message": message, "content": B64.encode(content), "branch": branch });
        if let Some(s) = sha {
            body["sha"] = json!(s);
        }
        Ok(self.req(reqwest::Method::PUT, &format!("/repos/{repo}/contents/{path}")).json(&body).send().await?.error_for_status()?.json().await?)
    }

    pub async fn create_gist(&self, description: &str, files: &BTreeMap<String, String>, public: bool) -> Result<Value, IntegrationError> {
        let files: serde_json::Map<String, Value> = files.iter().map(|(k, v)| (k.clone(), json!({ "content": v }))).collect();
        let body = json!({ "description": description, "public": public, "files": files });
        Ok(self.req(reqwest::Method::POST, "/gists").json(&body).send().await?.error_for_status()?.json().await?)
    }
}

/// Render repo files as a context block for the local LLM, trimming to `max_chars`.
pub fn build_context(files: &[(String, String)], max_chars: usize) -> String {
    let mut out = String::new();
    for (path, body) in files {
        let block = format!("### {path}\n```\n{body}\n```\n\n");
        if out.len() + block.len() > max_chars {
            let room = max_chars.saturating_sub(out.len() + path.len() + 32);
            if room > 200 {
                let cut: String = body.chars().take(room).collect();
                out.push_str(&format!("### {path} (truncated)\n```\n{cut}\n```\n\n"));
            }
            break;
        }
        out.push_str(&block);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_respects_budget() {
        let files = vec![("a.rs".to_string(), "x".repeat(100)), ("b.rs".to_string(), "y".repeat(5000))];
        let ctx = build_context(&files, 1000);
        assert!(ctx.len() <= 1000 + 64);
        assert!(ctx.contains("### a.rs"));
        assert!(ctx.contains("(truncated)"));
    }
}
