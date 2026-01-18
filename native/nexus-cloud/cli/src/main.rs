use std::fs::OpenOptions;
use std::io::{IsTerminal, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use chrono::Utc;
use fs2::FileExt;
use clap::{Parser, Subcommand};
use crypto::{
  decode_b64, derive_space_keys, encrypt_secret_bytes, encode_b64, generate_collab_keys,
  generate_key_bundle, generate_keypair, open_sealed_from_recipient, seal_for_recipient,
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use nexus_core::{
  load_auth_keypair, load_collab_keys, load_config, load_keys, load_space_config,
  load_space_secrets, load_website_auth, save_auth_keypair, save_collab_keys, save_config,
  save_keys, save_space_config, save_space_secrets, save_website_auth, AppConfig, CoreError,
  SpaceConfig, SpaceSecret, StatePaths, WebsiteAuth,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sync::v2::{
  ChunkConfig, SyncClientV2, SyncV2Config, UploadPhase, UploadProgress,
  WebsiteAuth as SyncWebsiteAuth,
};

const DEFAULT_CLOUD_URL: &str = "https://nexus-cloud.tnapathy.workers.dev";
const DEFAULT_WEBSITE_URL: &str = "https://getnexus.sh";
const DAEMON_LABEL: &str = "sh.getnexus.nexus-cloud-daemon";
const DAEMON_KEYCHAIN_SERVICE: &str = "Nexus Cloud CLI";
const DAEMON_KEYCHAIN_ACCOUNT: &str = "nexus-cloud";

struct CloudLock {
  _file: std::fs::File,
}

impl CloudLock {
  fn acquire(state: &StatePaths) -> Result<Self, CoreError> {
    let lock_path = state.root.join("cloud.lock");
    let mut file = OpenOptions::new()
      .create(true)
      .read(true)
      .write(true)
      .open(&lock_path)?;
    if let Err(_err) = file.try_lock_exclusive() {
      let mut contents = String::new();
      let _ = file.read_to_string(&mut contents);
      let details = contents.trim();
      let message = if details.is_empty() {
        "Another nexus-cloud process is already running.".to_string()
      } else {
        format!("Another nexus-cloud process is already running ({}).", details)
      };
      return Err(CoreError::Io(std::io::Error::new(
        std::io::ErrorKind::Other,
        message,
      )));
    }
    let _ = file.set_len(0);
    let _ = file.write_all(format!("pid={}\n", std::process::id()).as_bytes());
    Ok(Self { _file: file })
  }
}

#[derive(Parser)]
#[command(name = "nexus-cloud-rs", version, about = "Nexus Cloud Rust CLI")]
struct Cli {
  #[command(subcommand)]
  command: Commands,
}

#[derive(Subcommand)]
enum Commands {
  Init {
    #[arg(long)]
    workspace: Option<PathBuf>,
    #[arg(long, default_value = DEFAULT_CLOUD_URL)]
    cloud_url: String,
  },
  Login {
    #[arg(long)]
    website_url: Option<String>,
    #[arg(long)]
    api_token: Option<String>,
  },
  Push {
    #[arg(short, long)]
    message: Option<String>,
    /// Override workspace path (defaults to configured workspace)
    #[arg(long)]
    path: Option<PathBuf>,
  },
  Bench {
    #[arg(long)]
    output: Option<PathBuf>,
  },
  Reset {
    #[arg(long)]
    force: bool,
  },
  Pull {
    /// Override workspace path (defaults to configured workspace)
    #[arg(long)]
    path: Option<PathBuf>,
    /// Force full download, ignoring local index state
    #[arg(long)]
    force: bool,
  },
  Status,
  Log,
  /// Explain the Nexus Cloud lifecycle (My Workspace vs Shared Workspaces).
  #[command(aliases = ["lifecycle"])]
  Guide,
  Spaces {
    #[command(subcommand)]
    command: SpacesCommand,
  },
  Collab {
    #[command(subcommand)]
    command: CollabCommand,
  },
  Daemon {
    #[command(subcommand)]
    command: Option<DaemonCommand>,
  },
}

#[derive(Subcommand)]
enum SpacesCommand {
  List,
  Mount {
    space_id: String,
    #[arg(long)]
    path: Option<PathBuf>,
  },
  Unmount {
    space_id: String,
  },
  Push {
    space_id: String,
    #[arg(short, long)]
    message: Option<String>,
  },
  Pull {
    space_id: String,
  },
}

#[derive(Subcommand)]
enum CollabCommand {
  Auth {
    #[command(subcommand)]
    command: CollabAuthCommand,
  },
  Keys {
    #[command(subcommand)]
    command: CollabKeysCommand,
  },
  Spaces {
    #[command(subcommand)]
    command: CollabSpacesCommand,
  },
  Start {
    space_id: String,
  },
  Stop,
}

#[derive(Subcommand)]
enum CollabAuthCommand {
  Set,
}

#[derive(Subcommand)]
enum CollabKeysCommand {
  Init,
  Show,
  Register,
}

#[derive(Subcommand)]
enum CollabSpacesCommand {
  List,
  Create {
    #[arg(long)]
    name: String,
    #[arg(long)]
    members: String,
  },
  Delete {
    space_id: String,
  },
  Leave {
    space_id: String,
  },
  Key {
    space_id: String,
  },
  InviteLinks {
    #[command(subcommand)]
    command: InviteLinksCommand,
  },
}

#[derive(Subcommand)]
enum InviteLinksCommand {
  Create {
    space_id: String,
    #[arg(long)]
    emails: String,
    #[arg(long)]
    max_uses: Option<u32>,
    #[arg(long)]
    expires_in_hours: Option<i64>,
  },
  List {
    space_id: String,
  },
  Revoke {
    space_id: String,
    link_id: String,
  },
}

#[derive(Subcommand)]
enum DaemonCommand {
  Install,
}

#[tokio::main]
async fn main() -> Result<(), CoreError> {
  let cli = Cli::parse();
  match cli.command {
    Commands::Init {
      workspace,
      cloud_url,
    } => cmd_init(workspace, cloud_url).await?,
    Commands::Login { website_url, api_token } => cmd_login(website_url, api_token).await?,
    Commands::Push { message, path } => cmd_push(message, path).await?,
    Commands::Bench { output } => cmd_bench(output).await?,
    Commands::Reset { force } => cmd_reset(force).await?,
    Commands::Pull { path, force } => cmd_pull(path, force).await?,
    Commands::Status => cmd_status().await?,
    Commands::Log => cmd_log().await?,
    Commands::Guide => cmd_guide()?,
    Commands::Spaces { command } => cmd_spaces(command).await?,
    Commands::Collab { command } => cmd_collab(command).await?,
    Commands::Daemon { command } => cmd_daemon(command).await?,
  }
  Ok(())
}

async fn cmd_init(workspace: Option<PathBuf>, cloud_url: String) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  if let Ok(cfg) = load_config(&state.config_path) {
    if cfg.initialized {
      println!("Already initialized. Use \"push\" to sync.");
      return Ok(());
    }
  }

  let workspace_path = workspace.unwrap_or_else(default_workspace_path);
  // Keys are provisioned during login (paywalled flow).

  save_config(
    &state.config_path,
    &AppConfig {
      workspace_path: workspace_path.to_string_lossy().to_string(),
      cloud_url,
      initialized: true,
    },
  )?;

  create_nexusignore(&workspace_path)?;
  println!("✅ Initialized workspace at {}", workspace_path.display());
  println!("Next: run \"login\" to authenticate and provision keys.");
  Ok(())
}

async fn cmd_login(website_url: Option<String>, api_token: Option<String>) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let password = prompt_password("Master password: ")?;

  let url = website_url.unwrap_or_else(|| DEFAULT_WEBSITE_URL.to_string());
  if let Some(token) = api_token {
    let auth = WebsiteAuth {
      website_url: url,
      api_token: token.trim().to_string(),
    };
    save_website_auth(&state.website_auth_path, &auth, &password)?;
    bootstrap_login_state(&state, &password, &auth).await?;
    println!("✅ Logged in.");
    return Ok(());
  }
  let code = random_hex(16)?;
  let auth_url = format!("{}/auth/cli?code={}", url, code);
  println!("\nOpening browser:\n{}\n", auth_url);
  open_browser(&auth_url);
  println!("Waiting for authorization...");

  let poll_url = format!("{}/api/cli/token?code={}", url, code);
  let client = Client::new();
  for _ in 0..120u32 {
    let resp = client.get(&poll_url).send().await.map_err(map_http_err)?;
    if !resp.status().is_success() {
      tokio::time::sleep(std::time::Duration::from_secs(1)).await;
      continue;
    }
    let body: AuthPollResponse = resp.json().await.map_err(map_http_err)?;
    match body.status.as_str() {
      "authorized" => {
        if let Some(token) = body.token {
          let auth = WebsiteAuth {
            website_url: url.clone(),
            api_token: token,
          };
          save_website_auth(&state.website_auth_path, &auth, &password)?;
          if let Some(cloud_url) = body.cloud_url {
            if let Ok(mut cfg) = load_config(&state.config_path) {
              cfg.cloud_url = cloud_url;
              save_config(&state.config_path, &cfg)?;
            }
          }
          bootstrap_login_state(&state, &password, &auth).await?;
          println!("✅ Logged in.");
          return Ok(());
        }
      }
      "expired" => {
        return Err(CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::Other,
          "Authorization code expired",
        )));
      }
      "not_found" => {
        return Err(CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::Other,
          "Authorization code invalid",
        )));
      }
      _ => {}
    }
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
  }

  Err(CoreError::Io(std::io::Error::new(
    std::io::ErrorKind::Other,
    "Timeout waiting for authorization",
  )))
}

