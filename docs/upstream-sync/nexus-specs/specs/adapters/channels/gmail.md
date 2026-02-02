# Gmail/Email Adapter

**Status:** Partial (Hooks Only)  
**Nexus Tool:** `gog` (Gmail CLI via Google OAuth)  
**Upstream:** `src/hooks/gmail.ts` (hooks only, no full adapter)

---

## Implementation Status

### Upstream (OpenClaw)
⚠️ **Hooks only** — No full adapter implementation exists upstream.
- `src/hooks/gmail.ts` — Gmail hook for event triggers
- No inbound monitor
- No outbound send functions
- No channel plugin

### Nexus
✅ **Full capability via `gog` tool**
- Gmail CLI with full Gmail API access
- Read, search, send, reply, draft, label management
- See: `nexus skill use gog`

---

## Capabilities

```typescript
const GMAIL_CAPABILITIES: ChannelCapabilities = {
  text_limit: null,               // No practical limit
  supports_markdown: false,       // HTML or plain text
  markdown_flavor: null,
  supports_embeds: false,
  supports_threads: true,         // Email threads
  supports_reactions: false,
  supports_polls: false,
  supports_buttons: false,
  supports_ptt: false,
  supports_html: true,            // Email supports HTML
  supports_attachments: true,
};
```

---

## Formatting Rules

### Email Formats
- **Plain text:** Simple text body
- **HTML:** Rich formatting, images, links
- No markdown rendering — convert to HTML first

### Subject Line
- Keep under 100 chars for full visibility
- Thread replies should preserve `Re: ` prefix

### Threading
- Gmail threads by `threadId`
- Reply to thread: include original `Message-ID` in `In-Reply-To` header
- Same subject line maintains thread

---

## Nexus Integration (gog tool)

### Reading Email
```bash
# Search unread
gog gmail search "is:unread"

# Read specific message
gog gmail read <message-id>

# List recent
gog gmail list --max-results 10
```

### Sending Email
```bash
# Send new email
gog gmail send --to "user@example.com" --subject "Hello" --body "Message body"

# Reply to thread
gog gmail reply <message-id> --body "Reply text"

# Send with attachment
gog gmail send --to "user@example.com" --subject "Files" --body "See attached" --attach file.pdf
```

### Draft Management
```bash
# Create draft
gog gmail draft create --to "user@example.com" --subject "Draft" --body "..."

# List drafts
gog gmail draft list

# Send draft
gog gmail draft send <draft-id>
```

### Labels
```bash
# List labels
gog gmail labels

# Add label
gog gmail label add <message-id> "IMPORTANT"

# Remove label
gog gmail label remove <message-id> "INBOX"
```

---

## Inbound (Proposed)

### Event Fields
```typescript
{
  channel: 'gmail',
  peer_kind: 'email',
  thread_id: message.threadId,
  metadata: {
    message_id: message.id,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    labels: message.labelIds,
  },
}
```

### Polling Strategy
Since Gmail uses polling (no webhooks in basic setup):
- Check inbox every N minutes via heartbeat
- Use `gog gmail search "is:unread after:YYYY/MM/DD"`
- Mark as read after processing

### Push Notifications (Advanced)
Gmail supports push via Pub/Sub (requires setup):
- Create Pub/Sub topic
- Set up watch on mailbox
- Receive notifications on new mail

---

## Outbound (Proposed)

### Send via gog
```typescript
// Using gog CLI
await exec('gog gmail send', {
  '--to': recipient,
  '--subject': subject,
  '--body': body,
  '--attach': attachmentPath,
});
```

### Direct API
```typescript
// Using Gmail API directly
const gmail = google.gmail({ version: 'v1', auth });
await gmail.users.messages.send({
  userId: 'me',
  requestBody: {
    raw: base64EncodedEmail,
    threadId: threadId,  // For replies
  },
});
```

---

## Media/Attachments

### Supported
- Any file type as attachment
- Images can be inline (HTML emails)
- Max attachment size: 25MB (Gmail limit)

### Sending Attachments
```bash
gog gmail send --to "..." --subject "..." --body "..." \
  --attach file1.pdf --attach file2.png
```

---

## Upstream Hook Details

### `src/hooks/gmail.ts`
The upstream hook provides:
- Event trigger on new email
- Basic metadata extraction
- No send capability

This is likely used for:
- Triggering workflows on incoming email
- Integration with other systems
- Not meant for full bidirectional messaging

---

## Porting Notes

### Current State
- Upstream: Hooks only, no adapter
- Nexus: Full capability via `gog` tool

### Recommended Approach
1. **Use `gog` directly** — Already works, full API access
2. **Wrap in skill** — Gmail skill for common patterns
3. **Add to channel system** — If unified channel interface needed

### Heartbeat Integration
```bash
# Check for important unread
gog gmail search "is:unread is:important"

# Check for recent from specific sender
gog gmail search "is:unread from:boss@company.com"
```

### Key Considerations
- Email is async (not real-time like chat)
- Threading works differently (subject-based)
- HTML formatting vs plain text
- Attachments are common
- Rate limits apply (Gmail API quotas)

---

## Related
- `../upstream-reference/CHANNEL_INVENTORY.md` — Upstream status
- `../ADAPTER_INTERFACES.md` — Interface definitions
- `nexus skill use gog` — Full gog tool guide
