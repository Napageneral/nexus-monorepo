/**
 * Hook System Type Definitions
 * 
 * These types define the interface between ACL, hooks, and the broker.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL: Resolved by ACL, passed to hooks
// ─────────────────────────────────────────────────────────────────────────────

export type PrincipalType = 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent';

export interface Principal {
  type: PrincipalType;
  entity_id?: string;           // From entities table (if resolved)
  name?: string;                // "Mom", "Casey", etc.
  relationship?: string;        // "family", "partner", "work", "friend"
  source?: string;              // For webhooks: "stripe", "github", etc.
  agent_id?: string;            // For agent principals
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSIONS: Resolved by ACL, passed to hooks
// ─────────────────────────────────────────────────────────────────────────────

export interface Permissions {
  tools: string[];              // ["*"] or ["email:read", "calendar:read"]
  credentials: string[];        // ["gmail", "calendar"] or ["*"]
  data_access: 'none' | 'minimal' | 'contextual' | 'full';
  personas: string[];           // Which personas can be invoked
  rate_limit?: number;          // Messages per hour
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION: Resolved by ACL, passed to hooks
// ─────────────────────────────────────────────────────────────────────────────

export interface Session {
  session_key: string;          // e.g., "atlas:dm:casey", "atlas:group:discord:12345"
  persona: string;              // Which persona handles this session
  thread_id?: string;           // If continuing a specific thread
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK TRIGGERS: Declarative conditions for when hook is invoked
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerConditions {
  // Match against ACL-resolved principal
  principal?: {
    type?: PrincipalType | PrincipalType[];
    name?: string;              // Exact match on principal.name
    relationship?: string;      // Match on relationship
    entity_id?: string;         // Match specific entity
    source?: string;            // For webhooks: match source
  };
  
  // Match against event properties
  event?: {
    channels?: string[];        // ["imessage", "sms", "email"]
    types?: string[];           // ["timer_tick", "message"]
    direction?: 'sent' | 'received';
    metadata?: Record<string, any>;  // Match event.metadata fields
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK CONTEXT: What the handler receives
// ─────────────────────────────────────────────────────────────────────────────

export interface MnemonicEvent {
  id: string;                   // "{adapter}:{source_id}"
  timestamp: number;            // Unix ms
  channel: string;              // "imessage", "gmail", "discord", etc.
  content: string;              // Message content
  direction: 'sent' | 'received';
  thread_id?: string;
  sender_id?: string;
  metadata?: Record<string, any>;
  source_adapter: string;
}

export interface HookMetadata {
  id: string;
  name: string;
  created_at: number;
  last_triggered?: number;
  config: Record<string, any>;  // Hook-specific configuration
}

export interface HookContext {
  // The event being evaluated
  event: MnemonicEvent;
  
  // ACL-resolved identity and permissions (NEW - from ACL layer)
  principal: Principal;
  permissions: Permissions;
  session: Session;
  
  // Database access
  dbPath: string;               // Path to Mnemonic SQLite database
  
  // Semantic search (embeddings handled internally)
  search(query: string, opts?: {
    channels?: string[];
    since?: number;
    limit?: number;
  }): Promise<{ eventId: string; score: number }[]>;
  
  // LLM call (always gemini-3-flash-preview)
  llm(prompt: string, opts?: { json?: boolean }): Promise<string>;
  
  // Current time
  now: Date;
  
  // This hook's metadata
  hook: HookMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK RESULT: What the handler returns
// ─────────────────────────────────────────────────────────────────────────────

export interface HookResult {
  // Required: should this trigger an agent?
  fire: boolean;
  
  // Which agent to invoke (optional - defaults to session's persona)
  agent?: string;
  
  // Context to pass to the agent
  context?: {
    prompt?: string;            // Custom instruction for the agent
    extracted?: any;            // Data to pass to agent
    include_thread?: boolean;   // Include conversation history
  };
  
  // Self-disable after this run (for one-shot hooks)
  disable_hook?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK DEFINITION: The complete hook structure
// ─────────────────────────────────────────────────────────────────────────────

export interface Hook {
  name: string;
  description: string;
  mode: 'persistent' | 'one-shot';
  
  // Declarative triggers - checked by hook system BEFORE invoking handler
  triggers: TriggerConditions;
  
  // Optional configuration (set when hook is created/updated)
  config?: Record<string, any>;
  
  // The handler function - only called if triggers match
  handler: (ctx: HookContext) => Promise<HookResult>;
}