async fn bootstrap_login_state(
  state: &StatePaths,
  password: &str,
  auth: &WebsiteAuth,
) -> Result<(), CoreError> {
  if load_keys(&state.keys_path, password)?.is_none() {
    let keys = generate_key_bundle();
    save_keys(&state.keys_path, &keys, password)?;
    println!("✅ Provisioned workspace keys");
  }

  if load_auth_keypair(&state.auth_keypair_path, password)?.is_none() {
    let (public_key, secret_key) = generate_keypair();
    save_auth_keypair(&state.auth_keypair_path, &public_key, &secret_key, password)?;
    println!("✅ Provisioned auth keypair");
  }

  let mut collab_keys = load_collab_keys(&state.collab_keys_path, password)?;
  let mut collab_created = false;
  if collab_keys.is_none() {
    let keys = generate_collab_keys();
    save_collab_keys(&state.collab_keys_path, &keys, password)?;
    collab_keys = Some(keys);
    collab_created = true;
    println!("✅ Provisioned collab keys");
  }

  if collab_created {
    if let Some(keys) = collab_keys.as_ref() {
      let resp: KeysRegisterResponse = website_post(
        auth,
        "/api/keys",
        serde_json::json!({
          "identityPublicKey": encode_b64(&keys.identity_public_key),
          "signingPublicKey": encode_b64(&keys.signing_public_key),
        }),
      )
      .await?;
      println!("✅ Collab keys registered (keyVersion={})", resp.key_version);
    }
  }

  if let Some(keys) = collab_keys.as_ref() {
    let spaces: SpacesListResponse = website_get(auth, "/api/spaces").await?;
    if !spaces.spaces.is_empty() {
      let mut secrets = load_space_secrets(&state.space_secrets_path, password)?;
      let mut updated = 0usize;
      for space in spaces.spaces {
        let needs_refresh = secrets
          .get(&space.id)
          .map(|secret| secret.key_version != space.key_version)
          .unwrap_or(true);
        if !needs_refresh {
          continue;
        }
        let key_resp: SpaceKeyResponse = website_get(auth, &format!("/api/spaces/{}/key", space.id)).await?;
        let encrypted_key = match decode_b64(&key_resp.encrypted_key) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space key for {}: {}", space.id, err);
            continue;
          }
        };
        let nonce = match decode_b64(&key_resp.nonce) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space nonce for {}: {}", space.id, err);
            continue;
          }
        };
        let ephemeral_public_key = match decode_b64(&key_resp.ephemeral_public_key) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space key epk for {}: {}", space.id, err);
            continue;
          }
        };
        let space_key = match open_sealed_from_recipient(
          &encrypted_key,
          &nonce,
          &ephemeral_public_key,
          &keys.identity_secret_key,
        ) {
          Some(value) => value,
          None => {
            eprintln!("warning: failed to decrypt space key for {}", space.id);
            continue;
          }
        };
        secrets.insert(
          space.id,
          SpaceSecret {
            space_key: encode_b64(&space_key),
            key_version: key_resp.key_version,
            updated_at: Utc::now().to_rfc3339(),
          },
        );
        updated += 1;
      }
      if updated > 0 {
        save_space_secrets(&state.space_secrets_path, &secrets, password)?;
        println!("✅ Updated {} space key(s)", updated);
      }
    }
  }

  Ok(())
}

async fn cmd_push(message: Option<String>, path_override: Option<PathBuf>) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let _lock = CloudLock::acquire(&state)?;
  let password = prompt_password("Master password: ")?;

  let keys = load_keys(&state.keys_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Invalid password or missing keys")))?;
  let _auth_keypair = load_auth_keypair(&state.auth_keypair_path, &password)?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;

  let configured_workspace = PathBuf::from(&config.workspace_path);
  let workspace_path = path_override.unwrap_or_else(|| configured_workspace.clone());
  let index_path = state.index_path.clone();

  let repo_id = fetch_workspace_id(&website_auth).await?;
  let mut client = build_sync_client(
    &config,
    keys.content_key.clone(),
    keys.metadata_key.clone(),
    &website_auth,
    repo_id,
    index_path,
    workspace_path,
    keys.salt.clone(),
  );
  if std::env::var("NEXUS_DEBUG").ok().as_deref() == Some("1") {
    let chunk_config = ChunkConfig {
      min: parse_size_env("NEXUS_CHUNK_MIN", 256 * 1024),
      avg: parse_size_env("NEXUS_CHUNK_AVG", 8 * 1024 * 1024),
      max: parse_size_env("NEXUS_CHUNK_MAX", 32 * 1024 * 1024),
    };
    let cold_avg = parse_size_env("NEXUS_COLD_CHUNK_AVG", 64 * 1024 * 1024);
    let cold_max = parse_size_env("NEXUS_COLD_CHUNK_MAX", 128 * 1024 * 1024);
    let cold_chunk_config = ChunkConfig {
      min: chunk_config.min,
      avg: cold_avg.max(chunk_config.min),
      max: cold_max.max(cold_avg.max(chunk_config.min)),
    };
    eprintln!(
      "debug: chunk_config min={} avg={} max={}",
      chunk_config.min, chunk_config.avg, chunk_config.max
    );
    eprintln!(
      "debug: cold_chunk_config min={} avg={} max={}",
      cold_chunk_config.min, cold_chunk_config.avg, cold_chunk_config.max
    );
    eprintln!(
      "debug: pack_max_file={} pack_max_bytes={} pack_enable={}",
      parse_size_env("NEXUS_PACK_MAX_FILE", 512 * 1024),
      parse_size_env("NEXUS_PACK_MAX_BYTES", 64 * 1024 * 1024),
      std::env::var("NEXUS_PACK_ENABLE").ok().unwrap_or_else(|| "auto".to_string())
    );
    eprintln!(
      "debug: batch_size={} batch_max_bytes={} max_inflight_batches={} upload_concurrency={}",
      parse_usize_env("NEXUS_SYNC_BATCH_SIZE", 400),
      parse_size_env("NEXUS_SYNC_BATCH_MAX_BYTES", 512 * 1024 * 1024),
      parse_usize_env("NEXUS_SYNC_MAX_INFLIGHT_BATCHES", 4),
      parse_usize_env_any(&["NEXUS_SYNC_UPLOAD_CONCURRENCY", "NEXUS_SYNC_CONCURRENCY"], 32)
    );
  }
  let timeout_ms = std::env::var("NEXUS_SYNC_TIMEOUT_MS")
    .ok()
    .and_then(|v| v.parse::<u64>().ok())
    .unwrap_or(180_000);
  let mut last_phase: Option<UploadPhase> = None;
  let mut last_report = Instant::now();
  let push_future = async {
    client
      .push_fast(message.as_deref(), |p| report_progress(&p, &mut last_phase, &mut last_report))
      .await
  };
  let result = if timeout_ms == 0 {
    push_future
      .await
      .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?
  } else {
    tokio::time::timeout(Duration::from_millis(timeout_ms), push_future)
      .await
      .map_err(|_| {
        CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::TimedOut,
          "Sync timed out",
        ))
      })?
      .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?
  };
  eprintln!();
  if result.commit_hash.is_empty() {
    println!("(nothing to push)");
  } else {
    println!("✅ Pushed {}", result.commit_hash);
  }
  Ok(())
}

async fn cmd_pull(path_override: Option<PathBuf>, force: bool) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let _lock = CloudLock::acquire(&state)?;
  let password = prompt_password("Master password: ")?;

  let keys = load_keys(&state.keys_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Invalid password or missing keys")))?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;

  let configured_workspace = PathBuf::from(&config.workspace_path);
  let workspace_path = path_override.unwrap_or_else(|| configured_workspace.clone());

  let index_path = state.index_path.clone();
  let repo_id = fetch_workspace_id(&website_auth).await?;
  if force {
    let index = storage::LocalIndex::open(index_path.clone(), &workspace_path, Some(&repo_id))
      .map_err(map_storage)?;
    index.clear_workspace().map_err(map_storage)?;
  }

  let mut client = build_sync_client(
    &config,
    keys.content_key.clone(),
    keys.metadata_key.clone(),
    &website_auth,
    repo_id,
    index_path,
    workspace_path,
    keys.salt.clone(),
  );
  let timeout_ms = std::env::var("NEXUS_SYNC_TIMEOUT_MS")
    .ok()
    .and_then(|v| v.parse::<u64>().ok())
    .unwrap_or(180_000);
  let pull_future = async {
    client
      .pull()
      .await
      .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))
  };
  let result = if timeout_ms == 0 {
    pull_future.await?
  } else {
    tokio::time::timeout(Duration::from_millis(timeout_ms), pull_future)
      .await
      .map_err(|_| {
        CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::TimedOut,
          "Sync timed out",
        ))
      })??
  };
  if result.commit_hash.is_empty() {
    println!("(no commits)");
  } else {
    println!("✅ Pulled {}", result.commit_hash);
  }
  Ok(())
}

