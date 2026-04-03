package gitadapter

import "fmt"

type APIError struct {
	StatusCode   int
	Status       string
	Message      string
	RetryAfterMs int
}

func (e *APIError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return fmt.Sprintf("%s: %s", e.Status, e.Message)
	}
	return e.Status
}
