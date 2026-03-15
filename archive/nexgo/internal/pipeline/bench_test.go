package pipeline

import (
	"context"
	"testing"
)

// benchResolver returns a simple handler for all operations.
type benchResolver struct{}

func (r *benchResolver) Resolve(op string) (OperationHandlerInfo, error) {
	return OperationHandlerInfo{
		Operation: op,
		Kind:      "control",
		Action:    "read",
		Resource:  "test",
		Handler: func(ctx context.Context, req *NexusRequest) (any, error) {
			return map[string]string{"status": "ok"}, nil
		},
	}, nil
}

func (r *benchResolver) Has(op string) bool { return true }

// BenchmarkPipeline measures single-threaded pipeline execution throughput.
func BenchmarkPipeline(b *testing.B) {
	resolver := &benchResolver{}
	p := NewPipeline(resolver)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := NewRequest(NexusInput{
			Operation: "health",
			Routing: Routing{
				Adapter:  "bench",
				Platform: "test",
				Sender:   RoutingParticipant{ID: "bench", Name: "bench"},
			},
		})
		_, err := p.Execute(context.Background(), req)
		if err != nil {
			b.Fatalf("execute: %v", err)
		}
	}
}

// BenchmarkPipelineParallel measures parallel pipeline execution throughput.
func BenchmarkPipelineParallel(b *testing.B) {
	resolver := &benchResolver{}
	p := NewPipeline(resolver)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := NewRequest(NexusInput{
				Operation: "health",
				Routing: Routing{
					Adapter:  "bench",
					Platform: "test",
					Sender:   RoutingParticipant{ID: "bench", Name: "bench"},
				},
			})
			_, err := p.Execute(context.Background(), req)
			if err != nil {
				b.Fatalf("execute: %v", err)
			}
		}
	})
}

// BenchmarkNewRequest measures request creation overhead.
func BenchmarkNewRequest(b *testing.B) {
	input := NexusInput{
		Operation: "health",
		Routing: Routing{
			Adapter:  "bench",
			Platform: "test",
			Sender:   RoutingParticipant{ID: "bench", Name: "bench"},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = NewRequest(input)
	}
}
