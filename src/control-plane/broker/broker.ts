/**
 * Active Message Broker - Agent Lifecycle Manager
 *
 * The broker is responsible for:
 * - Receiving messages for agents
 * - Starting agents when they have work
 * - Restarting agents when new work arrives
 * - Interrupting agents if needed
 * - Managing agent lifecycle
 *
 * Agents are pure workers - they don't check queues or manage themselves.
 *
 * Ported from magic-toolbox and adapted for Nexus:
 * - Uses Nexus session storage (sessions.json + transcript JSONL) instead of SQLite
 * - Uses Nexus logging system (createSubsystemLogger)
 * - Removed instance manager (sharding not yet supported)
 * - Simplified for single ODU initially
 */

import crypto from "node:crypto";
import type { NexusConfig } from "../../config/config.js";
import {
  loadSession,
  type SessionEntry,
  writeSessionMetadata,
} from "../../config/sessions.js";
import { createSubsystemLogger } from "../../logging.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
} from "../../routing/session-key.js";

// Infer the SubsystemLogger type from the function return type
type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

/**
 * Message envelope for all agent-to-agent communication
 */
export interface AgentMessage {
  id: string;
  from: string; // Agent ID or 'user' or 'system' (use this for responses)
  to: string; // Agent ID
  content: string; // The actual message/task
  priority: "low" | "normal" | "high" | "urgent";
  deliveryMode?:
    | "batch"
    | "single"
    | "interrupt"
    | "steer"
    | "followup"
    | "collect";
  timestamp: number;
  conversationId?: string;
  metadata?: {
    source?: "user" | "ia" | "ea" | "tool" | "cross-odu";
    taskName?: string;
    [key: string]: unknown;
  };
}

/**
 * Agent session status (tracked in memory only)
 */
export type SessionStatus = "active" | "idle";

/**
 * Tracking info for running agents
 */
export interface RunningAgent {
  agentId: string;
  instance: unknown; // ExecutionAgent or InteractionAgent instance
  promise: Promise<string>;
  startedAt: number;
  status: SessionStatus; // Current execution status
}

/**
 * Agent factory function type
 * Each ODU provides a factory that creates agents in its context
 */
export type AgentFactory = (
  agentId: string,
  taskDescription: string,
  history: unknown[],
) => unknown;

/**
 * Session history entry (from Nexus transcript JSONL)
 */
interface SessionHistoryEntry {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: number;
  [key: string]: unknown;
}

type BrokerEventCallback = (...args: unknown[]) => void;

/**
 * Active Message Broker - manages agent lifecycle
 */
export class ActiveMessageBroker {
  // Message queues per agent
  private queues: Map<string, AgentMessage[]> = new Map();

  // Currently running agents
  private runningAgents: Map<string, RunningAgent> = new Map();

  // Agents currently being started (to prevent race conditions)
  private startingAgents: Set<string> = new Set();

  // Session status tracking (in-memory only, resets on server restart)
  private agentStatus: Map<string, SessionStatus> = new Map();

  // Registered IAs (always-on singletons)
  private registeredIAs: Map<string, unknown> = new Map();

  // Track external callers per agent (who has sent messages to this agent)
  // Format: agentId -> Set<senderAgentId>
  private externalCallers: Map<string, Set<string>> = new Map();

  // Delivery mode per agent (programmatic override)
  private deliveryModes: Map<string, "batch" | "single"> = new Map();

  // Agent factories per ODU (registered by each ODU)
  private agentFactories: Map<string, AgentFactory> = new Map();

  // Session store paths per ODU
  private sessionStorePaths: Map<string, string> = new Map();

  // Completion callbacks for async waiting
  private completionCallbacks: Map<
    string,
    ((result: { success: boolean; error?: string }) => void)[]
  > = new Map();

  // Collection support for 'collect' mode
  private collectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private collectionBuffers: Map<string, AgentMessage[]> = new Map();
  private collectDebounceMs = 500; // Default debounce delay
  private collectMaxMessages = 10; // Default max messages before auto-flush

  // Logger
  private logger: SubsystemLogger;
  private config?: NexusConfig;

  constructor(config?: NexusConfig) {
    this.logger = createSubsystemLogger("broker");
    this.config = config;
  }

