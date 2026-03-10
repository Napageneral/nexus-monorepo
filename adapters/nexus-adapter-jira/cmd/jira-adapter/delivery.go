package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type jiraDeliveryRoute struct {
	ConnectionID string
	ProjectKey   string
	IssueKey     string
}

func send(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	client, cfg, err := loadJiraClientFromRuntime()
	if err != nil {
		return nil, err
	}

	action, err := parseDeliveryAction(req.Text)
	if err != nil {
		return failedDeliveryResult(err, len(req.Text)), nil
	}

	route, err := resolveDeliveryRoute(req.Target, cfg, client, action.Action)
	if err != nil {
		return failedDeliveryResult(err, len(req.Text)), nil
	}

	switch action.Action {
	case "create_issue":
		return sendCreateIssue(ctx, client, route, action, len(req.Text))
	case "comment":
		return sendComment(ctx, client, route, action, len(req.Text))
	case "transition":
		return sendTransition(ctx, client, route, action, len(req.Text))
	case "assign":
		return sendAssign(ctx, client, route, action, len(req.Text))
	case "add_label":
		return sendAddLabel(ctx, client, route, action, len(req.Text))
	default:
		return failedDeliveryResult(fmt.Errorf("unsupported action %q", action.Action), len(req.Text)), nil
	}
}

func sendCreateIssue(ctx context.Context, client *jiraClient, route jiraDeliveryRoute, action deliveryAction, totalChars int) (*nexadapter.DeliveryResult, error) {
	if missing := missingRequiredFields(map[string]string{
		"issuetype": action.IssueType,
		"summary":   action.Summary,
	}); len(missing) > 0 {
		return failedDeliveryResult(fmt.Errorf("missing required create_issue fields: %s", strings.Join(missing, ", ")), totalChars), nil
	}

	fields := map[string]any{
		"project":   map[string]any{"key": route.ProjectKey},
		"issuetype": map[string]any{"name": action.IssueType},
		"summary":   action.Summary,
	}
	if description := strings.TrimSpace(action.Description); description != "" {
		adf, err := markdownToADF(description)
		if err != nil {
			return failedDeliveryResult(fmt.Errorf("convert description to ADF: %w", err), totalChars), nil
		}
		fields["description"] = json.RawMessage(adf)
	}
	if assignee := strings.TrimSpace(action.AssigneeAccountID); assignee != "" {
		fields["assignee"] = map[string]any{"accountId": assignee}
	}
	if len(action.Labels) > 0 {
		fields["labels"] = append([]string(nil), action.Labels...)
	}

	resp, err := client.createIssue(ctx, map[string]any{"fields": fields})
	if err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{resp.Key},
		ChunksSent: 1,
		TotalChars: totalChars,
	}, nil
}

func sendComment(ctx context.Context, client *jiraClient, route jiraDeliveryRoute, action deliveryAction, totalChars int) (*nexadapter.DeliveryResult, error) {
	if missing := missingRequiredFields(map[string]string{
		"body": action.Body,
	}); len(missing) > 0 {
		return failedDeliveryResult(fmt.Errorf("missing required comment fields: %s", strings.Join(missing, ", ")), totalChars), nil
	}

	adf, err := markdownToADF(action.Body)
	if err != nil {
		return failedDeliveryResult(fmt.Errorf("convert comment to ADF: %w", err), totalChars), nil
	}

	resp, err := client.addComment(ctx, route.IssueKey, map[string]any{"body": json.RawMessage(adf)})
	if err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{resp.ID},
		ChunksSent: 1,
		TotalChars: totalChars,
	}, nil
}

