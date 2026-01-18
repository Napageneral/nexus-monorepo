use std::path::{Path, PathBuf};

use std::collections::HashMap;

use crypto::{
  decode_b64, decrypt_key_bundle, decrypt_secret_json, encode_b64, encrypt_key_bundle,
  encrypt_secret_json, CollabKeys, KeyBundle,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("json error: {0}")]
  Json(#[from] serde_json::Error),
  #[error("missing home directory")]
  MissingHome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
  #[serde(default = "default_workspace_path")]
  pub workspace_path: String,
  pub cloud_url: String,
  pub initialized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsiteAuth {
  pub website_url: String,
  pub api_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAuthKeypair {
  pub version: u8,
  pub public_key: String,
  pub secret_key: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCollabKeys {
  pub version: u8,
  pub identity_public_key: String,
  pub identity_secret_key: String,
  pub signing_public_key: String,
  pub signing_secret_key: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSecret {
  pub space_key: String,
  pub key_version: u32,
  pub updated_at: String,
}

pub type SpaceSecrets = HashMap<String, SpaceSecret>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceConfig {
  pub space_id: String,
  pub mount_path: String,
  pub key_version: u32,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct StatePaths {
  pub root: PathBuf,
  pub config_path: PathBuf,
  pub index_path: PathBuf,
  pub keys_path: PathBuf,
  pub auth_keypair_path: PathBuf,
  pub website_auth_path: PathBuf,
  pub collab_keys_path: PathBuf,
  pub space_secrets_path: PathBuf,
  pub spaces_dir: PathBuf,
}

impl StatePaths {
  pub fn new() -> Result<Self, CoreError> {
    let root = default_state_root()?;
    Ok(Self {
      config_path: root.join("config.json"),
      index_path: root.join("index.db"),
      keys_path: root.join("keys.enc"),
      auth_keypair_path: root.join("auth-keypair.enc"),
      website_auth_path: root.join("website-auth.enc"),
      collab_keys_path: root.join("collab-keys.enc"),
      space_secrets_path: root.join("space-secrets.enc"),
      spaces_dir: root.join("spaces"),
      root,
    })
  }
}

pub fn default_state_root() -> Result<PathBuf, CoreError> {
  if let Ok(root) = std::env::var("NEXUS_STATE_DIR") {
    return Ok(PathBuf::from(root));
  }
  if let Ok(home_override) = std::env::var("NEXUS_HOME") {
    return Ok(PathBuf::from(home_override).join("state").join("cloud"));
  }
  let home = dirs::home_dir().ok_or(CoreError::MissingHome)?;
  let default_root = home.join("nexus").join("state").join("cloud");
  if default_root.exists() {
    return Ok(default_root);
  }
  let legacy_rs = home.join(".nexus-rs").join("state").join("cloud");
  if legacy_rs.exists() {
    return Ok(legacy_rs);
  }
  let legacy_dot = home.join(".nexus").join("cloud");
  if legacy_dot.exists() {
    return Ok(legacy_dot);
  }
  Ok(default_root)
}

fn default_workspace_path() -> String {
  if let Ok(home) = std::env::var("NEXUS_HOME") {
    return PathBuf::from(home).join("home").to_string_lossy().to_string();
  }
  dirs::home_dir()
    .map(|home| home.join("nexus").join("home").to_string_lossy().to_string())
    .unwrap_or_else(|| ".".to_string())
}

pub fn load_config(path: &Path) -> Result<AppConfig, CoreError> {
  let data = std::fs::read_to_string(path)?;
  Ok(serde_json::from_str(&data)?)
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), CoreError> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  let data = serde_json::to_string_pretty(config)?;
  std::fs::write(path, data)?;
  Ok(())
}

pub fn save_keys(path: &Path, bundle: &KeyBundle, password: &str) -> Result<(), CoreError> {
  let encrypted = encrypt_key_bundle(bundle, password).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  std::fs::write(path, encrypted)?;
  Ok(())
}

pub fn load_keys(path: &Path, password: &str) -> Result<Option<KeyBundle>, CoreError> {
  if !path.exists() {
    return Ok(None);
  }
  let data = std::fs::read(path)?;
  Ok(decrypt_key_bundle(&data, password))
}

pub fn save_auth_keypair(
  path: &Path,
  public_key: &[u8],
  secret_key: &[u8],
  password: &str,
) -> Result<(), CoreError> {
  let stored = StoredAuthKeypair {
    version: 1,
    public_key: encode_b64(public_key),
    secret_key: encode_b64(secret_key),
    created_at: chrono::Utc::now().to_rfc3339(),
  };
  save_secret_json(path, &stored, password)
}

pub fn load_auth_keypair(
  path: &Path,
  password: &str,
) -> Result<Option<(Vec<u8>, Vec<u8>)>, CoreError> {
  let stored: Option<StoredAuthKeypair> = load_secret_json(path, password)?;
  let Some(stored) = stored else {
    return Ok(None);
  };
  let public_key = decode_b64(&stored.public_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  let secret_key = decode_b64(&stored.secret_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  Ok(Some((public_key, secret_key)))
}

pub fn save_collab_keys(path: &Path, keys: &CollabKeys, password: &str) -> Result<(), CoreError> {
  let stored = StoredCollabKeys {
    version: 1,
    identity_public_key: encode_b64(&keys.identity_public_key),
    identity_secret_key: encode_b64(&keys.identity_secret_key),
    signing_public_key: encode_b64(&keys.signing_public_key),
    signing_secret_key: encode_b64(&keys.signing_secret_key),
    created_at: keys.created_at.clone(),
  };
  save_secret_json(path, &stored, password)
}

pub fn load_collab_keys(path: &Path, password: &str) -> Result<Option<CollabKeys>, CoreError> {
  let stored: Option<StoredCollabKeys> = load_secret_json(path, password)?;
  let Some(stored) = stored else {
    return Ok(None);
  };
  let identity_public_key = decode_b64(&stored.identity_public_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  let identity_secret_key = decode_b64(&stored.identity_secret_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  let signing_public_key = decode_b64(&stored.signing_public_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  let signing_secret_key = decode_b64(&stored.signing_secret_key).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  Ok(Some(CollabKeys {
    version: 1,
    identity_public_key,
    identity_secret_key,
    signing_public_key,
    signing_secret_key,
    created_at: stored.created_at,
  }))
}

pub fn save_website_auth(path: &Path, auth: &WebsiteAuth, password: &str) -> Result<(), CoreError> {
  save_secret_json(path, auth, password)
}

pub fn load_website_auth(path: &Path, password: &str) -> Result<Option<WebsiteAuth>, CoreError> {
  load_secret_json(path, password)
}

pub fn save_space_secrets(path: &Path, secrets: &SpaceSecrets, password: &str) -> Result<(), CoreError> {
  save_secret_json(path, secrets, password)
}

pub fn load_space_secrets(path: &Path, password: &str) -> Result<SpaceSecrets, CoreError> {
  if !path.exists() {
    return Ok(HashMap::new());
  }
  let secrets: Option<SpaceSecrets> = load_secret_json(path, password)?;
  Ok(secrets.unwrap_or_default())
}

pub fn save_space_config(state: &StatePaths, config: &SpaceConfig) -> Result<(), CoreError> {
  std::fs::create_dir_all(&state.spaces_dir)?;
  let path = state.spaces_dir.join(format!("{}.json", config.space_id));
  let data = serde_json::to_string_pretty(config)?;
  std::fs::write(path, data)?;
  Ok(())
}

pub fn load_space_config(state: &StatePaths, space_id: &str) -> Result<Option<SpaceConfig>, CoreError> {
  let path = state.spaces_dir.join(format!("{}.json", space_id));
  if !path.exists() {
    return Ok(None);
  }
  let data = std::fs::read_to_string(path)?;
  Ok(Some(serde_json::from_str(&data)?))
}

pub fn list_space_configs(state: &StatePaths) -> Result<Vec<SpaceConfig>, CoreError> {
  if !state.spaces_dir.exists() {
    return Ok(Vec::new());
  }
  let mut out = Vec::new();
  for entry in std::fs::read_dir(&state.spaces_dir)? {
    let entry = entry?;
    let path = entry.path();
    if path.extension().and_then(|s| s.to_str()) != Some("json") {
      continue;
    }
    let data = std::fs::read_to_string(&path)?;
    if let Ok(config) = serde_json::from_str::<SpaceConfig>(&data) {
      out.push(config);
    }
  }
  Ok(out)
}

fn save_secret_json<T: Serialize>(path: &Path, value: &T, password: &str) -> Result<(), CoreError> {
  let encrypted = encrypt_secret_json(value, password).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  std::fs::write(path, encrypted)?;
  Ok(())
}

fn load_secret_json<T: serde::de::DeserializeOwned>(
  path: &Path,
  password: &str,
) -> Result<Option<T>, CoreError> {
  if !path.exists() {
    return Ok(None);
  }
  let data = std::fs::read(path)?;
  Ok(decrypt_secret_json::<T>(&data, password))
}
