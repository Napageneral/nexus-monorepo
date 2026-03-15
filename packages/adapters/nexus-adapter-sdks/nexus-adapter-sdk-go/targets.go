package nexadapter

import "strings"

func RequireContainerTarget(target DeliveryTarget) (string, error) {
	containerID := strings.TrimSpace(target.Channel.ContainerID)
	if containerID == "" {
		return "", ErrTargetContainerRequired
	}
	return containerID, nil
}

func ReadThreadTarget(target DeliveryTarget) string {
	return strings.TrimSpace(target.Channel.ThreadID)
}

func ReadReplyToTarget(target DeliveryTarget) string {
	return strings.TrimSpace(target.ReplyToID)
}
