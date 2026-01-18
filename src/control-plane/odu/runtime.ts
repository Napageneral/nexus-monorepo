/**
 * Unified ODU Runtime
 *
 * Convention-driven agent runtime that works for any ODU.
 * Adapted from magic-toolbox for Nexus.
 */

import path from "node:path";
import { DEFAULT_MODEL } from "../../agents/defaults.js";
import {
  appendToHistory,
  type HistoryTurn,
  loadHistory,
} from "../../config/sessions.js";
import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveUserPath } from "../../utils.js";
import type { ActiveMessageBroker } from "../broker/broker.js";
import { ExecutionAgent, InteractionAgent } from "./agents.js";
import { loadPrompt } from "./prompt-loader.js";
import type {
  ExecutionAgentConfig,
  InteractionAgentConfig,
  ODUConfig,
} from "./types.js";

/**
 * Unified Interaction Agent Runtime
 *
 * Convention-driven IA that works for any ODU.
 * Wraps Nexus embedded agent system.
 */
export class ODUInteractionAgent extends InteractionAgent {
  // Static registry of all ODU IA singletons (fractal architecture support)
  private static instances: Map<string, ODUInteractionAgent> = new Map();

  static getOrCreate(
    config: InteractionAgentConfig & {
      oduConfig: ODUConfig;
      broker: ActiveMessageBroker;
    },
  ): ODUInteractionAgent {
    const key = `${config.oduPath}:${config.userId}`;
    const existing = ODUInteractionAgent.instances.get(key);
    if (existing) {
      return existing;
    }
    const instance = new ODUInteractionAgent(config);
    ODUInteractionAgent.instances.set(key, instance);
    return instance;
  }

  private conversationHistory: HistoryTurn[] = [];
  private broker!: ActiveMessageBroker;

  private constructor(
    config: InteractionAgentConfig & {
      oduConfig: ODUConfig;
      broker: ActiveMessageBroker;
    },
  ) {
    // Singleton key: oduPath + userId (supports nested ODUs)
    const key = `${config.oduPath}:${config.userId}`;

    // Create new instance
    super(config);
    this.oduConfig = config.oduConfig;
    this.broker = config.broker;

    // Register this singleton
    ODUInteractionAgent.instances.set(key, this);

    // Load conversation history asynchronously
    // (constructors can't be async, so we do this in the background)
    if (config.sessionId) {
      this.loadConversationHistory(config.sessionId).catch((error) => {
        this.log.warn("Failed to load conversation history", { error });
      });
    }

    // Register ODU with broker
    const agentFactory = (
      agentId: string,
      taskDescription: string,
      history: unknown[],
    ) => {
      return new ODUExecutionAgent({
        agentId,
        userId: this.userId,
        task: {
          userId: this.userId,
          type: this.oduConfig.name,
          description: taskDescription,
          taskName: agentId,
        },
        oduPath: this.oduPath,
        config: this.config,
        history,
        broker: this.broker,
      });
    };

    // Register ODU (EA factory) with broker
    this.broker.registerODU(
      this.oduConfig.name,
      path.join(resolveUserPath(this.oduPath), "../state"),
      agentFactory,
    );

    // Register THIS IA with broker so it can receive messages
    const iaId = `${this.oduConfig.name}-ia`;
    this.broker.registerIA(iaId, this);
    this.log.info("IA registered with broker", { iaId });
  }

  /**
   * Resolve the model to use for IA from config
   * Priority: controlPlane.odu.iaModel.primary > agent.model.primary > DEFAULT_MODEL
   */
  private resolveIAModel(): string {
    const oduConfig = this.config?.controlPlane?.odu;
    const agentConfig = this.config?.agent;

    // Check ODU-specific IA model first
    if (oduConfig?.iaModel?.primary) {
      // Extract just the model name from provider/model format
      const parts = oduConfig.iaModel.primary.split("/");
      return parts.length > 1 ? parts[1] : parts[0];
    }

    // Fall back to agent.model
    if (agentConfig?.model?.primary) {
      const parts = agentConfig.model.primary.split("/");
      return parts.length > 1 ? parts[1] : parts[0];
    }

    // Default to opus
    return DEFAULT_MODEL;
  }

