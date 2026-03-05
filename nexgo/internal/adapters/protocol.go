// Package adapters manages adapter process lifecycles and the JSONL protocol
// used for communication between the Nexus runtime and external adapter binaries.
package adapters

// Verb represents one of the 7 adapter protocol verbs.
type Verb string

const (
	VerbInfo     Verb = "info"
	VerbMonitor  Verb = "monitor"
	VerbBackfill Verb = "backfill"
	VerbSend     Verb = "send"
	VerbStream   Verb = "stream"
	VerbHealth   Verb = "health"
	VerbAccounts Verb = "accounts"
)

// ProtocolMessage is the JSONL message format between runtime and adapter.
type ProtocolMessage struct {
	ID        string `json:"id"`
	Verb      Verb   `json:"verb"`
	Payload   any    `json:"payload,omitempty"`
	Error     string `json:"error,omitempty"`
	RequestID string `json:"request_id,omitempty"` // correlation
}

// AdapterInfo is returned by the info verb.
type AdapterInfo struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Platform     string   `json:"platform"`
	Version      string   `json:"version"`
	Capabilities []string `json:"capabilities"`
}

// DeliveryRequest is used for the send/stream verbs.
type DeliveryRequest struct {
	ChannelID string `json:"channel_id"`
	Content   string `json:"content"`
	ReplyTo   string `json:"reply_to,omitempty"`
	ThreadID  string `json:"thread_id,omitempty"`
}
