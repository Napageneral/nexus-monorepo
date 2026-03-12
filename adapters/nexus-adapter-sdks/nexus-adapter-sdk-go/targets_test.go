package nexadapter

import "testing"

func TestRequireContainerTarget(t *testing.T) {
	target := DeliveryTarget{
		ConnectionID: "conn-1",
		Channel: ChannelRef{
			Platform:    "discord",
			ContainerID: "room-1",
		},
	}
	containerID, err := RequireContainerTarget(target)
	if err != nil {
		t.Fatalf("RequireContainerTarget: %v", err)
	}
	if containerID != "room-1" {
		t.Fatalf("container_id = %q", containerID)
	}
}

func TestRequireContainerTargetErrorsWhenMissing(t *testing.T) {
	_, err := RequireContainerTarget(DeliveryTarget{})
	if err == nil {
		t.Fatalf("expected error")
	}
	if err != ErrTargetContainerRequired {
		t.Fatalf("unexpected error: %v", err)
	}
}
