use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use api::{
  ApiClient, ChunkRegisterRequest, UploadChunkRequest, UploadCompleteRequest, UploadCommit,
  UploadPrepareRequest, UploadPrepareResponse, WebsiteClient,
};
use base64::engine::general_purpose;
use base64::Engine as _;
use bytes::Bytes;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
pub use chunker::ChunkConfig;
use chunker::{ChunkEvent, ChunkJob, ChunkerPool};
use crypto::encrypt_metadata;
use futures::stream::{FuturesUnordered, StreamExt};
use reqwest::Client as HttpClient;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use storage::{FileStatus, LocalIndex};
use thiserror::Error;
use uuid::Uuid;

use crate::scanner::{FastScanner, ScanPhase, ScanProgress, ScanResult};

const DEFAULT_BATCH_SIZE: usize = 200;
const DEFAULT_BATCH_MAX_BYTES: usize = 256 * 1024 * 1024;
const DEFAULT_MAX_INFLIGHT_BATCHES: usize = 2;
const DEFAULT_UPLOAD_CONCURRENCY: usize = 16;
const API_RETRIES: usize = 3;
const UPLOAD_RETRIES: usize = 3;

#[derive(Debug, Clone)]
pub struct WebsiteAuth {
  pub website_url: String,
  pub api_token: String,
}

#[derive(Debug, Clone)]
pub struct SyncV2Config {
  pub workspace_path: PathBuf,
  pub index_path: PathBuf,
  pub repo_id: String,
  pub cloud_url: String,
  pub website_auth: WebsiteAuth,
  pub content_key: Vec<u8>,
  pub metadata_key: Vec<u8>,
  pub salt: Vec<u8>,
  pub chunk_config: ChunkConfig,
  pub cold_chunk_config: ChunkConfig,
  pub batch_size: usize,
  pub batch_max_bytes: usize,
  pub max_inflight_batches: usize,
  pub upload_concurrency: usize,
  pub chunk_threads: usize,
}

