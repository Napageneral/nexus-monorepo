package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) insertCompaction(compaction CompactionWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(compaction.TurnID) == "" {
		return fmt.Errorf("compaction turn id is required")
	}
	if strings.TrimSpace(compaction.Summary) == "" {
		return fmt.Errorf("compaction summary is required")
	}
	if strings.TrimSpace(compaction.SummarizedThroughTurnID) == "" {
		return fmt.Errorf("summarized_through_turn_id is required")
	}
	if strings.TrimSpace(compaction.CompactionType) == "" {
		compaction.CompactionType = "summary"
	}
	if strings.TrimSpace(compaction.Model) == "" {
		return fmt.Errorf("compaction model is required")
	}
	scope := normalizeLedgerScope(LedgerScope{
		ScopeKey:      compaction.ScopeKey,
		RefName:       compaction.RefName,
		CommitSHA:     compaction.CommitSHA,
		TreeFlavor:    compaction.TreeFlavor,
		TreeVersionID: compaction.TreeVersionID,
	}, b.defaultLedgerScope())
	if turnScope, err := b.turnScope(compaction.TurnID); err == nil {
		scope = normalizeLedgerScope(scope, turnScope)
	}

	_, err := db.Exec(`
		INSERT INTO compactions (
			turn_id, summary, summarized_through_turn_id, first_kept_turn_id, turns_summarized,
			compaction_type, model, provider, tokens_before, tokens_after, summary_tokens,
			summarization_input_tokens, summarization_output_tokens, duration_ms, trigger, metadata_json,
			scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		compaction.TurnID,
		compaction.Summary,
		compaction.SummarizedThroughTurnID,
		nullIfBlank(compaction.FirstKeptTurnID),
		nullIntPtr(compaction.TurnsSummarized),
		compaction.CompactionType,
		compaction.Model,
		nullIfBlank(compaction.Provider),
		nullIntPtr(compaction.TokensBefore),
		nullIntPtr(compaction.TokensAfter),
		nullIntPtr(compaction.SummaryTokens),
		nullIntPtr(compaction.SummarizationInputTokens),
		nullIntPtr(compaction.SummarizationOutputTokens),
		nullIntPtr(compaction.DurationMS),
		nullIfBlank(compaction.Trigger),
		nullIfBlank(compaction.MetadataJSON),
		scope.ScopeKey,
		scope.RefName,
		scope.CommitSHA,
		scope.TreeFlavor,
		scope.TreeVersionID,
	)
	return err
}

func (b *Broker) getCompaction(turnID string) (*LedgerCompaction, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}
	turnID = strings.TrimSpace(turnID)
	if turnID == "" {
		return nil, fmt.Errorf("turn id is required")
	}

	row := db.QueryRow(`
		SELECT turn_id, summary, summarized_through_turn_id, first_kept_turn_id, turns_summarized,
		       compaction_type, model, provider, tokens_before, tokens_after, summary_tokens,
		       summarization_input_tokens, summarization_output_tokens, duration_ms, trigger, metadata_json,
		       scope_key, ref_name, commit_sha, tree_flavor, tree_version_id
		FROM compactions
		WHERE turn_id = ?
	`, turnID)

	var (
		out                       LedgerCompaction
		firstKept                 sql.NullString
		turnsSummarized           sql.NullInt64
		provider                  sql.NullString
		tokensBefore              sql.NullInt64
		tokensAfter               sql.NullInt64
		summaryTokens             sql.NullInt64
		summarizationInputTokens  sql.NullInt64
		summarizationOutputTokens sql.NullInt64
		durationMS                sql.NullInt64
		trigger                   sql.NullString
		metadataJSON              sql.NullString
		scopeKey                  string
		refName                   string
		commitSHA                 string
		treeFlavor                string
		treeVersionID             string
	)
	if err := row.Scan(
		&out.TurnID,
		&out.Summary,
		&out.SummarizedThroughTurnID,
		&firstKept,
		&turnsSummarized,
		&out.CompactionType,
		&out.Model,
		&provider,
		&tokensBefore,
		&tokensAfter,
		&summaryTokens,
		&summarizationInputTokens,
		&summarizationOutputTokens,
		&durationMS,
		&trigger,
		&metadataJSON,
		&scopeKey,
		&refName,
		&commitSHA,
		&treeFlavor,
		&treeVersionID,
	); err != nil {
		return nil, err
	}
	out.FirstKeptTurnID = nullString(firstKept)
	out.Provider = nullString(provider)
	out.Trigger = nullString(trigger)
	out.MetadataJSON = nullString(metadataJSON)
	out.TurnsSummarized = intPtrFromNull(turnsSummarized)
	out.TokensBefore = intPtrFromNull(tokensBefore)
	out.TokensAfter = intPtrFromNull(tokensAfter)
	out.SummaryTokens = intPtrFromNull(summaryTokens)
	out.SummarizationInputTokens = intPtrFromNull(summarizationInputTokens)
	out.SummarizationOutputTokens = intPtrFromNull(summarizationOutputTokens)
	out.DurationMS = intPtrFromNull(durationMS)
	out.ScopeKey = strings.TrimSpace(scopeKey)
	out.RefName = strings.TrimSpace(refName)
	out.CommitSHA = strings.TrimSpace(commitSHA)
	out.TreeFlavor = strings.TrimSpace(treeFlavor)
	out.TreeVersionID = strings.TrimSpace(treeVersionID)
	return &out, nil
}

func intPtrFromNull(v sql.NullInt64) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int64)
	return &n
}
