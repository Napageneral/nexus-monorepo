package main

import (
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const normalizedForgePlatformID = "git"

func buildCommitEvent(accountID string, provider Provider, repo Repository, commit Commit, diff []byte) nexadapter.AdapterInboundRecord {
	spaceID, spaceName, containerID, containerName := deriveRouting(provider.ID(), repo)
	threadID, threadName := deriveCommitThread(repo, commit)
	attachments := []nexadapter.Attachment{}
	if len(diff) > 0 {
		attachments = append(attachments, nexadapter.Attachment{
			ID:       fmt.Sprintf("%s:diff", commit.SHA),
			Filename: fmt.Sprintf("%s.diff", commit.SHA),
			MIMEType: "text/x-diff",
		})
	}
	metadata := map[string]any{
		"entity_type": "commit",
		"forge_provider": provider.ID(),
		"parents":     commit.Parents,
		"refs":        commit.Refs,
	}
	if strings.TrimSpace(repo.RemoteURL) != "" {
		metadata["remote_url"] = repo.RemoteURL
	}
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Platform:      normalizedForgePlatformID,
			ConnectionID:  accountID,
			SenderID:      commit.AuthorEmail,
			SenderName:    commit.AuthorName,
			SpaceID:       spaceID,
			SpaceName:     spaceName,
			ContainerKind: "group",
			ContainerID:   containerID,
			ContainerName: containerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: commitEventID(provider.ID(), repo, commit.SHA),
			Timestamp:        commit.Timestamp,
			Content:          commit.Message,
			ContentType:      "text",
			Attachments:      attachments,
			Metadata:         metadata,
		},
	}
}

func buildPullRequestEvent(accountID string, provider Provider, repo Repository, pr PullRequest, diff []byte, sourceArchive *nexadapter.Attachment) nexadapter.AdapterInboundRecord {
	spaceID, spaceName, containerID, containerName := deriveRouting(provider.ID(), repo)
	threadID := fmt.Sprintf("pr/%s", pr.ID)
	threadName := fmt.Sprintf("PR #%s: %s", pr.ID, pr.Title)
	content := threadName
	if strings.TrimSpace(pr.Description) != "" {
		content += "\n\n" + pr.Description
	}
	attachments := []nexadapter.Attachment{}
	if len(diff) > 0 {
		attachments = append(attachments, nexadapter.Attachment{
			ID:       fmt.Sprintf("pr/%s:diff", pr.ID),
			Filename: fmt.Sprintf("pr-%s.diff", pr.ID),
			MIMEType: "text/x-diff",
		})
	}
	if sourceArchive != nil {
		attachments = append(attachments, *sourceArchive)
	}
	metadata := map[string]any{
		"entity_type":   "pull_request",
		"forge_provider": provider.ID(),
		"state":         pr.State,
		"source_branch": pr.SourceBranch,
		"target_branch": pr.TargetBranch,
		"reviewers":     pr.Reviewers,
	}
	if strings.TrimSpace(repo.RemoteURL) != "" {
		metadata["remote_url"] = repo.RemoteURL
	}
	if strings.TrimSpace(pr.HeadCommitSHA) != "" {
		metadata["head_commit_sha"] = pr.HeadCommitSHA
	}
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Platform:      normalizedForgePlatformID,
			ConnectionID:  accountID,
			SenderID:      pr.AuthorEmail,
			SenderName:    pr.AuthorName,
			SpaceID:       spaceID,
			SpaceName:     spaceName,
			ContainerKind: "group",
			ContainerID:   containerID,
			ContainerName: containerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: prEventID(provider.ID(), repo, pr.ID),
			Timestamp:        pr.UpdatedAt,
			Content:          content,
			ContentType:      "text",
			Attachments:      attachments,
			Metadata:         metadata,
		},
	}
}

func buildCommentEvent(accountID string, provider Provider, repo Repository, pr PullRequest, comment Comment) nexadapter.AdapterInboundRecord {
	spaceID, spaceName, containerID, containerName := deriveRouting(provider.ID(), repo)
	threadID := fmt.Sprintf("pr/%s", pr.ID)
	threadName := fmt.Sprintf("PR #%s: %s", pr.ID, pr.Title)
	metadata := map[string]any{
		"entity_type":   "pr_comment",
		"forge_provider": provider.ID(),
		"inline":        comment.Inline,
	}
	if strings.TrimSpace(repo.RemoteURL) != "" {
		metadata["remote_url"] = repo.RemoteURL
	}
	if comment.Inline {
		metadata["file_path"] = comment.FilePath
		if comment.Line > 0 {
			metadata["line"] = comment.Line
		}
	}
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Platform:      normalizedForgePlatformID,
			ConnectionID:  accountID,
			SenderID:      comment.AuthorEmail,
			SenderName:    comment.AuthorName,
			SpaceID:       spaceID,
			SpaceName:     spaceName,
			ContainerKind: "group",
			ContainerID:   containerID,
			ContainerName: containerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
			ReplyToID:     prEventID(provider.ID(), repo, pr.ID),
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: commentEventID(provider.ID(), repo, pr.ID, comment.ID),
			Timestamp:        comment.CreatedAt,
			Content:          comment.Body,
			ContentType:      "text",
			Metadata:         metadata,
		},
	}
}

func deriveRouting(providerID string, repo Repository) (spaceID, spaceName, containerID, containerName string) {
	containerName = repo.Name
	containerID = repo.Name

	switch providerID {
	case "gitlab":
		parts := strings.Split(repo.FullName, "/")
		if len(parts) > 1 {
			spaceID = strings.Join(parts[:len(parts)-1], "/")
			spaceName = prettifySpaceName(parts[len(parts)-2])
			containerID = parts[len(parts)-1]
		} else {
			containerID = repo.FullName
		}
	default:
		parts := strings.SplitN(repo.FullName, "/", 2)
		if len(parts) == 2 {
			spaceID = parts[0]
			spaceName = prettifySpaceName(parts[0])
			containerID = parts[1]
		} else {
			containerID = repo.FullName
		}
	}
	if strings.TrimSpace(containerID) == "" {
		containerID = repo.FullName
	}
	return spaceID, spaceName, containerID, containerName
}

func deriveCommitThread(repo Repository, commit Commit) (threadID, threadName string) {
	ref := ""
	if len(commit.Refs) > 0 {
		ref = strings.TrimSpace(commit.Refs[0])
	}
	if ref == "" {
		branch := strings.TrimSpace(repo.DefaultBranch)
		if branch == "" {
			branch = "main"
		}
		ref = "refs/heads/" + branch
	}
	threadID = ref
	threadName = strings.TrimPrefix(ref, "refs/heads/")
	return threadID, threadName
}

func commitEventID(providerID string, repo Repository, sha string) string {
	return fmt.Sprintf("git:%s:%s:%s", providerID, repo.FullName, sha)
}

func prEventID(providerID string, repo Repository, prID string) string {
	return fmt.Sprintf("git:%s:%s:pr/%s", providerID, repo.FullName, prID)
}

func commentEventID(providerID string, repo Repository, prID string, commentID string) string {
	return fmt.Sprintf("git:%s:%s:pr/%s:comment/%s", providerID, repo.FullName, prID, commentID)
}

func prettifySpaceName(raw string) string {
	base := strings.TrimSpace(raw)
	base = strings.TrimSuffix(base, "-workspace")
	base = strings.TrimSuffix(base, "-org")
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.ReplaceAll(base, "_", " ")
	parts := strings.Fields(base)
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
	}
	return strings.Join(parts, " ")
}
