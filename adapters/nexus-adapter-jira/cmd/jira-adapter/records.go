package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func buildIssueRecord(connectionID string, client *jiraClient, issue jiraIssue) (adapterInboundRecord, error) {
	description, err := adfToMarkdown(issue.Fields.Description)
	if err != nil {
		return adapterInboundRecord{}, err
	}

	updatedAt, err := parseJiraTimestamp(issue.Fields.Updated)
	if err != nil {
		return adapterInboundRecord{}, err
	}

	contentParts := []string{strings.TrimSpace(issue.Fields.Summary)}
	if strings.TrimSpace(description) != "" {
		contentParts = append(contentParts, strings.TrimSpace(description))
	}
	content := strings.TrimSpace(strings.Join(contentParts, "\n\n"))

	senderID, senderName := issueReporter(issue)
	record := baseRecord(connectionID, client, senderID, senderName, issue.Fields.Project.Key, issue.Fields.Project.Name, issue.Key, fmt.Sprintf("%s: %s", issue.Key, issue.Fields.Summary))
	record.Payload = adapterInboundPayload{
		ExternalRecordID: issueExternalRecordID(client.site, issue.Key),
		Timestamp:        updatedAt.UnixMilli(),
		Content:          content,
		ContentType:      "text",
		Metadata: map[string]any{
			"issue_id":   issue.ID,
			"status":     fieldName(issue.Fields.Status),
			"issue_type": fieldName(issue.Fields.IssueType),
			"priority":   fieldName(issue.Fields.Priority),
			"labels":     issue.Fields.Labels,
		},
	}
	if assigneeID := userID(issue.Fields.Assignee); assigneeID != "" {
		record.Payload.Metadata["assignee_id"] = assigneeID
	}
	if parentKey := parentKey(issue.Fields.Parent); parentKey != "" {
		record.Payload.Metadata["parent_key"] = parentKey
	}
	if resolution := fieldName(issue.Fields.Resolution); resolution != "" {
		record.Payload.Metadata["resolution"] = resolution
	}
	if sprint := sprintName(issue.Fields.Sprint); sprint != "" {
		record.Payload.Metadata["sprint"] = sprint
	}
	if len(issue.Fields.Components) > 0 {
		record.Payload.Metadata["components"] = componentNames(issue.Fields.Components)
	}
	return record, nil
}

func buildCommentRecord(connectionID string, client *jiraClient, issue jiraIssue, comment jiraComment) (adapterInboundRecord, error) {
	content, err := adfToMarkdown(comment.Body)
	if err != nil {
		return adapterInboundRecord{}, err
	}
	createdAt, err := parseJiraTimestamp(firstNonBlank(comment.Updated, comment.Created))
	if err != nil {
		return adapterInboundRecord{}, err
	}

	senderID, senderName := issueCommentAuthor(comment)
	record := baseRecord(connectionID, client, senderID, senderName, issue.Fields.Project.Key, issue.Fields.Project.Name, issue.Key, fmt.Sprintf("%s: %s", issue.Key, issue.Fields.Summary))
	record.Routing.ReplyToID = issueExternalRecordID(client.site, issue.Key)
	record.Payload = adapterInboundPayload{
		ExternalRecordID: commentExternalRecordID(client.site, issue.Key, comment.ID),
		Timestamp:        createdAt.UnixMilli(),
		Content:          strings.TrimSpace(content),
		ContentType:      "text",
	}
	return record, nil
}

