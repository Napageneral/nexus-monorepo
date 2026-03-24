package nexadapter

import "testing"

func TestRequireContainerTarget(t *testing.T) {
	channel := ChannelRef{
		Platform:    "discord",
		ContainerID: "room-1",
	}
	containerID, err := RequireContainerTarget(channel)
	if err != nil {
		t.Fatalf("RequireContainerTarget: %v", err)
	}
	if containerID != "room-1" {
		t.Fatalf("container_id = %q", containerID)
	}
}

func TestRequireContainerTargetErrorsWhenMissing(t *testing.T) {
	_, err := RequireContainerTarget(ChannelRef{})
	if err == nil {
		t.Fatalf("expected error")
	}
	if err != ErrTargetContainerRequired {
		t.Fatalf("unexpected error: %v", err)
	}
}
