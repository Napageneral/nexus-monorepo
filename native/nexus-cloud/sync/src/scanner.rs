use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use blake3::hash as blake3_hash;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use rayon::prelude::*;
use storage::{FileRecord, FileStatus, LocalIndex, StorageError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScanError {
  #[error("storage error: {0}")]
  Storage(#[from] StorageError),
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("ignore error: {0}")]
  Ignore(#[from] ignore::Error),
}

#[derive(Debug, Clone)]
pub struct ScanProgress {
  pub phase: ScanPhase,
  pub files_found: usize,
  pub files_hashed: usize,
  pub bytes_hashed: u64,
  pub files_per_second: f64,
  pub mb_per_second: f64,
  pub estimated_seconds_remaining: f64,
  pub current_file: Option<String>,
  pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum ScanPhase {
  Walking,
  Hashing,
  Done,
}

#[derive(Debug, Clone)]
pub struct ScanResult {
  pub added: Vec<String>,
  pub modified: Vec<String>,
  pub deleted: Vec<String>,
  pub total_files: usize,
  pub total_bytes: u64,
  pub duration_ms: u128,
}

#[derive(Debug, Clone)]
struct FileEntry {
  relative_path: String,
  full_path: PathBuf,
  size: u64,
  inode: u64,
  mtime_ns: i64,
}

const QUICK_HASH_SAMPLE: usize = 64 * 1024;

const DEFAULT_IGNORE_PATTERNS: &[&str] = &[
  "sessions/",
  "*.tmp",
  "*.swp",
  ".DS_Store",
  ".env",
  ".env.*",
  "*credentials*",
  "*secret*",
  "*.key",
  "*.pem",
  "node_modules/",
  "__pycache__/",
  ".venv/",
  ".git/",
];

pub struct FastScanner {
  workspace_path: PathBuf,
  index: LocalIndex,
  ignore: Arc<Gitignore>,
  git_roots: Vec<PathBuf>,
}

impl FastScanner {
  pub fn new(
    index_path: PathBuf,
    workspace_path: PathBuf,
  ) -> Result<Self, ScanError> {
    let index = LocalIndex::open(index_path, &workspace_path, None)?;
    let ignore = build_ignore(&workspace_path)?;
    let ignore = Arc::new(ignore);
    let git_roots = find_git_repo_roots(&workspace_path, &ignore);
    Ok(Self {
      workspace_path,
      index,
      ignore,
      git_roots,
    })
  }

  pub fn has_existing_index(&self) -> Result<bool, ScanError> {
    let has_files = !self.index.all_files()?.is_empty();
    let has_head = self.index.head_commit()?.is_some();
    Ok(has_files && has_head)
  }

  pub fn close(self) {}

  pub fn all_files(&self) -> Result<Vec<FileRecord>, ScanError> {
    Ok(self.index.all_files()?)
  }

  pub fn head_commit(&self) -> Result<Option<String>, ScanError> {
    Ok(self.index.head_commit()?)
  }

  pub fn set_head_commit(&self, hash: &str) -> Result<(), ScanError> {
    Ok(self.index.set_head_commit(hash)?)
  }

  pub fn index(&self) -> &LocalIndex {
    &self.index
  }

  pub fn cold_start_scan<F>(&self, mut on_progress: F) -> Result<ScanResult, ScanError>
  where
    F: FnMut(ScanProgress),
  {
    let start = Instant::now();
    let mut progress = ScanProgress {
      phase: ScanPhase::Walking,
      files_found: 0,
      files_hashed: 0,
      bytes_hashed: 0,
      files_per_second: 0.0,
      mb_per_second: 0.0,
      estimated_seconds_remaining: 0.0,
      current_file: None,
      errors: Vec::new(),
    };

    let files = self.walk_files(&mut progress)?;
    progress.phase = ScanPhase::Hashing;
    on_progress(progress.clone());

    let total_files = files.len();
    let total_bytes = files.iter().map(|f| f.size).sum();

    let hashed_count = AtomicUsize::new(0);
    let hashed_bytes = AtomicU64::new(0);
    let errors = Arc::new(parking_lot::Mutex::new(Vec::new()));
    let start_hash = Instant::now();

    let results: Vec<(FileEntry, Option<String>, Option<String>, Option<String>)> = files
      .par_iter()
      .map(|entry| {
        let quick_hash = match hash_file(entry) {
          Ok(result) => result,
          Err(err) => {
            return (entry.clone(), None, None, Some(err.to_string()));
          }
        };

        hashed_count.fetch_add(1, Ordering::SeqCst);
        hashed_bytes.fetch_add(entry.size, Ordering::SeqCst);

        (entry.clone(), quick_hash, None, None)
      })
      .collect();

    let mut added = Vec::new();
    for (entry, quick_hash, _content_id, error) in results {
      if let Some(err) = error {
        errors.lock().push(format!("{}: {}", entry.relative_path, err));
        continue;
      }
      let record = FileRecord {
        path: entry.relative_path.clone(),
        inode: entry.inode,
        size: entry.size,
        mtime_ns: entry.mtime_ns,
        quick_hash,
        content_id: None,
        chunk_count: estimate_chunk_count(entry.size),
        status: FileStatus::New,
      };
      self.index.upsert_file(&record)?;
      added.push(entry.relative_path);
    }

    let duration_ms = start.elapsed().as_millis();
    progress.phase = ScanPhase::Done;
    let elapsed = start_hash.elapsed().as_secs_f64().max(0.1);
    let files_hashed = hashed_count.load(Ordering::SeqCst);
    let bytes_hashed = hashed_bytes.load(Ordering::SeqCst);
    progress.files_hashed = files_hashed;
    progress.bytes_hashed = bytes_hashed;
    progress.files_per_second = files_hashed as f64 / elapsed;
    progress.mb_per_second = (bytes_hashed as f64 / 1024.0 / 1024.0) / elapsed;
    progress.errors = errors.lock().clone();
    on_progress(progress);

    Ok(ScanResult {
      added,
      modified: Vec::new(),
      deleted: Vec::new(),
      total_files,
      total_bytes,
      duration_ms,
    })
  }

  pub fn incremental_scan<F>(&self, mut on_progress: F) -> Result<ScanResult, ScanError>
  where
    F: FnMut(ScanProgress),
  {
    let start = Instant::now();
    let mut progress = ScanProgress {
      phase: ScanPhase::Walking,
      files_found: 0,
      files_hashed: 0,
      bytes_hashed: 0,
      files_per_second: 0.0,
      mb_per_second: 0.0,
      estimated_seconds_remaining: 0.0,
      current_file: None,
      errors: Vec::new(),
    };

    let files = self.walk_files(&mut progress)?;
    let existing = self
      .index
      .all_files()?
      .into_iter()
      .map(|f| (f.path.clone(), f))
      .collect::<HashMap<_, _>>();

    let current_set: HashSet<String> = files.iter().map(|f| f.relative_path.clone()).collect();

    let mut deleted = Vec::new();
    for (path, record) in existing.iter() {
      if !current_set.contains(path) {
        let mut deleted_record = record.clone();
        deleted_record.status = FileStatus::Deleted;
        self.index.upsert_file(&deleted_record)?;
        deleted.push(path.clone());
      }
    }

    progress.phase = ScanPhase::Hashing;
    on_progress(progress.clone());

    let total_files = files.len();
    let total_bytes = files.iter().map(|f| f.size).sum();

    let hashed_count = AtomicUsize::new(0);
    let hashed_bytes = AtomicU64::new(0);
    let errors = Arc::new(parking_lot::Mutex::new(Vec::new()));
    let start_hash = Instant::now();

    let results: Vec<(String, bool, Option<String>, Option<String>, FileEntry, Option<String>)> = files
      .par_iter()
      .map(|entry| {
        let existing = existing.get(&entry.relative_path);
        let mut is_changed = true;
        if let Some(prev) = existing {
          if prev.status == FileStatus::Synced && prev.size == entry.size && prev.mtime_ns == entry.mtime_ns {
            is_changed = false;
          }
        }

        let (quick_hash, content_id, error, changed_flag) = if is_changed {
          match hash_file(entry) {
            Ok(hash) => {
              if let Some(prev) = existing {
                if prev.status != FileStatus::Synced {
                  (hash, None, None, true)
                } else if prev.quick_hash.as_deref() == hash.as_deref() {
                  (hash, prev.content_id.clone(), None, false)
                } else {
                  (hash, None, None, true)
                }
              } else {
                (hash, None, None, true)
              }
            }
            Err(err) => (None, None, Some(err.to_string()), true),
          }
        } else {
          (
            existing.and_then(|e| e.quick_hash.clone()),
            existing.and_then(|e| e.content_id.clone()),
            None,
            false,
          )
        };

        hashed_count.fetch_add(1, Ordering::SeqCst);
        hashed_bytes.fetch_add(entry.size, Ordering::SeqCst);

        (
          entry.relative_path.clone(),
          changed_flag,
          quick_hash,
          content_id,
          entry.clone(),
          error,
        )
      })
      .collect();

    let mut added = Vec::new();
    let mut modified = Vec::new();
    for (path, is_changed, quick_hash, _content_id, entry, error) in results {
      if let Some(err) = error {
        errors.lock().push(format!("{}: {}", entry.relative_path, err));
        continue;
      }
      if quick_hash.is_none() {
        continue;
      }
      if existing.get(&path).is_none() {
        let record = FileRecord {
          path: path.clone(),
          inode: entry.inode,
          size: entry.size,
          mtime_ns: entry.mtime_ns,
          quick_hash,
          content_id: None,
          chunk_count: estimate_chunk_count(entry.size),
          status: FileStatus::New,
        };
        self.index.upsert_file(&record)?;
        added.push(path);
        continue;
      }

      if is_changed {
        let record = FileRecord {
          path: path.clone(),
          inode: entry.inode,
          size: entry.size,
          mtime_ns: entry.mtime_ns,
          quick_hash,
          content_id: None,
          chunk_count: estimate_chunk_count(entry.size),
          status: FileStatus::Modified,
        };
        self.index.upsert_file(&record)?;
        modified.push(path);
      } else if let Some(existing) = existing.get(&path) {
        let record = FileRecord {
          path: path.clone(),
          inode: entry.inode,
          size: entry.size,
          mtime_ns: entry.mtime_ns,
          quick_hash,
          content_id: existing.content_id.clone(),
          chunk_count: existing.chunk_count,
          status: FileStatus::Synced,
        };
        self.index.upsert_file(&record)?;
      }
    }

    progress.phase = ScanPhase::Done;
    let elapsed = start_hash.elapsed().as_secs_f64().max(0.1);
    let files_hashed = hashed_count.load(Ordering::SeqCst);
    let bytes_hashed = hashed_bytes.load(Ordering::SeqCst);
    progress.files_hashed = files_hashed;
    progress.bytes_hashed = bytes_hashed;
    progress.files_per_second = files_hashed as f64 / elapsed;
    progress.mb_per_second = (bytes_hashed as f64 / 1024.0 / 1024.0) / elapsed;
    progress.errors = errors.lock().clone();
    on_progress(progress);

    Ok(ScanResult {
      added,
      modified,
      deleted,
      total_files,
      total_bytes,
      duration_ms: start.elapsed().as_millis(),
    })
  }

  fn walk_files(&self, progress: &mut ScanProgress) -> Result<Vec<FileEntry>, ScanError> {
    let mut entries = Vec::new();
    let mut count = 0usize;

    let git_roots = self.git_roots.clone();
    let ignore = Arc::clone(&self.ignore);
    let walker = ignore::WalkBuilder::new(&self.workspace_path)
      .hidden(false)
      .parents(false)
      .ignore(false)
      .git_ignore(false)
      .git_exclude(false)
      .git_global(false)
      .filter_entry(move |entry| {
        let is_dir = entry
          .file_type()
          .map(|ft| ft.is_dir())
          .unwrap_or(false);
        if is_dir {
          let path = entry.path();
          if should_ignore(&ignore, path, true) {
            return false;
          }
          if is_under_git_root(&git_roots, path) {
            return false;
          }
        }
        true
      })
      .build();

    for result in walker {
      let entry = match result {
        Ok(entry) => entry,
        Err(err) => {
          progress.errors.push(err.to_string());
          continue;
        }
      };

      if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
        let path = entry.path();
        if is_under_git_root(&self.git_roots, path) {
          continue;
        }
        if should_ignore(&self.ignore, path, false) {
          continue;
        }

        let metadata = match entry.metadata() {
          Ok(metadata) => metadata,
          Err(err) => {
            progress.errors.push(err.to_string());
            continue;
          }
        };
        let size = metadata.len();
        let inode = inode_of(&metadata);
        let mtime_ns = mtime_ns_of(&metadata);
        let relative_path = path
          .strip_prefix(&self.workspace_path)
          .unwrap_or(path)
          .to_string_lossy()
          .to_string();

        entries.push(FileEntry {
          relative_path,
          full_path: path.to_path_buf(),
          size,
          inode,
          mtime_ns,
        });
        count += 1;

        if count % 1000 == 0 {
          progress.files_found = count;
        }
      }
    }

    progress.files_found = entries.len();
    Ok(entries)
  }
}

fn build_ignore(root: &Path) -> Result<Gitignore, ScanError> {
  let mut builder = GitignoreBuilder::new(root);
  for pattern in DEFAULT_IGNORE_PATTERNS {
    let _ = builder.add_line(None, pattern);
  }

  let ignore_path = root.join(".nexusignore");
  if ignore_path.exists() {
    builder.add(ignore_path);
  }

  let ignore = builder.build()?;
  Ok(ignore)
}

fn is_git_repo_root(path: &Path) -> bool {
  let marker = path.join(".git");
  match std::fs::metadata(&marker) {
    Ok(meta) => meta.is_dir() || meta.is_file(),
    Err(_) => false,
  }
}

fn find_git_repo_roots(root: &Path, ignore: &Gitignore) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  let mut stack = vec![root.to_path_buf()];

  while let Some(dir) = stack.pop() {
    if should_ignore(ignore, &dir, true) {
      continue;
    }
    if is_git_repo_root(&dir) {
      if dir != root {
        roots.push(dir);
        continue;
      }
    }
    let entries = match std::fs::read_dir(&dir) {
      Ok(entries) => entries,
      Err(_) => continue,
    };
    for entry in entries {
      let entry = match entry {
        Ok(entry) => entry,
        Err(_) => continue,
      };
      let file_type = match entry.file_type() {
        Ok(file_type) => file_type,
        Err(_) => continue,
      };
      if file_type.is_dir() {
        let path = entry.path();
        if should_ignore(ignore, &path, true) {
          continue;
        }
        stack.push(path);
      }
    }
  }

  roots
}

fn is_under_git_root(git_roots: &[PathBuf], path: &Path) -> bool {
  git_roots.iter().any(|root| path.starts_with(root))
}

fn should_ignore(ignore: &Gitignore, path: &Path, is_dir: bool) -> bool {
  ignore
    .matched_path_or_any_parents(path, is_dir)
    .is_ignore()
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

fn estimate_chunk_count(size: u64) -> u32 {
  if size <= 256 * 1024 {
    1
  } else {
    ((size as f64) / (2.0 * 1024.0 * 1024.0)).ceil() as u32
  }
}

fn hash_file(entry: &FileEntry) -> Result<Option<String>, ScanError> {
  let quick = compute_quick_hash(&entry.full_path, entry.size)?;
  Ok(Some(quick))
}

fn compute_quick_hash(path: &Path, size: u64) -> Result<String, ScanError> {
  let mut file = File::open(path)?;
  let mut buffer = vec![0u8; QUICK_HASH_SAMPLE * 2 + 8];

  let first_size = std::cmp::min(size as usize, QUICK_HASH_SAMPLE);
  file.read_exact(&mut buffer[..first_size])?;

  let mut offset = first_size;
  if size as usize > QUICK_HASH_SAMPLE {
    let last_size = std::cmp::min(size as usize - QUICK_HASH_SAMPLE, QUICK_HASH_SAMPLE);
    let last_pos = size.saturating_sub(last_size as u64);
    file.seek(SeekFrom::Start(last_pos))?;
    file.read_exact(&mut buffer[offset..offset + last_size])?;
    offset += last_size;
  }

  let size_bytes = (size as u64).to_le_bytes();
  buffer[offset..offset + 8].copy_from_slice(&size_bytes);
  let hash = blake3_hash(&buffer[..offset + 8]);
  Ok(hex::encode(hash.as_bytes())[..32].to_string())
}
