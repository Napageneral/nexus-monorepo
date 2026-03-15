package pipeline

// NexusResult wraps the output of a pipeline execution.
type NexusResult struct {
	// RequestID is the ID of the request that produced this result.
	RequestID string `json:"request_id"`

	// Operation is the operation that was executed.
	Operation string `json:"operation"`

	// Status is the final status of the request.
	Status RequestStatus `json:"status"`

	// Data is the handler's return value.
	Data any `json:"data,omitempty"`

	// Error is set if the request failed.
	Error string `json:"error,omitempty"`

	// DurationMS is the total pipeline execution time.
	DurationMS int64 `json:"duration_ms"`
}
