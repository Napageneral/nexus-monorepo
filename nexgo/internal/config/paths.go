package config

import (
	"os"
	"path/filepath"
)

const (
	// DefaultRuntimePort is the default port for the runtime WS+HTTP server.
	DefaultRuntimePort = 18789
	// DefaultBridgePort is the default adapter bridge port (runtime + 1).
	DefaultBridgePort = 18790
	// DefaultBrowserControlPort is the default browser control port (runtime + 2).
	DefaultBrowserControlPort = 18791
	// DefaultCanvasHostPort is the default canvas host port (runtime + 4).
	DefaultCanvasHostPort = 18793
)

// Paths holds all resolved filesystem paths for a Nexus instance.
type Paths struct {
	Root        string // workspace root (~/nexus)
	Home        string // home directory (root/home)
	StateDir    string // state directory (root/state)
	DataDir     string // database directory (stateDir/data)
	ConfigFile  string // config file path (stateDir/config.json)
	PIDFile     string // daemon PID lock file (stateDir/nex.pid)
	CredDir     string // OAuth credentials (stateDir/credentials)
	ACLDir      string // ACL policies (stateDir/acl)
	LogFile     string // log file (stateDir/nexus.log)
}

// ResolvePaths computes all Nexus paths from environment variables and defaults.
// CLI flags (--state-dir, --config) take highest priority, then env vars, then defaults.
func ResolvePaths(stateDirFlag, configFlag string) Paths {
	root := envOrDefault("NEXUS_ROOT", defaultRoot())
	home := envOrDefault("NEXUS_HOME", filepath.Join(root, "home"))

	stateDir := stateDirFlag
	if stateDir == "" {
		stateDir = envOrDefault("NEXUS_STATE_DIR", filepath.Join(root, "state"))
	}

	dataDir := filepath.Join(stateDir, "data")

	configFile := configFlag
	if configFile == "" {
		configFile = os.Getenv("NEXUS_CONFIG_PATH")
		if configFile == "" {
			configFile = filepath.Join(stateDir, "config.json")
		}
	}

	credDir := envOrDefault("NEXUS_OAUTH_DIR", filepath.Join(stateDir, "credentials"))
	aclDir := envOrDefault("NEXUS_ACL_DIR", filepath.Join(stateDir, "acl"))

	return Paths{
		Root:       root,
		Home:       home,
		StateDir:   stateDir,
		DataDir:    dataDir,
		ConfigFile: configFile,
		PIDFile:    filepath.Join(stateDir, "nex.pid"),
		CredDir:    credDir,
		ACLDir:     aclDir,
		LogFile:    filepath.Join(stateDir, "nexus.log"),
	}
}

// defaultRoot returns the default Nexus root directory (~/nexus).
func defaultRoot() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join("/tmp", "nexus")
	}
	return filepath.Join(home, "nexus")
}

// envOrDefault returns the environment variable value, or the default if unset.
func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
