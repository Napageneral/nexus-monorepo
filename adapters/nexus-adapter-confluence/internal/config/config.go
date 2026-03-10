package config

import "time"

type SpaceOption struct {
	ID    string `json:"id"`
	Key   string `json:"key"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

type AccountConfig struct {
	ID               string        `json:"id"`
	Email            string        `json:"email"`
	APIToken         string        `json:"api_token"`
	Site             string        `json:"site"`
	SiteURL          string        `json:"site_url"`
	SiteDisplayName  string        `json:"site_display_name,omitempty"`
	Spaces           []SpaceOption `json:"spaces,omitempty"`
	PollIntervalMins int           `json:"poll_interval_mins,omitempty"`
	Sync             SyncConfig    `json:"sync,omitempty"`
}

type AdapterConfig struct {
	Accounts map[string]AccountConfig `json:"accounts"`
}

type SyncConfig struct {
	Pages       bool `json:"pages,omitempty"`
	PageContent bool `json:"page_content,omitempty"`
	Labels      bool `json:"labels,omitempty"`
	Versions    bool `json:"versions,omitempty"`
}

type SetupStep string

const (
	SetupStepCredentials SetupStep = "credentials"
	SetupStepSpaces      SetupStep = "spaces"
	SetupStepCompleted   SetupStep = "completed"
)

type StoredCredentials struct {
	Email    string `json:"email"`
	APIToken string `json:"api_token"`
	Site     string `json:"site"`
}

type SetupSession struct {
	ID             string            `json:"id"`
	AccountID      string            `json:"account_id"`
	Status         string            `json:"status"`
	Step           SetupStep         `json:"step"`
	Credentials    StoredCredentials `json:"credentials,omitempty"`
	SpaceOptions   []SpaceOption     `json:"space_options,omitempty"`
	SelectedSpaces []SpaceOption     `json:"selected_spaces,omitempty"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

func DefaultSyncConfig() SyncConfig {
	return SyncConfig{
		Pages:       true,
		PageContent: true,
		Labels:      true,
		Versions:    false,
	}
}

func (a AccountConfig) PollInterval() time.Duration {
	if a.PollIntervalMins <= 0 {
		return 15 * time.Minute
	}
	return time.Duration(a.PollIntervalMins) * time.Minute
}

func (a AccountConfig) SpaceByKey(key string) *SpaceOption {
	for i := range a.Spaces {
		if a.Spaces[i].Key == key {
			return &a.Spaces[i]
		}
	}
	return nil
}
