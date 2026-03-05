package broker

// UpsertSessionImport stores or updates a session import mapping row.
func (b *Broker) UpsertSessionImport(input SessionImportWrite) error {
	return b.upsertSessionImport(input)
}

// GetSessionImportBySource resolves a prior import mapping by source triple.
func (b *Broker) GetSessionImportBySource(source string, sourceProvider string, sourceSessionID string) (*SessionImport, error) {
	return b.getSessionImportBySource(source, sourceProvider, sourceSessionID)
}

// UpsertSessionImportRequest stores or updates a session import idempotency request row.
func (b *Broker) UpsertSessionImportRequest(input SessionImportRequestWrite) error {
	return b.upsertSessionImportRequest(input)
}

// GetSessionImportRequestByIdempotencyKey looks up an import request by idempotency key.
func (b *Broker) GetSessionImportRequestByIdempotencyKey(idempotencyKey string) (*SessionImportRequest, error) {
	return b.getSessionImportRequestByIdempotencyKey(idempotencyKey)
}

// UpsertSessionImportChunkPart stores or updates one import chunk part row.
func (b *Broker) UpsertSessionImportChunkPart(input SessionImportChunkPartWrite) error {
	return b.upsertSessionImportChunkPart(input)
}

// GetSessionImportChunkMeta returns first chunk metadata for an upload.
func (b *Broker) GetSessionImportChunkMeta(source string, uploadID string) (*SessionImportChunkPart, error) {
	return b.getSessionImportChunkMeta(source, uploadID)
}

// CountSessionImportChunkParts returns the number of stored chunks for a source/upload pair.
func (b *Broker) CountSessionImportChunkParts(source string, uploadID string) (int, error) {
	return b.countSessionImportChunkParts(source, uploadID)
}

// ListSessionImportChunkParts lists chunk rows for a source/upload pair.
func (b *Broker) ListSessionImportChunkParts(source string, uploadID string) ([]*SessionImportChunkPart, error) {
	return b.listSessionImportChunkParts(source, uploadID)
}

// PruneSessionImportChunkParts deletes old chunk rows before the provided timestamp.
func (b *Broker) PruneSessionImportChunkParts(olderThanMs int64) error {
	return b.pruneSessionImportChunkParts(olderThanMs)
}