async fn cmd_status() -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let workspace_path = PathBuf::from(&config.workspace_path);
  let index = storage::LocalIndex::open(state.index_path, &workspace_path, None).map_err(map_storage)?;
  let files = index.all_files().map_err(map_storage)?;
  let modified = index
    .files_by_status(storage::FileStatus::Modified)
    .map_err(map_storage)?
    .len();
  let added = index
    .files_by_status(storage::FileStatus::New)
    .map_err(map_storage)?
    .len();
  let deleted = index
    .files_by_status(storage::FileStatus::Deleted)
    .map_err(map_storage)?
    .len();
  println!(
    "Tracked files: {} (new: {}, modified: {}, deleted: {})",
    files.len(),
    added,
    modified,
    deleted
  );
  Ok(())
}

async fn cmd_log() -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let password = prompt_password("Master password: ")?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
  let repo_id = fetch_workspace_id(&website_auth).await?;
  let token = fetch_cloud_token(&website_auth, &repo_id, "read").await?;
  let api = api::ApiClient::new(config.cloud_url, token);
  let resp = api.get::<CommitListResponse>("/api/v1/commits?limit=20").await.map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
  })?;
  if resp.commits.is_empty() {
    println!("(no commits)");
  } else {
    for commit in resp.commits {
      let date = chrono::DateTime::<Utc>::from_utc(
        chrono::NaiveDateTime::from_timestamp_opt(commit.timestamp / 1000, 0).unwrap_or_default(),
        Utc,
      );
      println!("{}  {}", &commit.id[..8], date.to_rfc3339());
    }
  }
  Ok(())
}

fn cmd_guide() -> Result<(), CoreError> {
  let guide = r#"Nexus Cloud lifecycle

My Workspace
- Your personal workspace path (configured via init).
- Always-on background sync after daemon install.
- Use: push, pull, status, log.

Shared Workspaces
- Shared workspaces with specific members.
- Mounted to a local path; sync is per space.
- Use: spaces list/mount/push/pull.
- Create (high trust): collab spaces create --name "<name>" --members "a@b.com,b@c.com"
- Share link (allowlist): collab spaces invite-links create <space_id> --emails "a@b.com,b@c.com"

Lifecycle
1) init --workspace <path> --cloud-url <url>
2) login (browser auth + local key provisioning)
3) daemon install (macOS) for always-on sync
4) work normally; use push/pull for manual control
5) mount shared workspaces and sync per space

Keys & access
- Website issues tokens; keys stay local.
- Server never sees plaintext or keys.
"#;
  println!("{}", guide);
  Ok(())
}

async fn cmd_bench(output: Option<PathBuf>) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let password = prompt_password("Master password: ")?;
  let keys = load_keys(&state.keys_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Invalid password or missing keys")))?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
  let repo_id = fetch_workspace_id(&website_auth).await?;

  let mut client = build_sync_client(
    &config,
    keys.content_key.clone(),
    keys.metadata_key.clone(),
    &website_auth,
    repo_id,
    state.index_path.clone(),
    PathBuf::from(&config.workspace_path),
    keys.salt.clone(),
  );
  let result = client
    .push_fast(Some("bench"), |_| {})
    .await
    .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?;

  let phase = match result.stats.phase {
    sync::v2::UploadPhase::Scanning => "scanning",
    sync::v2::UploadPhase::Chunking => "chunking",
    sync::v2::UploadPhase::Uploading => "uploading",
    sync::v2::UploadPhase::Committing => "committing",
    sync::v2::UploadPhase::Done => "done",
  };

  let chunk_config = ChunkConfig {
    min: parse_size_env("NEXUS_CHUNK_MIN", 256 * 1024),
    avg: parse_size_env("NEXUS_CHUNK_AVG", 8 * 1024 * 1024),
    max: parse_size_env("NEXUS_CHUNK_MAX", 32 * 1024 * 1024),
  };
  let cold_avg = parse_size_env("NEXUS_COLD_CHUNK_AVG", 64 * 1024 * 1024);
  let cold_max = parse_size_env("NEXUS_COLD_CHUNK_MAX", 128 * 1024 * 1024);
  let cold_chunk_config = ChunkConfig {
    min: chunk_config.min,
    avg: cold_avg.max(chunk_config.min),
    max: cold_max.max(cold_avg.max(chunk_config.min)),
  };

  let bench = serde_json::json!({
    "commitHash": result.commit_hash,
    "stats": {
      "phase": phase,
      "totalFiles": result.stats.total_files,
      "processedFiles": result.stats.processed_files,
      "totalChunks": result.stats.total_chunks,
      "uploadedChunks": result.stats.uploaded_chunks,
      "skippedChunks": result.stats.skipped_chunks,
      "totalBytes": result.stats.total_bytes,
      "uploadedBytes": result.stats.uploaded_bytes,
      "startTime": result.stats.start_time_ms,
      "errors": result.stats.errors,
      "currentFile": result.stats.current_file,
      "timings": {
        "scanMs": result.stats.timings.scan_ms,
        "chunkMs": result.stats.timings.chunk_ms,
        "uploadMs": result.stats.timings.upload_ms,
        "commitMs": result.stats.timings.commit_ms,
        "totalMs": result.stats.timings.total_ms,
      }
    },
    "chunkConfig": {
      "min": chunk_config.min,
      "avg": chunk_config.avg,
      "max": chunk_config.max,
    },
    "coldChunkConfig": {
      "min": cold_chunk_config.min,
      "avg": cold_chunk_config.avg,
      "max": cold_chunk_config.max,
    },
    "packConfig": {
      "enabled": std::env::var("NEXUS_PACK_ENABLE").ok().unwrap_or_else(|| "auto".to_string()),
      "maxFile": parse_size_env("NEXUS_PACK_MAX_FILE", 512 * 1024),
      "maxBytes": parse_size_env("NEXUS_PACK_MAX_BYTES", 64 * 1024 * 1024),
    },
    "syncConfig": {
      "batchSize": parse_usize_env("NEXUS_SYNC_BATCH_SIZE", 400),
      "batchMaxBytes": parse_size_env("NEXUS_SYNC_BATCH_MAX_BYTES", 512 * 1024 * 1024),
      "maxInflightBatches": parse_usize_env("NEXUS_SYNC_MAX_INFLIGHT_BATCHES", 4),
      "uploadConcurrency": parse_usize_env_any(&["NEXUS_SYNC_UPLOAD_CONCURRENCY", "NEXUS_SYNC_CONCURRENCY"], 32),
    }
  });

  let path = output.unwrap_or_else(|| PathBuf::from("bench/rust-bench.json"));
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  std::fs::write(path, serde_json::to_string_pretty(&bench)?)?;
  println!("Bench results written.");
  Ok(())
}

async fn cmd_reset(force: bool) -> Result<(), CoreError> {
  if !force {
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "Refusing to reset without --force",
    )));
  }
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let password = prompt_password("Master password: ")?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
  let repo_id = fetch_workspace_id(&website_auth).await?;
  let token = fetch_cloud_token(&website_auth, &repo_id, "write").await?;
  let api = api::ApiClient::new(config.cloud_url, token);
  let mut cursor: Option<String> = None;
  let mut total_deleted: u64 = 0;
  loop {
    let mut body = serde_json::json!({ "limit": 1000 });
    if let Some(ref cursor_value) = cursor {
      body["cursor"] = serde_json::json!(cursor_value);
    }
    let resp: WorkspaceResetResponse = api
      .post_json(
        "/api/v1/workspace/reset",
        &body,
      )
      .await
      .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?;
    if !resp.success {
      if let Some(err) = resp.r2_error {
        return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)));
      }
      return Err(CoreError::Io(std::io::Error::new(
        std::io::ErrorKind::Other,
        "Workspace reset failed",
      )));
    }
    if let Some(r2) = resp.r2 {
      total_deleted += r2.deleted;
      cursor = r2.next_cursor;
      if cursor.is_none() {
        break;
      }
    } else {
      break;
    }
  }
  println!("✅ Workspace reset (deleted {} objects)", total_deleted);
  Ok(())
}

