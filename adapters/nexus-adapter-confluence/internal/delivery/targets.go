package delivery

import (
	"fmt"
	"strings"
)

type Target struct {
	Action       string
	SpaceKey     string
	ParentPageID string
	PageID       string
}

func ParseTarget(to string) (Target, error) {
	trimmed := strings.TrimSpace(to)
	if trimmed == "" {
		return Target{}, fmt.Errorf("delivery target is required")
	}

	if strings.HasPrefix(trimmed, "space:") {
		rest := strings.TrimPrefix(trimmed, "space:")
		parts := strings.Split(rest, "/")
		if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
			return Target{}, fmt.Errorf("space key is required")
		}
		target := Target{
			Action:   "create_page",
			SpaceKey: strings.TrimSpace(parts[0]),
		}
		if len(parts) > 1 {
			if !strings.HasPrefix(parts[1], "parent:") {
				return Target{}, fmt.Errorf("invalid create-page target %q", to)
			}
			target.ParentPageID = strings.TrimSpace(strings.TrimPrefix(parts[1], "parent:"))
			if target.ParentPageID == "" {
				return Target{}, fmt.Errorf("parent page id is required")
			}
		}
		if len(parts) > 2 {
			return Target{}, fmt.Errorf("invalid create-page target %q", to)
		}
		return target, nil
	}

	if strings.HasPrefix(trimmed, "page:") {
		rest := strings.TrimPrefix(trimmed, "page:")
		parts := strings.Split(rest, "/")
		if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
			return Target{}, fmt.Errorf("page id is required")
		}
		target := Target{PageID: strings.TrimSpace(parts[0])}
		if len(parts) == 1 {
			target.Action = "update_page"
			return target, nil
		}
		if len(parts) == 2 && parts[1] == "comment" {
			target.Action = "add_comment"
			return target, nil
		}
		return Target{}, fmt.Errorf("invalid page target %q", to)
	}

	return Target{}, fmt.Errorf("unsupported target %q", to)
}