  /**
   * Register an ODU with the broker
   * Each ODU registers its agent factory and session store path
   */
  registerODU(
    oduName: string,
    sessionStorePath: string,
    agentFactory: AgentFactory,
  ): void {
    this.sessionStorePaths.set(oduName, sessionStorePath);
    this.agentFactories.set(oduName, agentFactory);
    this.logger.info(`ODU registered: ${oduName}`, {
      oduName,
      sessionStorePath,
    });
  }

  /**
   * Register an IA with the broker
   * IAs are singleton, always-on agents that can receive messages
   */
  registerIA(iaId: string, instance: unknown): void {
    this.registeredIAs.set(iaId, instance);
    this.logger.info(`IA registered: ${iaId}`, { iaId });
  }

  /**
   * Set delivery mode for an agent (programmatic only, for tests)
   */
  setDeliveryMode(agentId: string, mode: "batch" | "single"): void {
    this.deliveryModes.set(agentId, mode);
    this.logger.debug(`Delivery mode set for ${agentId}: ${mode}`, {
      agentId,
      mode,
    });
  }

  /**
   * Set collection parameters (for 'collect' mode)
   */
  setCollectionParams(debounceMs?: number, maxMessages?: number): void {
    if (debounceMs !== undefined) this.collectDebounceMs = debounceMs;
    if (maxMessages !== undefined) this.collectMaxMessages = maxMessages;
    this.logger.debug("Collection params updated", {
      debounceMs: this.collectDebounceMs,
      maxMessages: this.collectMaxMessages,
    });
  }

  /**
   * Handle collect mode: buffer messages and debounce delivery
   */
  private handleCollectMode(message: AgentMessage): void {
    const agentId = message.to;

    // Add to collection buffer
    if (!this.collectionBuffers.has(agentId)) {
      this.collectionBuffers.set(agentId, []);
    }
    this.collectionBuffers.get(agentId)?.push(message);

    // Clear existing timer
    const existingTimer = this.collectionTimers.get(agentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Check if we've hit max messages
    const buffer = this.collectionBuffers.get(agentId);
    if (!buffer) return;
    if (buffer.length >= this.collectMaxMessages) {
      // Flush immediately
      this.flushCollectionBuffer(agentId);
      return;
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.flushCollectionBuffer(agentId);
    }, this.collectDebounceMs);

    this.collectionTimers.set(agentId, timer);
  }

  /**
   * Flush collection buffer to queue
   */
  private flushCollectionBuffer(agentId: string): void {
    const buffer = this.collectionBuffers.get(agentId);
    if (!buffer || buffer.length === 0) return;

    this.logger.debug(`Flushing collection buffer for ${agentId}`, {
      agentId,
      messageCount: buffer.length,
    });

    // Clear timer and buffer
    const timer = this.collectionTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.collectionTimers.delete(agentId);
    }
    this.collectionBuffers.delete(agentId);

    // Enqueue all buffered messages
    for (const message of buffer) {
      this.enqueue(message);
    }

