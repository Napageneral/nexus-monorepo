// Package config handles loading, validating, and watching the Nexus configuration.
package config

// Config is the root configuration structure for Nexus.
// For Phase 1, we define the fields needed for the foundation: runtime, logging, and memory paths.
// Additional sections are added as later phases require them.
type Config struct {
	Runtime  RuntimeConfig  `json:"runtime,omitempty"`
	Logging  LoggingConfig  `json:"logging,omitempty"`
	Memory   MemoryConfig   `json:"memory,omitempty"`
	Channels ChannelsConfig `json:"channels,omitempty"`
	Agents   AgentsConfig   `json:"agents,omitempty"`
	Session  SessionConfig  `json:"session,omitempty"`
	Tools    ToolsConfig    `json:"tools,omitempty"`
	Clock    ClockConfig    `json:"clock,omitempty"`
	Cron     CronConfig     `json:"cron,omitempty"`
	Hooks    HooksConfig    `json:"hooks,omitempty"`
	Auth     AuthConfig     `json:"auth,omitempty"`
	Models   ModelsConfig   `json:"models,omitempty"`
	Browser  BrowserConfig  `json:"browser,omitempty"`
	Messages MessagesConfig `json:"messages,omitempty"`
	Skills   SkillsConfig   `json:"skills,omitempty"`
	Update   UpdateConfig   `json:"update,omitempty"`
	UI       UIConfig       `json:"ui,omitempty"`
}

// RuntimeConfig controls the runtime daemon (ports, paths, auth, TLS, apps).
type RuntimeConfig struct {
	Port      int              `json:"port,omitempty"`
	Bind      string           `json:"bind,omitempty"` // "auto", "lan", "loopback", "custom", "tailnet"
	ControlUI ControlUIConfig  `json:"controlUi,omitempty"`
	Auth      RuntimeAuthConfig `json:"auth,omitempty"`
	TLS       RuntimeTLSConfig `json:"tls,omitempty"`
	Reload    ReloadConfig     `json:"reload,omitempty"`
	Apps      map[string]AppConfig `json:"apps,omitempty"`
	HTTP      RuntimeHTTPConfig `json:"http,omitempty"`
	Ingress   IngressConfig    `json:"ingress,omitempty"`
}

// ControlUIConfig configures the embedded control panel UI.
type ControlUIConfig struct {
	Enabled        *bool    `json:"enabled,omitempty"`
	BasePath       string   `json:"basePath,omitempty"`
	Root           string   `json:"root,omitempty"`
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
}

// RuntimeAuthConfig configures authentication for the runtime server.
type RuntimeAuthConfig struct {
	Mode         string       `json:"mode,omitempty"` // "token", "password", "trusted_token"
	Token        string       `json:"token,omitempty"`
	Password     string       `json:"password,omitempty"`
	TrustedToken TrustedToken `json:"trustedToken,omitempty"`
}

// TrustedToken holds JWT verification configuration.
type TrustedToken struct {
	Issuer            string            `json:"issuer,omitempty"`
	Audience          string            `json:"audience,omitempty"`
	HMACSecret        string            `json:"hmacSecret,omitempty"`
	HMACSecretEnv     string            `json:"hmacSecretEnv,omitempty"`
	HMACSecretsByKid  map[string]string `json:"hmacSecretsByKid,omitempty"`
	ActiveKid         string            `json:"activeKid,omitempty"`
	ClockSkewSeconds  int               `json:"clockSkewSeconds,omitempty"`
	RequireJTI        *bool             `json:"requireJti,omitempty"`
}

// RuntimeTLSConfig controls TLS for the runtime server.
type RuntimeTLSConfig struct {
	Enabled      *bool  `json:"enabled,omitempty"`
	AutoGenerate *bool  `json:"autoGenerate,omitempty"`
	CertPath     string `json:"certPath,omitempty"`
	KeyPath      string `json:"keyPath,omitempty"`
	CAPath       string `json:"caPath,omitempty"`
}

// ReloadConfig controls config hot-reload behavior.
type ReloadConfig struct {
	Mode       string `json:"mode,omitempty"` // "off", "restart", "hot", "hybrid"
	DebounceMS int    `json:"debounceMs,omitempty"`
}

