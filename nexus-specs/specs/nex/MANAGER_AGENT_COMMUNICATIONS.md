# Manager Agent Communications Responsibility

**Status:** DESIGN (captured from API design discussion)
**Last Updated:** 2026-03-04

---

## Overview

When agents send messages on behalf of users through channels, critical decisions must be made about identity, authorization, and preference. This document captures the Manager Agent's (MA) responsibility for handling these communication decisions.

**Core tension:** An agent can send a message on a channel, but *whose identity* does it send as? The answer depends on channel type, account ownership, and user preferences — and the MA is responsible for navigating this.

---

## The Communication Chain

```
User Request: "Send Casey a text message"

1. CONTACT RESOLUTION
   contacts.search("Casey") → Contact record(s)
   Contact has channels: iMessage (Tyler↔Casey), Discord DM (Bot↔Casey)

2. CHANNEL SELECTION
   MA picks appropriate channel based on:
   - User preference ("text message" → iMessage)
   - Channel availability (is adapter connected?)
   - Context (urgency, formality, content type)

3. IDENTITY DECISION
   WHO sends the message?
   - Agent sends AS the user (using user's account)
   - Agent sends AS itself (using bot/agent account)
   - Agent cannot send (no account on this channel)

4. DELIVERY
   channels.send(channel_id, message, { sender_account: ... })
```

---

## Identity Scenarios

### Scenario 1: Agent Sends As User

The agent uses the human user's adapter account. The recipient sees the message as coming from the user.

**When:** Personal communications (text messages, personal email), channels where the agent has no separate identity.

**Example:** "Send Casey a text" → Agent uses Tyler's iMessage account → Casey sees a message from Tyler.

**Requirement:** Agent must have permission to use the user's account on this channel.

### Scenario 2: Agent Sends As Itself

The agent has its own adapter account (e.g., a Discord bot, a dedicated email address). The recipient knows they're talking to an AI agent.

**When:** Business communications, support channels, contexts where AI transparency matters.

**Example:** "Reply to the support ticket" → Agent uses its own email account → Customer sees a reply from "Atlas (AI Assistant)".

**Requirement:** Agent must have its own configured account on the relevant adapter.

### Scenario 3: Agent Cannot Send

The agent has no account (personal or delegated) on the requested channel.

**When:** User requests communication on a channel where neither the agent nor the user has access.

**Response:** MA should explain the limitation and suggest alternatives.

---

## Manager Agent Responsibilities

### 1. Clarify Sender Identity

When a user first requests the agent send a message through a channel, the MA must clarify:

> "Should I send this as you (from your account) or as myself (from the bot account)?"

If the agent doesn't have its own account on that channel, the MA should note:

> "I don't have my own account on iMessage. I can send this from your account — Casey will see it as coming from you. Is that what you want?"

### 2. Record Preferences

After the user clarifies, the MA records the preference for future use:

```
Channel Preferences:
- iMessage: Send as Tyler (user's account)
- Discord DMs: Send as Atlas (bot account)
- Email (personal): Send as Tyler
- Email (support): Send as Atlas
- Slack (workspace): Send as Atlas bot
```

These preferences are stored in the MA's workspace (e.g., `PREFERENCES.md` or a structured data file) and applied automatically going forward.

### 3. Apply Preferences Automatically

On subsequent requests, the MA applies stored preferences without asking:

> User: "Tell Casey I'll be late"
> MA: (knows iMessage → send as Tyler) → channels.send(...)

### 4. Handle Edge Cases

**New channel type:** If a user requests communication through a channel where no preference exists, ask before sending.

**Ambiguous recipient:** If Casey has multiple channels, the MA should either:
- Apply a default preference for that contact
- Ask which channel to use
- Choose based on context (urgent → phone/text, casual → Discord)

**Delegated sending ethics:** The MA should never misrepresent the agent's identity. If sending as the user, the content should reflect what the user would actually say. The MA may note in its own records that it sent the message on behalf of the user.

---

## Channel Authorization Model

The channel itself tracks which accounts can send through it:

```
Channel: "Tyler↔Casey iMessage"
  adapter: imessage
  accounts:
    - tyler (owner)    → can send
    - atlas (agent)    → NOT configured (no iMessage account)

Channel: "Support Discord"
  adapter: discord
  accounts:
    - atlas-bot (agent) → can send
    - tyler (owner)     → can send
```

When the MA calls `channels.send`, it must specify which account to send from. The channel validates that the account is authorized.

---

## Integration with ACL

Channel send permissions flow through the standard ACL pipeline:

1. **Agent identity** → entity with `is_agent: true`
2. **Policy match** → does the agent's policy allow `channels.send` on this channel?
3. **Credential access** → does the policy grant access to the credential backing this account?
4. **Execution** → adapter sends the message

The MA itself needs broad `channels.send` permission. Restrictions come from:
- Which credentials/accounts the agent can access (policy-gated)
- User preferences (soft constraint, MA-enforced)
- Channel configuration (which accounts are registered)

---

## Future Considerations

- **Message drafts:** MA could draft messages for user review before sending
- **Tone adaptation:** MA adjusts communication style based on channel (formal email vs casual Discord)
- **Read receipts:** MA tracks delivery status and reports back
- **Group channels:** Additional complexity around who the agent represents in group settings
- **Multi-agent coordination:** Multiple agents with different communication responsibilities
