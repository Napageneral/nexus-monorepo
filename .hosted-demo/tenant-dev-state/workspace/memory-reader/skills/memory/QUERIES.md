# Memory Query Patterns

Use the right database for each query:
- `memory.db`: facts/observations/analysis store (path from `DB_MEMORY_PATH`, `DB_PATH` alias).
- `embeddings.db`: embedding + vector index (`DB_EMBEDDINGS_PATH`).
- `identity.db`: entities + contacts directory (`$NEXUS_STATE_DIR/data/identity.db`).
- `events.db`: event ledger (`$NEXUS_STATE_DIR/data/events.db`).
- `agents.db`: agent session ledger (`$NEXUS_STATE_DIR/data/agents.db`).