func buildChangelogRecord(connectionID string, client *jiraClient, issue jiraIssue, history jiraHistory, item jiraChangeItem) (adapterInboundRecord, error) {
	createdAt, err := parseJiraTimestamp(history.Created)
	if err != nil {
		return adapterInboundRecord{}, err
	}

	senderID, senderName := issueHistoryAuthor(history)
	record := baseRecord(connectionID, client, senderID, senderName, issue.Fields.Project.Key, issue.Fields.Project.Name, issue.Key, fmt.Sprintf("%s: %s", issue.Key, issue.Fields.Summary))
	record.Routing.ReplyToID = issueExternalRecordID(client.site, issue.Key)
	record.Payload = adapterInboundPayload{
		ExternalRecordID: changelogExternalRecordID(client.site, issue.Key, history.ID, item.Field),
		Timestamp:        createdAt.UnixMilli(),
		Content:          fmt.Sprintf("%s: %s -> %s", item.Field, firstNonBlank(item.FromString, "(empty)"), firstNonBlank(item.ToString, "(empty)")),
		ContentType:      "text",
		Metadata: map[string]any{
			"field": item.Field,
			"from":  item.FromString,
			"to":    item.ToString,
		},
	}
	return record, nil
}

func baseRecord(connectionID string, client *jiraClient, senderID, senderName, projectKey, projectName, issueKey, threadName string) adapterInboundRecord {
	return adapterInboundRecord{
		Operation: "record.ingest",
		Routing: adapterInboundRouting{
			Adapter:       "jira-adapter",
			Platform:      "jira",
			ConnectionID:  connectionID,
			SenderID:      firstNonBlank(senderID, "jira-system"),
			SenderName:    firstNonBlank(senderName, "Jira"),
			SpaceID:       client.site,
			SpaceName:     client.siteURL,
			ContainerID:   projectKey,
			ContainerKind: "group",
			ContainerName: projectName,
			ThreadID:      issueKey,
			ThreadName:    threadName,
		},
	}
}

func issueExternalRecordID(siteID, issueKey string) string {
	return fmt.Sprintf("jira:%s:%s", siteID, issueKey)
}

func commentExternalRecordID(siteID, issueKey, commentID string) string {
	return fmt.Sprintf("jira:%s:%s:comment:%s", siteID, issueKey, commentID)
}

func changelogExternalRecordID(siteID, issueKey, historyID, field string) string {
	field = strings.ReplaceAll(strings.TrimSpace(field), " ", "_")
	return fmt.Sprintf("jira:%s:%s:changelog:%s:%s", siteID, issueKey, historyID, field)
}

func parseJiraTimestamp(value string) (time.Time, error) {
	return time.Parse("2006-01-02T15:04:05.000-0700", strings.TrimSpace(value))
}

func issueReporter(issue jiraIssue) (string, string) {
	if issue.Fields.Reporter != nil {
		return issue.Fields.Reporter.AccountID, issue.Fields.Reporter.DisplayName
	}
	if issue.Fields.Assignee != nil {
		return issue.Fields.Assignee.AccountID, issue.Fields.Assignee.DisplayName
	}
	return "", ""
}

func issueCommentAuthor(comment jiraComment) (string, string) {
	if comment.Author != nil {
		return comment.Author.AccountID, comment.Author.DisplayName
	}
	if comment.UpdateAuthor != nil {
		return comment.UpdateAuthor.AccountID, comment.UpdateAuthor.DisplayName
	}
	return "", ""
}

func issueHistoryAuthor(history jiraHistory) (string, string) {
	if history.Author != nil {
		return history.Author.AccountID, history.Author.DisplayName
	}
	return "", ""
}

func userID(user *jiraUser) string {
	if user == nil {
		return ""
	}
	return user.AccountID
}

func fieldName(field *jiraNamedField) string {
	if field == nil {
		return ""
	}
	return field.Name
}

func parentKey(parent *jiraIssueParent) string {
	if parent == nil {
		return ""
	}
	return parent.Key
}

func componentNames(components []jiraNamedField) []string {
	names := make([]string, 0, len(components))
	for _, component := range components {
		if strings.TrimSpace(component.Name) != "" {
			names = append(names, component.Name)
		}
	}
	return names
}

func sprintName(raw any) string {
	switch typed := raw.(type) {
	case map[string]any:
		return stringAttr(typed, "name")
	case []any:
		for _, item := range typed {
			if name := sprintName(item); name != "" {
				return name
			}
		}
	case json.RawMessage:
		var decoded any
		if err := json.Unmarshal(typed, &decoded); err == nil {
			return sprintName(decoded)
		}
	}
	return ""
}
