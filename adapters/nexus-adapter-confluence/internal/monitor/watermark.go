package monitor

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Watermark struct {
	SpaceKey   string    `json:"space_key"`
	ModifiedAt time.Time `json:"modified_at"`
}

type WatermarkStore struct {
	filePath   string
	mu         sync.Mutex
	watermarks map[string]Watermark
}

func NewWatermarkStore(dataDir string) *WatermarkStore {
	return &WatermarkStore{
		filePath:   filepath.Join(dataDir, "confluence", "watermarks.json"),
		watermarks: map[string]Watermark{},
	}
}

func (s *WatermarkStore) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := os.ReadFile(s.filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.watermarks = map[string]Watermark{}
			return nil
		}
		return err
	}

	var watermarks map[string]Watermark
	if err := json.Unmarshal(raw, &watermarks); err != nil {
		return err
	}
	s.watermarks = watermarks
	if s.watermarks == nil {
		s.watermarks = map[string]Watermark{}
	}
	return nil
}

func (s *WatermarkStore) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.filePath), 0o755); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(s.watermarks, "", "  ")
	if err != nil {
		return err
	}

	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.filePath); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func (s *WatermarkStore) Get(spaceKey string) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.watermarks[spaceKey].ModifiedAt
}

func (s *WatermarkStore) Advance(spaceKey string, modifiedAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.watermarks[spaceKey]
	if current.ModifiedAt.After(modifiedAt) || current.ModifiedAt.Equal(modifiedAt) {
		return
	}
	s.watermarks[spaceKey] = Watermark{
		SpaceKey:   spaceKey,
		ModifiedAt: modifiedAt.UTC(),
	}
}

func (s *WatermarkStore) LatestAcrossSpaces() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()

	var latest time.Time
	for _, watermark := range s.watermarks {
		if watermark.ModifiedAt.After(latest) {
			latest = watermark.ModifiedAt
		}
	}
	return latest
}