func sendTransition(ctx context.Context, client *jiraClient, route jiraDeliveryRoute, action deliveryAction, totalChars int) (*nexadapter.DeliveryResult, error) {
	if missing := missingRequiredFields(map[string]string{
		"target_status": action.TargetStatus,
	}); len(missing) > 0 {
		return failedDeliveryResult(fmt.Errorf("missing required transition fields: %s", strings.Join(missing, ", ")), totalChars), nil
	}

	transitions, err := client.getTransitions(ctx, route.IssueKey)
	if err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	var chosen *jiraTransition
	for i := range transitions {
		if strings.EqualFold(strings.TrimSpace(transitions[i].Name), strings.TrimSpace(action.TargetStatus)) {
			chosen = &transitions[i]
			break
		}
		if transitions[i].To != nil && strings.EqualFold(strings.TrimSpace(transitions[i].To.Name), strings.TrimSpace(action.TargetStatus)) {
			chosen = &transitions[i]
			break
		}
	}
	if chosen == nil {
		names := make([]string, 0, len(transitions))
		for _, transition := range transitions {
			if transition.To != nil && strings.TrimSpace(transition.To.Name) != "" {
				names = append(names, transition.To.Name)
				continue
			}
			names = append(names, transition.Name)
		}
		return failedDeliveryResult(fmt.Errorf("transition %q not found; available transitions: %s", action.TargetStatus, strings.Join(names, ", ")), totalChars), nil
	}

	payload := map[string]any{
		"transition": map[string]any{"id": chosen.ID},
	}
	if comment := strings.TrimSpace(action.Comment); comment != "" {
		adf, err := markdownToADF(comment)
		if err != nil {
			return failedDeliveryResult(fmt.Errorf("convert transition comment to ADF: %w", err), totalChars), nil
		}
		payload["update"] = map[string]any{
			"comment": []map[string]any{
				{"add": map[string]any{"body": json.RawMessage(adf)}},
			},
		}
	}

	if err := client.executeTransition(ctx, route.IssueKey, payload); err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{route.IssueKey},
		ChunksSent: 1,
		TotalChars: totalChars,
	}, nil
}

func sendAssign(ctx context.Context, client *jiraClient, route jiraDeliveryRoute, action deliveryAction, totalChars int) (*nexadapter.DeliveryResult, error) {
	if missing := missingRequiredFields(map[string]string{
		"assignee_account_id": action.AssigneeAccountID,
	}); len(missing) > 0 {
		return failedDeliveryResult(fmt.Errorf("missing required assign fields: %s", strings.Join(missing, ", ")), totalChars), nil
	}

	payload := map[string]any{
		"fields": map[string]any{
			"assignee": map[string]any{"accountId": action.AssigneeAccountID},
		},
	}
	if err := client.updateIssue(ctx, route.IssueKey, payload); err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{route.IssueKey},
		ChunksSent: 1,
		TotalChars: totalChars,
	}, nil
}

func sendAddLabel(ctx context.Context, client *jiraClient, route jiraDeliveryRoute, action deliveryAction, totalChars int) (*nexadapter.DeliveryResult, error) {
	if len(action.Labels) == 0 {
		return failedDeliveryResult(fmt.Errorf("missing required add_label field: labels"), totalChars), nil
	}

	ops := make([]map[string]any, 0, len(action.Labels))
	for _, label := range action.Labels {
		if trimmed := strings.TrimSpace(label); trimmed != "" {
			ops = append(ops, map[string]any{"add": trimmed})
		}
	}
	if len(ops) == 0 {
		return failedDeliveryResult(fmt.Errorf("labels must not be empty"), totalChars), nil
	}

	payload := map[string]any{
		"update": map[string]any{
			"labels": ops,
		},
	}
	if err := client.updateIssue(ctx, route.IssueKey, payload); err != nil {
		return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{route.IssueKey},
		ChunksSent: 1,
		TotalChars: totalChars,
	}, nil
}

func parseDeliveryAction(raw string) (deliveryAction, error) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &payload); err != nil {
		return deliveryAction{}, fmt.Errorf("parse delivery action JSON: %w", err)
	}
	if _, exists := payload["project"]; exists {
		return deliveryAction{}, errors.New("delivery action field project is not allowed; route via target.channel.container_id")
	}
	if _, exists := payload["issue_key"]; exists {
		return deliveryAction{}, errors.New("delivery action field issue_key is not allowed; route via target.channel.thread_id")
	}

	var action deliveryAction
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &action); err != nil {
		return deliveryAction{}, fmt.Errorf("parse delivery action JSON: %w", err)
	}
	action.Action = strings.TrimSpace(action.Action)
	if action.Action == "" {
		return deliveryAction{}, errors.New("delivery action missing action field")
	}
	return action, nil
}