  /**
   * Load conversation history from new session format
   */
  private async loadConversationHistory(sessionId: string): Promise<void> {
    try {
      // Use DEFAULT_AGENT_ID and sessionId as the sessionKey
      const agentId = DEFAULT_AGENT_ID;
      const sessionKey = sessionId;

      // Load history from new format
      const history = await loadHistory(agentId, sessionKey);
      if (history && history.length > 0) {
        // Convert HistoryTurn[] to conversation history format
        this.conversationHistory = history.map((turn: HistoryTurn) => ({
          turn_id: turn.turn_id,
          role: turn.role,
          content: turn.content,
          tool_calls: turn.tool_calls,
          tool_call_id: turn.tool_call_id,
          timestamp: turn.timestamp,
        }));
        this.log.info("Loaded conversation history", {
          turns: this.conversationHistory.length,
        });
      }
    } catch (error) {
      this.log.error("Failed to load conversation history", { error });
    }
  }

  /**
   * Handle a user message and return complete response
   */
  async chatSync(userMessage: string): Promise<string> {
    // ALWAYS interrupt if currently streaming
    if (this.isStreaming) {
      this.log.info("New message received while streaming, interrupting");
      this.interrupt();

      // Wait a tiny bit for stream to stop
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Add message to queue
    this.queueMessage(userMessage);

    // If already processing (but not streaming), return queued message
    if (this.isProcessing && !this.isStreaming) {
      return "Message queued. Processing...";
    }

    this.isProcessing = true;

    try {
      let finalResponse = "";

      // Process all queued messages
      while (this.messageQueue.length > 0) {
        // Dequeue all current messages
        const messages = this.messageQueue.splice(0);

        // Sort by priority (high priority first)
        messages.sort((a, b) => {
          const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
          const aPriority = priorityOrder[a.priority] || 2;
          const bPriority = priorityOrder[b.priority] || 2;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.timestamp - b.timestamp;
        });

        // Extract sender from first message
        const from = messages[0].from;

        // Combine messages into single prompt
        const combinedMessage =
          messages.length === 1
            ? messages[0].content
            : messages
                .map((m, i) => `Message ${i + 1}:\n${m.content}`)
                .join("\n\n---\n\n");

        // Reset interrupt flag for new processing
        this.shouldInterrupt = false;

        // Process the combined message with sender context (with streaming + interrupt support)
        finalResponse = await this.processSingleMessage(combinedMessage, from);

        // If interrupted, accumulated response is preserved
        // New messages will be in the queue for next iteration
      }

      return finalResponse;
    } finally {
      this.isProcessing = false;
      this.isStreaming = false;
    }
  }

  /**
   * Process a single message (extracted for queue handling)
   */
  protected async processSingleMessage(
    userMessage: string,
    from?: string,
  ): Promise<string> {
    // If message from another agent, prepend context so IA knows who to respond to
    if (from && from !== "user" && from !== "system") {
      userMessage = `[Message from agent: ${from}]\n\n${userMessage}`;
    }

    this.log.info("Processing message", {
      messageLength: userMessage.length,
      from,
    });

    // Import dependencies dynamically
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { createInteractionTools, handleToolInvocation } = await import(
      "./interaction-tools.js"
    );

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required for ODU interaction agent",
      );
    }

    // Create Anthropic client
    const client = new Anthropic({ apiKey });

    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt();

    // Create interaction tools context
    const toolsContext = {
      broker: this.broker,
      userId: this.userId,
      oduName: this.oduConfig.name,
      oduPurpose: this.oduConfig.purpose,
      agentId: `${this.oduConfig.name}-ia`,
    };

    // Get tool definitions
    const tools = createInteractionTools(toolsContext);

    // Build conversation history in Anthropic format
    const messages: Array<{
      role: "user" | "assistant";
      content: string | Array<unknown>;
    }> = [];