async fn cmd_spaces(command: SpacesCommand) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  match command {
    SpacesCommand::List => {
      let configs = nexus_core::list_space_configs(&state)?;
      if configs.is_empty() {
        println!("(no mounted spaces)");
      } else {
        for cfg in configs {
          println!("{}  {}", cfg.space_id, cfg.mount_path);
        }
      }
    }
    SpacesCommand::Mount { space_id, path } => {
      let had_spaces = !nexus_core::list_space_configs(&state)?.is_empty();
      let password = prompt_password("Master password: ")?;
      let website_auth = load_website_auth(&state.website_auth_path, &password)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
      let collab_keys = load_collab_keys(&state.collab_keys_path, &password)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys configured")))?;

      let key_resp: SpaceKeyResponse = website_get(&website_auth, &format!("/api/spaces/{}/key", space_id)).await?;
      let space_key = open_sealed_from_recipient(
        &decode_b64(&key_resp.encrypted_key).map_err(map_crypto)?,
        &decode_b64(&key_resp.nonce).map_err(map_crypto)?,
        &decode_b64(&key_resp.ephemeral_public_key).map_err(map_crypto)?,
        &collab_keys.identity_secret_key,
      )
      .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Failed to decrypt space key")))?;

      let mount_path = path.unwrap_or_else(|| default_spaces_root().join(&space_id));
      std::fs::create_dir_all(&mount_path)?;

      let cfg = SpaceConfig {
        space_id: space_id.clone(),
        mount_path: mount_path.to_string_lossy().to_string(),
        key_version: key_resp.key_version,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
      };
      save_space_config(&state, &cfg)?;

      let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
      secrets.insert(
        space_id.clone(),
        SpaceSecret {
          space_key: encode_b64(&space_key),
          key_version: key_resp.key_version,
          updated_at: Utc::now().to_rfc3339(),
        },
      );
      save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
      println!("✅ Mounted {}", space_id);
      if !had_spaces {
        if let Err(err) = ensure_daemon_running(&state, &password) {
          eprintln!("warning: failed to start background sync: {}", err);
        }
      }
    }
    SpacesCommand::Unmount { space_id } => {
      let config_path = state.spaces_dir.join(format!("{}.json", space_id));
      if config_path.exists() {
        std::fs::remove_file(config_path)?;
        println!("✅ Unmounted {}", space_id);
      } else {
        println!("Space {} is not mounted", space_id);
      }
    }
    SpacesCommand::Push { space_id, message } => {
      let _lock = CloudLock::acquire(&state)?;
      let password = prompt_password("Master password: ")?;
      let website_auth = load_website_auth(&state.website_auth_path, &password)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
      let secrets = load_space_secrets(&state.space_secrets_path, &password)?;
      let cfg = load_space_config(&state, &space_id)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Space not mounted")))?;
      let secret = secrets.get(&space_id).ok_or_else(|| {
        CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Missing space key"))
      })?;
      let space_key = decode_b64(&secret.space_key).map_err(map_crypto)?;
      let space_keys = derive_space_keys(&space_key, &space_id).map_err(map_crypto)?;
      let salt = space_key[..16].to_vec();

      let mut client = build_sync_client(
        &config,
        space_keys.content_key.clone(),
        space_keys.metadata_key.clone(),
        &website_auth,
        space_id.clone(),
        state.index_path.clone(),
        PathBuf::from(&cfg.mount_path),
        salt,
      );
      let result = client
        .push_fast(message.as_deref(), |_| {})
        .await
        .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?;
      if result.commit_hash.is_empty() {
        println!("(nothing to push)");
      } else {
        println!("✅ Pushed {}", result.commit_hash);
      }
    }
    SpacesCommand::Pull { space_id } => {
      let _lock = CloudLock::acquire(&state)?;
      let password = prompt_password("Master password: ")?;
      let website_auth = load_website_auth(&state.website_auth_path, &password)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
      let secrets = load_space_secrets(&state.space_secrets_path, &password)?;
      let cfg = load_space_config(&state, &space_id)?
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Space not mounted")))?;
      let secret = secrets.get(&space_id).ok_or_else(|| {
        CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Missing space key"))
      })?;
      let space_key = decode_b64(&secret.space_key).map_err(map_crypto)?;
      let space_keys = derive_space_keys(&space_key, &space_id).map_err(map_crypto)?;
      let salt = space_key[..16].to_vec();

      let mut client = build_sync_client(
        &config,
        space_keys.content_key.clone(),
        space_keys.metadata_key.clone(),
        &website_auth,
        space_id.clone(),
        state.index_path.clone(),
        PathBuf::from(&cfg.mount_path),
        salt,
      );
      let result = client.pull().await.map_err(|err| {
        CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
      })?;
      if result.commit_hash.is_empty() {
        println!("(no commits)");
      } else {
        println!("✅ Pulled {}", result.commit_hash);
      }
    }
  }
  Ok(())
}

