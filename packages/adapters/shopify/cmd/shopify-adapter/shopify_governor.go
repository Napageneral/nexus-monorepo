package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	shopifyGovernorSlots          = 2
	shopifyGovernorRequestSpacing = 125 * time.Millisecond
	shopifyGovernorPollInterval   = 25 * time.Millisecond
	shopifyGovernorDefaultBackoff = 30 * time.Second
)

type shopifyGovernorState struct {
	Version       int    `json:"version"`
	NextRequestAt string `json:"next_request_at,omitempty"`
	BackoffUntil  string `json:"backoff_until,omitempty"`
}

type shopifyGovernorLease struct {
	file         *os.File
	localRelease func()
}

func (lease *shopifyGovernorLease) release() {
	if lease == nil || lease.file == nil {
		return
	}
	_ = syscall.Flock(int(lease.file.Fd()), syscall.LOCK_UN)
	_ = lease.file.Close()
	lease.file = nil
	if lease.localRelease != nil {
		lease.localRelease()
		lease.localRelease = nil
	}
}

var shopifyLocalGovernor = struct {
	sync.Mutex
	slots map[string]chan struct{}
}{slots: map[string]chan struct{}{}}

func acquireShopifyLocalGovernorSlot(ctx context.Context, dir string) (func(), error) {
	shopifyLocalGovernor.Lock()
	slots := shopifyLocalGovernor.slots[dir]
	if slots == nil {
		slots = make(chan struct{}, shopifyGovernorSlots)
		shopifyLocalGovernor.slots[dir] = slots
	}
	shopifyLocalGovernor.Unlock()
	select {
	case slots <- struct{}{}:
		return func() { <-slots }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

type shopifyGovernedBody struct {
	io.ReadCloser
	lease *shopifyGovernorLease
}

func (body *shopifyGovernedBody) Close() error {
	err := body.ReadCloser.Close()
	body.lease.release()
	return err
}

func shopifyGovernorDir(connectionID string) (string, error) {
	statePath, _, err := sourceStatePaths(connectionID)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(filepath.Dir(statePath), "request-governor")
	if err := secureShopifyStateDirectory(dir); err != nil {
		return "", fmt.Errorf("create Shopify request governor directory: %w", err)
	}
	return dir, nil
}

func acquireShopifyGovernorSlot(ctx context.Context, dir string) (*shopifyGovernorLease, error) {
	localRelease, err := acquireShopifyLocalGovernorSlot(ctx, dir)
	if err != nil {
		return nil, err
	}
	for {
		for slot := 0; slot < shopifyGovernorSlots; slot++ {
			path := filepath.Join(dir, fmt.Sprintf("slot-%d.lock", slot))
			file, err := openShopifyPrivateFile(path, syscall.O_RDWR, true)
			if err != nil {
				localRelease()
				return nil, fmt.Errorf("open Shopify request governor slot: %w", err)
			}
			if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err == nil {
				return &shopifyGovernorLease{file: file, localRelease: localRelease}, nil
			}
			_ = file.Close()
		}
		timer := time.NewTimer(shopifyGovernorPollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			localRelease()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func parseGovernorTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}
	}
	return parsed
}

func reserveShopifyRequest(ctx context.Context, dir string, now func() time.Time) error {
	lockPath := filepath.Join(dir, "state.lock")
	statePath := filepath.Join(dir, "state.json")
	for {
		lock, err := openShopifyPrivateFile(lockPath, syscall.O_RDWR, true)
		if err != nil {
			return fmt.Errorf("open Shopify request governor lock: %w", err)
		}
		if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
			_ = lock.Close()
			return fmt.Errorf("lock Shopify request governor: %w", err)
		}
		state := shopifyGovernorState{Version: 1}
		if raw, readErr := readShopifyPrivateFile(statePath); readErr == nil {
			if err := json.Unmarshal(raw, &state); err != nil || state.Version != 1 {
				_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
				_ = lock.Close()
				return errors.New("Shopify request governor state is invalid")
			}
		} else if !errors.Is(readErr, os.ErrNotExist) {
			_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
			_ = lock.Close()
			return fmt.Errorf("read Shopify request governor state: %w", readErr)
		}

		current := now().UTC()
		readyAt := parseGovernorTime(state.NextRequestAt)
		if backoff := parseGovernorTime(state.BackoffUntil); backoff.After(readyAt) {
			readyAt = backoff
		}
		if readyAt.After(current) {
			_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
			_ = lock.Close()
			timer := time.NewTimer(readyAt.Sub(current))
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
			continue
		}

		state.NextRequestAt = current.Add(shopifyGovernorRequestSpacing).Format(time.RFC3339Nano)
		encoded, err := json.Marshal(state)
		if err == nil {
			err = writeShopifyPrivateFileAtomic(statePath, append(encoded, '\n'))
		}
		_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
		_ = lock.Close()
		if err != nil {
			return fmt.Errorf("persist Shopify request governor reservation: %w", err)
		}
		return nil
	}
}

func updateShopifyGovernorBackoff(dir string, until time.Time) error {
	lockPath := filepath.Join(dir, "state.lock")
	statePath := filepath.Join(dir, "state.json")
	lock, err := openShopifyPrivateFile(lockPath, syscall.O_RDWR, true)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN) //nolint:errcheck
	state := shopifyGovernorState{Version: 1}
	if raw, readErr := readShopifyPrivateFile(statePath); readErr == nil {
		if err := json.Unmarshal(raw, &state); err != nil || state.Version != 1 {
			return errors.New("Shopify request governor state is invalid")
		}
	} else if !errors.Is(readErr, os.ErrNotExist) {
		return fmt.Errorf("read Shopify request governor state: %w", readErr)
	}
	if until.After(parseGovernorTime(state.BackoffUntil)) {
		state.BackoffUntil = until.UTC().Format(time.RFC3339Nano)
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return writeShopifyPrivateFileAtomic(statePath, append(encoded, '\n'))
}

func shopifyRetryAfter(response *http.Response, now time.Time) time.Time {
	value := strings.TrimSpace(response.Header.Get("Retry-After"))
	if seconds, err := strconv.Atoi(value); err == nil && seconds > 0 && seconds <= 3600 {
		return now.Add(time.Duration(seconds) * time.Second)
	}
	if parsed, err := http.ParseTime(value); err == nil && parsed.After(now) {
		return parsed
	}
	return now.Add(shopifyGovernorDefaultBackoff)
}

func shopifyRESTPressureDelay(response *http.Response) time.Duration {
	parts := strings.Split(strings.TrimSpace(response.Header.Get("X-Shopify-Shop-Api-Call-Limit")), "/")
	if len(parts) != 2 {
		return 0
	}
	used, usedErr := strconv.Atoi(strings.TrimSpace(parts[0]))
	limit, limitErr := strconv.Atoi(strings.TrimSpace(parts[1]))
	if usedErr != nil || limitErr != nil || used < 0 || limit <= 0 || used*100 < limit*80 {
		return 0
	}
	return time.Duration(used*100/limit-79) * 250 * time.Millisecond
}

func doShopifyRequest(ctx context.Context, state *shopifyState, request *http.Request) (*http.Response, error) {
	if state == nil || strings.TrimSpace(state.ConnectionID) == "" || os.Getenv(nexadapterStateDirEnvName) == "" {
		return shopifyHTTPClient.Do(request)
	}
	dir, err := shopifyGovernorDir(state.ConnectionID)
	if err != nil {
		return nil, err
	}
	lease, err := acquireShopifyGovernorSlot(ctx, dir)
	if err != nil {
		return nil, fmt.Errorf("acquire Shopify request governor: %w", err)
	}
	if err := reserveShopifyRequest(ctx, dir, time.Now); err != nil {
		lease.release()
		return nil, err
	}
	response, err := shopifyHTTPClient.Do(request)
	if err != nil {
		lease.release()
		return nil, err
	}
	now := time.Now().UTC()
	if response.StatusCode == http.StatusTooManyRequests {
		if err := updateShopifyGovernorBackoff(dir, shopifyRetryAfter(response, now)); err != nil {
			_ = response.Body.Close()
			lease.release()
			return nil, fmt.Errorf("persist Shopify 429 backoff: %w", err)
		}
	} else if delay := shopifyRESTPressureDelay(response); delay > 0 {
		if err := updateShopifyGovernorBackoff(dir, now.Add(delay)); err != nil {
			_ = response.Body.Close()
			lease.release()
			return nil, fmt.Errorf("persist Shopify request pressure delay: %w", err)
		}
	}
	response.Body = &shopifyGovernedBody{ReadCloser: response.Body, lease: lease}
	return response, nil
}

// Keep the environment-variable name local so the governor does not depend on
// SDK implementation details beyond the documented process contract.
const nexadapterStateDirEnvName = "NEXUS_ADAPTER_STATE_DIR"
