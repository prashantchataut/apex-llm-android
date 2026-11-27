//! Multi-segment, resumable HTTP Range downloader with SHA256 verification.
//!
//! Layout on disk: `<dest>.part` (pre-allocated) + `<dest>.apexdl` (JSON sidecar
//! with per-segment progress). On restart we read the sidecar and continue each
//! segment from `start + done`.

use crate::HubError;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use tokio::{
    fs::OpenOptions,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt, SeekFrom},
    sync::Mutex,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Segment {
    pub start: u64,
    /// inclusive
    pub end: u64,
    pub done: u64,
}

impl Segment {
    pub fn len(&self) -> u64 {
        self.end - self.start + 1
    }
    pub fn is_empty(&self) -> bool {
        false
    }
    pub fn remaining(&self) -> u64 {
        self.len() - self.done
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sidecar {
    pub url: String,
    pub total: u64,
    pub segments: Vec<Segment>,
}

/// Split `total` bytes into at most `n` contiguous inclusive ranges.
pub fn plan_segments(total: u64, n: u32) -> Vec<Segment> {
    if total == 0 {
        return vec![];
    }
    let n = (n.max(1) as u64).min(total);
    let base = total / n;
    let rem = total % n;
    let mut out = Vec::with_capacity(n as usize);
    let mut start = 0;
    for i in 0..n {
        let len = base + u64::from(i < rem);
        out.push(Segment {
            start,
            end: start + len - 1,
            done: 0,
        });
        start += len;
    }
    out
}

pub struct DownloadOptions {
    pub segments: u32,
    pub expected_sha256: Option<String>,
    /// Catalog size in bytes, used only when the server (and the hub API) do not report one.
    pub size_hint: Option<u64>,
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            segments: 4,
            expected_sha256: None,
            size_hint: None,
        }
    }
}

fn part_path(dest: &Path) -> PathBuf {
    let mut s = dest.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}
fn sidecar_path(dest: &Path) -> PathBuf {
    let mut s = dest.as_os_str().to_owned();
    s.push(".apexdl");
    PathBuf::from(s)
}

/// Parse the total out of `Content-Range: bytes 0-0/12345` (None for `*`).
pub fn parse_content_range_total(v: &str) -> Option<u64> {
    v.rsplit('/')
        .next()?
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|n| *n > 0)
}

/// Split `https://huggingface.co/{repo}/resolve/{rev}/{file}` into `(repo, file)`.
pub fn split_hf_resolve_url(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("https://huggingface.co/")?;
    let (repo, tail) = rest.split_once("/resolve/")?;
    let (_rev, file) = tail.split_once('/')?;
    let file = file.split('?').next()?;
    Some((repo.to_string(), file.to_string()))
}

fn header_u64(h: &reqwest::header::HeaderMap, name: &str) -> Option<u64> {
    h.get(name)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|n| *n > 0)
}

/// Best-effort total size. NEVER an error: `None` means "stream it and show an indeterminate bar".
///
/// Order: real `Content-Length` header on HEAD (note `reqwest::Response::content_length()` is the
/// body-size hint and is always 0 for HEAD, which is what used to raise "server did not report a
/// content length") → `X-Linked-Size` → `Range: bytes=0-0` probe + `Content-Range` → Hugging Face
/// `?blobs=true` JSON → the catalog's `size_hint`.
pub async fn resolve_total(client: &reqwest::Client, url: &str, hint: Option<u64>) -> Option<u64> {
    if let Ok(resp) = client.head(url).send().await {
        let h = resp.headers();
        if let Some(n) = header_u64(h, "content-length").or_else(|| header_u64(h, "x-linked-size"))
        {
            return Some(n);
        }
    }
    if let Ok(resp) = client.get(url).header("Range", "bytes=0-0").send().await {
        let h = resp.headers();
        if let Some(n) = h
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(parse_content_range_total)
            .or_else(|| header_u64(h, "x-linked-size"))
        {
            return Some(n);
        }
    }
    if let Some((repo, file)) = split_hf_resolve_url(url) {
        let api = format!("https://huggingface.co/api/models/{repo}?blobs=true");
        if let Ok(resp) = client.get(api).send().await {
            if let Ok(v) = resp.json::<serde_json::Value>().await {
                let size = v["siblings"].as_array().and_then(|a| {
                    a.iter()
                        .find(|s| s["rfilename"].as_str() == Some(file.as_str()))
                        .and_then(|s| s["size"].as_u64())
                });
                if let Some(n) = size.filter(|n| *n > 0) {
                    return Some(n);
                }
            }
        }
    }
    hint.filter(|n| *n > 0)
}

/// Single-connection streaming download for servers that give no usable length at all.
/// Progress is reported as `progress(received, 0)` (total 0 = unknown); the caller shows an
/// indeterminate bar. Completion is `stream ended`, never a byte comparison.
async fn download_unknown_length(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    progress: &(impl Fn(u64, u64) + Send + Sync),
) -> Result<u64, HubError> {
    let resp = client.get(url).send().await?.error_for_status()?;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(part)
        .await?;
    let mut stream = resp.bytes_stream();
    let mut got = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        got += chunk.len() as u64;
        progress(got, 0);
    }
    file.flush().await?;
    Ok(got)
}