async fn cmd_collab(command: CollabCommand) -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let password = prompt_password("Master password: ")?;

  match command {
    CollabCommand::Auth { command } => match command {
      CollabAuthCommand::Set => {
        let url = prompt(&format!("Website URL [{}]: ", DEFAULT_WEBSITE_URL))?;
        let website_url = if url.trim().is_empty() { DEFAULT_WEBSITE_URL } else { url.trim() };
        let api_token = prompt("Website API token (Bearer): ")?;
        let auth = WebsiteAuth {
          website_url: website_url.to_string(),
          api_token: api_token.trim().to_string(),
        };
        save_website_auth(&state.website_auth_path, &auth, &password)?;
        bootstrap_login_state(&state, &password, &auth).await?;
        println!("✅ Website auth saved.");
      }
    },
    CollabCommand::Keys { command } => match command {
      CollabKeysCommand::Init => {
        if state.collab_keys_path.exists() {
          println!("Collab keys already exist.");
          return Ok(());
        }
        let keys = generate_collab_keys();
        save_collab_keys(&state.collab_keys_path, &keys, &password)?;
        println!("✅ Collab keys generated.");
      }
      CollabKeysCommand::Show => {
        let keys = load_collab_keys(&state.collab_keys_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys")))?;
        println!("identityPublicKey: {}", encode_b64(&keys.identity_public_key));
        println!("signingPublicKey:  {}", encode_b64(&keys.signing_public_key));
      }
      CollabKeysCommand::Register => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let keys = load_collab_keys(&state.collab_keys_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys")))?;
        let resp: KeysRegisterResponse = website_post(
          &auth,
          "/api/keys",
          serde_json::json!({
            "identityPublicKey": encode_b64(&keys.identity_public_key),
            "signingPublicKey": encode_b64(&keys.signing_public_key),
          }),
        )
        .await?;
        println!("✅ {} (keyVersion={})", resp.message, resp.key_version);
      }
    },
    CollabCommand::Spaces { command } => match command {
      CollabSpacesCommand::List => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let resp: SpacesListResponse = website_get(&auth, "/api/spaces").await?;
        if resp.spaces.is_empty() {
          println!("(no spaces)");
        } else {
          for space in resp.spaces {
            println!("{}  v{}  {}  members={}", space.id, space.key_version, space.role, space.member_count);
          }
        }
      }
      CollabSpacesCommand::Create { name, members } => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let keys = load_collab_keys(&state.collab_keys_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys")))?;

        let _ = website_post::<KeysRegisterResponse>(
          &auth,
          "/api/keys",
          serde_json::json!({
            "identityPublicKey": encode_b64(&keys.identity_public_key),
            "signingPublicKey": encode_b64(&keys.signing_public_key),
          }),
        )
        .await;

        let connections: ConnectionsResponse = website_get(&auth, "/api/connections").await?;
        let mut email_to_id = std::collections::HashMap::new();
        for conn in connections.connections {
          if conn.status == "accepted" {
            email_to_id.insert(conn.user.email.to_lowercase(), conn.user.id);
          }
        }
        let member_emails: Vec<String> = members
          .split(',')
          .map(|s| s.trim().to_lowercase())
          .filter(|s| !s.is_empty())
          .collect();
        if member_emails.is_empty() {
          return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No members provided")));
        }

        let mut member_user_ids = Vec::new();
        for email in member_emails {
          let id = email_to_id.get(&email).ok_or_else(|| {
            CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("Unknown member: {}", email)))
          })?;
          member_user_ids.push(id.clone());
        }

        let token_info: TokenInfoResponse =
          website_post(&auth, "/api/validate-token", serde_json::json!({})).await?;
        let creator_id = token_info.user_id.ok_or_else(|| {
          CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Failed to get user id"))
        })?;
        if !member_user_ids.contains(&creator_id) {
          member_user_ids.insert(0, creator_id.clone());
        }

        let mut member_keys = Vec::new();
        for user_id in &member_user_ids {
          let pk: UserKeyResponse = website_get(&auth, &format!("/api/users/{}/keys", user_id)).await?;
          let identity_pk = decode_b64(&pk.identity_public_key).map_err(map_crypto)?;
          member_keys.push((user_id.clone(), identity_pk));
        }

        let space_key = random_bytes(32)?;
        let encrypted_name = encrypt_secret_bytes(name.as_bytes(), &space_key).map_err(map_crypto)?;
        let encrypted_name_b64 = encode_b64(&encrypted_name);

        let member_payloads: Vec<serde_json::Value> = member_keys
          .into_iter()
          .map(|(user_id, identity_pk)| {
            let sealed = seal_for_recipient(&space_key, &identity_pk).map_err(map_crypto)?;
            Ok::<serde_json::Value, CoreError>(serde_json::json!({
              "userId": user_id,
              "encryptedKey": encode_b64(&sealed.ciphertext),
              "ephemeralPublicKey": encode_b64(&sealed.ephemeral_public_key),
              "nonce": encode_b64(&sealed.nonce),
            }))
          })
          .collect::<Result<_, _>>()?;

        let created: SpaceCreateResponse = website_post(
          &auth,
          "/api/spaces",
          serde_json::json!({
            "encryptedName": encrypted_name_b64,
            "memberKeys": member_payloads,
          }),
        )
        .await?;

        let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        secrets.insert(
          created.space_id.clone(),
          SpaceSecret {
            space_key: encode_b64(&space_key),
            key_version: created.key_version,
            updated_at: Utc::now().to_rfc3339(),
          },
        );
        save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
        println!("✅ Created space {} (v{})", created.space_id, created.key_version);
      }
      CollabSpacesCommand::Delete { space_id } => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let _: BasicResponse = website_delete(&auth, &format!("/api/spaces/{}", space_id)).await?;

        let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        if secrets.remove(&space_id).is_some() {
          save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
        }
        let config_path = state.spaces_dir.join(format!("{}.json", space_id));
        let _ = std::fs::remove_file(&config_path);
        let data_dir = state.spaces_dir.join(&space_id);
        let _ = std::fs::remove_dir_all(&data_dir);
        println!("✅ Deleted space {}", space_id);
      }
      CollabSpacesCommand::Leave { space_id } => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let token_info: TokenInfoResponse =
          website_post(&auth, "/api/validate-token", serde_json::json!({})).await?;
        let user_id = token_info.user_id.ok_or_else(|| {
          CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Failed to get user id"))
        })?;
        let _: BasicResponse = website_delete(
          &auth,
          &format!("/api/spaces/{}/members/{}", space_id, user_id),
        )
        .await?;

        let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        if secrets.remove(&space_id).is_some() {
          save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
        }
        let config_path = state.spaces_dir.join(format!("{}.json", space_id));
        let _ = std::fs::remove_file(&config_path);
        let data_dir = state.spaces_dir.join(&space_id);
        let _ = std::fs::remove_dir_all(&data_dir);
        println!("✅ Left space {}", space_id);
      }
      CollabSpacesCommand::Key { space_id } => {
        let auth = load_website_auth(&state.website_auth_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
        let keys = load_collab_keys(&state.collab_keys_path, &password)?
          .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys")))?;
        let resp: SpaceKeyResponse = website_get(&auth, &format!("/api/spaces/{}/key", space_id)).await?;
        let space_key = open_sealed_from_recipient(
          &decode_b64(&resp.encrypted_key).map_err(map_crypto)?,
          &decode_b64(&resp.nonce).map_err(map_crypto)?,
          &decode_b64(&resp.ephemeral_public_key).map_err(map_crypto)?,
          &keys.identity_secret_key,
        )
        .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Failed to decrypt space key")))?;
        let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        secrets.insert(
          space_id.clone(),
          SpaceSecret {
            space_key: encode_b64(&space_key),
            key_version: resp.key_version,
            updated_at: Utc::now().to_rfc3339(),
          },
        );
        save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
        println!("✅ Updated space key for {}", space_id);
      }
      CollabSpacesCommand::InviteLinks { command } => match command {
        InviteLinksCommand::Create {
          space_id,
          emails,
          max_uses,
          expires_in_hours,
        } => {
          let auth = load_website_auth(&state.website_auth_path, &password)?
            .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
          let secrets = load_space_secrets(&state.space_secrets_path, &password)?;
          let secret = secrets.get(&space_id).ok_or_else(|| {
            CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Missing space key"))
          })?;
          let space_key = decode_b64(&secret.space_key).map_err(map_crypto)?;

          let allowlist: Vec<String> = emails
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
          if allowlist.is_empty() {
            return Err(CoreError::Io(std::io::Error::new(
              std::io::ErrorKind::Other,
              "No emails provided",
            )));
          }

          let lookup: UsersLookupResponse = website_post(
            &auth,
            "/api/users/lookup",
            serde_json::json!({ "emails": allowlist.clone() }),
          )
          .await?;
          if !lookup.missing.is_empty() {
            return Err(CoreError::Io(std::io::Error::new(
              std::io::ErrorKind::Other,
              format!("Unknown or unregistered emails: {}", lookup.missing.join(", ")),
            )));
          }

          let mut email_to_user = std::collections::HashMap::new();
          for user in lookup.users {
            email_to_user.insert(user.email.to_lowercase(), user);
          }

          let mut member_payloads = Vec::new();
          for email in &allowlist {
            let user = email_to_user.get(email).ok_or_else(|| {
              CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("Unknown member: {}", email)))
            })?;
            let identity_pk = decode_b64(&user.identity_public_key).map_err(map_crypto)?;
            let sealed = seal_for_recipient(&space_key, &identity_pk).map_err(map_crypto)?;
            member_payloads.push(serde_json::json!({
              "userId": user.user_id,
              "encryptedKey": encode_b64(&sealed.ciphertext),
              "ephemeralPublicKey": encode_b64(&sealed.ephemeral_public_key),
              "nonce": encode_b64(&sealed.nonce),
              "keyVersion": secret.key_version,
            }));
          }

          let expires_at = expires_in_hours.map(|hours| {
            (Utc::now() + chrono::Duration::hours(hours)).to_rfc3339()
          });

          let resp: InviteLinkCreateResponse = website_post(
            &auth,
            &format!("/api/spaces/{}/invite-links", space_id),
            serde_json::json!({
              "emails": allowlist,
              "memberKeys": member_payloads,
              "maxUses": max_uses,
              "expiresAt": expires_at,
            }),
          )
          .await?;
          println!("✅ Invite link created");
          println!("{}", resp.url);
          if let Some(expires_at) = resp.expires_at {
            println!("Expires at {}", expires_at);
          }
        }
        InviteLinksCommand::List { space_id } => {
          let auth = load_website_auth(&state.website_auth_path, &password)?
            .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
          let resp: InviteLinksListResponse =
            website_get(&auth, &format!("/api/spaces/{}/invite-links", space_id)).await?;
          if resp.links.is_empty() {
            println!("(no invite links)");
          } else {
            for link in resp.links {
              let scope = if link.email_allowlist.is_empty() {
                "allowlist=all".to_string()
              } else {
                format!("allowlist={}", link.email_allowlist.join(","))
              };
              let expires = link.expires_at.clone().unwrap_or_else(|| "never".to_string());
              println!(
                "{}  uses={}/{}  expires={}  {}",
                link.id,
                link.uses,
                link.max_uses.map(|v| v.to_string()).unwrap_or_else(|| "∞".to_string()),
                expires,
                scope
              );
              println!("  {}", link.url);
            }
          }
        }
        InviteLinksCommand::Revoke { space_id, link_id } => {
          let auth = load_website_auth(&state.website_auth_path, &password)?
            .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth")))?;
          let _: BasicResponse = website_delete(
            &auth,
            &format!("/api/spaces/{}/invite-links/{}", space_id, link_id),
          )
          .await?;
          println!("✅ Invite link revoked");
        }
      },
    },
    CollabCommand::Start { space_id } => {
      let repo_root = repo_root();
      let config = load_config(&state.config_path).ok();
      let nexus_home = nexus_home_from_config(config.as_ref()).unwrap_or_else(|| nexus_home_from_state(&state));
      let status = std::process::Command::new("bun")
        .arg("client/cli.ts")
        .arg("collab")
        .arg("start")
        .arg(space_id)
        .env("NEXUS_HOME", nexus_home)
        .current_dir(repo_root)
        .status()
        .map_err(|err| CoreError::Io(err))?;
      if !status.success() {
        return Err(CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::Other,
          "Collab start failed",
        )));
      }
    }
    CollabCommand::Stop => {
      let repo_root = repo_root();
      let config = load_config(&state.config_path).ok();
      let nexus_home = nexus_home_from_config(config.as_ref()).unwrap_or_else(|| nexus_home_from_state(&state));
      let status = std::process::Command::new("bun")
        .arg("client/cli.ts")
        .arg("collab")
        .arg("stop")
        .env("NEXUS_HOME", nexus_home)
        .current_dir(repo_root)
        .status()
        .map_err(|err| CoreError::Io(err))?;
      if !status.success() {
        return Err(CoreError::Io(std::io::Error::new(
          std::io::ErrorKind::Other,
          "Collab stop failed",
        )));
      }
    }
  }
  Ok(())
}

async fn cmd_daemon(command: Option<DaemonCommand>) -> Result<(), CoreError> {
  if let Some(cmd) = command {
    match cmd {
      DaemonCommand::Install => {
        return cmd_daemon_install().await;
      }
    }
  }

  cmd_daemon_run().await
}

