/**
 * @fileoverview Base Tool — Abstract Tool Interface
 * @module @nxt1/backend/modules/agent/tools
 *
 * Every tool the agent can invoke extends this base class.
 * Tools are single-purpose, stateless functions that:
 * 1. Accept validated JSON input (matching their schema).
 * 2. Perform one specific action (DB query, API call, file generation).
 * 3. Return a structured result the LLM can interpret.
 *
 * Tools do NOT hold state or call the LLM — that is the agent's job.
 *
 * @example
 * ```ts
 * export class FetchPlayerStatsTool extends BaseTool {
 *   readonly name = 'fetch_player_stats';
 *   readonly description = 'Retrieves verified stats for a player by userId and sport.';
 *   readonly parameters = { ... };  // JSON Schema
 *   readonly isMutation = false;
 *   readonly category = 'database';
 *
 *   async execute(input: { userId: string; sport: string }): Promise<ToolResult> {
 *     const stats = await this.db.getStats(input.userId, input.sport);
 *     return { success: true, data: stats };
 *   }
 * }
 * ```
 */

import type {
  AgentProgressMetadata,
  AgentToolCategory,
  AgentIdentifier,
  AgentXToolStepIcon,
  ToolStage,
} from '@nxt1/core';
import type { ZodError, ZodType } from 'zod';

export type ToolParameterSchema = Readonly<Record<string, unknown>> | ZodType<unknown>;

export interface ToolResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly markdown?: string;
  readonly error?: string;
}

/**
 * Execution context injected into every tool call by the agent runtime.
 * Provides identity and session information that tools can use for
 * scoped storage paths, audit logging, or permission checks — without
 * relying on the LLM to supply these values (which would be unreliable).
 */
export interface ToolExecutionContext {
  /** The authenticated Firestore UID of the user who owns this agent session. */
  readonly userId: string;
  /** Which backend environment is serving this tool execution. */
  readonly environment?: 'staging' | 'production';
  /** The MongoDB thread ID for the current conversation (if available). */
  readonly threadId?: string;
  /** The unique session ID for the current agent run. */
  readonly sessionId?: string;
  /**
   * Abort signal propagated from the SSE connection close or explicit cancel.
   * Tools SHOULD check `signal.aborted` before starting expensive operations
   * and pass the signal to any outgoing `fetch()` calls so they terminate
   * immediately when the user cancels the stream.
   */
  readonly signal?: AbortSignal;
  /**
   * Emit a structured tool stage update to the client during long-running work.
   * This is the typed replacement for `onProgress` and allows the frontend to
   * localize text, map icons, and attribute activity to sub-agents.
   */
  readonly emitStage?: (
    stage: ToolStage,
    metadata?: AgentProgressMetadata & {
      readonly icon?: AgentXToolStepIcon;
      readonly subAgentId?: string;
    }
  ) => void;
}

export abstract class BaseTool {
  /** Unique tool name (snake_case). Used in LLM function-calling schemas. */
  abstract readonly name: string;

  /** Human-readable description. Sent to the LLM so it knows when to use this tool. */
  abstract readonly description: string;

  /** JSON Schema describing the tool's input parameters. */
  abstract readonly parameters: ToolParameterSchema;

  /** Whether this tool performs a write/mutation (triggers pre-tool guardrails). */
  abstract readonly isMutation: boolean;

  /** Logical category for organization and permissions. */
  abstract readonly category: AgentToolCategory;

  /** Which sub-agents are allowed to invoke this tool. '*' = all. */
  readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  /**
   * Cached vector embedding of the tool's description.
   * Loaded lazily on first access.
   */
  _embedding?: readonly number[];

  /** Execute the tool with validated input and optional execution context. */
  abstract execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult>;

  // ─── Helper Methods for Tool RAG ────────────────────────────────────

  /**
   * Lazily computes and caches the embedding vector for semantic matching.
   * Callers pass the embedding function (LLM adapter).
   */
  async matchIntent(
    intentVector: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>
  ): Promise<number> {
    if (!this._embedding) {
      // Create a rich context string for the embedding model to improve matching
      const contextText = `Tool Name: ${this.name}\nDescription: ${this.description}\nCategory: ${this.category}`;
      this._embedding = await embedFn(contextText);
    }
    return this.cosineSimilarity(intentVector, this._embedding);
  }

  /**
   * Computes the cosine similarity between two vectors.
   * Range is [-1, 1], where 1 is identical.
   */
  private cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ─── Shared Input Helpers ─────────────────────────────────────────────

  /** Extract a trimmed non-empty string from input, or null. */
  protected str(obj: Record<string, unknown>, key: string): string | null {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return null;
  }

  /** Extract a nested object from input, or null. */
  protected obj(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val))
      return val as Record<string, unknown>;
    return null;
  }

  /** Extract a non-empty array from input, or null. */
  protected arr(obj: Record<string, unknown>, key: string): unknown[] | null {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) return val;
    return null;
  }

  /** Extract a finite number from input, or null. */
  protected num(obj: Record<string, unknown>, key: string): number | null {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  /** Build a standardized "missing required param" error. */
  protected paramError(param: string): ToolResult {
    return {
      success: false,
      error: `Parameter "${param}" is required and must be a non-empty string.`,
    };
  }

  /** Format a Zod parse error into a compact field-aware tool error. */
  protected zodError(error: ZodError): ToolResult {
    return {
      success: false,
      error: error.issues
        .map((issue) =>
          issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
        )
        .join(', '),
    };
  }
}