func resolveDeliveryRoute(target nexadapter.DeliveryTarget, cfg *jiraConnectionConfig, client *jiraClient, action string) (jiraDeliveryRoute, error) {
	connectionID := strings.TrimSpace(target.ConnectionID)
	if connectionID == "" {
		return jiraDeliveryRoute{}, errors.New("delivery target missing connection_id")
	}
	if cfg != nil && strings.TrimSpace(cfg.ConnectionID) != "" && connectionID != strings.TrimSpace(cfg.ConnectionID) {
		return jiraDeliveryRoute{}, fmt.Errorf("delivery target connection_id %q does not match runtime connection %q", connectionID, cfg.ConnectionID)
	}

	channel := target.Channel
	if !strings.EqualFold(strings.TrimSpace(channel.Platform), "jira") {
		return jiraDeliveryRoute{}, fmt.Errorf("delivery target platform must be jira, got %q", channel.Platform)
	}
	if channel.SpaceID != "" && !strings.EqualFold(strings.TrimSpace(channel.SpaceID), strings.TrimSpace(client.site)) {
		return jiraDeliveryRoute{}, fmt.Errorf("delivery target space_id %q does not match runtime site %q", channel.SpaceID, client.site)
	}
	if kind := strings.TrimSpace(channel.ContainerKind); kind != "" && kind != "group" {
		return jiraDeliveryRoute{}, fmt.Errorf("jira delivery target container_kind must be group, got %q", channel.ContainerKind)
	}

	projectKey := strings.TrimSpace(channel.ContainerID)
	if projectKey == "" {
		return jiraDeliveryRoute{}, errors.New("jira delivery target missing channel.container_id")
	}
	issueKey := strings.TrimSpace(channel.ThreadID)

	switch action {
	case "create_issue":
		if issueKey != "" {
			return jiraDeliveryRoute{}, errors.New("create_issue must target a Jira project channel without thread_id")
		}
	case "comment", "transition", "assign", "add_label":
		if issueKey == "" {
			return jiraDeliveryRoute{}, fmt.Errorf("%s must target a Jira issue thread with thread_id", action)
		}
		if !isValidIssueKeyForProject(projectKey, issueKey) {
			return jiraDeliveryRoute{}, fmt.Errorf("%s target thread_id %q is not a valid Jira issue key for project %q", action, issueKey, projectKey)
		}
	default:
		return jiraDeliveryRoute{}, fmt.Errorf("unsupported action %q", action)
	}

	return jiraDeliveryRoute{
		ConnectionID: connectionID,
		ProjectKey:   projectKey,
		IssueKey:     issueKey,
	}, nil
}

func isValidIssueKeyForProject(projectKey, issueKey string) bool {
	projectKey = strings.TrimSpace(projectKey)
	issueKey = strings.TrimSpace(issueKey)
	if projectKey == "" || issueKey == "" {
		return false
	}
	prefix := projectKey + "-"
	if !strings.HasPrefix(issueKey, prefix) {
		return false
	}
	suffix := strings.TrimPrefix(issueKey, prefix)
	if suffix == "" {
		return false
	}
	for _, r := range suffix {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func failedDeliveryResult(err error, totalChars int) *nexadapter.DeliveryResult {
	return failedDeliveryResultWithError(deliveryErrorFrom(err), totalChars)
}

func failedDeliveryResultWithError(deliveryErr *nexadapter.DeliveryError, totalChars int) *nexadapter.DeliveryResult {
	return &nexadapter.DeliveryResult{
		Success:    false,
		MessageIDs: []string{},
		ChunksSent: 0,
		TotalChars: totalChars,
		Error:      deliveryErr,
	}
}

func deliveryErrorFrom(err error) *nexadapter.DeliveryError {
	if err == nil {
		return nil
	}

	var jiraErr *jiraAPIError
	if errors.As(err, &jiraErr) {
		switch jiraErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return &nexadapter.DeliveryError{
				Type:    "permission_denied",
				Message: jiraErr.Message,
				Retry:   false,
			}
		case http.StatusNotFound:
			return &nexadapter.DeliveryError{
				Type:    "not_found",
				Message: jiraErr.Message,
				Retry:   false,
			}
		case http.StatusTooManyRequests:
			retryAfter := retryAfterDuration(jiraErr.Headers)
			return &nexadapter.DeliveryError{
				Type:         "rate_limited",
				Message:      jiraErr.Message,
				Retry:        true,
				RetryAfterMs: int(retryAfter / time.Millisecond),
			}
		case http.StatusBadRequest, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity:
			return &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: jiraErr.Message,
				Retry:   false,
			}
		default:
			return &nexadapter.DeliveryError{
				Type:    "unknown",
				Message: jiraErr.Message,
				Retry:   jiraErr.StatusCode >= 500,
			}
		}
	}

	var netErr net.Error
	if errors.As(err, &netErr) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return &nexadapter.DeliveryError{
			Type:    "network",
			Message: err.Error(),
			Retry:   true,
		}
	}

	return &nexadapter.DeliveryError{
		Type:    "unknown",
		Message: err.Error(),
		Retry:   false,
	}
}
