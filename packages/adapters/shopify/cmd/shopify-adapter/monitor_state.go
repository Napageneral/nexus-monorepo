package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	shopifyAdapterStateDirEnv  = "NEXUS_ADAPTER_STATE_DIR"
	shopifyMonitorStateVersion = 2
	shopifyHotLaneOverlap      = 2 * time.Minute
	shopifyMediumLaneOverlap   = 5 * time.Minute
	shopifyColdLaneOverlap     = 10 * time.Minute
	shopifyCustomerInterval    = 5 * time.Minute
	shopifyProductInterval     = 30 * time.Minute
	shopifyCollectionInterval  = 30 * time.Minute
	shopifyDiscountInterval    = 30 * time.Minute
	shopifyMarketingInterval   = 30 * time.Minute
)

type shopifyMonitorFamily string

const (
	shopifyMonitorFamilyOrder       shopifyMonitorFamily = "order"
	shopifyMonitorFamilyLineItem    shopifyMonitorFamily = "line_item"
	shopifyMonitorFamilyFulfillment shopifyMonitorFamily = "fulfillment"
	shopifyMonitorFamilyInventory   shopifyMonitorFamily = "inventory"
	shopifyMonitorFamilyCustomer    shopifyMonitorFamily = "customer"
	shopifyMonitorFamilyProduct     shopifyMonitorFamily = "product"
	shopifyMonitorFamilyCollection  shopifyMonitorFamily = "collection"
	shopifyMonitorFamilyDiscount    shopifyMonitorFamily = "discount"
	shopifyMonitorFamilyMarketing   shopifyMonitorFamily = "marketing"
)

type shopifyMonitorState struct {
	Version  int                                          `json:"version"`
	Families map[shopifyMonitorFamily]*shopifyFamilyState `json:"families,omitempty"`
	Metrics  map[shopifyMonitorFamily]*shopifyFamilyStats `json:"metrics,omitempty"`
}

type shopifyFamilyState struct {
	CursorAt         time.Time `json:"cursor_at,omitempty"`
	CursorProviderID string    `json:"cursor_provider_id,omitempty"`
	LastPollAt       time.Time `json:"last_poll_at,omitempty"`
}

type shopifyFamilyStats struct {
	LastCycleAt     time.Time `json:"last_cycle_at,omitempty"`
	LastAttempted   int       `json:"last_attempted,omitempty"`
	LastEmitted     int       `json:"last_emitted,omitempty"`
	LastSuppressed  int       `json:"last_suppressed,omitempty"`
	TotalAttempted  int       `json:"total_attempted,omitempty"`
	TotalEmitted    int       `json:"total_emitted,omitempty"`
	TotalSuppressed int       `json:"total_suppressed,omitempty"`
}

type shopifyMonitorTuple struct {
	CursorAt   time.Time
	ProviderID string
}

type shopifyMonitorFamilyConfig struct {
	Name     shopifyMonitorFamily
	Interval time.Duration
	Overlap  time.Duration
	Poll     func(context.Context, *shopifyState, shopifyMonitorTuple, time.Time, nexadapter.EmitFunc) (shopifyMonitorTuple, error)
}

type shopifyMonitorCycleResult struct {
	DueFamilies        []shopifyMonitorFamily
	SuccessfulFamilies []shopifyMonitorFamily
	FailedFamilies     []shopifyMonitorFamily
	StateChanged       bool
}

type shopifyInventoryCandidate struct {
	Item  shopifyGraphQLInventoryItem
	Level shopifyGraphQLInventoryLevel
	Tuple shopifyMonitorTuple
}

func runShopifyMonitor(ctx nexadapter.AdapterContext[struct{}], state *shopifyState, emit nexadapter.EmitFunc) error {
	monitorState, err := loadShopifyMonitorState(state.ConnectionID)
	if err != nil {
		return err
	}
	revisionStore, err := openShopifyRevisionStore(state.ConnectionID)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := revisionStore.Close(); closeErr != nil {
			nexadapter.LogError("shopify monitor revision store close: %v", closeErr)
		}
	}()

	for {
		pollTime := time.Now().UTC()
		result := runShopifyMonitorCycle(ctx.Context, state, monitorState, revisionStore, pollTime, emit)
		if result.StateChanged {
			if err := saveShopifyMonitorState(state.ConnectionID, monitorState); err != nil {
				return err
			}
		}

		wait := defaultMonitorInterval
		if len(result.DueFamilies) > 0 && len(result.SuccessfulFamilies) == 0 && len(result.FailedFamilies) > 0 {
			wait = defaultMonitorErrorBackoff
		}

		select {
		case <-ctx.Context.Done():
			return nil
		case <-time.After(wait):
		}
	}
}

