package media

import (
	"context"
	"log/slog"
)

// Interpretation represents the result of media analysis by a provider.
type Interpretation struct {
	Provider    string         `json:"provider"`
	Description string         `json:"description"`
	Text        string         `json:"text"` // OCR or transcription
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// UnderstandingProvider defines the interface for media analysis providers.
type UnderstandingProvider interface {
	Name() string
	Process(ctx context.Context, media *MediaFile) (*Interpretation, error)
	Supports(mimeType string) bool
}

// UnderstandingService manages media understanding providers.
type UnderstandingService struct {
	providers map[string]UnderstandingProvider
	logger    *slog.Logger
}

// NewUnderstandingService creates a new UnderstandingService.
func NewUnderstandingService(logger *slog.Logger) *UnderstandingService {
	if logger == nil {
		logger = slog.Default()
	}
	return &UnderstandingService{
		providers: make(map[string]UnderstandingProvider),
		logger:    logger,
	}
}

// Register adds a provider to the service.
func (s *UnderstandingService) Register(provider UnderstandingProvider) {
	s.providers[provider.Name()] = provider
	s.logger.Debug("registered understanding provider", "name", provider.Name())
}

// Process runs all applicable providers against the given media file.
// For now, returns empty results - real providers will be added later.
func (s *UnderstandingService) Process(ctx context.Context, media *MediaFile) ([]Interpretation, error) {
	var results []Interpretation

	for _, provider := range s.providers {
		if !provider.Supports(media.MimeType) {
			continue
		}

		result, err := provider.Process(ctx, media)
		if err != nil {
			s.logger.Warn("understanding provider failed",
				"provider", provider.Name(),
				"error", err,
			)
			continue
		}
		if result != nil {
			results = append(results, *result)
		}
	}

	return results, nil
}