#[derive(Debug, Clone)]
pub struct UploadProgress {
  pub phase: UploadPhase,
  pub total_files: usize,
  pub processed_files: usize,
  pub total_chunks: usize,
  pub uploaded_chunks: usize,
  pub skipped_chunks: usize,
  pub total_bytes: u64,
  pub uploaded_bytes: u64,
  pub start_time: Instant,
  pub start_time_ms: u128,
  pub timings: UploadTimings,
  pub errors: Vec<String>,
  pub current_file: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadPhase {
  Scanning,
  Chunking,
  Uploading,
  Committing,
  Done,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UploadTimings {
  pub scan_ms: u128,
  pub chunk_ms: u128,
  pub upload_ms: u128,
  pub commit_ms: u128,
  pub total_ms: u128,
}

#[derive(Debug, Clone)]
pub struct PushResult {
  pub commit_hash: String,
  pub stats: UploadProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkManifestEntry {
  pub id: String,
  pub size: u64,
  #[serde(default)]
  pub offset: Option<u64>,
  #[serde(rename = "packOffset", default)]
  pub pack_offset: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct PullResult {
  pub commit_hash: String,
  pub files_updated: usize,
}

#[derive(Debug, Error)]
pub enum SyncError {
  #[error("api error: {0}")]
  Api(#[from] api::ApiError),
  #[error("scanner error: {0}")]
  Scanner(#[from] crate::scanner::ScanError),
  #[error("chunker error: {0}")]
  Chunker(String),
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("crypto error: {0}")]
  Crypto(#[from] crypto::CryptoError),
  #[error("storage error: {0}")]
  Storage(#[from] storage::StorageError),
  #[error("http error: {0}")]
  Http(#[from] reqwest::Error),
  #[error("upload failed: {0}")]
  Upload(String),
}

pub struct SyncClientV2 {
  config: SyncV2Config,
  cloud_token: Option<String>,
  cloud_token_expiry: Option<i64>,
}

impl SyncClientV2 {
  pub fn new(config: SyncV2Config) -> Self {
    Self {
      config,
      cloud_token: None,
      cloud_token_expiry: None,
    }
  }

  pub async fn push_fast<F>(&mut self, message: Option<&str>, mut on_progress: F) -> Result<PushResult, SyncError>
  where
    F: FnMut(UploadProgress),
  {
    let mut progress = UploadProgress {
      phase: UploadPhase::Scanning,
      total_files: 0,
      processed_files: 0,
      total_chunks: 0,
      uploaded_chunks: 0,
      skipped_chunks: 0,
      total_bytes: 0,
      uploaded_bytes: 0,
      start_time: Instant::now(),
      start_time_ms: chrono::Utc::now().timestamp_millis() as u128,
      timings: UploadTimings::default(),
      errors: Vec::new(),
      current_file: None,
    };
    on_progress(progress.clone());

    let mut phase_start = Instant::now();

    let scanner = FastScanner::new(
      self.config.index_path.clone(),
      self.config.workspace_path.clone(),
    )?;

    let is_cold = !scanner.has_existing_index()?;
    let scan_result = if is_cold {
      scanner.cold_start_scan(|p| {
        progress.total_files = p.files_found;
        progress.processed_files = p.files_hashed;
        progress.current_file = p.current_file;
        if !p.errors.is_empty() {
          progress.errors = p.errors;
        }
        on_progress(progress.clone());
      })?
    } else {
      scanner.incremental_scan(|p| {
        progress.total_files = p.files_found;
        progress.processed_files = p.files_hashed;
        progress.current_file = p.current_file;
        if !p.errors.is_empty() {
          progress.errors = p.errors;
        }
        on_progress(progress.clone());
      })?
    };

    let mut changed = Vec::new();
    changed.extend(scan_result.added.iter().cloned());
    changed.extend(scan_result.modified.iter().cloned());

    let index = scanner.index();
    let changed_set: std::collections::HashSet<_> = changed.iter().cloned().collect();
    let mut backfill = Vec::new();
    for file in scanner.all_files()? {
      if file.status == FileStatus::Deleted {
        continue;
      }
      if changed_set.contains(&file.path) {
        continue;
      }
      let stored = index.get_chunks(&file.path)?;
      if stored.is_empty() && file.size > 0 {
        backfill.push(file.path.clone());
      }
    }

    if changed.is_empty() && scan_result.deleted.is_empty() && backfill.is_empty() {
      progress.timings.scan_ms = phase_start.elapsed().as_millis();
      if let Some(head) = scanner.head_commit()? {
        progress.phase = UploadPhase::Done;
        on_progress(progress.clone());
        return Ok(PushResult {
          commit_hash: head,
          stats: progress,
        });
      }

      self.refresh_cloud_token().await?;
      let api = ApiClient::new(self.config.cloud_url.clone(), self.cloud_token.clone().unwrap_or_default());
      progress.phase = UploadPhase::Committing;
      phase_start = Instant::now();
      on_progress(progress.clone());
      let commit_hash = create_commit(&api, &self.config, &scanner, message.unwrap_or("sync"), &HashMap::new()).await?;
      progress.timings.commit_ms = phase_start.elapsed().as_millis();
      progress.timings.total_ms = progress.start_time.elapsed().as_millis();
      progress.phase = UploadPhase::Done;
      on_progress(progress.clone());
      return Ok(PushResult {
        commit_hash,
        stats: progress,
      });
    }

    progress.timings.scan_ms = phase_start.elapsed().as_millis();
    progress.phase = UploadPhase::Chunking;
    phase_start = Instant::now();
    on_progress(progress.clone());

    struct PackCandidate {
      relative_path: String,
      full_path: PathBuf,
      size: u64,
      inode: u64,
      mtime_ns: i64,
    }

    let mut jobs = Vec::new();
    let index = scanner.index();
    let mut chunk_manifest: HashMap<String, Vec<ChunkManifestEntry>> = HashMap::new();
    let mut chunk_index: HashMap<String, u32> = HashMap::new();
    let pack_enabled = std::env::var("NEXUS_PACK_ENABLE")
      .ok()
      .map(|v| v != "0")
      .unwrap_or(is_cold);
    let pack_max_file = parse_size_env("NEXUS_PACK_MAX_FILE", 512 * 1024);
    let pack_max_bytes = parse_size_env("NEXUS_PACK_MAX_BYTES", 64 * 1024 * 1024);
    let mut pack_candidates: Vec<PackCandidate> = Vec::new();

    for rel in changed.iter().chain(backfill.iter()) {
      let full = self.config.workspace_path.join(rel);
      let meta = std::fs::metadata(&full)?;
      index.delete_chunks(rel)?;
      let size = meta.len();
      if pack_enabled && pack_max_file > 0 && pack_max_bytes > 0 && size > 0 && size <= pack_max_file {
        pack_candidates.push(PackCandidate {
          relative_path: rel.clone(),
          full_path: full,
          size,
          inode: inode_of(&meta),
          mtime_ns: mtime_ns_of(&meta),
        });
      } else {
        jobs.push(ChunkJob {
          full_path: full,
          relative_path: rel.clone(),
          size,
        });
      }
    }

    let chunk_config = if is_cold {
      self.config.cold_chunk_config
    } else {
      self.config.chunk_config
    };
    let pool = ChunkerPool::new(self.config.chunk_threads.max(1))
      .map_err(|err| SyncError::Chunker(err.to_string()))?;
    let rx = pool.chunk_files(
      jobs,
      chunk_config,
      self.config.content_key.clone(),
      self.config.salt.clone(),
    );

    self.refresh_cloud_token().await?;
    let api = ApiClient::new(self.config.cloud_url.clone(), self.cloud_token.clone().unwrap_or_default());
    let http = build_http_client()?;
    let batch_timeout_ms = std::env::var("NEXUS_UPLOAD_BATCH_TIMEOUT_MS")
      .ok()
      .and_then(|v| v.parse::<u64>().ok())
      .unwrap_or(60_000);
    let mut in_flight = FuturesUnordered::new();
    let mut pending: Vec<chunker::ChunkPayload> = Vec::new();
    let mut pending_bytes = 0usize;
    let mut upload_start: Option<Instant> = None;
    let make_batch_future = |api: ApiClient,
                             http: HttpClient,
                             batch: Vec<chunker::ChunkPayload>,
                             upload_concurrency: usize,
                             timeout_ms: u64| async move {
      if timeout_ms == 0 {
        upload_batch(&api, &http, &batch, upload_concurrency).await
      } else {
        tokio::time::timeout(
          std::time::Duration::from_millis(timeout_ms),
          upload_batch(&api, &http, &batch, upload_concurrency),
        )
        .await
        .map_err(|_| SyncError::Upload(format!("upload batch timed out after {}ms", timeout_ms)))?
      }
    };

    let mut pack_payloads: Vec<chunker::ChunkPayload> = Vec::new();
    if pack_enabled && !pack_candidates.is_empty() {
      let mut pack_buffer: Vec<u8> = Vec::new();
      let mut pack_entries: Vec<(String, u64, u64, i64, String, u64)> = Vec::new();

      let mut flush_pack = |pack_buffer: &mut Vec<u8>,
                            pack_entries: &mut Vec<(String, u64, u64, i64, String, u64)>|
       -> Result<(), SyncError> {
        if pack_entries.is_empty() {
          return Ok(());
        }
        let (encrypted_id, encrypted_data) =
          crypto::encrypt_chunk_xchacha(pack_buffer, &self.config.content_key, &self.config.salt)?;
        pack_payloads.push(chunker::ChunkPayload {
          encrypted_id: encrypted_id.clone(),
          data: encrypted_data,
          size: pack_buffer.len() as u32,
          offset: 0,
          relative_path: pack_entries[0].0.clone(),
        });

        for (path, size, inode, mtime_ns, content_id, pack_offset) in pack_entries.drain(..) {
          let status = index
            .get_file(&path)?
            .map(|r| r.status)
            .unwrap_or(FileStatus::New);
          let mut record = index.get_file(&path)?.unwrap_or(storage::FileRecord {
            path: path.clone(),
            inode,
            size,
            mtime_ns,
            quick_hash: None,
            content_id: None,
            chunk_count: 1,
            status,
          });
          record.content_id = Some(content_id);
          record.chunk_count = 1;
          record.inode = inode;
          record.size = size;
          record.mtime_ns = mtime_ns;
          if status != FileStatus::New {
            record.status = FileStatus::Modified;
          }
          index.upsert_file(&record)?;

          let entry = ChunkManifestEntry {
            id: encrypted_id.clone(),
            size,
            offset: Some(0),
            pack_offset: Some(pack_offset),
          };
          chunk_manifest.entry(path.clone()).or_default().push(entry);
          let idx = chunk_index.entry(path.clone()).or_insert(0);
          index.upsert_chunk(&storage::ChunkRecord {
            chunk_id: encrypted_id.clone(),
            file_path: path.clone(),
            chunk_index: *idx,
            offset: 0,
            length: size,
            encrypted_id: Some(encrypted_id.clone()),
            pack_offset: Some(pack_offset),
            uploaded: false,
          })?;
          *idx += 1;
        }

        pack_buffer.clear();
        Ok(())
      };

      for candidate in pack_candidates {
        let data = std::fs::read(&candidate.full_path)?;
        let content_id = compute_content_id_from_bytes(&data, &self.config.content_key)?;
        let pack_offset = pack_buffer.len() as u64;
        pack_buffer.extend_from_slice(&data);
        pack_entries.push((
          candidate.relative_path.clone(),
          candidate.size,
          candidate.inode,
          candidate.mtime_ns,
          content_id,
          pack_offset,
        ));
        progress.processed_files += 1;
        progress.current_file = Some(candidate.relative_path.clone());
        if progress.processed_files % 200 == 0 {
          on_progress(progress.clone());
        }

        if pack_buffer.len() as u64 >= pack_max_bytes {
          flush_pack(&mut pack_buffer, &mut pack_entries)?;
        }
      }
      flush_pack(&mut pack_buffer, &mut pack_entries)?;
    }

    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<ChunkEvent>(512);
    let forwarder = tokio::task::spawn_blocking(move || {
      for event in rx.iter() {
        if event_tx.blocking_send(event).is_err() {
          break;
        }
      }
    });

    for payload in pack_payloads {
      progress.total_chunks += 1;
      progress.total_bytes += payload.data.len() as u64;
      pending_bytes += payload.data.len();
      pending.push(payload);

      if pending.len() >= self.config.batch_size || pending_bytes >= self.config.batch_max_bytes {
        let batch = std::mem::take(&mut pending);
        pending_bytes = 0;
        if upload_start.is_none() {
          upload_start = Some(Instant::now());
          progress.phase = UploadPhase::Uploading;
          on_progress(progress.clone());
        }
        let api = api.clone();
        let http = http.clone();
        let upload_concurrency = self.config.upload_concurrency;
        let timeout_ms = batch_timeout_ms;
        in_flight.push(make_batch_future(api, http, batch, upload_concurrency, timeout_ms));

        if in_flight.len() >= self.config.max_inflight_batches {
          if let Some(result) = in_flight.next().await {
            match result {
              Ok(stats) => {
                progress.uploaded_chunks += stats.uploaded_chunks;
                progress.skipped_chunks += stats.skipped_chunks;
                progress.uploaded_bytes += stats.uploaded_bytes;
              }
              Err(err) => progress.errors.push(err.to_string()),
            }
            on_progress(progress.clone());
          }
        }
      }
    }

    while let Some(event) = event_rx.recv().await {
      match event {
        ChunkEvent::Chunk(payload) => {
          progress.total_chunks += 1;
          progress.total_bytes += payload.data.len() as u64;
          let entry = ChunkManifestEntry {
            id: payload.encrypted_id.clone(),
            size: payload.size as u64,
            offset: Some(payload.offset),
            pack_offset: None,
          };
          chunk_manifest
            .entry(payload.relative_path.clone())
            .or_default()
            .push(entry.clone());
          let idx = chunk_index.entry(payload.relative_path.clone()).or_insert(0);
          index.upsert_chunk(&storage::ChunkRecord {
            chunk_id: payload.encrypted_id.clone(),
            file_path: payload.relative_path.clone(),
            chunk_index: *idx,
            offset: payload.offset,
            length: payload.size as u64,
            encrypted_id: Some(payload.encrypted_id.clone()),
            pack_offset: None,
            uploaded: false,
          })?;
          *idx += 1;

          pending_bytes += payload.data.len();
          pending.push(payload);

          if pending.len() >= self.config.batch_size || pending_bytes >= self.config.batch_max_bytes {
            let batch = std::mem::take(&mut pending);
            pending_bytes = 0;
            if upload_start.is_none() {
              upload_start = Some(Instant::now());
              progress.phase = UploadPhase::Uploading;
              on_progress(progress.clone());
            }
            let api = api.clone();
            let http = http.clone();
            let upload_concurrency = self.config.upload_concurrency;
            let timeout_ms = batch_timeout_ms;
            in_flight.push(make_batch_future(api, http, batch, upload_concurrency, timeout_ms));

            if in_flight.len() >= self.config.max_inflight_batches {
              if let Some(result) = in_flight.next().await {
                match result {
                  Ok(stats) => {
                    progress.uploaded_chunks += stats.uploaded_chunks;
                    progress.skipped_chunks += stats.skipped_chunks;
                    progress.uploaded_bytes += stats.uploaded_bytes;
                  }
                  Err(err) => progress.errors.push(err.to_string()),
                }
                on_progress(progress.clone());
              }
            }
          }

          if progress.total_chunks % 100 == 0 {
            on_progress(progress.clone());
          }
        }
        ChunkEvent::Done {
          relative_path,
          total_chunks,
          content_id,
          ..
        } => {
          let full_path = self.config.workspace_path.join(&relative_path);
          let meta = std::fs::metadata(&full_path)?;
          let mut record = index.get_file(&relative_path)?.unwrap_or(storage::FileRecord {
            path: relative_path.clone(),
            inode: inode_of(&meta),
            size: meta.len(),
            mtime_ns: mtime_ns_of(&meta),
            quick_hash: None,
            content_id: None,
            chunk_count: total_chunks,
            status: FileStatus::Modified,
          });
          record.content_id = Some(content_id);
          record.chunk_count = total_chunks;
          record.inode = inode_of(&meta);
          record.size = meta.len();
          record.mtime_ns = mtime_ns_of(&meta);
          index.upsert_file(&record)?;
          progress.processed_files += 1;
          on_progress(progress.clone());
        }
        ChunkEvent::Error { relative_path, error } => {
          progress.errors.push(format!("{}: {}", relative_path, error));
          on_progress(progress.clone());
        }
      }
    }

    let _ = forwarder.await;
    progress.timings.chunk_ms = phase_start.elapsed().as_millis();

    if !pending.is_empty() {
      let batch = std::mem::take(&mut pending);
      if upload_start.is_none() {
        upload_start = Some(Instant::now());
        progress.phase = UploadPhase::Uploading;
        on_progress(progress.clone());
      }
      let api = api.clone();
      let http = http.clone();
      let upload_concurrency = self.config.upload_concurrency;
      let timeout_ms = batch_timeout_ms;
      in_flight.push(make_batch_future(api, http, batch, upload_concurrency, timeout_ms));
    }

    while let Some(result) = in_flight.next().await {
      match result {
        Ok(stats) => {
          progress.uploaded_chunks += stats.uploaded_chunks;
          progress.skipped_chunks += stats.skipped_chunks;
          progress.uploaded_bytes += stats.uploaded_bytes;
        }
        Err(err) => progress.errors.push(err.to_string()),
      }
      on_progress(progress.clone());
    }

    progress.timings.upload_ms = upload_start
      .map(|start| start.elapsed().as_millis())
      .unwrap_or(0);
    progress.phase = UploadPhase::Committing;
    phase_start = Instant::now();
    on_progress(progress.clone());

    let commit_hash = create_commit(
      &api,
      &self.config,
      &scanner,
      message.unwrap_or("sync"),
      &chunk_manifest,
    )
    .await?;

    progress.timings.commit_ms = phase_start.elapsed().as_millis();
    progress.timings.total_ms = progress.start_time.elapsed().as_millis();
    progress.phase = UploadPhase::Done;
    on_progress(progress.clone());

    Ok(PushResult {
      commit_hash,
      stats: progress,
    })
  }

  pub async fn pull(&mut self) -> Result<PullResult, SyncError> {
    self.refresh_cloud_token().await?;
    let api = ApiClient::new(self.config.cloud_url.clone(), self.cloud_token.clone().unwrap_or_default());

    let remote = match api.get::<api::Ref>("/api/v1/refs/main").await {
      Ok(remote) => remote,
      Err(api::ApiError::Status { status: 404, .. }) => {
        return Ok(PullResult {
          commit_hash: String::new(),
          files_updated: 0,
        });
      }
      Err(err) => return Err(SyncError::Api(err)),
    };
    let index = LocalIndex::open(
      self.config.index_path.clone(),
      &self.config.workspace_path,
      Some(&self.config.repo_id),
    )?;
    let local = index.head_commit()?.unwrap_or_default();

    if remote.hash == local {
      return Ok(PullResult {
        commit_hash: remote.hash,
        files_updated: 0,
      });
    }

    let commit = api.get::<CommitResponse>(&format!("/api/v1/commits/{}", remote.hash)).await?;
    let commit_bytes = general_purpose::STANDARD
      .decode(commit.data.as_bytes())
      .map_err(|err| SyncError::Upload(err.to_string()))?;
    let commit_data: serde_json::Value =
      serde_json::from_slice(&commit_bytes).map_err(|err| SyncError::Upload(err.to_string()))?;
    let tree_hash = commit_data
      .get("tree")
      .and_then(|v| v.as_str())
      .ok_or_else(|| SyncError::Upload("missing tree hash".to_string()))?
      .to_string();

    let tree_blob = api.get::<BlobResponse>(&format!("/api/v1/blobs/{}", tree_hash)).await?;
    let tree_encrypted = general_purpose::STANDARD
      .decode(tree_blob.data.as_bytes())
      .map_err(|err| SyncError::Upload(err.to_string()))?;
    let tree_plain = decrypt_with_key(&tree_encrypted, &self.config.content_key)?;
    let tree_entries: Vec<TreeEntry> =
      serde_json::from_slice(&tree_plain).map_err(|err| SyncError::Upload(err.to_string()))?;

    let existing = index
      .all_files()?
      .into_iter()
      .map(|f| (f.path.clone(), f))
      .collect::<HashMap<_, _>>();
    let http = build_http_client()?;

    let mut files_updated = 0usize;
    let mut seen_paths = HashMap::new();
    let mut download_cache: HashMap<String, Vec<u8>> = HashMap::new();

    for entry in tree_entries {
      let encrypted_name = general_purpose::STANDARD
        .decode(entry.encrypted_name.as_bytes())
        .map_err(|err| SyncError::Upload(err.to_string()))?;
      let metadata = crypto::decrypt_metadata(&encrypted_name, &self.config.metadata_key)
        .ok_or_else(|| SyncError::Upload("failed to decrypt metadata".to_string()))?;
      let relative_path = metadata.filename.clone();
      seen_paths.insert(relative_path.clone(), true);

      let full_path = self.config.workspace_path.join(&relative_path);
      let local_record = existing.get(&relative_path);
      let local_exists = full_path.exists();

      let local_modified = if local_exists {
        let local_content_id = compute_content_id_for_file(&full_path, &self.config.content_key)?;
        local_record
          .and_then(|r| r.content_id.clone())
          .map(|id| id != local_content_id)
          .unwrap_or(true)
      } else {
        false
      };

      let needs_download = local_record
        .and_then(|r| r.content_id.clone())
        .map(|id| id != entry.hash)
        .unwrap_or(true);

      if needs_download {
      let chunks = entry.chunks.clone().unwrap_or_default();
      if chunks.is_empty() && metadata.size == 0 {
        if let Some(parent) = full_path.parent() {
          std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&full_path, &[])?;
        files_updated += 1;
        index.upsert_file(&storage::FileRecord {
          path: relative_path.clone(),
          inode: 0,
          size: metadata.size as u64,
          mtime_ns: metadata.mtime as i64,
          quick_hash: None,
          content_id: Some(entry.hash.clone()),
          chunk_count: 0,
          status: FileStatus::Synced,
        })?;
        index.delete_chunks(&relative_path)?;
        continue;
      }
      if chunks.is_empty() {
        return Err(SyncError::Upload(format!("missing chunks for {}", relative_path)));
      }
        let chunk_ids: Vec<String> = chunks.iter().map(|c| c.id.clone()).collect();
        let missing: Vec<String> = chunk_ids
          .iter()
          .filter(|id| !download_cache.contains_key(*id))
          .cloned()
          .collect();
        if !missing.is_empty() {
          let downloaded = download_chunks(&api, &http, &missing, self.config.upload_concurrency).await?;
          for (id, data) in downloaded {
            download_cache.insert(id, data);
          }
        }

        let use_offsets = chunks.iter().all(|c| c.offset.is_some());
        let mut remote_content = if use_offsets {
          vec![0u8; metadata.size as usize]
        } else {
          Vec::new()
        };
        for chunk in &chunks {
          let encrypted = download_cache
            .get(&chunk.id)
            .ok_or_else(|| SyncError::Upload("missing downloaded chunk".to_string()))?;
          let plaintext = decrypt_chunk(encrypted, &self.config.content_key)?;
          if use_offsets {
            let file_offset = chunk.offset.unwrap_or(0) as usize;
            let len = chunk.size as usize;
            let slice = if let Some(pack_offset) = chunk.pack_offset {
              let start = pack_offset as usize;
              let end = start + len;
              &plaintext[start..end]
            } else if plaintext.len() == len {
              &plaintext
            } else {
              &plaintext[..len.min(plaintext.len())]
            };
            remote_content[file_offset..file_offset + len].copy_from_slice(slice);
          } else {
            remote_content.extend_from_slice(&plaintext);
          }
        }

        if local_modified {
          handle_conflict(
            &full_path,
            &relative_path,
            &remote_content,
          )?;
          files_updated += 1;
        } else {
          if let Some(parent) = full_path.parent() {
            std::fs::create_dir_all(parent)?;
          }
          std::fs::write(&full_path, &remote_content)?;
          files_updated += 1;
        }

        index.upsert_file(&storage::FileRecord {
          path: relative_path.clone(),
          inode: 0,
          size: metadata.size as u64,
          mtime_ns: metadata.mtime as i64,
          quick_hash: None,
          content_id: Some(entry.hash.clone()),
          chunk_count: chunks.len() as u32,
          status: FileStatus::Synced,
        })?;
        index.delete_chunks(&relative_path)?;
        for (idx, chunk) in chunks.iter().enumerate() {
          index.upsert_chunk(&storage::ChunkRecord {
            chunk_id: chunk.id.clone(),
            file_path: relative_path.clone(),
            chunk_index: idx as u32,
            offset: chunk.offset.unwrap_or(0),
            length: chunk.size,
            encrypted_id: Some(chunk.id.clone()),
            pack_offset: chunk.pack_offset,
            uploaded: true,
          })?;
        }
      }
    }

    for (path, record) in existing {
      if !seen_paths.contains_key(&path) {
        let full_path = self.config.workspace_path.join(&path);
        if full_path.exists() {
          if !is_local_modified(&full_path, record.content_id.as_deref(), &self.config.content_key)? {
            std::fs::remove_file(&full_path)?;
            files_updated += 1;
          }
        }
        index.upsert_file(&storage::FileRecord {
          path: record.path,
          inode: record.inode,
          size: record.size,
          mtime_ns: record.mtime_ns,
          quick_hash: record.quick_hash,
          content_id: record.content_id,
          chunk_count: record.chunk_count,
          status: FileStatus::Deleted,
        })?;
      }
    }

    index.set_head_commit(&remote.hash)?;

    Ok(PullResult {
      commit_hash: remote.hash,
      files_updated,
    })
  }

  async fn refresh_cloud_token(&mut self) -> Result<(), SyncError> {
    let now = chrono::Utc::now().timestamp();
    if let (Some(token), Some(expiry)) = (&self.cloud_token, self.cloud_token_expiry) {
      if expiry > now + 60 {
        let _ = token;
        return Ok(());
      }
    }

    let website = WebsiteClient::new(
      self.config.website_auth.website_url.clone(),
      self.config.website_auth.api_token.clone(),
    );
    let response = website.cloud_token(&self.config.repo_id, "write").await?;
    let expiry = chrono::DateTime::parse_from_rfc3339(&response.expires_at)
      .map_err(|err| SyncError::Upload(err.to_string()))?
      .timestamp();
    self.cloud_token = Some(response.token);
    self.cloud_token_expiry = Some(expiry);
    Ok(())
  }
}

#[derive(Debug, Clone)]
struct BatchStats {
  uploaded_chunks: usize,
  skipped_chunks: usize,
  uploaded_bytes: u64,
}

async fn upload_batch(
  api: &ApiClient,
  http: &HttpClient,
  batch: &[chunker::ChunkPayload],
  upload_concurrency: usize,
) -> Result<BatchStats, SyncError> {
  let debug = std::env::var("NEXUS_UPLOAD_DEBUG").ok().as_deref() == Some("1");
  let start = std::time::Instant::now();
  if debug {
    eprintln!("upload_batch: preparing {} chunks", batch.len());
  }
  let chunk_info: Vec<UploadChunkRequest> = batch
    .iter()
    .map(|c| UploadChunkRequest {
      id: c.encrypted_id.clone(),
      size: c.data.len() as u64,
    })
    .collect();

  let prepare = api_post_json_retry::<UploadPrepareRequest, UploadPrepareResponse>(
    api,
    "/api/v1/upload/prepare",
    &UploadPrepareRequest { chunks: chunk_info },
  )
  .await?;

  let mut needed_map = std::collections::HashMap::new();
  for item in prepare.needed {
    needed_map.insert(item.id.clone(), item.url.clone());
  }
  if debug {
    eprintln!(
      "upload_batch: prepare done (needed {}, skipped {}) in {:?}",
      needed_map.len(),
      batch.len().saturating_sub(needed_map.len()),
      start.elapsed()
    );
  }

  let mut upload_tasks = FuturesUnordered::new();
  let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(upload_concurrency));
  let mut skipped_chunks = 0usize;

  for chunk in batch {
    if let Some(url) = needed_map.get(&chunk.encrypted_id) {
      let client = http.clone();
      let url = url.clone();
      let data = Bytes::from(chunk.data.clone());
      let semaphore = semaphore.clone();
      upload_tasks.push(async move {
        let _permit = semaphore
          .acquire_owned()
          .await
          .map_err(|err| SyncError::Upload(err.to_string()))?;
        upload_with_retry(&client, &url, data).await?;
        Ok::<(), SyncError>(())
      });
    } else {
      skipped_chunks += 1;
    }
  }
  if debug {
    eprintln!("upload_batch: uploading {} chunks", upload_tasks.len());
  }

  let mut uploaded_chunks = 0usize;
  while let Some(res) = upload_tasks.next().await {
    res?;
    uploaded_chunks += 1;
  }

  let uploaded_ids: Vec<String> = batch
    .iter()
    .filter(|c| needed_map.contains_key(&c.encrypted_id))
    .map(|c| c.encrypted_id.clone())
    .collect();
  let uploaded_bytes: u64 = batch
    .iter()
    .filter(|c| needed_map.contains_key(&c.encrypted_id))
    .map(|c| c.data.len() as u64)
    .sum();

  if !uploaded_ids.is_empty() {
    api_post_empty_retry(
      api,
      "/api/v1/chunks/register",
      &ChunkRegisterRequest {
        ids: uploaded_ids,
        total_size: uploaded_bytes,
      },
    )
    .await?;
  }
  if debug {
    eprintln!(
      "upload_batch: done uploaded {} skipped {} total {:?}",
      uploaded_chunks,
      skipped_chunks,
      start.elapsed()
    );
  }

  Ok(BatchStats {
    uploaded_chunks,
    skipped_chunks,
    uploaded_bytes,
  })
}

async fn create_commit(
  api: &ApiClient,
  config: &SyncV2Config,
  scanner: &FastScanner,
  message: &str,
  chunk_manifest: &HashMap<String, Vec<ChunkManifestEntry>>,
) -> Result<String, SyncError> {
  let mut tree = Vec::new();

  for file in scanner.all_files()? {
    if file.status == FileStatus::Deleted {
      continue;
    }
    let content_id = match &file.content_id {
      Some(id) => id.clone(),
      None => continue,
    };

    let full_path = config.workspace_path.join(&file.path);
    let stat = std::fs::metadata(&full_path)?;
    let current_inode = inode_of(&stat);
    let current_size = stat.len();
    let current_mtime_ns = mtime_ns_of(&stat);
    if current_size != file.size || current_mtime_ns != file.mtime_ns {
      let mut updated = file.clone();
      updated.inode = current_inode;
      updated.size = current_size;
      updated.mtime_ns = current_mtime_ns;
      updated.content_id = None;
      updated.status = FileStatus::Modified;
      scanner.index().upsert_file(&updated)?;
      continue;
    }

    let encrypted_name = encrypt_metadata(
      &crypto::FileMetadata {
        filename: file.path.clone(),
        size: file.size,
        mode: file_mode(&stat),
        mtime: mtime_ms(&stat),
      },
      &config.metadata_key,
    )?;

    let chunks = if let Some(chunks) = chunk_manifest.get(&file.path) {
      Some(chunks.clone())
    } else {
      let stored = scanner.index().get_chunks(&file.path)?;
      if stored.is_empty() {
        None
      } else {
        Some(
          stored
            .into_iter()
            .map(|chunk| ChunkManifestEntry {
              id: chunk.chunk_id,
              size: chunk.length,
              offset: Some(chunk.offset),
              pack_offset: chunk.pack_offset,
            })
            .collect(),
        )
      }
    };

    let chunks = if chunks.is_none() && file.size == 0 {
      Some(Vec::new())
    } else {
      chunks
    };

    let chunks = match chunks {
      Some(chunks) => chunks,
      None => {
        let mut updated = file.clone();
        updated.inode = current_inode;
        updated.size = current_size;
        updated.mtime_ns = current_mtime_ns;
        updated.content_id = None;
        updated.status = FileStatus::Modified;
        scanner.index().upsert_file(&updated)?;
        continue;
      }
    };

    tree.push(serde_json::json!({
      "encryptedName": general_purpose::STANDARD.encode(encrypted_name),
      "hash": content_id,
      "type": "blob",
      "mode": file_mode(&stat),
      "chunks": chunks,
    }));
  }

  let tree_json = serde_json::to_vec(&tree).map_err(|err| SyncError::Upload(err.to_string()))?;
  let encrypted_tree = encrypt_with_key(&tree_json, &config.content_key)?;
  let head_commit = scanner.head_commit()?.unwrap_or_default();
  let parents = if head_commit.is_empty() { Vec::new() } else { vec![head_commit] };

  let response = api_post_json_retry::<UploadCompleteRequest, api::UploadCompleteResponse>(
    api,
    "/api/v1/upload/complete",
    &UploadCompleteRequest {
      session_id: Uuid::new_v4().to_string(),
      tree: general_purpose::STANDARD.encode(encrypted_tree),
      commit: UploadCommit {
        message: message.to_string(),
        parents,
      },
    },
  )
  .await?;

  scanner.set_head_commit(&response.commit_hash)?;
  Ok(response.commit_hash)
}

fn encrypt_with_key(data: &[u8], key: &[u8]) -> Result<Vec<u8>, SyncError> {
  let cipher = XChaCha20Poly1305::new_from_slice(key)
    .map_err(|_| SyncError::Upload("invalid key length".to_string()))?;
  let nonce = random_bytes(24)?;
  let nonce_arr = XNonce::from_slice(&nonce);
  let ciphertext = cipher
    .encrypt(nonce_arr, data)
    .map_err(|_| SyncError::Upload("encrypt failed".to_string()))?;
  let mut out = Vec::with_capacity(nonce.len() + ciphertext.len());
  out.extend_from_slice(&nonce);
  out.extend_from_slice(&ciphertext);
  Ok(out)
}

fn file_mode(meta: &std::fs::Metadata) -> u32 {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode()
  }
  #[cfg(not(unix))]
  {
    0
  }
}

fn mtime_ms(meta: &std::fs::Metadata) -> i64 {
  match meta.modified() {
    Ok(time) => match time.duration_since(std::time::UNIX_EPOCH) {
      Ok(dur) => dur.as_millis() as i64,
      Err(_) => 0,
    },
    Err(_) => 0,
  }
}

fn inode_of(metadata: &std::fs::Metadata) -> u64 {
  #[cfg(unix)]
  {
    use std::os::unix::fs::MetadataExt;
    metadata.ino()
  }
  #[cfg(not(unix))]
  {
    0
  }
}

fn mtime_ns_of(metadata: &std::fs::Metadata) -> i64 {
  #[cfg(unix)]
  {
    use std::os::unix::fs::MetadataExt;
    metadata.mtime_nsec()
  }
  #[cfg(not(unix))]
  {
    0
  }
}

fn random_bytes(len: usize) -> Result<Vec<u8>, SyncError> {
  let mut buf = vec![0u8; len];
  getrandom::fill(&mut buf).map_err(|err| SyncError::Upload(err.to_string()))?;
  Ok(buf)
}

fn _use_scan_types(_p: ScanProgress, _r: ScanResult, _s: ScanPhase) {}

async fn api_post_json_retry<B: Serialize, T: for<'de> Deserialize<'de>>(
  api: &ApiClient,
  path: &str,
  body: &B,
) -> Result<T, SyncError> {
  let mut last_err: Option<api::ApiError> = None;
  for attempt in 0..API_RETRIES {
    match api.post_json::<B, T>(path, body).await {
      Ok(resp) => return Ok(resp),
      Err(err) => {
        let retry = matches!(err, api::ApiError::Status { status, .. } if status >= 500 || status == 429);
        last_err = Some(err);
        if retry && attempt + 1 < API_RETRIES {
          let delay = backoff_delay(attempt);
          tokio::time::sleep(delay).await;
          continue;
        }
        return Err(SyncError::Api(last_err.unwrap()));
      }
    }
  }
  Err(SyncError::Api(last_err.unwrap()))
}

async fn api_post_empty_retry<B: Serialize>(
  api: &ApiClient,
  path: &str,
  body: &B,
) -> Result<(), SyncError> {
  let mut last_err: Option<api::ApiError> = None;
  for attempt in 0..API_RETRIES {
    match api.post_empty(path, body).await {
      Ok(()) => return Ok(()),
      Err(err) => {
        let retry = matches!(err, api::ApiError::Status { status, .. } if status >= 500 || status == 429);
        last_err = Some(err);
        if retry && attempt + 1 < API_RETRIES {
          let delay = backoff_delay(attempt);
          tokio::time::sleep(delay).await;
          continue;
        }
        return Err(SyncError::Api(last_err.unwrap()));
      }
    }
  }
  Err(SyncError::Api(last_err.unwrap()))
}

async fn upload_with_retry(client: &HttpClient, url: &str, data: Bytes) -> Result<(), SyncError> {
  let mut last_err: Option<SyncError> = None;
  for attempt in 0..UPLOAD_RETRIES {
    match client.put(url).body(data.clone()).send().await {
      Ok(resp) => {
        if resp.status().is_success() {
          return Ok(());
        }
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        let err = SyncError::Upload(format!("upload failed: {} {}", status, body));
        let retry = status >= 500 || status == 429;
        last_err = Some(err);
        if retry && attempt + 1 < UPLOAD_RETRIES {
          let delay = backoff_delay(attempt);
          tokio::time::sleep(delay).await;
          continue;
        }
        return Err(last_err.unwrap());
      }
      Err(err) => {
        last_err = Some(SyncError::Http(err));
        if attempt + 1 < UPLOAD_RETRIES {
          let delay = backoff_delay(attempt);
          tokio::time::sleep(delay).await;
          continue;
        }
        return Err(last_err.unwrap());
      }
    }
  }
  Err(last_err.unwrap())
}

fn build_http_client() -> Result<HttpClient, SyncError> {
  let timeout_ms = std::env::var("NEXUS_HTTP_TIMEOUT_MS")
    .ok()
    .and_then(|v| v.parse::<u64>().ok())
    .unwrap_or(60_000);
  HttpClient::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()
    .map_err(SyncError::Http)
}

fn parse_size_env(key: &str, fallback: u64) -> u64 {
  let value = std::env::var(key).ok();
  parse_size(value.as_deref(), fallback)
}

fn parse_size(value: Option<&str>, fallback: u64) -> u64 {
  let Some(raw) = value else {
    return fallback;
  };
  let trimmed = raw.trim().to_lowercase();
  if trimmed.is_empty() {
    return fallback;
  }
  let mut number = String::new();
  let mut unit = String::new();
  for ch in trimmed.chars() {
    if ch.is_ascii_digit() || ch == '.' {
      number.push(ch);
    } else if !ch.is_whitespace() {
      unit.push(ch);
    }
  }
  let amount: f64 = number.parse().unwrap_or(0.0);
  let multiplier = match unit.as_str() {
    "g" | "gb" => 1024.0 * 1024.0 * 1024.0,
    "m" | "mb" => 1024.0 * 1024.0,
    "k" | "kb" => 1024.0,
    "" | "b" => 1.0,
    _ => 1.0,
  };
  (amount * multiplier).max(1.0) as u64
}

fn backoff_delay(attempt: usize) -> std::time::Duration {
  let base = 250u64;
  let exp = 2u64.pow(attempt.min(6) as u32);
  std::time::Duration::from_millis(base * exp)
}

#[derive(Debug, Deserialize)]
struct CommitResponse {
  pub data: String,
}

#[derive(Debug, Deserialize)]
struct BlobResponse {
  pub data: String,
}

#[derive(Debug, Deserialize)]
struct TreeEntry {
  #[serde(rename = "encryptedName")]
  pub encrypted_name: String,
  pub hash: String,
  #[serde(default)]
  pub chunks: Option<Vec<ChunkManifestEntry>>,
}

async fn download_chunks(
  api: &ApiClient,
  http: &HttpClient,
  chunk_ids: &[String],
  concurrency: usize,
) -> Result<HashMap<String, Vec<u8>>, SyncError> {
  let mut unique_ids: Vec<String> = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for id in chunk_ids {
    if seen.insert(id.clone()) {
      unique_ids.push(id.clone());
    }
  }

  let response = api_post_json_retry::<api::DownloadPrepareRequest, api::DownloadPrepareResponse>(
    api,
    "/api/v1/download/prepare",
    &api::DownloadPrepareRequest {
      chunks: unique_ids.clone(),
    },
  )
  .await?;

  let mut url_map = HashMap::new();
  for url in response.urls {
    url_map.insert(url.id.clone(), url.url.clone());
  }

  let mut results: HashMap<String, Vec<u8>> = HashMap::new();
  let mut tasks = FuturesUnordered::new();
  let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency.max(1)));

  for chunk_id in &unique_ids {
    let url = url_map
      .get(chunk_id)
      .ok_or_else(|| SyncError::Upload("missing download url".to_string()))?
      .clone();
    let client = http.clone();
    let permit = semaphore.clone().acquire_owned().await.unwrap();
    let id = chunk_id.clone();
    tasks.push(async move {
      let _permit = permit;
      let resp = client.get(url).send().await?;
      if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(SyncError::Upload(format!("download failed: {} {}", status, body)));
      }
      let bytes = resp.bytes().await?;
      Ok::<(String, Vec<u8>), SyncError>((id, bytes.to_vec()))
    });
  }

  while let Some(res) = tasks.next().await {
    let (id, data) = res?;
    results.insert(id, data);
  }

  Ok(results)
}

fn decrypt_chunk(data: &[u8], key: &[u8]) -> Result<Vec<u8>, SyncError> {
  if data.len() < 24 {
    return Err(SyncError::Upload("invalid chunk size".to_string()));
  }
  let nonce = &data[..24];
  let ciphertext = &data[24..];
  let cipher = XChaCha20Poly1305::new_from_slice(key)
    .map_err(|_| SyncError::Upload("invalid key length".to_string()))?;
  let nonce_arr = XNonce::from_slice(nonce);
  cipher
    .decrypt(nonce_arr, ciphertext)
    .map_err(|_| SyncError::Upload("chunk decrypt failed".to_string()))
}

fn decrypt_with_key(data: &[u8], key: &[u8]) -> Result<Vec<u8>, SyncError> {
  if data.len() < 24 {
    return Err(SyncError::Upload("invalid encrypted payload".to_string()));
  }
  let nonce = &data[..24];
  let ciphertext = &data[24..];
  let cipher = XChaCha20Poly1305::new_from_slice(key)
    .map_err(|_| SyncError::Upload("invalid key length".to_string()))?;
  let nonce_arr = XNonce::from_slice(nonce);
  cipher
    .decrypt(nonce_arr, ciphertext)
    .map_err(|_| SyncError::Upload("decrypt failed".to_string()))
}

fn compute_content_id_for_file(path: &PathBuf, key: &[u8]) -> Result<String, SyncError> {
  use hmac::{Hmac, Mac};
  use sha2::Sha256;
  let mut file = std::fs::File::open(path)?;
  let mut mac = Hmac::<Sha256>::new_from_slice(key)
    .map_err(|err| SyncError::Upload(err.to_string()))?;
  let mut buffer = vec![0u8; 1024 * 1024];
  loop {
    let read = std::io::Read::read(&mut file, &mut buffer)?;
    if read == 0 {
      break;
    }
    mac.update(&buffer[..read]);
  }
  Ok(hex::encode(mac.finalize().into_bytes()))
}

fn compute_content_id_from_bytes(data: &[u8], key: &[u8]) -> Result<String, SyncError> {
  use hmac::{Hmac, Mac};
  use sha2::Sha256;
  let mut mac = Hmac::<Sha256>::new_from_slice(key)
    .map_err(|err| SyncError::Upload(err.to_string()))?;
  mac.update(data);
  Ok(hex::encode(mac.finalize().into_bytes()))
}

fn is_local_modified(
  path: &PathBuf,
  expected: Option<&str>,
  key: &[u8],
) -> Result<bool, SyncError> {
  let Some(expected) = expected else {
    return Ok(true);
  };
  let current = compute_content_id_for_file(path, key)?;
  Ok(current != expected)
}

fn handle_conflict(full_path: &PathBuf, relative_path: &str, remote: &[u8]) -> Result<(), SyncError> {
  let local = std::fs::read(full_path)?;
  let local_is_text = is_text(&local);
  let remote_is_text = is_text(remote);

  if local_is_text && remote_is_text {
    let merged = format!(
      "<<<<<<< local\n{}\n=======\n{}\n>>>>>>> remote\n",
      String::from_utf8_lossy(&local),
      String::from_utf8_lossy(remote)
    );
    if let Some(parent) = full_path.parent() {
      std::fs::create_dir_all(parent)?;
    }
    std::fs::write(full_path, merged)?;
    eprintln!("Conflict in {} - merged with markers", relative_path);
  } else {
    let ext = full_path
      .extension()
      .and_then(|s| s.to_str())
      .map(|s| format!(".{}", s))
      .unwrap_or_default();
    let base = full_path
      .with_extension("")
      .to_string_lossy()
      .to_string();
    let local_path = format!("{}.local{}", base, ext);
    let remote_path = format!("{}.remote{}", base, ext);
    std::fs::rename(full_path, &local_path)?;
    std::fs::write(&remote_path, remote)?;
    eprintln!("Conflict in {} - kept both versions", relative_path);
  }
  Ok(())
}

fn is_text(data: &[u8]) -> bool {
  if data.iter().any(|b| *b == 0) {
    return false;
  }
  std::str::from_utf8(data).is_ok()
}
