/**
 * @fileoverview Unit Tests — ToolRegistry cancellation guard
 * @module @nxt1/backend/modules/agent/tools
 *
 * Tests that the ToolRegistry short-circuits tool execution when the
 * AbortSignal is already aborted before the tool's execute() runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';

// ─── Stub Tool ──────────────────────────────────────────────────────────────

class StubTool extends BaseTool {
  readonly name = 'stub_tool';
  readonly description = 'A stub tool for testing.';
  readonly parameters = { type: 'object', properties: {}, required: [] } as const;
  readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'analytics' as const;

  readonly executeFn = vi.fn<[Record<string, unknown>, ToolExecutionContext?], Promise<ToolResult>>(
    async () => ({ success: true, data: { ok: true } })
  );

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    return this.executeFn(input, context);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let stub: StubTool;

  beforeEach(() => {
    registry = new ToolRegistry();
    stub = new StubTool();
    registry.register(stub);
  });

  describe('execute', () => {
    it('should delegate to the tool when signal is not aborted', async () => {
      const controller = new AbortController();
      const result = await registry.execute(
        'stub_tool',
        {},
        {
          userId: 'u1',
          signal: controller.signal,
        }
      );

      expect(result.success).toBe(true);
      expect(stub.executeFn).toHaveBeenCalledOnce();
    });

    it('should return error without calling tool when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await registry.execute(
        'stub_tool',
        {},
        {
          userId: 'u1',
          signal: controller.signal,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation cancelled');
      expect(stub.executeFn).not.toHaveBeenCalled();
    });

    it('should execute normally when no signal is provided', async () => {
      const result = await registry.execute('stub_tool', {}, { userId: 'u1' });

      expect(result.success).toBe(true);
      expect(stub.executeFn).toHaveBeenCalledOnce();
    });

    it('should execute normally when no context is provided', async () => {
      const result = await registry.execute('stub_tool', {});

      expect(result.success).toBe(true);
      expect(stub.executeFn).toHaveBeenCalledOnce();
    });

    it('should return error for unknown tool name', async () => {
      const result = await registry.execute('nonexistent', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: nonexistent');
    });
  });
});
