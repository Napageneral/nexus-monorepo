package broker_test

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/Napageneral/spike/internal/broker"
)

func TestRunParallelRunsAllIDs(t *testing.T) {
	ids := []string{"a", "b", "c", "d"}
	var count int32
	err := broker.RunParallel(context.Background(), ids, 2, func(id string) error {
		_ = id
		atomic.AddInt32(&count, 1)
		return nil
	})
	if err != nil {
		t.Fatalf("RunParallel error: %v", err)
	}
	if got := atomic.LoadInt32(&count); got != int32(len(ids)) {
		t.Fatalf("expected %d executions, got %d", len(ids), got)
	}
}
