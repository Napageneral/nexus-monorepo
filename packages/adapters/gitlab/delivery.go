package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"

	core "github.com/nexus-project/gitlab/internal/gitadapter"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type deliveryTarget struct {
	RepoFullName string
	RepoSpaceID  string
	Action       string
	PRID         string
}

type gitMethodTarget struct {
	ConnectionID string                `json:"connection_id"`
	Channel      nexadapter.ChannelRef `json:"channel"`
	ReplyToID    string                `json:"reply_to_id,omitempty"`
}

type gitMethodResult struct {
	Success    bool                      `json:"success"`
	MessageIDs []string                  `json:"message_ids"`
	ChunksSent int                       `json:"chunks_sent"`
	TotalChars int                       `json:"total_chars,omitempty"`
	Error      *nexadapter.DeliveryError `json:"error,omitempty"`
}

type gitMethodPayload struct {
	Target       gitMethodTarget `json:"target"`
	Title        string          `json:"title,omitempty"`
	Description  string          `json:"description,omitempty"`
	SourceBranch string          `json:"source_branch,omitempty"`
	TargetBranch string          `json:"target_branch,omitempty"`
	Reviewers    []string        `json:"reviewers,omitempty"`
	Body         string          `json:"body,omitempty"`
	Strategy     string          `json:"strategy,omitempty"`
	BranchName   string          `json:"branch_name,omitempty"`
	FromRef      string          `json:"from_ref,omitempty"`
}

func parseTargetThreadPRID(threadID string) (string, error) {
	trimmed := strings.TrimSpace(threadID)
	if trimmed == "" {
		return "", nil
	}
	if !strings.HasPrefix(trimmed, "pr/") {
		return "", fmt.Errorf("invalid git thread_id %q", threadID)
	}
	prID := strings.TrimSpace(strings.TrimPrefix(trimmed, "pr/"))
	if prID == "" {
		return "", fmt.Errorf("invalid git thread_id %q", threadID)
	}
	return prID, nil
}

func parseGitMethodTarget(targetRef gitMethodTarget, methodName string) (deliveryTarget, error) {
	repoContainerID := strings.TrimSpace(targetRef.Channel.ContainerID)
	if repoContainerID == "" {
		return deliveryTarget{}, fmt.Errorf("%s requires target.channel.container_id", methodName)
	}
	prID, err := parseTargetThreadPRID(targetRef.Channel.ThreadID)
	if err != nil {
		return deliveryTarget{}, err
	}

	switch methodName {
	case "gitlab.pull_requests.create", "gitlab.branches.create":
		if prID != "" {
			return deliveryTarget{}, fmt.Errorf("%s requires repository scope target", methodName)
		}
		return deliveryTarget{
			RepoFullName: repoContainerID,
			RepoSpaceID:  strings.TrimSpace(targetRef.Channel.SpaceID),
		}, nil
	case "gitlab.pull_requests.comments.create", "gitlab.pull_requests.merge":
		if prID == "" {
			return deliveryTarget{}, fmt.Errorf("%s requires PR scope target", methodName)
		}
		return deliveryTarget{
			RepoFullName: repoContainerID,
			RepoSpaceID:  strings.TrimSpace(targetRef.Channel.SpaceID),
			PRID:         prID,
		}, nil
	default:
		return deliveryTarget{}, fmt.Errorf("unsupported git method %q", methodName)
	}
}

func deliveryErrorFromErr(err error) *nexadapter.DeliveryError {
	if err == nil {
		return nil
	}
	if apiErr, ok := err.(*core.APIError); ok {
		switch apiErr.StatusCode {
		case 401, 403:
			return &nexadapter.DeliveryError{Type: "permission_denied", Message: err.Error(), Retry: false}
		case 404:
			return &nexadapter.DeliveryError{Type: "not_found", Message: err.Error(), Retry: false}
		case 409, 422:
			return &nexadapter.DeliveryError{Type: "content_rejected", Message: err.Error(), Retry: false}
		case 429:
			return &nexadapter.DeliveryError{Type: "rate_limited", Message: err.Error(), Retry: true, RetryAfterMs: apiErr.RetryAfterMs}
		default:
			if apiErr.StatusCode >= 500 {
				return &nexadapter.DeliveryError{Type: "network", Message: err.Error(), Retry: true}
			}
		}
	}
	if _, ok := err.(net.Error); ok {
		return &nexadapter.DeliveryError{Type: "network", Message: err.Error(), Retry: true}
	}
	return &nexadapter.DeliveryError{Type: "unknown", Message: err.Error(), Retry: false}
}

