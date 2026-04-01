CREATE TABLE IF NOT EXISTS message_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_message_guid TEXT NOT NULL,
    update_type TEXT NOT NULL,
    content TEXT,
    timestamp TIMESTAMP NOT NULL,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER,
    is_from_me BOOLEAN DEFAULT 0,
    guid TEXT UNIQUE NOT NULL,
    FOREIGN KEY (original_message_guid) REFERENCES messages(guid),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_message_updates_original_guid ON message_updates(original_message_guid);
CREATE INDEX IF NOT EXISTS idx_message_updates_timestamp ON message_updates(timestamp);
CREATE INDEX IF NOT EXISTS idx_message_updates_chat_id ON message_updates(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_updates_guid ON message_updates(guid);