// AppConfig describes a runtime-hosted app.
type AppConfig struct {
	Enabled     *bool  `json:"enabled,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	EntryPath   string `json:"entryPath,omitempty"`
	APIBase     string `json:"apiBase,omitempty"`
	Kind        string `json:"kind,omitempty"` // "static", "proxy"
	Root        string `json:"root,omitempty"`
	Icon        string `json:"icon,omitempty"`
	Order       int    `json:"order,omitempty"`
}

// RuntimeHTTPConfig configures HTTP endpoints.
type RuntimeHTTPConfig struct {
	Endpoints HTTPEndpoints `json:"endpoints,omitempty"`
}

// HTTPEndpoints toggles specific HTTP endpoint groups.
type HTTPEndpoints struct {
	ChatCompletions *EndpointToggle `json:"chatCompletions,omitempty"`
	Responses       *EndpointToggle `json:"responses,omitempty"`
}

// EndpointToggle enables/disables an endpoint group.
type EndpointToggle struct {
	Enabled *bool `json:"enabled,omitempty"`
}

// IngressConfig configures a separate ingress listener.
type IngressConfig struct {
	Enabled *bool             `json:"enabled,omitempty"`
	Port    int               `json:"port,omitempty"`
	Bind    string            `json:"bind,omitempty"`
	Auth    RuntimeAuthConfig `json:"auth,omitempty"`
	TLS     RuntimeTLSConfig  `json:"tls,omitempty"`
}

// LoggingConfig controls logging behavior.
type LoggingConfig struct {
	Level           string   `json:"level,omitempty"`           // "silent","fatal","error","warn","info","debug","trace"
	File            string   `json:"file,omitempty"`
	ConsoleLevel    string   `json:"consoleLevel,omitempty"`
	ConsoleStyle    string   `json:"consoleStyle,omitempty"` // "pretty", "compact", "json"
	RedactSensitive string   `json:"redactSensitive,omitempty"` // "off", "tools"
	RedactPatterns  []string `json:"redactPatterns,omitempty"`
}

// MemoryConfig controls the memory subsystem.
type MemoryConfig struct {
	Backend   string    `json:"backend,omitempty"` // "builtin", "qmd"
	Citations string    `json:"citations,omitempty"` // "auto", "on", "off"
	QMD       QMDConfig `json:"qmd,omitempty"`
}

// QMDConfig configures QMD memory backend.
type QMDConfig struct {
	Command              string   `json:"command,omitempty"`
	IncludeDefaultMemory *bool    `json:"includeDefaultMemory,omitempty"`
	Paths                []QMDPath `json:"paths,omitempty"`
}

// QMDPath defines a path for QMD indexing.
type QMDPath struct {
	Path    string `json:"path"`
	Name    string `json:"name,omitempty"`
	Pattern string `json:"pattern,omitempty"`
}

// ChannelsConfig holds adapter/channel configuration.
// Phase 1: stub — channels are configured as external adapter processes.
type ChannelsConfig struct {
	Defaults ChannelDefaults        `json:"defaults,omitempty"`
	Extra    map[string]interface{} `json:"-"` // passthrough for extension channels
}

// ChannelDefaults holds default channel settings.
type ChannelDefaults struct {
	GroupPolicy string `json:"groupPolicy,omitempty"` // "open","disabled","allowlist"
}

// AgentsConfig holds agent configuration.
type AgentsConfig struct {
	Defaults AgentDefaults  `json:"defaults,omitempty"`
	List     []AgentConfig  `json:"list,omitempty"`
}

// AgentDefaults holds default agent settings.
type AgentDefaults struct {
	Model          ModelSelection `json:"model,omitempty"`
	MaxConcurrent  int            `json:"maxConcurrent,omitempty"`
	TimeoutSeconds int            `json:"timeoutSeconds,omitempty"`
	Workspace      string         `json:"workspace,omitempty"`
}

// ModelSelection specifies primary + fallback models.
type ModelSelection struct {
	Primary   string   `json:"primary,omitempty"`
	Fallbacks []string `json:"fallbacks,omitempty"`
}

// AgentConfig defines a single agent.
type AgentConfig struct {
	ID        string         `json:"id"`
	Default   bool           `json:"default,omitempty"`
	Name      string         `json:"name,omitempty"`
	Workspace string         `json:"workspace,omitempty"`
	Model     ModelSelection `json:"model,omitempty"`
	Skills    []string       `json:"skills,omitempty"`
}

// SessionConfig controls session behavior.
type SessionConfig struct {
	Scope       string `json:"scope,omitempty"`   // "per-sender", "global"
	DMScope     string `json:"dmScope,omitempty"` // "main","per-peer","per-channel-peer","per-account-channel-peer"
	IdleMinutes int    `json:"idleMinutes,omitempty"`
	MainKey     string `json:"mainKey,omitempty"` // always "main"
}

// ToolsConfig controls tool availability.
type ToolsConfig struct {
	Profile   string   `json:"profile,omitempty"` // "minimal","coding","messaging","full"
	Allow     []string `json:"allow,omitempty"`
	AlsoAllow []string `json:"alsoAllow,omitempty"`
	Deny      []string `json:"deny,omitempty"`
}

// ClockConfig controls the clock tick system.
type ClockConfig struct {
	Enabled        *bool `json:"enabled,omitempty"`
	TickIntervalMS int   `json:"tickIntervalMs,omitempty"`
}

// CronConfig controls the cron scheduler.
type CronConfig struct {
	Enabled           *bool  `json:"enabled,omitempty"`
	Store             string `json:"store,omitempty"`
	MaxConcurrentRuns int    `json:"maxConcurrentRuns,omitempty"`
}

// HooksConfig controls the webhook system.
type HooksConfig struct {
	Enabled      *bool          `json:"enabled,omitempty"`
	Path         string         `json:"path,omitempty"`
	Token        string         `json:"token,omitempty"`
	MaxBodyBytes int            `json:"maxBodyBytes,omitempty"`
	Mappings     []HookMapping  `json:"mappings,omitempty"`
}

// HookMapping defines a webhook routing rule.
type HookMapping struct {
	ID              string `json:"id,omitempty"`
	Path            string `json:"path,omitempty"`
	Action          string `json:"action,omitempty"` // "wake", "agent"
	SessionKey      string `json:"sessionKey,omitempty"`
	MessageTemplate string `json:"messageTemplate,omitempty"`
	Channel         string `json:"channel,omitempty"`
}

// AuthConfig controls authentication profiles and credential ordering.
type AuthConfig struct {
	Profiles map[string]AuthProfile `json:"profiles,omitempty"`
	Order    map[string][]string    `json:"order,omitempty"`
}

// AuthProfile describes a single auth credential.
type AuthProfile struct {
	Provider string `json:"provider"`
	Mode     string `json:"mode"` // "api_key","oauth","token","external_cli"
	Email    string `json:"email,omitempty"`
}

// ModelsConfig configures custom model providers.
type ModelsConfig struct {
	Mode      string                     `json:"mode,omitempty"` // "merge", "replace"
	Providers map[string]ProviderConfig  `json:"providers,omitempty"`
}

// ProviderConfig defines a custom model provider.
type ProviderConfig struct {
	BaseURL string            `json:"baseUrl"`
	APIKey  string            `json:"apiKey,omitempty"`
	Auth    string            `json:"auth,omitempty"`
	API     string            `json:"api,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Models  []ModelDef        `json:"models"`
}