func executeGitMethod(ctx context.Context, req nexadapter.AdapterMethodRequest, methodName string) (*gitMethodResult, error) {
	payload, totalChars, err := readGitMethodPayload(req, methodName)
	if err != nil {
		return nil, err
	}

	accountID, err := nexadapter.RequireConnection(payload.Target.ConnectionID)
	if err != nil {
		return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
	}
	config, provider, err := loadRuntimeAccount(accountID)
	if err != nil {
		return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
	}
	target, err := parseGitMethodTarget(payload.Target, methodName)
	if err != nil {
		return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
	}
	repo, err := findTrackedRepo(config.Repositories, target.RepoFullName, target.RepoSpaceID)
	if err != nil {
		return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
	}

	switch methodName {
	case "gitlab.pull_requests.create":
		pr, err := provider.CreatePullRequest(ctx, config, repo, CreatePRRequest{
			Title:        strings.TrimSpace(payload.Title),
			Description:  strings.TrimSpace(payload.Description),
			SourceBranch: strings.TrimSpace(payload.SourceBranch),
			TargetBranch: strings.TrimSpace(payload.TargetBranch),
			Reviewers:    append([]string(nil), payload.Reviewers...),
		})
		if err != nil {
			return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
		}
		return &gitMethodResult{Success: true, MessageIDs: []string{fmt.Sprintf("pr/%s", pr.ID)}, ChunksSent: 1, TotalChars: totalChars}, nil
	case "gitlab.pull_requests.comments.create":
		comment, err := provider.PostComment(ctx, config, repo, target.PRID, strings.TrimSpace(payload.Body))
		if err != nil {
			return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
		}
		return &gitMethodResult{Success: true, MessageIDs: []string{fmt.Sprintf("comment/%s", comment.ID)}, ChunksSent: 1, TotalChars: totalChars}, nil
	case "gitlab.pull_requests.merge":
		strategy := MergeStrategy(strings.TrimSpace(payload.Strategy))
		if strategy == "" {
			strategy = MergeStrategy("merge")
		}
		if err := provider.MergePullRequest(ctx, config, repo, target.PRID, strategy); err != nil {
			return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
		}
		return &gitMethodResult{Success: true, MessageIDs: []string{fmt.Sprintf("merge/pr/%s", target.PRID)}, ChunksSent: 1, TotalChars: totalChars}, nil
	case "gitlab.branches.create":
		if err := provider.CreateBranch(ctx, config, repo, strings.TrimSpace(payload.BranchName), strings.TrimSpace(payload.FromRef)); err != nil {
			return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(err)}, nil
		}
		return &gitMethodResult{Success: true, MessageIDs: []string{fmt.Sprintf("refs/heads/%s", strings.TrimSpace(payload.BranchName))}, ChunksSent: 1, TotalChars: totalChars}, nil
	default:
		return &gitMethodResult{Success: false, Error: deliveryErrorFromErr(fmt.Errorf("unsupported git method %q", methodName))}, nil
	}
}

func readGitMethodPayload(req nexadapter.AdapterMethodRequest, methodName string) (gitMethodPayload, int, error) {
	payload := req.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	if _, exists := payload["action"]; exists {
		return gitMethodPayload{}, 0, fmt.Errorf("%s does not allow payload.action", methodName)
	}

	targetRaw, ok := payload["target"].(map[string]any)
	if !ok {
		return gitMethodPayload{}, 0, fmt.Errorf("%s requires payload.target", methodName)
	}
	connectionID := strings.TrimSpace(req.ConnectionID)
	if connectionID == "" {
		connectionID = strings.TrimSpace(payloadString(targetRaw, "connection_id"))
	}
	if connectionID == "" {
		return gitMethodPayload{}, 0, fmt.Errorf("%s requires --connection or payload.target.connection_id", methodName)
	}
	if strings.TrimSpace(payloadString(targetRaw, "connection_id")) == "" {
		targetRaw["connection_id"] = connectionID
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return gitMethodPayload{}, 0, err
	}

	var parsed gitMethodPayload
	if err := json.Unmarshal(encoded, &parsed); err != nil {
		return gitMethodPayload{}, 0, err
	}
	return parsed, len(encoded), nil
}

func findTrackedRepo(repositories []Repository, fullName string, spaceID string) (Repository, error) {
	trimmedFullName := strings.TrimSpace(fullName)
	trimmedSpaceID := strings.TrimSpace(spaceID)
	if trimmedFullName == "" {
		return Repository{}, fmt.Errorf("repository %q not found or not tracked", fullName)
	}
	for _, repo := range repositories {
		if strings.EqualFold(repo.FullName, trimmedFullName) {
			return repo, nil
		}
		if trimmedSpaceID != "" {
			candidate := trimmedSpaceID + "/" + trimmedFullName
			if strings.EqualFold(repo.FullName, candidate) {
				return repo, nil
			}
			repoParts := strings.Split(repo.FullName, "/")
			if len(repoParts) > 1 {
				repoSpaceID := strings.Join(repoParts[:len(repoParts)-1], "/")
				repoName := repoParts[len(repoParts)-1]
				if strings.EqualFold(repoSpaceID, trimmedSpaceID) && strings.EqualFold(repoName, trimmedFullName) {
					return repo, nil
				}
			}
		} else if strings.EqualFold(repo.Name, trimmedFullName) {
			return repo, nil
		}
	}
	return Repository{}, fmt.Errorf("repository %q not found or not tracked", fullName)
}

func payloadStringSlice(value any) []string {
	array, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(array))
	for _, item := range array {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			result = append(result, strings.TrimSpace(text))
		}
	}
	return result
}
