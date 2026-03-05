package broker

import "strings"

// LedgerScope identifies runtime scope metadata for ledger rows.
type LedgerScope struct {
	ScopeKey      string
	RefName       string
	CommitSHA     string
	TreeFlavor    string
	TreeVersionID string
}

func (s LedgerScope) normalized() LedgerScope {
	return LedgerScope{
		ScopeKey:      strings.TrimSpace(s.ScopeKey),
		RefName:       strings.TrimSpace(s.RefName),
		CommitSHA:     strings.TrimSpace(s.CommitSHA),
		TreeFlavor:    strings.TrimSpace(s.TreeFlavor),
		TreeVersionID: strings.TrimSpace(s.TreeVersionID),
	}
}

func normalizeLedgerScope(scope LedgerScope, fallback LedgerScope) LedgerScope {
	scope = scope.normalized()
	fallback = fallback.normalized()
	if scope.ScopeKey == "" {
		scope.ScopeKey = fallback.ScopeKey
	}
	if scope.RefName == "" {
		scope.RefName = fallback.RefName
	}
	if scope.CommitSHA == "" {
		scope.CommitSHA = fallback.CommitSHA
	}
	if scope.TreeFlavor == "" {
		scope.TreeFlavor = fallback.TreeFlavor
	}
	if scope.TreeVersionID == "" {
		scope.TreeVersionID = fallback.TreeVersionID
	}
	return scope
}