    // Trigger agent execution if not running
    if (!this.runningAgents.has(agentId) && !this.registeredIAs.has(agentId)) {
      const queue = this.queues.get(agentId) || [];
      if (queue.length > 0) {
        void this.startAgentWithBatch(agentId, queue);
      }
    }
  }

  /**
   * Send message and wait for synchronous acknowledgment from IA
   * Used for cross-ODU calls where caller needs immediate confirmation
   *
   * @param message - The message to send
   * @returns Promise that resolves with acknowledgment string
   */
  async sendAndWaitForAck(message: AgentMessage): Promise<string> {
    this.logger.debug(
      `Sending with ack wait: ${message.from} → ${message.to}`,
      { message },
    );

    // Route message (resolve short names to full IDs)
    const resolvedTo = this.routeMessage(message.from, message.to);
    message.to = resolvedTo;

    // Validate target is an IA
    const ia = this.registeredIAs.get(message.to) as
      | {
          queueMessage?: (
            content: string,
            priority: string,
            from: string,
          ) => void;
          processQueue?: () => Promise<string>;
        }
      | undefined;
    if (!ia) {
      throw new Error(
        `Cannot wait for ack: ${message.to} is not a registered IA`,
      );
    }

    // Track external caller if needed
    if (
      message.from !== message.to &&
      message.from !== "user" &&
      message.from !== "system"
    ) {
      if (!this.externalCallers.has(message.to)) {
        this.externalCallers.set(message.to, new Set());
      }
      this.externalCallers.get(message.to)?.add(message.from);
    }

    // Add to queue for tracking
    this.enqueue(message);

    // Queue message at IA
    if (ia.queueMessage) {
      ia.queueMessage(
        message.content,
        message.priority || "normal",
        message.from,
      );
    }

    this.logger.debug(`Waiting for ack from ${message.to}...`, {
      to: message.to,
    });

    // Kick off processing and wait for acknowledgment
    let ack = "";
    if (ia.processQueue) {
      ack = await ia.processQueue();
    }

    this.logger.debug(`Received ack from ${message.to}`, {
      to: message.to,
      ackLength: ack.length,
    });

    return ack;
  }

  /**
   * Send a message to an agent
   *
   * The broker decides everything:
   * - Should we interrupt?
   * - Should we batch?
   * - Should we start the agent?
   */
  async send(message: AgentMessage): Promise<void> {
    this.logger.debug(`Message from ${message.from} to ${message.to}`, {
      from: message.from,
      to: message.to,
      priority: message.priority,
      contentPreview: message.content.substring(0, 100),
    });

    // Route message (resolve short names to full IDs)
    const resolvedTo = this.routeMessage(message.from, message.to);
    message.to = resolvedTo;

    this.logger.debug(`Routed to ${resolvedTo}`, { resolvedTo });

    // 1. Track external caller (if not self-message)
    if (
      message.from !== message.to &&
      message.from !== "user" &&
      message.from !== "system"
    ) {
      if (!this.externalCallers.has(message.to)) {
        this.externalCallers.set(message.to, new Set());
      }
      this.externalCallers.get(message.to)?.add(message.from);
    }

    // 2. Handle collect mode (buffer and debounce)
    if (message.deliveryMode === "collect") {
      this.handleCollectMode(message);
      return; // Don't enqueue immediately
    }

    // 3. Handle steer mode (interrupt like urgent)
    if (message.deliveryMode === "steer") {
      // Steer mode interrupts current work
      message.priority = "urgent";
      message.deliveryMode = "interrupt";
    }

    // 4. Handle followup mode (queue without interrupting)
    if (message.deliveryMode === "followup") {
      // Followup doesn't interrupt - just queues normally
      // No special handling needed, just enqueue
    }

    // 5. Add to queue
    this.enqueue(message);

    // 3. Decide what to do

    // Check if target is a registered IA
    const ia = this.registeredIAs.get(message.to) as
      | {
          queueMessage?: (
            content: string,
            priority: string,
            from: string,
          ) => void;
          processQueue?: () => Promise<void>;
          chatSync?: (msg: string) => Promise<void>;
        }
      | undefined;
    if (ia) {
      // IA is always running - queue message and trigger processing
      this.logger.debug(`Delivering to IA: ${message.to}`, {
        to: message.to,
        contentPreview: message.content.substring(0, 100),
      });

      // Queue the message with sender information
      if (ia.queueMessage) {
        ia.queueMessage(
          message.content,
          message.priority || "normal",
          message.from,
        );
      }

      // Trigger processing by calling processQueue() if it exists, otherwise use chatSync
      if (ia.processQueue) {
        this.logger.debug(`Calling processQueue() for ${message.to}`, {
          to: message.to,
        });
        ia.processQueue().catch((error: Error) => {
          this.logger.error(
            `IA ${message.to} processQueue error: ${error.message}`,
            { to: message.to, error: error.message },
          );
        });
      } else if (ia.chatSync) {
        // Fallback: Call chatSync with empty string
        this.logger.debug(`Calling chatSync('') for ${message.to} (fallback)`, {
          to: message.to,
        });
        setImmediate(() => {
          ia.chatSync?.("").catch((error: Error) => {
            this.logger.error(
              `IA ${message.to} chatSync error: ${error.message}`,
              { to: message.to, error: error.message },
            );
          });
        });
      }

      return;
    }

    // Target is an EA - handle normally
    const shouldInterrupt = this.shouldInterrupt(message);
    const running = this.runningAgents.get(message.to);

    if (shouldInterrupt && running) {
      // Interrupt and restart immediately
      this.logger.info(`Interrupting ${message.to} for urgent message`, {
        agentId: message.to,
      });
      await this.interruptAndRestart(message.to);
    } else if (!running && !this.startingAgents.has(message.to)) {
      // Agent not running and not being started - mark as starting and process
      this.startingAgents.add(message.to);
      this.logger.info(`Processing batch for ${message.to}`, {
        agentId: message.to,
      });

      try {
        await this.processNextBatch(message.to);
      } finally {
        this.startingAgents.delete(message.to);
      }
    } else {
      // Agent running or being started - let it finish
      this.logger.debug(
        `Message queued for ${message.to}, will process after current session`,
        { agentId: message.to },
      );
      // When it completes, broker will process next batch
    }
  }

  /**
   * Route message to correct agent
   * Resolves short names to fully-qualified agent IDs
   *
   * Rules:
   * 1. Fully-qualified name (e.g., "toolbox-ea-worktrees") → Route directly
   * 2. Short name (e.g., "worktrees") → Expand to caller's ODU EA
   */
  private routeMessage(from: string, to: string): string {
    // Rule 1: If fully-qualified, route directly
    if (this.isFullyQualified(to)) {
      // Validate agent exists or can be created
      if (!this.validateAgentExists(to)) {
        throw new Error(
          `Unknown agent: ${to}. Agent does not exist in session store or running agents.`,
        );
      }
      return to;
    }

    // Rule 2: Short name - expand to caller's ODU EA
    // Special case: 'user' and 'system' default to primary ODU
    let callerODU: string;
    if (from === "user" || from === "system") {
      // Get first registered ODU (primary)
      const odus = Array.from(this.agentFactories.keys());
      callerODU = odus[0] || "nexus";
    } else {
      callerODU = this.getODUName(from);
    }

    const expandedId = this.expandAgentName(callerODU, to);

    this.logger.debug(
      `Expanded "${to}" to "${expandedId}" for caller ${from}`,
      { from, to, expandedId },
    );

    return expandedId;
  }

  /**
   * Check if agent name is fully-qualified
   * Fully-qualified format: {oduName}-{ia|ea}-{identifier} OR {oduName}-ia
   * Examples: "toolbox-ea-worktrees", "meta-ia"
   */
  private isFullyQualified(name: string): boolean {
    const parts = name.split("-");

    // Must have at least 2 parts (oduName-ia) or 3+ parts (oduName-ea-identifier)
    if (parts.length < 2) {
      return false;
    }

    // Second part must be 'ia' or 'ea'
    const agentType = parts[1];
    return agentType === "ia" || agentType === "ea";
  }

  /**
   * Expand short agent name to fully-qualified ID
   * Short name "worktrees" → "toolbox-ea-worktrees"
   */
  private expandAgentName(callerODU: string, shortName: string): string {
    return `${callerODU}-ea-${shortName}`;
  }

  /**
   * Validate that agent exists or can be created
   * Checks: registered IAs, running agents, or if ODU is registered
   */
  private validateAgentExists(agentId: string): boolean {
    // Check if it's a registered IA
    if (this.registeredIAs.has(agentId)) {
      return true;
    }

    // Check if agent is currently running
    if (this.runningAgents.has(agentId)) {
      return true;
    }

    // Check if ODU is registered (can create agent)
    try {
      const oduName = this.getODUName(agentId);
      const storePath = this.sessionStorePaths.get(oduName);

      if (!storePath) {
        // ODU not registered - can't create agent
        return false;
      }

      // ODU is registered, so we can create the agent if needed
      return true;
    } catch (error) {
      this.logger.error(`Error validating agent ${agentId}`, {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check if agent has pending messages
   */
  hasPending(agentId: string): boolean {
    const queue = this.queues.get(agentId);
    return queue ? queue.length > 0 : false;
  }

  /**
   * Get current session status for an agent
   * Returns 'idle' if agent never started or completed
   */
  getAgentStatus(agentId: string): SessionStatus {
    return this.agentStatus.get(agentId) || "idle";
  }

  /**
   * Set session status for an agent
   * Called internally during agent lifecycle
   */
  private setAgentStatus(agentId: string, status: SessionStatus): void {
    const oldStatus = this.agentStatus.get(agentId);
    this.agentStatus.set(agentId, status);
    this.logger.debug(`Agent ${agentId} status: ${status}`, {
      agentId,
      status,
    });

    // Emit status change event
    if (oldStatus !== status) {
      this.emit("agent_status_changed", {
        agentId,
        oldStatus,
        newStatus: status,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if agent is currently active (processing messages)
   */
  isAgentActive(agentId: string): boolean {
    return this.getAgentStatus(agentId) === "active";
  }

  /**
   * Get list of external agents that have sent messages to this agent
   * Returns fully-qualified agent IDs
   */
  getExternalCallers(agentId: string): string[] {
    const callers = this.externalCallers.get(agentId);
    return callers ? Array.from(callers) : [];
  }

  /**
   * Get queue size for agent (for debugging/monitoring)
   */
  getQueueSize(agentId: string): number {
    return this.queues.get(agentId)?.length || 0;
  }

  /**
   * Wait for specific agent to complete
   * Returns Promise that resolves when agent finishes (success or error)
   *
   * Usage:
   *   const result = await broker.onceAgentCompletes('toolbox-ea-worktrees');
   *   if (result.success) { ... }
   */
  onceAgentCompletes(
    agentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.completionCallbacks.has(agentId)) {
        this.completionCallbacks.set(agentId, []);
      }
      this.completionCallbacks.get(agentId)?.push(resolve);
    });
  }

  /**
   * Decide if we should interrupt based on context-aware rules
   */
  private shouldInterrupt(message: AgentMessage): boolean {
    // Rule 1: External → IA always interrupts
    if (message.to.endsWith("-ia") && message.metadata?.source === "user") {
      return true;
    }

    // Rule 2: EA → parent IA never interrupts
    if (message.to.endsWith("-ia") && message.metadata?.source === "ea") {
      return false;
    }

    // Rule 3: Explicit interrupt mode
    if (message.deliveryMode === "interrupt") {
      return true;
    }

    // Rule 4: Priority-based
    if (message.priority === "urgent") {
      return true;
    }

    if (message.priority === "high") {
      const running = this.runningAgents.get(message.to);
      if (running && Date.now() - running.startedAt > 30000) {
        return true; // Running > 30s, interrupt
      }
    }

    return false; // Default: don't interrupt
  }

  /**
   * Process next batch of messages for an agent
   * Batches consecutive messages from the same sender
   *
   * NOTE: Caller should add agent to startingAgents before calling this
   */
  private async processNextBatch(agentId: string): Promise<void> {
    const queue = this.queues.get(agentId);
    if (!queue || queue.length === 0) {
      this.logger.debug(`No messages for ${agentId}`, { agentId });
      return;
    }

    // Get consecutive messages from same sender
    const firstSender = queue[0].from;
    const batch: AgentMessage[] = [];

    // Take all consecutive messages from the same sender
    while (queue.length > 0 && queue[0].from === firstSender) {
      const nextMessage = queue.shift();
      if (!nextMessage) break;
      batch.push(nextMessage);
    }

    this.logger.info(
      `Batched ${batch.length} messages from ${firstSender} for ${agentId}`,
      {
        agentId,
        batchSize: batch.length,
        sender: firstSender,
      },
    );

    // Start agent with this batch
    await this.startAgentWithBatch(agentId, batch);
  }

  /**
   * Start an agent with a specific batch of messages
   *
   * Steps:
   * 1. Parse agent ID to find ODU
   * 2. Load session history from store
   * 3. Format batch messages
   * 4. Create agent via factory
   * 5. Start agent.execute()
   * 6. Monitor completion
   */
  private async startAgentWithBatch(
    agentId: string,
    batch: AgentMessage[],
  ): Promise<void> {
    try {
      // 1. Parse agent ID to find ODU
      const oduName = this.getODUName(agentId);
      const factory = this.agentFactories.get(oduName);
      const storePath = this.sessionStorePaths.get(oduName);

      if (!factory || !storePath) {
        throw new Error(
          `ODU not registered: ${oduName} (for agent ${agentId})`,
        );
      }

      // 2. Register EA (creates if new, updates if exists)
      const displayName = this.getDisplayName(agentId);
      await this.registerEA(storePath, agentId, displayName);

      // 3. Load session history from store
      const session = await this.loadSessionFromStore(storePath, agentId);
      const history = session?.history || [];

      this.logger.debug(`Loaded session for ${agentId}`, {
        agentId,
        historyLength: history.length,
        displayName,
      });

      // 4. Format batch messages
      let taskDescription: string;
      const deliveryMode = this.deliveryModes.get(agentId) || "batch";

      if (deliveryMode === "single" || batch.length === 1) {
        // Single message
        taskDescription = batch[0].content;
        this.logger.debug(
          `Processing single message from ${this.getDisplayName(batch[0].from)}`,
          {
            agentId,
            from: batch[0].from,
          },
        );
      } else {
        // Multiple messages from same sender - batch them
        if (batch.length === 1) {
          taskDescription = batch[0].content;
        } else {
          taskDescription = batch
            .map((m, i) => `Message ${i + 1}:\n${m.content}`)
            .join("\n\n---\n\n");
        }

        this.logger.debug(`Batched ${batch.length} messages into prompt`, {
          agentId,
          batchSize: batch.length,
        });
      }

      // 5. Create agent via factory
      const agent = factory(agentId, taskDescription, history) as {
        execute: () => Promise<string>;
      };

      // 6. Start and track
      const promise = agent.execute();

      // Mark agent as active
      this.setAgentStatus(agentId, "active");

      // Emit agent started event
      this.emit("agent_started", {
        agentId,
        oduName: this.getODUName(agentId),
        timestamp: Date.now(),
        queueSize: batch.length,
      });

      this.runningAgents.set(agentId, {
        agentId,
        instance: agent,
        promise,
        startedAt: Date.now(),
        status: "active",
      });

      this.logger.info(`Agent ${agentId} started (status: active)`, {
        agentId,
        historyLength: history.length,
        queuedMessages: batch.length,
        sender: batch[0].from,
      });

      // 7. Monitor completion
      promise
        .then(() => this.onAgentComplete(agentId))
        .catch((error: Error) => this.onAgentError(agentId, error));
    } catch (error) {
      this.logger.error(`Failed to start agent ${agentId}`, {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get display name from fully-qualified agent ID
   * toolbox-ea-worktrees → worktrees
   * meta-ia → meta-ia (keep IAs fully-qualified)
   */
  private getDisplayName(agentId: string): string {
    const parts = agentId.split("-");
    if (parts.length >= 3 && parts[1] === "ea") {
      // EA: return task name part
      return parts.slice(2).join("-");
    }
    // IA or other: return full name
    return agentId;
  }

  /**
   * When agent completes, check for more work
   */
  private onAgentComplete(agentId: string): void {
    this.logger.info(`Agent ${agentId} completed`, { agentId });

    // Mark agent as idle
    this.setAgentStatus(agentId, "idle");

    // Remove from running agents
    this.runningAgents.delete(agentId);

    // Emit agent completed event
    this.emit("agent_completed", {
      agentId,
      oduName: this.getODUName(agentId),
      timestamp: Date.now(),
      success: true,
    });

    // Notify completion listeners
    this.notifyCompletion(agentId, { success: true });

    // Are there more messages queued?
    if (this.hasPending(agentId) && !this.startingAgents.has(agentId)) {
      const queueSize = this.getQueueSize(agentId);
      this.logger.info(
        `Processing next batch for ${agentId} (${queueSize} messages queued)`,
        {
          agentId,
          queueSize,
        },
      );

      // Mark as starting and process next batch
      this.startingAgents.add(agentId);
      this.processNextBatch(agentId)
        .then(() => this.startingAgents.delete(agentId))
        .catch((error) => {
          this.logger.error(`Error processing next batch for ${agentId}`, {
            agentId,
            error: error instanceof Error ? error.message : String(error),
          });
          this.startingAgents.delete(agentId);
        });
    } else {
      this.logger.debug(`Agent ${agentId} idle (no more messages)`, {
        agentId,
      });
    }
  }

  /**
   * Handle agent errors
   */
  private onAgentError(agentId: string, error: Error): void {
    this.logger.error(`Agent ${agentId} failed`, {
      agentId,
      error: error.message,
    });

    // Mark agent as idle (failed, but can receive new messages)
    this.setAgentStatus(agentId, "idle");

    // Remove from running
    this.runningAgents.delete(agentId);

    // Notify completion listeners with error
    this.notifyCompletion(agentId, { success: false, error: error.message });

    // Don't restart on error - let user handle it
    // Messages stay in queue for manual intervention
  }

  /**
   * Notify all completion listeners for an agent
   * Called when agent completes (success or error)
   */
  private notifyCompletion(
    agentId: string,
    result: { success: boolean; error?: string },
  ): void {
    const callbacks = this.completionCallbacks.get(agentId) || [];
    callbacks.forEach((cb) => {
      cb(result);
    });
    this.completionCallbacks.delete(agentId); // One-time callbacks

    if (callbacks.length > 0) {
      this.logger.debug(
        `Notified ${callbacks.length} listener(s) for ${agentId}`,
        {
          agentId,
          listenersCount: callbacks.length,
          success: result.success,
        },
      );
    }
  }

  /**
   * Interrupt a running agent and restart with new messages
   */
  private async interruptAndRestart(agentId: string): Promise<void> {
    const running = this.runningAgents.get(agentId);
    if (!running) return;

    this.logger.info(`Sending interrupt to ${agentId}`, { agentId });

    // Send interrupt signal
    const instance = running.instance as { interrupt?: () => void };
    if (instance.interrupt) {
      instance.interrupt();
    }

    // Wait for graceful stop (agent saves state)
    try {
      await running.promise;
    } catch {
      // Interrupt causes early exit, that's expected
      this.logger.debug(`Agent ${agentId} interrupted successfully`, {
        agentId,
      });
    }

    // Remove from running
    this.runningAgents.delete(agentId);

    // Mark as starting and process next batch with new messages
    if (!this.startingAgents.has(agentId)) {
      this.startingAgents.add(agentId);
      try {
        await this.processNextBatch(agentId);
      } finally {
        this.startingAgents.delete(agentId);
      }
    }
  }

  /**
   * Add message to queue with priority + FIFO sorting
   */
  private enqueue(message: AgentMessage): void {
    if (!this.queues.has(message.to)) {
      this.queues.set(message.to, []);
    }
    this.queues.get(message.to)?.push(message);
    this.sortQueue(message.to);

    // Emit message queued event
    this.emit("message_queued", {
      messageId: message.id,
      from: message.from,
      to: message.to,
      priority: message.priority,
      timestamp: message.timestamp,
      queueSize: this.queues.get(message.to)?.length,
    });
  }

  /**
   * Sort queue: priority first, then FIFO within priority
   */
  private sortQueue(agentId: string): void {
    const queue = this.queues.get(agentId);
    if (!queue) return;

    queue.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.timestamp - b.timestamp; // FIFO within same priority
    });
  }

  /**
   * Parse agent ID to determine ODU name
   * Examples:
   * - 'toolbox-ia' → 'toolbox'
   * - 'toolbox-ea-abc123' → 'toolbox'
   * - 'meta-ia' → 'meta'
   */
  private getODUName(agentId: string): string {
    const parts = agentId.split("-");

    if (parts.length < 2) {
      throw new Error(`Invalid agent ID format: ${agentId}`);
    }

    // Regular instance: first part is ODU name
    return parts[0];
  }

  /**
   * Load session from Nexus session store (new format)
   */
  private async loadSessionFromStore(
    _storePath: string,
    agentId: string,
  ): Promise<{ history: SessionHistoryEntry[] } | null> {
    try {
      const sessionKey = `agent:${agentId}`;
      const agentIdNormalized = normalizeAgentId(DEFAULT_AGENT_ID);
      const session = await loadSession(agentIdNormalized, sessionKey);

      if (!session) {
        return null;
      }

      // Load history from new format
      const history: SessionHistoryEntry[] = session.history.map((turn) => ({
        role: turn.role,
        content: turn.content,
        timestamp: new Date(turn.timestamp).getTime(),
      }));

      return {
        history,
      };
    } catch (error) {
      this.logger.error(`Failed to load session for ${agentId}`, {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Register or update EA in session store (new format)
   * EAs persist forever once created
   */
  private async registerEA(
    _storePath: string,
    agentId: string,
    taskName?: string,
  ): Promise<void> {
    try {
      const sessionKey = `agent:${agentId}`;
      const agentIdNormalized = normalizeAgentId(DEFAULT_AGENT_ID);
      const now = Date.now();

      // Check if EA already exists
      const existing = await loadSession(agentIdNormalized, sessionKey);

      if (existing) {
        // Update last updated timestamp
        await writeSessionMetadata(agentIdNormalized, sessionKey, {
          ...existing.metadata,
          updatedAt: now,
        });
        this.logger.debug(`Updated session for ${agentId}`, { agentId });
      } else {
        // Create new EA registration
        const displayName = this.getDisplayName(agentId);
        const oduName = this.getODUName(agentId);

        const newEntry: SessionEntry = {
          sessionId: crypto.randomUUID(),
          updatedAt: now,
          displayName: taskName || displayName,
          chatType: "direct",
        };

        await writeSessionMetadata(agentIdNormalized, sessionKey, {
          ...newEntry,
          created: new Date().toISOString(),
        });
        this.logger.info(`Registered new EA: ${agentId}`, {
          agentId,
          oduName,
          displayName,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to register EA ${agentId}`, {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - registration failure shouldn't block agent execution
    }
  }

  // ============================================================
  // PUBLIC OBSERVABILITY METHODS (for GUI and monitoring)
  // ============================================================

  /**
   * Get all registered IAs
   * Returns array of IA metadata for GUI display
   */
  getRegisteredIAs(): Array<{ id: string; oduName: string }> {
    const ias: Array<{ id: string; oduName: string }> = [];
    for (const [id] of this.registeredIAs.entries()) {
      ias.push({
        id,
        oduName: this.getODUName(id),
      });
    }
    return ias;
  }

  /**
   * Get all running EAs with their status
   * Returns array of EA metadata for GUI display
   */
  getRunningAgents(): Array<{
    agentId: string;
    status: SessionStatus;
    startedAt: number;
    oduName: string;
    queueSize: number;
  }> {
    const agents: Array<{
      agentId: string;
      status: SessionStatus;
      startedAt: number;
      oduName: string;
      queueSize: number;
    }> = [];

    for (const [agentId, runningAgent] of this.runningAgents.entries()) {
      agents.push({
        agentId,
        status: runningAgent.status,
        startedAt: runningAgent.startedAt,
        oduName: this.getODUName(agentId),
        queueSize: this.getQueueSize(agentId),
      });
    }

    return agents;
  }

  /**
   * Get all queues with their sizes
   * Returns map of agentId -> queue size
   */
  getAllQueues(): Map<string, number> {
    const queueSizes = new Map<string, number>();

    for (const [agentId, queue] of this.queues.entries()) {
      queueSizes.set(agentId, queue.length);
    }

    return queueSizes;
  }

  /**
   * Get all agent IDs (both IAs and EAs) that the broker knows about
   * Includes running, queued, and registered agents
   */
  getAllKnownAgents(): Array<{
    agentId: string;
    type: "ia" | "ea";
    status: SessionStatus;
    oduName: string;
    queueSize: number;
    isRunning: boolean;
  }> {
    const agents: Array<{
      agentId: string;
      type: "ia" | "ea";
      status: SessionStatus;
      oduName: string;
      queueSize: number;
      isRunning: boolean;
    }> = [];

    // Add all registered IAs
    for (const [id] of this.registeredIAs.entries()) {
      agents.push({
        agentId: id,
        type: "ia",
        status: this.getAgentStatus(id),
        oduName: this.getODUName(id),
        queueSize: this.getQueueSize(id),
        isRunning: false, // IAs are always available, not "running" in the same sense
      });
    }

    // Add all running EAs
    for (const [id, runningAgent] of this.runningAgents.entries()) {
      agents.push({
        agentId: id,
        type: "ea",
        status: runningAgent.status,
        oduName: this.getODUName(id),
        queueSize: this.getQueueSize(id),
        isRunning: true,
      });
    }

    // Add queued agents that aren't running
    for (const [id, queue] of this.queues.entries()) {
      if (
        !this.runningAgents.has(id) &&
        !this.registeredIAs.has(id) &&
        queue.length > 0
      ) {
        agents.push({
          agentId: id,
          type: "ea",
          status: "idle",
          oduName: this.getODUName(id),
          queueSize: queue.length,
          isRunning: false,
        });
      }
    }

    return agents;
  }

  /**
   * Event emitter support for real-time updates
   * Listeners can subscribe to broker events
   */
  private eventListeners: Map<string, BrokerEventCallback[]> = new Map();

  /**
   * Subscribe to broker events
   * Events: 'agent_started', 'agent_completed', 'agent_status_changed', 'message_queued'
   */
  on(event: string, callback: BrokerEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  /**
   * Unsubscribe from broker events
   */
  off(event: string, callback: BrokerEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all subscribers
   */
  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    for (const callback of listeners) {
      try {
        callback(data);
      } catch (error) {
        this.logger.error(`Error in event listener for ${event}`, {
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
