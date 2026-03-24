package nexadapter

import "strings"

func RequireContainerTarget(channel ChannelRef) (string, error) {
	containerID := strings.TrimSpace(channel.ContainerID)
	if containerID == "" {
		return "", ErrTargetContainerRequired
	}
	return containerID, nil
}

func ReadThreadTarget(channel ChannelRef) string {
	return strings.TrimSpace(channel.ThreadID)
}

func ReadReplyToTarget(replyToID string) string {
	return strings.TrimSpace(replyToID)
}