async fn cmd_daemon_run() -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let config = ensure_initialized(&state)?;
  let password = daemon_password()?;
  let keys = load_keys(&state.keys_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "Invalid password or missing keys")))?;
  let website_auth = load_website_auth(&state.website_auth_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No website auth configured")))?;
  let collab_keys = load_collab_keys(&state.collab_keys_path, &password)?
    .ok_or_else(|| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, "No collab keys configured")))?;

  let repo_id = fetch_workspace_id(&website_auth).await?;
  loop {
    let mut client = build_sync_client(
      &config,
      keys.content_key.clone(),
      keys.metadata_key.clone(),
      &website_auth,
      repo_id.clone(),
      state.index_path.clone(),
      PathBuf::from(&config.workspace_path),
      keys.salt.clone(),
    );
    let _ = client.pull().await;
    let _ = client.push_fast(None, |_| {}).await;

    let spaces: SpacesListResponse = website_get(&website_auth, "/api/spaces").await?;
    for space in spaces.spaces {
      if load_space_config(&state, &space.id)?.is_none() {
        let key_resp: SpaceKeyResponse = website_get(&website_auth, &format!("/api/spaces/{}/key", space.id)).await?;
        let encrypted_key = match decode_b64(&key_resp.encrypted_key) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space key for {}: {}", space.id, err);
            continue;
          }
        };
        let nonce = match decode_b64(&key_resp.nonce) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space nonce for {}: {}", space.id, err);
            continue;
          }
        };
        let ephemeral_public_key = match decode_b64(&key_resp.ephemeral_public_key) {
          Ok(value) => value,
          Err(err) => {
            eprintln!("warning: failed to decode space key epk for {}: {}", space.id, err);
            continue;
          }
        };
        let space_key = match open_sealed_from_recipient(
          &encrypted_key,
          &nonce,
          &ephemeral_public_key,
          &collab_keys.identity_secret_key,
        ) {
          Some(value) => value,
          None => {
            eprintln!("warning: failed to decrypt space key for {}", space.id);
            continue;
          }
        };
        let mount_path = default_spaces_root().join(&space.id);
        std::fs::create_dir_all(&mount_path)?;
        save_space_config(
          &state,
          &SpaceConfig {
            space_id: space.id.clone(),
            mount_path: mount_path.to_string_lossy().to_string(),
            key_version: key_resp.key_version,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
          },
        )?;
        let mut secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        secrets.insert(
          space.id.clone(),
          SpaceSecret {
            space_key: encode_b64(&space_key),
            key_version: key_resp.key_version,
            updated_at: Utc::now().to_rfc3339(),
          },
        );
        save_space_secrets(&state.space_secrets_path, &secrets, &password)?;
      }

      if let Some(cfg) = load_space_config(&state, &space.id)? {
        let secrets = load_space_secrets(&state.space_secrets_path, &password)?;
        if let Some(secret) = secrets.get(&space.id) {
          let space_key = decode_b64(&secret.space_key).map_err(map_crypto)?;
          let space_keys = derive_space_keys(&space_key, &space.id).map_err(map_crypto)?;
          let salt = space_key[..16].to_vec();
          let mut client = build_sync_client(
            &config,
            space_keys.content_key.clone(),
            space_keys.metadata_key.clone(),
            &website_auth,
            space.id.clone(),
            state.index_path.clone(),
            PathBuf::from(&cfg.mount_path),
            salt,
          );
          let _ = client.pull().await;
          let _ = client.push_fast(None, |_| {}).await;
        }
      }
    }

    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
  }
}

async fn cmd_daemon_install() -> Result<(), CoreError> {
  let state = StatePaths::new()?;
  let _config = ensure_initialized(&state)?;
  if !cfg!(target_os = "macos") {
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "Daemon install is only supported on macOS right now",
    )));
  }

  let password = prompt_password("Master password: ")?;
  if std::io::stdin().is_terminal() {
    store_password_in_keychain(&password)?;
  }

  let exe = std::env::current_exe()?;
  let nexus_home = Some(nexus_home_from_state(&state));
  let plist_path = write_launch_agent(&exe, nexus_home.as_deref())?;
  bootstrap_launch_agent(&plist_path)?;
  println!("✅ Background sync installed (launchd)");
  Ok(())
}

fn ensure_initialized(state: &StatePaths) -> Result<AppConfig, CoreError> {
  let config = load_config(&state.config_path)?;
  if !config.initialized {
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "Not initialized. Run init first.",
    )));
  }
  Ok(config)
}

fn build_sync_client(
  config: &AppConfig,
  content_key: Vec<u8>,
  metadata_key: Vec<u8>,
  auth: &WebsiteAuth,
  repo_id: String,
  index_path: PathBuf,
  workspace_path: PathBuf,
  salt: Vec<u8>,
) -> SyncClientV2 {
  let chunk_config = ChunkConfig {
    min: parse_size_env("NEXUS_CHUNK_MIN", 256 * 1024),
    avg: parse_size_env("NEXUS_CHUNK_AVG", 8 * 1024 * 1024),
    max: parse_size_env("NEXUS_CHUNK_MAX", 32 * 1024 * 1024),
  };
  let cold_avg = parse_size_env("NEXUS_COLD_CHUNK_AVG", 64 * 1024 * 1024);
  let cold_max = parse_size_env("NEXUS_COLD_CHUNK_MAX", 128 * 1024 * 1024);
  let cold_chunk_config = ChunkConfig {
    min: chunk_config.min,
    avg: cold_avg.max(chunk_config.min),
    max: cold_max.max(cold_avg.max(chunk_config.min)),
  };
  let default_threads = (num_cpus::get().saturating_sub(1)).max(1);
  let chunk_threads = parse_usize_env_any(&["NEXUS_CHUNK_WORKERS", "NEXUS_CHUNK_THREADS"], default_threads);

  SyncClientV2::new(SyncV2Config {
    workspace_path,
    index_path,
    repo_id,
    cloud_url: config.cloud_url.clone(),
    website_auth: SyncWebsiteAuth {
      website_url: auth.website_url.clone(),
      api_token: auth.api_token.clone(),
    },
    content_key,
    metadata_key,
    salt,
    chunk_config,
    cold_chunk_config,
    batch_size: parse_usize_env("NEXUS_SYNC_BATCH_SIZE", 400),
    batch_max_bytes: parse_size_env("NEXUS_SYNC_BATCH_MAX_BYTES", 512 * 1024 * 1024) as usize,
    max_inflight_batches: parse_usize_env("NEXUS_SYNC_MAX_INFLIGHT_BATCHES", 4),
    upload_concurrency: parse_usize_env_any(&["NEXUS_SYNC_UPLOAD_CONCURRENCY", "NEXUS_SYNC_CONCURRENCY"], 32),
    chunk_threads,
  })
}

fn parse_size_env(key: &str, fallback: u32) -> u32 {
  let value = std::env::var(key).ok();
  parse_size(value.as_deref(), fallback)
}

fn parse_usize_env(key: &str, fallback: usize) -> usize {
  std::env::var(key)
    .ok()
    .and_then(|v| v.trim().parse::<usize>().ok())
    .filter(|v| *v > 0)
    .unwrap_or(fallback)
}

fn parse_usize_env_any(keys: &[&str], fallback: usize) -> usize {
  for key in keys {
    if let Ok(value) = std::env::var(key) {
      if let Ok(parsed) = value.trim().parse::<usize>() {
        if parsed > 0 {
          return parsed;
        }
      }
    }
  }
  fallback
}

fn parse_size(value: Option<&str>, fallback: u32) -> u32 {
  let Some(raw) = value else {
    return fallback;
  };
  let trimmed = raw.trim().to_lowercase();
  let re = regex::Regex::new(r"^(\d+(?:\.\d+)?)(b|kb|k|mb|m|gb|g)?$").ok();
  let Some(re) = re else {
    return fallback;
  };
  let Some(caps) = re.captures(&trimmed) else {
    return fallback;
  };
  let amount: f64 = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
  let unit = caps.get(2).map(|m| m.as_str()).unwrap_or("b");
  let multiplier = match unit {
    "g" | "gb" => 1024.0 * 1024.0 * 1024.0,
    "m" | "mb" => 1024.0 * 1024.0,
    "k" | "kb" => 1024.0,
    _ => 1.0,
  };
  (amount * multiplier).max(1.0) as u32
}

fn map_storage(err: storage::StorageError) -> CoreError {
  CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
}

fn map_crypto(err: crypto::CryptoError) -> CoreError {
  CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
}

fn map_http_err(err: reqwest::Error) -> CoreError {
  CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err))
}