func runShopifyMonitorCycle(ctx context.Context, state *shopifyState, monitorState *shopifyMonitorState, revisionStore *shopifyRevisionStore, pollTime time.Time, emit nexadapter.EmitFunc) shopifyMonitorCycleResult {
	result := shopifyMonitorCycleResult{}
	for _, family := range shopifyMonitorFamilies() {
		familyState := monitorState.family(family.Name)
		if !familyState.due(pollTime, family.Interval) {
			continue
		}
		result.DueFamilies = append(result.DueFamilies, family.Name)

		cursor := familyState.cursor()
		since := familyState.since(pollTime, family.Overlap)
		emitter := newShopifyMonitorEmitter(monitorState, revisionStore, pollTime, emit)
		latestTuple, err := family.Poll(ctx, state, cursor, since, emitter.Emit)
		if err == nil {
			err = emitter.Err()
		}
		if err != nil {
			nexadapter.LogError("shopify monitor %s poll failed: %v", family.Name, err)
			result.FailedFamilies = append(result.FailedFamilies, family.Name)
			continue
		}

		familyState.advance(pollTime, latestTuple)
		result.SuccessfulFamilies = append(result.SuccessfulFamilies, family.Name)
		result.StateChanged = true
		if emitter.StateChanged() {
			result.StateChanged = true
		}
	}
	logShopifyMonitorMetrics(monitorState, pollTime)
	return result
}

func shopifyMonitorFamilies() []shopifyMonitorFamilyConfig {
	return []shopifyMonitorFamilyConfig{
		{
			Name:     shopifyMonitorFamilyOrder,
			Interval: defaultMonitorInterval,
			Overlap:  shopifyHotLaneOverlap,
			Poll:     pollShopifyOrders,
		},
		{
			Name:     shopifyMonitorFamilyFulfillment,
			Interval: defaultMonitorInterval,
			Overlap:  shopifyHotLaneOverlap,
			Poll:     pollShopifyFulfillments,
		},
		{
			Name:     shopifyMonitorFamilyInventory,
			Interval: defaultMonitorInterval,
			Overlap:  shopifyHotLaneOverlap,
			Poll:     pollShopifyInventory,
		},
		{
			Name:     shopifyMonitorFamilyCustomer,
			Interval: shopifyCustomerInterval,
			Overlap:  shopifyMediumLaneOverlap,
			Poll:     pollShopifyCustomers,
		},
		{
			Name:     shopifyMonitorFamilyProduct,
			Interval: shopifyProductInterval,
			Overlap:  shopifyColdLaneOverlap,
			Poll:     pollShopifyProducts,
		},
		{
			Name:     shopifyMonitorFamilyCollection,
			Interval: shopifyCollectionInterval,
			Overlap:  shopifyColdLaneOverlap,
			Poll:     pollShopifyCollections,
		},
		{
			Name:     shopifyMonitorFamilyDiscount,
			Interval: shopifyDiscountInterval,
			Overlap:  shopifyColdLaneOverlap,
			Poll:     pollShopifyDiscounts,
		},
		{
			Name:     shopifyMonitorFamilyMarketing,
			Interval: shopifyMarketingInterval,
			Overlap:  shopifyColdLaneOverlap,
			Poll:     pollShopifyMarketing,
		},
	}
}

