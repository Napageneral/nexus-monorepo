package record

import (
	"context"
	"sync"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
)

type userLookupClient interface {
	GetUser(ctx context.Context, userID string) (*atlassian.User, error)
}

type UserCache struct {
	mu    sync.Mutex
	users map[string]string
}

func NewUserCache() *UserCache {
	return &UserCache{
		users: map[string]string{},
	}
}

func (c *UserCache) Resolve(ctx context.Context, client userLookupClient, userID string) string {
	c.mu.Lock()
	value, ok := c.users[userID]
	c.mu.Unlock()
	if ok {
		return value
	}

	user, err := client.GetUser(ctx, userID)
	displayName := ""
	if err == nil && user != nil {
		displayName = user.DisplayName
	}

	c.mu.Lock()
	c.users[userID] = displayName
	c.mu.Unlock()
	return displayName
}
