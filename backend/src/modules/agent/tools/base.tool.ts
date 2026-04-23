/**
 * @fileoverview Base Tool - Abstract Tool Interface
 * @module @nxt1/backend/modules/agent/tools
 */

import type {
  AgentProgressMetadata,
  AgentToolCategory,
  AgentToolEntityGroup,
  AgentIdentifier,
  AgentXToolStepIcon,
  ToolStage,
} from '@nxt1/core';
import type { ZodError, ZodType } from 'zod';

export type ToolParameterSchema = ZodType<unknown>;

export interface ToolResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly markdown?: string;
  readonly error?: string;
}

export interface ToolExecutionContext {
  readonly userId: string;
  readonly environment?: 'staging' | 'production';
  readonly threadId?: string;
  readonly sessionId?: string;
  readonly allowedEntityGroups?: readonly AgentToolEntityGroup[];
  readonly allowedToolNames?: readonly string[];
  readonly signal?: AbortSignal;
  readonly emitStage?: (
    stage: ToolStage,
    metadata?: AgentProgressMetadata & {
      readonly icon?: AgentXToolStepIcon;
      readonly subAgentId?: string;
    }
  ) => void;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameterSchema;
  abstract readonly isMutation: boolean;
  abstract readonly category: AgentToolCategory;

  readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  _embedding?: readonly number[];

  abstract execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult>;

  async matchIntent(
    intentVector: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>
  ): Promise<number> {
    if (!this._embedding) {
      const contextText = `Tool Name: ${this.name}\nDescription: ${this.description}\nCategory: ${this.category}`;
      this._embedding = await embedFn(contextText);
    }
    return this.cosineSimilarity(intentVector, this._embedding);
  }

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

  protected str(obj: Record<string, unknown>, key: string): string | null {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return null;
  }

  protected obj(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
    return null;
  }

  protected arr(obj: Record<string, unknown>, key: string): unknown[] | null {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) return val;
    return null;
  }

  protected num(obj: Record<string, unknown>, key: string): number | null {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  protected paramError(param: string): ToolResult {
    return {
      success: false,
      error: `Parameter "${param}" is required and must be a non-empty string.`,
    };
  }

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
