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
        out.push(Segment { start, end: start + len - 1, done: 0 });
        start += len;
    }
    out
}

pub struct DownloadOptions {
    pub segments: u32,
    pub expected_sha256: Option<String>,
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self { segments: 4, expected_sha256: None }
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

async fn content_length(client: &reqwest::Client, url: &str) -> Result<u64, HubError> {
    let resp = client.head(url).send().await?.error_for_status()?;
    resp.content_length().filter(|l| *l > 0).ok_or(HubError::NoLength)
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
    let state: Sidecar = match tokio::fs::read(&side).await.ok().and_then(|b| serde_json::from_slice::<Sidecar>(&b).ok()) {
        Some(s) if s.url == url && part.exists() => s,
        _ => {
            let total = content_length(client, url).await?;
            let f = OpenOptions::new().create(true).write(true).truncate(true).open(&part).await?;
            f.set_len(total).await?;
            Sidecar { url: url.to_string(), total, segments: plan_segments(total, opts.segments) }
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
        let (client, url, part, side) = (client.clone(), url.to_string(), part.clone(), side.clone());
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
        t.await.map_err(|e| HubError::Io(std::io::Error::other(e)))??;
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