fn report_progress(progress: &UploadProgress, last_phase: &mut Option<UploadPhase>, last_report: &mut Instant) {
  let now = Instant::now();
  if last_report.elapsed() < Duration::from_millis(500)
    && last_phase.as_ref() == Some(&progress.phase)
  {
    return;
  }
  *last_report = now;

  if last_phase.as_ref() != Some(&progress.phase) {
    println!();
    match progress.phase {
      UploadPhase::Scanning => println!("🔍 Scanning..."),
      UploadPhase::Chunking => println!("🧩 Chunking..."),
      UploadPhase::Uploading => println!("⬆️  Uploading..."),
      UploadPhase::Committing => println!("🧾 Committing..."),
      UploadPhase::Done => println!("✅ Done"),
    }
    *last_phase = Some(progress.phase);
  }

  match progress.phase {
    UploadPhase::Scanning => {
      let current = progress.current_file.clone().unwrap_or_default();
      eprint!(
        "\r  {} / {} files {}",
        progress.processed_files,
        progress.total_files,
        current
      );
    }
    UploadPhase::Chunking => {
      eprint!(
        "\r  {} chunks ({:.1} MB)",
        progress.total_chunks,
        bytes_to_mb(progress.total_bytes)
      );
    }
    UploadPhase::Uploading => {
      eprint!(
        "\r  {} / {} chunks ({:.1} / {:.1} MB)",
        progress.uploaded_chunks,
        progress.total_chunks,
        bytes_to_mb(progress.uploaded_bytes),
        bytes_to_mb(progress.total_bytes)
      );
    }
    UploadPhase::Committing | UploadPhase::Done => {}
  }
}

fn bytes_to_mb(bytes: u64) -> f64 {
  bytes as f64 / (1024.0 * 1024.0)
}

fn parse_repo_id_from_token(token: &str) -> Result<Option<String>, CoreError> {
  let mut parts = token.split('.');
  let _header = parts.next();
  let payload = parts.next();
  if payload.is_none() {
    return Ok(None);
  }
  let payload = payload.unwrap();
  let decoded = URL_SAFE_NO_PAD
    .decode(payload.as_bytes())
    .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))?;
  let value: serde_json::Value = serde_json::from_slice(&decoded)?;
  if let Some(repo_id) = value.get("repoId").and_then(|v| v.as_str()) {
    return Ok(Some(repo_id.to_string()));
  }
  if let Some(repo_id) = value.get("workspaceId").and_then(|v| v.as_str()) {
    return Ok(Some(repo_id.to_string()));
  }
  Ok(None)
}

fn prompt(question: &str) -> Result<String, CoreError> {
  use std::io::{stdin, stdout, Write};
  print!("{}", question);
  stdout().flush()?;
  let mut buf = String::new();
  stdin().read_line(&mut buf)?;
  Ok(buf.trim().to_string())
}

fn prompt_password(question: &str) -> Result<String, CoreError> {
  if let Ok(value) = std::env::var("NEXUS_PASSWORD") {
    return Ok(value);
  }
  if !std::io::stdin().is_terminal() {
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "No TTY available for password prompt. Set NEXUS_PASSWORD to run non-interactively.",
    )));
  }
  rpassword::prompt_password(question)
    .map_err(|err| CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err)))
}

fn random_bytes(len: usize) -> Result<Vec<u8>, CoreError> {
  let mut buf = vec![0u8; len];
  getrandom::fill(&mut buf).map_err(|err| {
    CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, err.to_string()))
  })?;
  Ok(buf)
}

fn random_hex(bytes: usize) -> Result<String, CoreError> {
  let data = random_bytes(bytes)?;
  Ok(data.iter().map(|b| format!("{:02x}", b)).collect())
}

fn open_browser(url: &str) {
  let cmd = if cfg!(target_os = "macos") {
    "open"
  } else if cfg!(target_os = "windows") {
    "start"
  } else {
    "xdg-open"
  };
  let _ = std::process::Command::new(cmd).arg(url).spawn();
}

fn daemon_password() -> Result<String, CoreError> {
  if let Ok(value) = std::env::var("NEXUS_PASSWORD") {
    return Ok(value);
  }
  if let Some(value) = load_password_from_keychain()? {
    return Ok(value);
  }
  if std::io::stdin().is_terminal() {
    return prompt_password("Master password: ");
  }
  Err(CoreError::Io(std::io::Error::new(
    std::io::ErrorKind::Other,
    "NEXUS_PASSWORD not set and no keychain entry found",
  )))
}

fn load_password_from_keychain() -> Result<Option<String>, CoreError> {
  if !cfg!(target_os = "macos") {
    return Ok(None);
  }
  let output = std::process::Command::new("security")
    .arg("find-generic-password")
    .arg("-a")
    .arg(DAEMON_KEYCHAIN_ACCOUNT)
    .arg("-s")
    .arg(DAEMON_KEYCHAIN_SERVICE)
    .arg("-w")
    .output()?;
  if !output.status.success() {
    return Ok(None);
  }
  let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if value.is_empty() {
    Ok(None)
  } else {
    Ok(Some(value))
  }
}

fn store_password_in_keychain(password: &str) -> Result<(), CoreError> {
  if !cfg!(target_os = "macos") {
    return Ok(());
  }
  let status = std::process::Command::new("security")
    .arg("add-generic-password")
    .arg("-a")
    .arg(DAEMON_KEYCHAIN_ACCOUNT)
    .arg("-s")
    .arg(DAEMON_KEYCHAIN_SERVICE)
    .arg("-w")
    .arg(password)
    .arg("-U")
    .status()?;
  if status.success() {
    Ok(())
  } else {
    Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "Failed to store daemon password in keychain",
    )))
  }
}

fn launch_agent_path() -> Result<PathBuf, CoreError> {
  let home = dirs::home_dir().ok_or(CoreError::MissingHome)?;
  Ok(home.join("Library").join("LaunchAgents").join(format!("{}.plist", DAEMON_LABEL)))
}

fn launchctl_target() -> Result<String, CoreError> {
  let uid = String::from_utf8_lossy(
    &std::process::Command::new("id")
      .arg("-u")
      .output()?
      .stdout,
  )
  .trim()
  .to_string();
  Ok(format!("gui/{}", uid))
}

fn launchctl_label() -> Result<String, CoreError> {
  Ok(format!("{}/{}", launchctl_target()?, DAEMON_LABEL))
}

fn launch_agent_loaded(label: &str) -> Result<bool, CoreError> {
  if !cfg!(target_os = "macos") {
    return Ok(false);
  }
  let status = std::process::Command::new("launchctl")
    .arg("print")
    .arg(label)
    .status()?;
  Ok(status.success())
}

fn write_launch_agent(exe: &Path, nexus_home: Option<&Path>) -> Result<PathBuf, CoreError> {
  let plist_path = launch_agent_path()?;
  if let Some(parent) = plist_path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  let home = dirs::home_dir().ok_or(CoreError::MissingHome)?;
  let stdout_path = home.join("Library").join("Logs").join("nexus-cloud-daemon.log");
  let stderr_path = home.join("Library").join("Logs").join("nexus-cloud-daemon.err.log");
  let mut env = String::new();
  if let Some(home) = nexus_home {
    env.push_str(&format!(
      "    <key>NEXUS_HOME</key>\n    <string>{}</string>\n",
      home.to_string_lossy()
    ));
  }
  let plist = format!(
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
      <string>{exe}</string>
      <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{stdout}</string>
    <key>StandardErrorPath</key>
    <string>{stderr}</string>
    <key>EnvironmentVariables</key>
    <dict>
{env}    </dict>
  </dict>
</plist>
"#,
    label = DAEMON_LABEL,
    exe = exe.to_string_lossy(),
    stdout = stdout_path.to_string_lossy(),
    stderr = stderr_path.to_string_lossy(),
    env = env,
  );
  std::fs::write(&plist_path, plist)?;
  Ok(plist_path)
}

fn bootstrap_launch_agent(plist_path: &Path) -> Result<(), CoreError> {
  if !cfg!(target_os = "macos") {
    return Ok(());
  }
  let target = launchctl_target()?;
  let label = launchctl_label()?;
  if launch_agent_loaded(&label)? {
    let _ = std::process::Command::new("launchctl")
      .arg("enable")
      .arg(&label)
      .status();
    let _ = std::process::Command::new("launchctl")
      .arg("kickstart")
      .arg("-k")
      .arg(&label)
      .status();
    return Ok(());
  }
  let _ = std::process::Command::new("launchctl")
    .arg("bootout")
    .arg(&target)
    .arg(plist_path)
    .status();
  let status = std::process::Command::new("launchctl")
    .arg("bootstrap")
    .arg(&target)
    .arg(plist_path)
    .status()?;
  if !status.success() {
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      "Failed to bootstrap launch agent",
    )));
  }
  let _ = std::process::Command::new("launchctl")
    .arg("enable")
    .arg(&label)
    .status();
  let _ = std::process::Command::new("launchctl")
    .arg("kickstart")
    .arg("-k")
    .arg(&label)
    .status();
  Ok(())
}

fn ensure_daemon_running(state: &StatePaths, password: &str) -> Result<(), CoreError> {
  if !cfg!(target_os = "macos") {
    return Ok(());
  }
  store_password_in_keychain(password)?;
  let exe = std::env::current_exe()?;
  let nexus_home = Some(nexus_home_from_state(state));
  let plist_path = write_launch_agent(&exe, nexus_home.as_deref())?;
  bootstrap_launch_agent(&plist_path)?;
  Ok(())
}

