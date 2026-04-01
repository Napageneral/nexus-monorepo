package etl

import (
	"database/sql"
	"fmt"
	"time"
)

const (
	maintenanceWatermarkSource            = "maintenance"
	maintenanceWatermarkHandleRunNS       = "handle_run_ns"
	maintenanceWatermarkChatRunNS         = "chat_run_ns"
	maintenanceWatermarkParticipantRunNS  = "participant_run_ns"
	maintenanceWatermarkConversationRunNS = "conversation_run_ns"
	maintenanceWatermarkAddressBookRunNS  = "addressbook_run_ns"
	maintenanceWatermarkHandleName        = maintenanceWatermarkHandleRunNS
	maintenanceWatermarkChatName          = maintenanceWatermarkChatRunNS
	maintenanceWatermarkMessageName       = maintenanceWatermarkConversationRunNS
	maintenanceWatermarkAddressBookNS     = maintenanceWatermarkAddressBookRunNS
	maintenanceHandleRefreshName          = maintenanceWatermarkHandleRunNS
	maintenanceAddressBookHydrationName   = maintenanceWatermarkAddressBookRunNS
	maintenanceChatRepairName             = maintenanceWatermarkChatRunNS
	maintenanceParticipantRepairName      = maintenanceWatermarkParticipantRunNS
	maintenanceConversationRepairName     = maintenanceWatermarkConversationRunNS
)

// MaintenanceWatermarks tracks slow-lane bookkeeping separately from the hot watcher.
type MaintenanceWatermarks struct {
	HandleRunNS       int64
	ChatRunNS         int64
	ParticipantRunNS  int64
	ConversationRunNS int64
	AddressBookRunNS  int64
}

// MaintenanceSyncResult summarizes a slow maintenance pass.
type MaintenanceSyncResult struct {
	HandlesCount            int
	ChatsCount              int
	ChatParticipantsCount   int
	AddressBookUpdatesCount int
	ConversationsCount      int
	CompletedAtUnixMS       int64
	Watermarks              MaintenanceWatermarks
}

// MaintenanceSync runs the slow repair lane for Eve.
//
// It keeps its own restart-safe bookkeeping so the hot ingest path can remain
// focused on delta acquisition and canonical emit.
func MaintenanceSync(chatDB *ChatDB, warehouseDB *sql.DB) (*MaintenanceSyncResult, error) {
	if chatDB == nil {
		return nil, fmt.Errorf("maintenance sync requires chat.db access")
	}
	if warehouseDB == nil {
		return nil, fmt.Errorf("maintenance sync requires a warehouse database")
	}

	watermarks, err := loadOrSeedMaintenanceWatermarks(warehouseDB)
	if err != nil {
		return nil, err
	}

	result := &MaintenanceSyncResult{Watermarks: watermarks}

	if count, err := SyncHandles(chatDB, warehouseDB); err != nil {
		return nil, fmt.Errorf("maintenance handle refresh failed: %w", err)
	} else {
		result.HandlesCount = count
	}
	if now, err := persistMaintenanceRun(warehouseDB, maintenanceWatermarkHandleRunNS); err != nil {
		return nil, fmt.Errorf("failed to persist handle maintenance watermark: %w", err)
	} else {
		watermarks.HandleRunNS = now
	}

	if count, err := SyncChats(chatDB, warehouseDB); err != nil {
		return nil, fmt.Errorf("maintenance chat repair failed: %w", err)
	} else {
		result.ChatsCount = count
	}
	if now, err := persistMaintenanceRun(warehouseDB, maintenanceWatermarkChatRunNS); err != nil {
		return nil, fmt.Errorf("failed to persist chat maintenance watermark: %w", err)
	} else {
		watermarks.ChatRunNS = now
	}

	if count, err := SyncChatParticipants(chatDB, warehouseDB); err != nil {
		return nil, fmt.Errorf("maintenance participant repair failed: %w", err)
	} else {
		result.ChatParticipantsCount = count
	}
	if now, err := persistMaintenanceRun(warehouseDB, maintenanceWatermarkParticipantRunNS); err != nil {
		return nil, fmt.Errorf("failed to persist participant maintenance watermark: %w", err)
	} else {
		watermarks.ParticipantRunNS = now
	}

	if updated, err := HydrateContactNamesFromAddressBook(warehouseDB); err != nil {
		return nil, fmt.Errorf("address book hydration failed: %w", err)
	} else {
		result.AddressBookUpdatesCount = updated
	}
	if now, err := persistMaintenanceRun(warehouseDB, maintenanceWatermarkAddressBookRunNS); err != nil {
		return nil, fmt.Errorf("failed to persist address book maintenance watermark: %w", err)
	} else {
		watermarks.AddressBookRunNS = now
	}

	if count, err := BuildConversations(warehouseDB); err != nil {
		return nil, fmt.Errorf("conversation repair failed: %w", err)
	} else {
		result.ConversationsCount = count
	}
	if now, err := persistMaintenanceRun(warehouseDB, maintenanceWatermarkConversationRunNS); err != nil {
		return nil, fmt.Errorf("failed to persist conversation maintenance watermark: %w", err)
	} else {
		watermarks.ConversationRunNS = now
		result.CompletedAtUnixMS = now / int64(time.Millisecond)
	}

	result.Watermarks = watermarks
	return result, nil
}

func loadOrSeedMaintenanceWatermarks(warehouseDB *sql.DB) (MaintenanceWatermarks, error) {
	handleRunNS, err := GetOrSeedWatermarkInt(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkHandleRunNS, 0)
	if err != nil {
		return MaintenanceWatermarks{}, err
	}
	chatRunNS, err := GetOrSeedWatermarkInt(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkChatRunNS, 0)
	if err != nil {
		return MaintenanceWatermarks{}, err
	}
	participantRunNS, err := GetOrSeedWatermarkInt(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkParticipantRunNS, 0)
	if err != nil {
		return MaintenanceWatermarks{}, err
	}
	conversationRunNS, err := GetOrSeedWatermarkInt(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkConversationRunNS, 0)
	if err != nil {
		return MaintenanceWatermarks{}, err
	}
	addressBookRunNS, err := GetOrSeedWatermarkInt(warehouseDB, maintenanceWatermarkSource, maintenanceWatermarkAddressBookRunNS, 0)
	if err != nil {
		return MaintenanceWatermarks{}, err
	}

	return MaintenanceWatermarks{
		HandleRunNS:       handleRunNS,
		ChatRunNS:         chatRunNS,
		ParticipantRunNS:  participantRunNS,
		ConversationRunNS: conversationRunNS,
		AddressBookRunNS:  addressBookRunNS,
	}, nil
}

func persistMaintenanceRun(warehouseDB *sql.DB, name string) (int64, error) {
	now := time.Now().UnixNano()
	if err := SetWatermark(warehouseDB, maintenanceWatermarkSource, name, &now, nil); err != nil {
		return 0, err
	}
	return now, nil
}