    // Add conversation history
    for (const turn of this.conversationHistory) {
      if (turn.role === "user") {
        messages.push({ role: "user", content: turn.content });
      } else if (turn.role === "assistant") {
        // Build assistant message with tool calls if present
        const content: Array<Record<string, unknown>> = [];
        if (turn.content) {
          content.push({ type: "text", text: turn.content });
        }
        if (turn.tool_calls && turn.tool_calls.length > 0) {
          for (const toolCall of turn.tool_calls) {
            content.push({
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments),
            });
          }
        }
        messages.push({ role: "assistant", content });
      } else if (turn.role === "tool") {
      }
    }

    // Add current user message
    messages.push({ role: "user", content: userMessage });

    // Resolve model from config (IA uses controlPlane.odu.iaModel or agent.model)
    const iaModel = this.resolveIAModel();

    // Call Claude API with tool support
    let response = await client.messages.create({
      model: iaModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as unknown as any,
      tools,
    });

    // Handle tool calls in a loop (agent may make multiple tool calls)
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (
      response.stop_reason === "tool_use" &&
      iterationCount < maxIterations
    ) {
      iterationCount++;

      // Extract tool calls from response
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use",
      ) as Array<{
        type: "tool_use";
        id: string;
        name: string;
        input: unknown;
      }>;

      // Execute each tool and collect results
      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await handleToolInvocation(
            toolBlock.name,
            toolBlock.input,
            toolsContext,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: result,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Error: ${errorMessage}`,
            is_error: true,
          });
        }
      }

      // Add assistant response to messages
      messages.push({ role: "assistant", content: response.content });

      // Add tool results as user message
      messages.push({ role: "user", content: toolResults });

      // Continue conversation
      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages as unknown as any,
        tools,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (block) => block.type === "text",
    );
    const finalResponse = textBlocks.map((block) => block.text).join("\n");

    // Save conversation history (both in-memory and to disk)
    const userTurn: HistoryTurn = {
      turn_id: `turn-${Date.now()}-user`,
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    const assistantTurn: HistoryTurn = {
      turn_id: `turn-${Date.now()}-assistant`,
      role: "assistant",
      content: finalResponse,
      timestamp: new Date().toISOString(),
    };

    // Update in-memory history
    this.conversationHistory.push(userTurn);
    this.conversationHistory.push(assistantTurn);

    // Persist to disk using the IA's session
    const agentId = DEFAULT_AGENT_ID;
    const sessionKey = this.sessionId;
    try {
      await appendToHistory(agentId, sessionKey, userTurn);
      await appendToHistory(agentId, sessionKey, assistantTurn);
      this.log.debug("Persisted conversation to history.jsonl", { sessionKey });
    } catch (error) {
      this.log.warn("Failed to persist conversation history", {
        error,
        sessionKey,
      });
    }

    return finalResponse;
  }

  /**
   * Build system prompt for the IA
   */
  protected async buildSystemPrompt(): Promise<string> {
    // Load InteractionAgent.md prompt with template variables
    const prompt = await loadPrompt("InteractionAgent.md", {
      oduName: this.oduConfig.name,
      oduPurpose: this.oduConfig.purpose,
      oduPath: this.oduPath,
    });

    return prompt;
  }
}

/**
 * Unified Execution Agent Runtime
 *
 * Convention-driven EA that works for any ODU.
 * Wraps Nexus embedded agent system with isolated workspace.
 */
export class ODUExecutionAgent extends ExecutionAgent {
  private broker: ActiveMessageBroker;

  constructor(
    config: ExecutionAgentConfig & {
      oduConfig?: ODUConfig;
      broker: ActiveMessageBroker;
    },
  ) {
    super(config);
    this.broker = config.broker;
    if (config.oduConfig) {
      this.oduConfig = config.oduConfig;
    } else {
      // Derive ODU name from path
      const oduName = path.basename(
        resolveUserPath(config.oduPath || "~/nexus/home"),
      );
      this.oduConfig = {
        name: oduName,
        purpose: `Execute tasks for ${oduName} ODU`,
      };
    }
  }

  /**
   * Execute the task using Nexus embedded agent
   */
  async execute(): Promise<string> {
    this.log.info("Starting EA execution", {
      taskType: this.task.type,
      taskDescription: (this.task.description || "").substring(0, 200),
      historyLength: this.history.length,
    });

    try {
      // Import runEmbeddedPiAgent dynamically
      const { runEmbeddedPiAgent } = await import(
        "../../agents/pi-embedded-runner.js"
      );
      const { resolveNexusAgentDir } = await import(
        "../../agents/agent-paths.js"
      );
      const { randomUUID } = await import("node:crypto");
      const path = await import("node:path");

      // Build initial task prompt
      const taskPrompt = this.buildInitialPrompt();

      // Resolve workspace directory for this EA
      // Use shared workspace (~/nexus/home) - all EAs share the same workspace
      // This aligns with Cursor and single-agent mode behavior
      const workspaceDir = resolveUserPath(this.oduPath);

      // Resolve session file path
      const agentDir = resolveNexusAgentDir();
      const sessionFile = path.join(workspaceDir, ".agent-session.json");

      // Build system prompt with EA template
      const systemPrompt = await this.buildSystemPrompt();

      // Run embedded pi-agent with full coding tools
      const result = await runEmbeddedPiAgent({
        sessionId: this.agentId,
        sessionKey: this.agentId,
        sessionFile,
        workspaceDir,
        agentDir,
        config: this.config,
        prompt: taskPrompt,
        // Use default provider/model if not configured
        provider: undefined, // Will use defaults from config
        model: undefined, // Will use defaults from config
        thinkLevel: this.config?.agent?.thinkingDefault,
        verboseLevel: this.config?.agent?.verboseDefault,
        timeoutMs: (this.config?.agent?.timeoutSeconds || 300) * 1000,
        runId: randomUUID(),
        extraSystemPrompt: systemPrompt,
      });

      // Extract final response from payloads
      const finalResponse =
        result.payloads
          ?.map((p) => p.text)
          .filter(Boolean)
          .join("\n\n") || "Task completed";

      this.log.info("EA execution complete", {
        responseLength: finalResponse.length,
        usage: result.meta.agentMeta?.usage,
      });

      // Send result back to IA via broker
      const oduName = this.oduConfig.name;
      const iaId = `${oduName}-ia`;
      await this.broker.send({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        from: this.agentId,
        to: iaId,
        content: finalResponse,
        priority: "normal",
        timestamp: Date.now(),
        metadata: {
          source: "ea",
          completionResult: true,
          usage: result.meta.agentMeta?.usage,
        },
      });

      return finalResponse;
    } catch (error) {
      this.log.error("EA execution failed", { error });

      // Send error back to IA
      const oduName = this.oduConfig.name;
      const iaId = `${oduName}-ia`;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.broker.send({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        from: this.agentId,
        to: iaId,
        content: `Task failed: ${errorMessage}`,
        priority: "normal",
        timestamp: Date.now(),
        metadata: {
          source: "ea",
          completionResult: true,
          error: true,
        },
      });

      throw error;
    }
  }

  /**
   * Build system prompt for the EA
   */
  protected async buildSystemPrompt(): Promise<string> {
    // Load ExecutionAgent.md prompt with template variables
    const prompt = await loadPrompt("ExecutionAgent.md", {
      oduName: this.oduConfig.name,
      oduPurpose: this.oduConfig.purpose,
      oduPath: this.oduPath,
      task: this.task.description || "Execute the assigned task",
      taskName: this.task.taskName || "task",
      agentId: this.agentId,
      // For now, leave skills and capabilities empty
      // These will be populated when we implement skill/capability loading
      availableSkills: "(Skills will be listed here)",
      availableCapabilities: "(Capabilities will be listed here)",
    });

    return prompt;
  }
}