pub async fn sha256_file(path: &Path) -> Result<String, HubError> {
    let mut f = tokio::fs::File::open(path).await?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Download `url` to `dest`. `progress(downloaded, total)` is called as bytes land.
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    opts: DownloadOptions,
    progress: impl Fn(u64, u64) + Send + Sync + 'static,
) -> Result<(), HubError> {
    let part = part_path(dest);
    let side = sidecar_path(dest);

    // Resume or plan.
    let state: Sidecar = match tokio::fs::read(&side)
        .await
        .ok()
        .and_then(|b| serde_json::from_slice::<Sidecar>(&b).ok())
    {
        Some(s) if s.url == url && part.exists() => s,
        _ => {
            let Some(total) = resolve_total(client, url, opts.size_hint).await else {
                // Unknown length: stream to .part, then rename. No resume (nothing to plan against).
                let got = download_unknown_length(client, url, &part, &progress).await?;
                if let Some(expected) = opts.expected_sha256 {
                    let actual = sha256_file(&part).await?;
                    if !actual.eq_ignore_ascii_case(&expected) {
                        let _ = tokio::fs::remove_file(&part).await;
                        return Err(HubError::ChecksumMismatch { expected, actual });
                    }
                }
                tokio::fs::rename(&part, dest).await?;
                progress(got, got);
                return Ok(());
            };
            let f = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&part)
                .await?;
            f.set_len(total).await?;
            Sidecar {
                url: url.to_string(),
                total,
                segments: plan_segments(total, opts.segments),
            }
        }
    };
    let total = state.total;
    let done0: u64 = state.segments.iter().map(|s| s.done).sum();
    let counter = Arc::new(AtomicU64::new(done0));
    let progress = Arc::new(progress);
    let shared = Arc::new(Mutex::new(state.clone()));

    let mut tasks = Vec::new();
    for (idx, seg) in state.segments.iter().cloned().enumerate() {
        if seg.remaining() == 0 {
            continue;
        }
        let (client, url, part, side) =
            (client.clone(), url.to_string(), part.clone(), side.clone());
        let (counter, progress, shared) = (counter.clone(), progress.clone(), shared.clone());
        tasks.push(tokio::spawn(async move {
            let from = seg.start + seg.done;
            let resp = client
                .get(&url)
                .header("Range", format!("bytes={from}-{}", seg.end))
                .send()
                .await?
                .error_for_status()?;
            let mut file = OpenOptions::new().write(true).open(&part).await?;
            file.seek(SeekFrom::Start(from)).await?;
            let mut stream = resp.bytes_stream();
            let mut since_flush = 0u64;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk?;
                file.write_all(&chunk).await?;
                let n = chunk.len() as u64;
                let now = counter.fetch_add(n, Ordering::Relaxed) + n;
                progress(now, total);
                since_flush += n;
                let mut st = shared.lock().await;
                st.segments[idx].done += n;
                if since_flush >= 4 << 20 {
                    since_flush = 0;
                    file.flush().await?;
                    let json = serde_json::to_vec(&*st)?;
                    tokio::fs::write(&side, json).await?;
                }
            }
            file.flush().await?;
            Ok::<(), HubError>(())
        }));
    }
    for t in tasks {
        // JoinError → io error; inner HubError propagated.
        t.await
            .map_err(|e| HubError::Io(std::io::Error::other(e)))??;
    }

    if let Some(expected) = opts.expected_sha256 {
        let actual = sha256_file(&part).await?;
        if !actual.eq_ignore_ascii_case(&expected) {
            // keep nothing corrupt around
            let _ = tokio::fs::remove_file(&part).await;
            let _ = tokio::fs::remove_file(&side).await;
            return Err(HubError::ChecksumMismatch { expected, actual });
        }
    }
    tokio::fs::rename(&part, dest).await?;
    let _ = tokio::fs::remove_file(&side).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_cover_exactly() {
        for (total, n) in [(10u64, 3u32), (1, 4), (1000, 4), (7, 7), (1 << 31, 8)] {
            let segs = plan_segments(total, n);
            assert_eq!(segs.iter().map(Segment::len).sum::<u64>(), total);
            assert_eq!(segs.first().unwrap().start, 0);
            assert_eq!(segs.last().unwrap().end, total - 1);
            for w in segs.windows(2) {
                assert_eq!(w[0].end + 1, w[1].start);
            }
        }
        assert!(plan_segments(0, 4).is_empty());
    }

    #[test]
    fn content_range_total_parses() {
        assert_eq!(
            parse_content_range_total("bytes 0-0/491400032"),
            Some(491400032)
        );
        assert_eq!(parse_content_range_total("bytes 0-0/*"), None);
        assert_eq!(parse_content_range_total("garbage"), None);
    }

    #[test]
    fn hf_resolve_url_splits() {
        assert_eq!(
            split_hf_resolve_url("https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/q4.gguf?download=true"),
            Some(("Qwen/Qwen2.5-0.5B-Instruct-GGUF".to_string(), "q4.gguf".to_string()))
        );
        assert_eq!(split_hf_resolve_url("https://example.com/x.gguf"), None);
    }

    #[tokio::test]
    async fn sha256_of_known_bytes() {
        let dir = std::env::temp_dir().join("apex_sha_test.bin");
        tokio::fs::write(&dir, b"abc").await.unwrap();
        assert_eq!(
            sha256_file(&dir).await.unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = tokio::fs::remove_file(&dir).await;
    }
}
