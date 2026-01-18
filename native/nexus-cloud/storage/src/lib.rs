use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
  #[error("sqlite error: {0}")]
  Sqlite(#[from] rusqlite::Error),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum FileStatus {
  Unknown,
  Synced,
  Modified,
  New,
  Deleted,
}

impl FileStatus {
  fn as_str(&self) -> &'static str {
    match self {
      FileStatus::Unknown => "unknown",
      FileStatus::Synced => "synced",
      FileStatus::Modified => "modified",
      FileStatus::New => "new",
      FileStatus::Deleted => "deleted",
    }
  }

  fn from_str(value: &str) -> FileStatus {
    match value {
      "synced" => FileStatus::Synced,
      "modified" => FileStatus::Modified,
      "new" => FileStatus::New,
      "deleted" => FileStatus::Deleted,
      _ => FileStatus::Unknown,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
  pub path: String,
  pub inode: u64,
  pub size: u64,
  pub mtime_ns: i64,
  pub quick_hash: Option<String>,
  pub content_id: Option<String>,
  pub chunk_count: u32,
  pub status: FileStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkRecord {
  pub chunk_id: String,
  pub file_path: String,
  pub chunk_index: u32,
  pub offset: u64,
  pub length: u64,
  pub encrypted_id: Option<String>,
  pub pack_offset: Option<u64>,
  pub uploaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncState {
  pub head_commit: Option<String>,
  pub remote_head: Option<String>,
  pub last_full_scan: Option<i64>,
  pub upload_session: Option<String>,
}

pub struct LocalIndex {
  conn: Connection,
  workspace_key: String,
}

impl LocalIndex {
  pub fn open<P: AsRef<Path>>(
    index_path: P,
    workspace_path: &Path,
    space_id: Option<&str>,
  ) -> Result<Self, StorageError> {
    if let Some(parent) = index_path.as_ref().parent() {
      std::fs::create_dir_all(parent).map_err(|err| {
        StorageError::Sqlite(rusqlite::Error::ToSqlConversionFailure(Box::new(err)))
      })?;
    }
    let conn = Connection::open(index_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    let workspace_key = workspace_key_for_path(workspace_path);
    let index = LocalIndex { conn, workspace_key };
    index.init_schema()?;
    index.ensure_workspace(workspace_path, space_id)?;
    Ok(index)
  }

  fn init_schema(&self) -> Result<(), StorageError> {
    self.conn.execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_key TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        space_id TEXT,
        last_seen_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS files (
        workspace_key TEXT NOT NULL,
        path TEXT NOT NULL,
        inode INTEGER,
        size INTEGER,
        mtime_ns INTEGER,
        quick_hash TEXT,
        content_id TEXT,
        chunk_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'unknown',
        PRIMARY KEY (workspace_key, path)
      );

      CREATE TABLE IF NOT EXISTS chunks (
        workspace_key TEXT NOT NULL,
        file_path TEXT,
        chunk_index INTEGER,
        chunk_id TEXT,
        offset INTEGER,
        length INTEGER,
        encrypted_id TEXT,
        pack_offset INTEGER,
        uploaded INTEGER DEFAULT 0,
        PRIMARY KEY (workspace_key, file_path, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        workspace_key TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (workspace_key, key)
      );
      "#,
    )?;
    self.migrate_legacy_schema()?;
    self.ensure_indexes()?;
    Ok(())
  }

  fn ensure_indexes(&self) -> Result<(), StorageError> {
    self.conn.execute_batch(
      r#"
      CREATE INDEX IF NOT EXISTS idx_files_status ON files(workspace_key, status);
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(workspace_key, file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_id ON chunks(workspace_key, chunk_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_uploaded ON chunks(workspace_key, uploaded) WHERE uploaded = 0;
      "#,
    )?;
    Ok(())
  }

  fn ensure_workspace(&self, workspace_path: &Path, space_id: Option<&str>) -> Result<(), StorageError> {
    let workspace_path = workspace_path.to_string_lossy().to_string();
    self.conn.execute(
      r#"
      INSERT INTO workspaces (workspace_key, workspace_path, space_id, last_seen_at)
      VALUES (?, ?, ?, strftime('%s','now'))
      ON CONFLICT(workspace_key) DO UPDATE SET
        workspace_path = excluded.workspace_path,
        space_id = COALESCE(excluded.space_id, workspaces.space_id),
        last_seen_at = excluded.last_seen_at
      "#,
      params![self.workspace_key, workspace_path, space_id],
    )?;
    Ok(())
  }

  pub fn get_file(&self, path: &str) -> Result<Option<FileRecord>, StorageError> {
    self.conn
      .query_row(
        "SELECT path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status FROM files WHERE workspace_key = ? AND path = ?",
        params![self.workspace_key, path],
        |row| Self::row_to_file(row),
      )
      .optional()
      .map_err(StorageError::from)
  }

  pub fn upsert_file(&self, file: &FileRecord) -> Result<(), StorageError> {
    self.conn.execute(
      r#"
      INSERT OR REPLACE INTO files (workspace_key, path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      "#,
      params![
        self.workspace_key,
        file.path,
        file.inode as i64,
        file.size as i64,
        file.mtime_ns,
        file.quick_hash,
        file.content_id,
        file.chunk_count as i64,
        file.status.as_str()
      ],
    )?;
    Ok(())
  }

  pub fn delete_file(&self, path: &str) -> Result<(), StorageError> {
    self.conn.execute(
      "DELETE FROM files WHERE workspace_key = ? AND path = ?",
      params![self.workspace_key, path],
    )?;
    self.conn.execute(
      "DELETE FROM chunks WHERE workspace_key = ? AND file_path = ?",
      params![self.workspace_key, path],
    )?;
    Ok(())
  }

  pub fn get_chunks(&self, path: &str) -> Result<Vec<ChunkRecord>, StorageError> {
    let mut stmt = self.conn.prepare(
      "SELECT chunk_id, file_path, chunk_index, offset, length, encrypted_id, pack_offset, uploaded FROM chunks WHERE workspace_key = ? AND file_path = ? ORDER BY chunk_index",
    )?;
    let rows = stmt.query_map(params![self.workspace_key, path], |row| Self::row_to_chunk(row))?;
    let mut out = Vec::new();
    for row in rows {
      out.push(row?);
    }
    Ok(out)
  }

  pub fn delete_chunks(&self, path: &str) -> Result<(), StorageError> {
    self.conn.execute(
      "DELETE FROM chunks WHERE workspace_key = ? AND file_path = ?",
      params![self.workspace_key, path],
    )?;
    Ok(())
  }

  pub fn upsert_chunk(&self, chunk: &ChunkRecord) -> Result<(), StorageError> {
    self.conn.execute(
      r#"
      INSERT OR REPLACE INTO chunks (workspace_key, file_path, chunk_index, chunk_id, offset, length, encrypted_id, pack_offset, uploaded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      "#,
      params![
        self.workspace_key,
        chunk.file_path,
        chunk.chunk_index as i64,
        chunk.chunk_id,
        chunk.offset as i64,
        chunk.length as i64,
        chunk.encrypted_id,
        chunk.pack_offset.map(|v| v as i64),
        if chunk.uploaded { 1 } else { 0 },
      ],
    )?;
    Ok(())
  }

  pub fn get_unuploaded_chunks(&self) -> Result<Vec<ChunkRecord>, StorageError> {
    let mut stmt = self
      .conn
      .prepare("SELECT chunk_id, file_path, chunk_index, offset, length, encrypted_id, pack_offset, uploaded FROM chunks WHERE workspace_key = ? AND uploaded = 0")?;
    let rows = stmt.query_map(params![self.workspace_key], |row| Self::row_to_chunk(row))?;
    let mut out = Vec::new();
    for row in rows {
      out.push(row?);
    }
    Ok(out)
  }

  pub fn mark_chunk_uploaded(&self, chunk_id: &str) -> Result<(), StorageError> {
    self.conn.execute(
      "UPDATE chunks SET uploaded = 1 WHERE workspace_key = ? AND chunk_id = ?",
      params![self.workspace_key, chunk_id],
    )?;
    Ok(())
  }

  pub fn get_state(&self, key: &str) -> Result<Option<String>, StorageError> {
    self.conn
      .query_row(
        "SELECT value FROM sync_state WHERE workspace_key = ? AND key = ?",
        params![self.workspace_key, key],
        |row| row.get::<_, String>(0),
      )
      .optional()
      .map_err(StorageError::from)
  }

  pub fn set_state(&self, key: &str, value: &str) -> Result<(), StorageError> {
    self.conn.execute(
      "INSERT OR REPLACE INTO sync_state (workspace_key, key, value) VALUES (?, ?, ?)",
      params![self.workspace_key, key, value],
    )?;
    Ok(())
  }

  pub fn head_commit(&self) -> Result<Option<String>, StorageError> {
    self.get_state("head_commit")
  }

  pub fn set_head_commit(&self, hash: &str) -> Result<(), StorageError> {
    self.set_state("head_commit", hash)
  }

  pub fn files_by_status(&self, status: FileStatus) -> Result<Vec<FileRecord>, StorageError> {
    let mut stmt = self.conn.prepare(
      "SELECT path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status FROM files WHERE workspace_key = ? AND status = ?",
    )?;
    let rows = stmt.query_map(params![self.workspace_key, status.as_str()], |row| Self::row_to_file(row))?;
    let mut out = Vec::new();
    for row in rows {
      out.push(row?);
    }
    Ok(out)
  }

  pub fn all_files(&self) -> Result<Vec<FileRecord>, StorageError> {
    let mut stmt = self.conn.prepare(
      "SELECT path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status FROM files WHERE workspace_key = ?",
    )?;
    let rows = stmt.query_map(params![self.workspace_key], |row| Self::row_to_file(row))?;
    let mut out = Vec::new();
    for row in rows {
      out.push(row?);
    }
    Ok(out)
  }

  pub fn mark_all_synced(&self) -> Result<(), StorageError> {
    self.conn.execute(
      "UPDATE files SET status = 'synced' WHERE workspace_key = ? AND status IN ('new','modified')",
      params![self.workspace_key],
    )?;
    Ok(())
  }

  pub fn clear_workspace(&self) -> Result<(), StorageError> {
    self.conn.execute(
      "DELETE FROM chunks WHERE workspace_key = ?",
      params![self.workspace_key],
    )?;
    self.conn.execute(
      "DELETE FROM files WHERE workspace_key = ?",
      params![self.workspace_key],
    )?;
    self.conn.execute(
      "DELETE FROM sync_state WHERE workspace_key = ?",
      params![self.workspace_key],
    )?;
    Ok(())
  }

  fn row_to_file(row: &Row<'_>) -> rusqlite::Result<FileRecord> {
    Ok(FileRecord {
      path: row.get(0)?,
      inode: row.get::<_, i64>(1)? as u64,
      size: row.get::<_, i64>(2)? as u64,
      mtime_ns: row.get(3)?,
      quick_hash: row.get(4)?,
      content_id: row.get(5)?,
      chunk_count: row.get::<_, i64>(6)? as u32,
      status: FileStatus::from_str(&row.get::<_, String>(7)?),
    })
  }

  fn row_to_chunk(row: &Row<'_>) -> rusqlite::Result<ChunkRecord> {
    Ok(ChunkRecord {
      chunk_id: row.get(0)?,
      file_path: row.get(1)?,
      chunk_index: row.get::<_, i64>(2)? as u32,
      offset: row.get::<_, i64>(3)? as u64,
      length: row.get::<_, i64>(4)? as u64,
      encrypted_id: row.get(5)?,
      pack_offset: row.get::<_, Option<i64>>(6)?.map(|v| v as u64),
      uploaded: row.get::<_, i64>(7)? != 0,
    })
  }

  fn table_exists(&self, table: &str) -> Result<bool, StorageError> {
    let mut stmt = self.conn.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )?;
    let exists = stmt
      .query_row(params![table], |_row| Ok(()))
      .optional()
      .map_err(StorageError::from)?
      .is_some();
    Ok(exists)
  }

  fn table_has_column(&self, table: &str, column: &str) -> Result<bool, StorageError> {
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = self.conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
      if row? == column {
        return Ok(true);
      }
    }
    Ok(false)
  }

  fn migrate_legacy_schema(&self) -> Result<(), StorageError> {
    if !self.table_exists("files")? {
      return Ok(());
    }
    if self.table_has_column("files", "workspace_key")? {
      if !self.table_has_column("chunks", "pack_offset")? {
        self.conn.execute("ALTER TABLE chunks ADD COLUMN pack_offset INTEGER", [])?;
      }
      return Ok(());
    }

    let has_chunks = self.table_exists("chunks")?;
    let has_sync_state = self.table_exists("sync_state")?;
    let has_pack_offset = self.table_has_column("chunks", "pack_offset")?;
    let has_uploaded = self.table_has_column("chunks", "uploaded")?;

    self.conn.execute_batch("BEGIN IMMEDIATE;")?;
    let result = (|| {
      self.conn.execute("ALTER TABLE files RENAME TO files_old", [])?;
      self.conn.execute_batch(
        r#"
      CREATE TABLE files (
        workspace_key TEXT NOT NULL,
        path TEXT NOT NULL,
        inode INTEGER,
        size INTEGER,
        mtime_ns INTEGER,
        quick_hash TEXT,
        content_id TEXT,
        chunk_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'unknown',
        PRIMARY KEY (workspace_key, path)
      );
      "#,
      )?;
      self.conn.execute(
        r#"
      INSERT INTO files (workspace_key, path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status)
      SELECT ?, path, inode, size, mtime_ns, quick_hash, content_id, chunk_count, status
      FROM files_old
      "#,
        params![self.workspace_key],
      )?;
      self.conn.execute("DROP TABLE files_old", [])?;

      if has_chunks {
        self.conn.execute("ALTER TABLE chunks RENAME TO chunks_old", [])?;
        self.conn.execute_batch(
          r#"
        CREATE TABLE chunks (
          workspace_key TEXT NOT NULL,
          file_path TEXT,
          chunk_index INTEGER,
          chunk_id TEXT,
          offset INTEGER,
          length INTEGER,
          encrypted_id TEXT,
          pack_offset INTEGER,
          uploaded INTEGER DEFAULT 0,
          PRIMARY KEY (workspace_key, file_path, chunk_index)
        );
        "#,
        )?;
        let pack_select = if has_pack_offset { "pack_offset" } else { "NULL" };
        let uploaded_select = if has_uploaded { "uploaded" } else { "0" };
        let insert_sql = format!(
          "INSERT INTO chunks (workspace_key, file_path, chunk_index, chunk_id, offset, length, encrypted_id, pack_offset, uploaded)\n         SELECT ?, file_path, chunk_index, chunk_id, offset, length, encrypted_id, {}, {} FROM chunks_old",
          pack_select, uploaded_select
        );
        self.conn.execute(&insert_sql, params![self.workspace_key])?;
        self.conn.execute("DROP TABLE chunks_old", [])?;
      }

      if has_sync_state {
        self.conn.execute("ALTER TABLE sync_state RENAME TO sync_state_old", [])?;
        self.conn.execute_batch(
          r#"
        CREATE TABLE sync_state (
          workspace_key TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          PRIMARY KEY (workspace_key, key)
        );
        "#,
        )?;
        self.conn.execute(
          "INSERT INTO sync_state (workspace_key, key, value) SELECT ?, key, value FROM sync_state_old",
          params![self.workspace_key],
        )?;
        self.conn.execute("DROP TABLE sync_state_old", [])?;
      }

      self.conn.execute_batch(
        r#"
      CREATE INDEX IF NOT EXISTS idx_files_status ON files(workspace_key, status);
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(workspace_key, file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_id ON chunks(workspace_key, chunk_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_uploaded ON chunks(workspace_key, uploaded) WHERE uploaded = 0;
      "#,
      )?;
      Ok(())
    })();
    if let Err(err) = result {
      let _ = self.conn.execute_batch("ROLLBACK;");
      return Err(err);
    }
    self.conn.execute_batch("COMMIT;")?;
    Ok(())
  }
}

fn workspace_key_for_path(path: &Path) -> String {
  let normalized = if path.is_absolute() {
    path.to_path_buf()
  } else {
    std::env::current_dir()
      .unwrap_or_else(|_| Path::new(".").to_path_buf())
      .join(path)
  };
  normalized.to_string_lossy().to_string()
}