// ModelDef defines a single model within a provider.
type ModelDef struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Reasoning     bool   `json:"reasoning,omitempty"`
	ContextWindow int    `json:"contextWindow,omitempty"`
	MaxTokens     int    `json:"maxTokens,omitempty"`
}

// BrowserConfig controls the browser module.
type BrowserConfig struct {
	Enabled        *bool  `json:"enabled,omitempty"`
	CDPUrl         string `json:"cdpUrl,omitempty"`
	ExecutablePath string `json:"executablePath,omitempty"`
	Headless       *bool  `json:"headless,omitempty"`
}

// MessagesConfig controls message handling.
type MessagesConfig struct {
	ResponsePrefix string       `json:"responsePrefix,omitempty"`
	Queue          QueueConfig  `json:"queue,omitempty"`
}

// QueueConfig controls message queuing behavior.
type QueueConfig struct {
	Mode       string `json:"mode,omitempty"` // "steer","followup","collect","queue","interrupt"
	DebounceMS int    `json:"debounceMs,omitempty"`
	Cap        int    `json:"cap,omitempty"`
	Drop       string `json:"drop,omitempty"` // "old","new","summarize"
}

// SkillsConfig controls skill loading and configuration.
type SkillsConfig struct {
	AllowBundled []string                  `json:"allowBundled,omitempty"`
	Entries      map[string]SkillEntry     `json:"entries,omitempty"`
}

// SkillEntry configures a single skill.
type SkillEntry struct {
	Enabled *bool             `json:"enabled,omitempty"`
	APIKey  string            `json:"apiKey,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Config  map[string]any    `json:"config,omitempty"`
}

// UpdateConfig controls auto-update behavior.
type UpdateConfig struct {
	Channel      string `json:"channel,omitempty"` // "stable","beta","dev"
	CheckOnStart *bool  `json:"checkOnStart,omitempty"`
}

// UIConfig controls the Control UI appearance.
type UIConfig struct {
	SeamColor string          `json:"seamColor,omitempty"`
	Assistant AssistantConfig `json:"assistant,omitempty"`
}

// AssistantConfig controls the assistant display.
type AssistantConfig struct {
	Name   string `json:"name,omitempty"`
	Avatar string `json:"avatar,omitempty"`
}