func pollShopifyOrders(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	orders, sourceRequest, _, err := fetchOrdersSince(ctx, state, since, true)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(orders, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseOrderUpdatedAt(orders[i]), ProviderID: int64String(orders[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseOrderUpdatedAt(orders[j]), ProviderID: int64String(orders[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, order := range orders {
		tuple := shopifyMonitorTuple{CursorAt: parseOrderUpdatedAt(order), ProviderID: int64String(order.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)

		if record := buildOrderRecord(state, order, sourceRequest); record.Operation != "" {
			emit(record)
		}
		for _, lineItem := range order.LineItems {
			if record := buildLineItemRecord(state, order, lineItem, sourceRequest); record.Operation != "" {
				emit(record)
			}
		}
	}

	return latest, nil
}

func pollShopifyFulfillments(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	fulfillments, sourceRequest, _, err := fetchFulfillmentOrdersSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(fulfillments, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(fulfillments[i].UpdatedAt), ProviderID: strings.TrimSpace(fulfillments[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(fulfillments[j].UpdatedAt), ProviderID: strings.TrimSpace(fulfillments[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, fulfillment := range fulfillments {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(fulfillment.UpdatedAt), ProviderID: strings.TrimSpace(fulfillment.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildFulfillmentRecord(state, fulfillment, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyInventory(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	levels, sourceRequest, _, err := fetchInventoryLevelsSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}

	itemIDs := make([]int64, 0, len(levels))
	seenItemIDs := map[int64]bool{}
	for _, level := range levels {
		if level.InventoryItemID <= 0 || seenItemIDs[level.InventoryItemID] {
			continue
		}
		seenItemIDs[level.InventoryItemID] = true
		itemIDs = append(itemIDs, level.InventoryItemID)
	}
	itemsByID, err := fetchHotInventoryItemsByNumericIDs(ctx, state, itemIDs)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}

	candidates := make([]shopifyInventoryCandidate, 0, len(levels))
	for _, level := range levels {
		itemGID := fmt.Sprintf("gid://shopify/InventoryItem/%d", level.InventoryItemID)
		hydratedItem, ok := itemsByID[level.InventoryItemID]
		item := shopifyGraphQLInventoryItem{
			ID:        itemGID,
			UpdatedAt: level.UpdatedAt,
		}
		if ok {
			item.ID = hydratedItem.ID
			item.SKU = hydratedItem.SKU
			item.UpdatedAt = firstNonBlank(hydratedItem.UpdatedAt, level.UpdatedAt)
			item.Tracked = hydratedItem.Tracked
			item.InventoryLevels = hydratedItem.InventoryLevels
		}

		levelNode, foundLevel := matchHotInventoryLevel(item.InventoryLevels, level)
		if !foundLevel {
			levelNode = synthesizeHotInventoryLevel(level)
		}

		candidates = append(candidates, shopifyInventoryCandidate{
			Item:  item,
			Level: levelNode,
			Tuple: shopifyMonitorTuple{
				CursorAt:   parseShopifyUpdatedAt(level.UpdatedAt),
				ProviderID: fmt.Sprintf("%d:%d", level.InventoryItemID, level.LocationID),
			},
		})
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Tuple.less(candidates[j].Tuple)
	})

	latest := shopifyMonitorTuple{}
	for _, candidate := range candidates {
		if !candidate.Tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, candidate.Tuple)
		if record := buildInventoryRecord(state, candidate.Item, candidate.Level, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyCustomers(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	customers, sourceRequest, _, err := fetchCustomersSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(customers, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(customers[i].UpdatedAt), ProviderID: strings.TrimSpace(customers[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(customers[j].UpdatedAt), ProviderID: strings.TrimSpace(customers[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, customer := range customers {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(customer.UpdatedAt), ProviderID: strings.TrimSpace(customer.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildCustomerRecord(state, customer, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyProducts(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	products, sourceRequest, _, err := fetchProductsSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(products, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(products[i].UpdatedAt), ProviderID: strings.TrimSpace(products[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(products[j].UpdatedAt), ProviderID: strings.TrimSpace(products[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, product := range products {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(product.UpdatedAt), ProviderID: strings.TrimSpace(product.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildProductRecord(state, product, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyCollections(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	collections, sourceRequest, _, err := fetchCollectionsSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(collections, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(collections[i].UpdatedAt), ProviderID: strings.TrimSpace(collections[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(collections[j].UpdatedAt), ProviderID: strings.TrimSpace(collections[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, collection := range collections {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(collection.UpdatedAt), ProviderID: strings.TrimSpace(collection.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildCollectionRecord(state, collection, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyDiscounts(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	discounts, sourceRequest, _, err := fetchDiscountsSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(discounts, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(discounts[i].UpdatedAt), ProviderID: strings.TrimSpace(discounts[i].NodeGID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(discounts[j].UpdatedAt), ProviderID: strings.TrimSpace(discounts[j].NodeGID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, discount := range discounts {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(discount.UpdatedAt), ProviderID: strings.TrimSpace(discount.NodeGID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildDiscountRecord(state, discount, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func pollShopifyMarketing(ctx context.Context, state *shopifyState, cursor shopifyMonitorTuple, since time.Time, emit nexadapter.EmitFunc) (shopifyMonitorTuple, error) {
	activities, sourceRequest, _, err := fetchMarketingActivitiesSince(ctx, state, since)
	if err != nil {
		return shopifyMonitorTuple{}, err
	}
	sort.Slice(activities, func(i, j int) bool {
		left := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(activities[i].UpdatedAt), ProviderID: strings.TrimSpace(activities[i].ID)}
		right := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(activities[j].UpdatedAt), ProviderID: strings.TrimSpace(activities[j].ID)}
		return left.less(right)
	})

	latest := shopifyMonitorTuple{}
	for _, activity := range activities {
		tuple := shopifyMonitorTuple{CursorAt: parseShopifyUpdatedAt(activity.UpdatedAt), ProviderID: strings.TrimSpace(activity.ID)}
		if !tuple.After(cursor) {
			continue
		}
		latest = maxShopifyMonitorTuple(latest, tuple)
		if record := buildMarketingRecord(state, activity, sourceRequest); record.Operation != "" {
			emit(record)
		}
	}

	return latest, nil
}

func resolveShopifyAdapterStateDir() (string, error) {
	if raw := strings.TrimSpace(os.Getenv(shopifyAdapterStateDirEnv)); raw != "" {
		return raw, nil
	}
	return "", errors.New("missing adapter state dir (expected $NEXUS_ADAPTER_STATE_DIR)")
}

func loadShopifyMonitorState(connectionID string) (*shopifyMonitorState, error) {
	stateDir, err := resolveShopifyAdapterStateDir()
	if err != nil {
		return nil, err
	}

	path := shopifyMonitorStatePath(stateDir, connectionID)
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultShopifyMonitorState(), nil
		}
		return nil, err
	}

	state := defaultShopifyMonitorState()
	if err := json.Unmarshal(raw, state); err != nil {
		return defaultShopifyMonitorState(), nil
	}
	if state.Families == nil {
		state.Families = map[shopifyMonitorFamily]*shopifyFamilyState{}
	}
	if state.Metrics == nil {
		state.Metrics = map[shopifyMonitorFamily]*shopifyFamilyStats{}
	}
	return state, nil
}

func saveShopifyMonitorState(connectionID string, state *shopifyMonitorState) error {
	stateDir, err := resolveShopifyAdapterStateDir()
	if err != nil {
		return err
	}

	path := shopifyMonitorStatePath(stateDir, connectionID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func defaultShopifyMonitorState() *shopifyMonitorState {
	return &shopifyMonitorState{
		Version:  shopifyMonitorStateVersion,
		Families: map[shopifyMonitorFamily]*shopifyFamilyState{},
		Metrics:  map[shopifyMonitorFamily]*shopifyFamilyStats{},
	}
}

func shopifyMonitorStatePath(stateDir string, connectionID string) string {
	return filepath.Join(stateDir, "shopify", connectionID, "monitor-state.json")
}

func (state *shopifyMonitorState) family(name shopifyMonitorFamily) *shopifyFamilyState {
	if state.Families == nil {
		state.Families = map[shopifyMonitorFamily]*shopifyFamilyState{}
	}
	if familyState, ok := state.Families[name]; ok && familyState != nil {
		return familyState
	}
	familyState := &shopifyFamilyState{}
	state.Families[name] = familyState
	return familyState
}

func (state *shopifyMonitorState) metrics(name shopifyMonitorFamily) *shopifyFamilyStats {
	if state.Metrics == nil {
		state.Metrics = map[shopifyMonitorFamily]*shopifyFamilyStats{}
	}
	if metrics, ok := state.Metrics[name]; ok && metrics != nil {
		return metrics
	}
	metrics := &shopifyFamilyStats{}
	state.Metrics[name] = metrics
	return metrics
}

func (state *shopifyFamilyState) due(now time.Time, interval time.Duration) bool {
	if state.LastPollAt.IsZero() {
		return true
	}
	return !state.LastPollAt.Add(interval).After(now.UTC())
}

func (state *shopifyFamilyState) since(now time.Time, overlap time.Duration) time.Time {
	cursorAt := state.CursorAt
	if cursorAt.IsZero() {
		cursorAt = state.LastPollAt
	}
	if cursorAt.IsZero() {
		cursorAt = now.UTC()
	}
	since := cursorAt.Add(-overlap)
	if since.After(now.UTC()) {
		return now.UTC()
	}
	return since.UTC()
}

func (state *shopifyFamilyState) cursor() shopifyMonitorTuple {
	return shopifyMonitorTuple{
		CursorAt:   state.CursorAt.UTC(),
		ProviderID: strings.TrimSpace(state.CursorProviderID),
	}
}

func (state *shopifyFamilyState) advance(pollTime time.Time, latest shopifyMonitorTuple) {
	cursor := state.cursor()
	if latest.After(cursor) {
		cursor = latest
	}
	state.CursorAt = cursor.CursorAt
	state.CursorProviderID = cursor.ProviderID
	state.LastPollAt = pollTime.UTC()
}

func (tuple shopifyMonitorTuple) After(other shopifyMonitorTuple) bool {
	left := tuple.normalized()
	right := other.normalized()
	if left.CursorAt.After(right.CursorAt) {
		return true
	}
	if left.CursorAt.Before(right.CursorAt) {
		return false
	}
	return strings.Compare(left.ProviderID, right.ProviderID) > 0
}

func (tuple shopifyMonitorTuple) less(other shopifyMonitorTuple) bool {
	left := tuple.normalized()
	right := other.normalized()
	if left.CursorAt.Before(right.CursorAt) {
		return true
	}
	if left.CursorAt.After(right.CursorAt) {
		return false
	}
	return strings.Compare(left.ProviderID, right.ProviderID) < 0
}

func (tuple shopifyMonitorTuple) normalized() shopifyMonitorTuple {
	return shopifyMonitorTuple{
		CursorAt:   tuple.CursorAt.UTC(),
		ProviderID: strings.TrimSpace(tuple.ProviderID),
	}
}

func maxShopifyMonitorTuple(left shopifyMonitorTuple, right shopifyMonitorTuple) shopifyMonitorTuple {
	if right.After(left) {
		return right
	}
	return left
}

type shopifyMonitorEmitter struct {
	state    *shopifyMonitorState
	store    *shopifyRevisionStore
	pollTime time.Time
	emit     nexadapter.EmitFunc
	err      error
	changed  bool
}

func newShopifyMonitorEmitter(state *shopifyMonitorState, store *shopifyRevisionStore, pollTime time.Time, emit nexadapter.EmitFunc) *shopifyMonitorEmitter {
	return &shopifyMonitorEmitter{
		state:    state,
		store:    store,
		pollTime: pollTime.UTC(),
		emit:     emit,
	}
}

func (e *shopifyMonitorEmitter) Emit(record any) {
	if e.err != nil {
		return
	}

	inbound, ok := record.(nexadapter.AdapterInboundRecord)
	if !ok {
		e.emit(record)
		return
	}

	family, logicalRowID, revisionHash := shopifyMonitorRecordKeys(inbound)
	if family == "" || logicalRowID == "" || revisionHash == "" {
		e.emit(inbound)
		return
	}

	metrics := e.state.metrics(family)
	metrics.beginCycle(e.pollTime)
	metrics.LastAttempted++
	metrics.TotalAttempted++

	duplicate, err := e.store.IsDuplicateRevision(family, logicalRowID, revisionHash)
	if err != nil {
		e.err = err
		return
	}
	if duplicate {
		metrics.LastSuppressed++
		metrics.TotalSuppressed++
		e.changed = true
		return
	}

	e.emit(inbound)
	if err := e.store.PutRevision(family, logicalRowID, revisionHash); err != nil {
		e.err = err
		return
	}
	metrics.LastEmitted++
	metrics.TotalEmitted++
	e.changed = true
}

func (e *shopifyMonitorEmitter) Err() error {
	return e.err
}

func (e *shopifyMonitorEmitter) StateChanged() bool {
	return e.changed
}

func logShopifyMonitorMetrics(state *shopifyMonitorState, pollTime time.Time) {
	if state == nil {
		return
	}
	families := make([]string, 0, len(state.Metrics))
	for family, metrics := range state.Metrics {
		if metrics == nil || !metrics.LastCycleAt.Equal(pollTime.UTC()) || metrics.LastAttempted == 0 {
			continue
		}
		families = append(families, string(family))
	}
	sort.Strings(families)
	for _, familyName := range families {
		metrics := state.metrics(shopifyMonitorFamily(familyName))
		nexadapter.LogInfo("shopify monitor metrics family=%s attempted=%d emitted=%d suppressed=%d", familyName, metrics.LastAttempted, metrics.LastEmitted, metrics.LastSuppressed)
	}
}

func shopifyMonitorRecordKeys(record nexadapter.AdapterInboundRecord) (shopifyMonitorFamily, string, string) {
	metadata := record.Payload.Metadata
	if metadata == nil {
		return "", "", ""
	}
	family := shopifyMonitorFamily(metadataString(metadata, "family"))
	logicalRowID := metadataString(metadata, "logical_row_id")
	revisionHash := metadataString(metadata, "revision_hash")
	return family, logicalRowID, revisionHash
}

func metadataString(metadata map[string]any, key string) string {
	if metadata == nil {
		return ""
	}
	raw, ok := metadata[key]
	if !ok || raw == nil {
		return ""
	}
	switch typed := raw.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(raw))
	}
}

func (state *shopifyFamilyStats) beginCycle(pollTime time.Time) {
	if state == nil {
		return
	}
	if state.LastCycleAt.Equal(pollTime.UTC()) {
		return
	}
	state.LastCycleAt = pollTime.UTC()
	state.LastAttempted = 0
	state.LastEmitted = 0
	state.LastSuppressed = 0
}
