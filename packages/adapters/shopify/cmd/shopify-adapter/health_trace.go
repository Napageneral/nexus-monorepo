package main

import (
	"context"
	"sync"
	"time"
)

type shopifyHealthTraceContextKey struct{}

type shopifyHealthTrace struct {
	mu          sync.Mutex
	latencyMS   map[string]int64
	tokenSource string
}

func newShopifyHealthTrace() *shopifyHealthTrace {
	return &shopifyHealthTrace{latencyMS: map[string]int64{}}
}

func withShopifyHealthTrace(ctx context.Context, trace *shopifyHealthTrace) context.Context {
	if trace == nil {
		return ctx
	}
	return context.WithValue(ctx, shopifyHealthTraceContextKey{}, trace)
}

func shopifyHealthTraceFromContext(ctx context.Context) *shopifyHealthTrace {
	trace, _ := ctx.Value(shopifyHealthTraceContextKey{}).(*shopifyHealthTrace)
	return trace
}

func recordShopifyHealthLatency(ctx context.Context, phase string, startedAt time.Time) {
	trace := shopifyHealthTraceFromContext(ctx)
	if trace == nil {
		return
	}
	trace.mu.Lock()
	trace.latencyMS[phase] = time.Since(startedAt).Milliseconds()
	trace.mu.Unlock()
}

func recordShopifyHealthTokenSource(ctx context.Context, source string) {
	trace := shopifyHealthTraceFromContext(ctx)
	if trace == nil {
		return
	}
	trace.mu.Lock()
	trace.tokenSource = source
	trace.mu.Unlock()
}

func (trace *shopifyHealthTrace) snapshot() (map[string]int64, string) {
	trace.mu.Lock()
	defer trace.mu.Unlock()
	latency := make(map[string]int64, len(trace.latencyMS))
	for phase, duration := range trace.latencyMS {
		latency[phase] = duration
	}
	return latency, trace.tokenSource
}