fn default_workspace_path() -> PathBuf {
  if let Ok(home) = std::env::var("NEXUS_HOME") {
    return PathBuf::from(home).join("home");
  }
  dirs::home_dir()
    .map(|home| home.join("nexus").join("home"))
    .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn default_spaces_root() -> PathBuf {
  if let Ok(home) = std::env::var("NEXUS_HOME") {
    return PathBuf::from(home).join("home").join("spaces");
  }
  dirs::home_dir()
    .map(|home| home.join("nexus").join("home").join("spaces"))
    .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn create_nexusignore(workspace: &PathBuf) -> Result<(), CoreError> {
  let ignore_path = workspace.join(".nexusignore");
  if ignore_path.exists() {
    return Ok(());
  }
  let contents = r#"# Nexus Cloud Ignore File
# Patterns here will not be synced to the cloud

# Session logs (may contain API keys in conversations)
sessions/

# Environment files
.env
.env.*

# Secrets
*credentials*
*secret*
*.key
*.pem

# Dependencies
node_modules/
__pycache__/
.venv/

# OS files
.DS_Store
*.swp
*.tmp

# Git (handled separately)
.git/
"#;
  std::fs::write(ignore_path, contents)?;
  Ok(())
}

fn repo_root() -> PathBuf {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest
    .parent()
    .and_then(|p| p.parent())
    .unwrap_or(&manifest)
    .to_path_buf()
}

fn nexus_home_from_state(state: &StatePaths) -> PathBuf {
  if let Ok(config) = load_config(&state.config_path) {
    if let Some(home) = nexus_home_from_config(Some(&config)) {
      return home;
    }
  }
  state
    .root
    .parent()
    .unwrap_or(&state.root)
    .to_path_buf()
}

fn nexus_home_from_config(config: Option<&AppConfig>) -> Option<PathBuf> {
  let config = config?;
  let workspace = PathBuf::from(&config.workspace_path);
  workspace.parent().map(|p| p.to_path_buf())
}

async fn fetch_workspace_id(auth: &WebsiteAuth) -> Result<String, CoreError> {
  let url = format!("{}/api/cloud/token", auth.website_url);
  let client = Client::new();
  let resp = client
    .post(url)
    .bearer_auth(&auth.api_token)
    .json(&serde_json::json!({ "permissions": "write" }))
    .send()
    .await
    .map_err(map_http_err)?;
  if !resp.status().is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(CoreError::Io(std::io::Error::new(
      std::io::ErrorKind::Other,
      text,
    )));
  }
  let body: CloudTokenInfo = resp.json().await.map_err(map_http_err)?;
  if let Some(id) = body.workspace_id {
    return Ok(id);
  }
  if let Some(token) = body.token {
    if let Some(id) = parse_repo_id_from_token(&token)? {
      return Ok(id);
    }
  }
  Err(CoreError::Io(std::io::Error::new(
    std::io::ErrorKind::Other,
    "Failed to resolve workspace id from token",
  )))
}

async fn fetch_cloud_token(auth: &WebsiteAuth, repo_id: &str, permissions: &str) -> Result<String, CoreError> {
  let url = format!("{}/api/cloud/token", auth.website_url);
  let client = Client::new();
  let resp = client
    .post(url)
    .bearer_auth(&auth.api_token)
    .json(&serde_json::json!({ "repoId": repo_id, "permissions": permissions }))
    .send()
    .await
    .map_err(map_http_err)?;
  if !resp.status().is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, text)));
  }
  let body: CloudTokenResponse = resp.json().await.map_err(map_http_err)?;
  Ok(body.token)
}

async fn website_get<T: for<'de> Deserialize<'de>>(auth: &WebsiteAuth, path: &str) -> Result<T, CoreError> {
  let url = format!("{}{}", auth.website_url, path);
  let resp = Client::new()
    .get(url)
    .bearer_auth(&auth.api_token)
    .send()
    .await
    .map_err(map_http_err)?;
  if !resp.status().is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, text)));
  }
  Ok(resp.json::<T>().await.map_err(map_http_err)?)
}

async fn website_post<T: for<'de> Deserialize<'de>>(
  auth: &WebsiteAuth,
  path: &str,
  body: impl Serialize,
) -> Result<T, CoreError> {
  let url = format!("{}{}", auth.website_url, path);
  let resp = Client::new()
    .post(url)
    .bearer_auth(&auth.api_token)
    .json(&body)
    .send()
    .await
    .map_err(map_http_err)?;
  if !resp.status().is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, text)));
  }
  Ok(resp.json::<T>().await.map_err(map_http_err)?)
}

async fn website_delete<T: for<'de> Deserialize<'de>>(
  auth: &WebsiteAuth,
  path: &str,
) -> Result<T, CoreError> {
  let url = format!("{}{}", auth.website_url, path);
  let resp = Client::new()
    .delete(url)
    .bearer_auth(&auth.api_token)
    .send()
    .await
    .map_err(map_http_err)?;
  if !resp.status().is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(CoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, text)));
  }
  Ok(resp.json::<T>().await.map_err(map_http_err)?)
}

#[derive(Debug, Deserialize)]
struct AuthPollResponse {
  pub status: String,
  pub token: Option<String>,
  #[serde(rename = "cloudUrl")]
  pub cloud_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CloudTokenInfo {
  #[serde(rename = "workspaceId")]
  pub workspace_id: Option<String>,
  pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CloudTokenResponse {
  pub token: String,
}

#[derive(Debug, Deserialize)]
struct CommitListResponse {
  pub commits: Vec<CommitEntry>,
}

#[derive(Debug, Deserialize)]
struct CommitEntry {
  pub id: String,
  pub timestamp: i64,
}

#[derive(Debug, Deserialize)]
struct KeysRegisterResponse {
  pub success: bool,
  #[serde(rename = "keyVersion")]
  pub key_version: u32,
  pub message: String,
}

#[derive(Debug, Deserialize)]
struct SpacesListResponse {
  pub spaces: Vec<SpaceListEntry>,
}

#[derive(Debug, Deserialize)]
struct SpaceListEntry {
  pub id: String,
  #[serde(rename = "keyVersion")]
  pub key_version: u32,
  pub role: String,
  #[serde(rename = "memberCount")]
  pub member_count: u32,
}

#[derive(Debug, Deserialize)]
struct SpaceKeyResponse {
  #[serde(rename = "encryptedKey")]
  pub encrypted_key: String,
  #[serde(rename = "ephemeralPublicKey")]
  pub ephemeral_public_key: String,
  pub nonce: String,
  #[serde(rename = "keyVersion")]
  pub key_version: u32,
}

#[derive(Debug, Deserialize)]
struct SpaceCreateResponse {
  pub success: bool,
  #[serde(rename = "spaceId")]
  pub space_id: String,
  #[serde(rename = "keyVersion")]
  pub key_version: u32,
}

#[derive(Debug, Deserialize)]
struct ConnectionsResponse {
  pub connections: Vec<ConnectionEntry>,
}

#[derive(Debug, Deserialize)]
struct ConnectionEntry {
  pub status: String,
  pub user: ConnectionUser,
}

#[derive(Debug, Deserialize)]
struct ConnectionUser {
  pub id: String,
  pub email: String,
}

#[derive(Debug, Deserialize)]
struct TokenInfoResponse {
  pub valid: bool,
  #[serde(rename = "userId")]
  pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserKeyResponse {
  #[serde(rename = "identityPublicKey")]
  pub identity_public_key: String,
}

#[derive(Debug, Deserialize)]
struct UsersLookupResponse {
  pub users: Vec<UserLookupEntry>,
  pub missing: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct UserLookupEntry {
  #[serde(rename = "userId")]
  pub user_id: String,
  pub email: String,
  #[serde(rename = "identityPublicKey")]
  pub identity_public_key: String,
  #[serde(rename = "keyVersion")]
  pub key_version: u32,
}

#[derive(Debug, Deserialize)]
struct InviteLinkCreateResponse {
  pub success: bool,
  #[serde(rename = "linkId")]
  pub link_id: String,
  pub token: String,
  pub url: String,
  #[serde(rename = "maxUses")]
  pub max_uses: Option<u32>,
  #[serde(rename = "expiresAt")]
  pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InviteLinksListResponse {
  pub links: Vec<InviteLinkEntry>,
}

#[derive(Debug, Deserialize)]
struct InviteLinkEntry {
  pub id: String,
  pub token: String,
  pub url: String,
  #[serde(rename = "emailAllowlist")]
  pub email_allowlist: Vec<String>,
  #[serde(rename = "maxUses")]
  pub max_uses: Option<u32>,
  pub uses: u32,
  #[serde(rename = "expiresAt")]
  pub expires_at: Option<String>,
  #[serde(rename = "createdAt")]
  pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct BasicResponse {
  pub success: bool,
}

#[derive(Debug, Deserialize)]
struct WorkspaceResetResponse {
  pub success: bool,
  pub r2: Option<WorkspaceResetR2>,
  #[serde(rename = "r2Error")]
  pub r2_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkspaceResetR2 {
  pub deleted: u64,
  #[serde(rename = "nextCursor")]
  pub next_cursor: Option<String>,
}
