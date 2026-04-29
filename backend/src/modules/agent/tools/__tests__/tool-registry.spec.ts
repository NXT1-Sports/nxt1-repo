/**
 * @fileoverview Unit Tests — ToolRegistry cancellation guard
 * @module @nxt1/backend/modules/agent/tools
 *
 * Tests that the ToolRegistry short-circuits tool execution when the
 * AbortSignal is already aborted before the tool's execute() runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import {
  DEFAULT_AGENT_APP_CONFIG,
  setCachedAgentAppConfig,
} from '../../config/agent-app-config.js';

// ─── Stub Tool ──────────────────────────────────────────────────────────────

class StubTool extends BaseTool {
  readonly name = 'stub_tool';
  readonly description = 'A stub tool for testing.';
  readonly parameters = z.object({});
  readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

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

class ZodTool extends BaseTool {
  readonly name = 'zod_tool';
  readonly description = 'A stub tool with Zod parameters.';
  readonly parameters = z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(10).optional(),
  });
  readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  async execute(): Promise<ToolResult> {
    return { success: true, data: { ok: true } };
  }
}

class TeamTool extends BaseTool {
  readonly name = 'team_tool';
  readonly description = 'Team-scoped tool for tests.';
  readonly parameters = z.object({ teamId: z.string().min(1) });
  readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  async execute(): Promise<ToolResult> {
    return { success: true };
  }
}

class LegacySchemaTool extends BaseTool {
  readonly name = 'legacy_schema_tool';
  readonly description = 'Legacy schema tool for strict mode tests.';
  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  } as unknown as z.ZodType<unknown>;
  readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  async execute(): Promise<ToolResult> {
    return { success: true };
  }
}

class ScoredTool extends BaseTool {
  constructor(
    readonly name: string,
    private readonly fixedScore: number,
    readonly isMutation: boolean
  ) {
    super();
  }

  readonly description = 'Score-controlled tool for semantic matching tests.';
  readonly parameters = z.object({});
  readonly allowedAgents = ['*'] as const;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  async matchIntent(): Promise<number> {
    return this.fixedScore;
  }

  async execute(): Promise<ToolResult> {
    return { success: true, data: { ok: true } };
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let stub: StubTool;

  beforeEach(() => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
    registry = new ToolRegistry();
    stub = new StubTool();
    registry.register(stub);
  });

  afterEach(() => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
  });

  describe('getDefinitions', () => {
    it('should compile Zod parameter schemas into JSON Schema', () => {
      registry.register(new ZodTool());

      const definitions = registry.getDefinitions();
      const zodDefinition = definitions.find((definition) => definition.name === 'zod_tool');

      expect(zodDefinition?.parameters).toMatchObject({
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      });
    });

    it('should hide disabled tools from exposed definitions', () => {
      setCachedAgentAppConfig({
        ...DEFAULT_AGENT_APP_CONFIG,
        featureFlags: {
          ...DEFAULT_AGENT_APP_CONFIG.featureFlags,
          disabledTools: ['stub_tool'],
        },
      });

      expect(registry.getDefinitions().some((definition) => definition.name === 'stub_tool')).toBe(
        false
      );
    });

    it('should filter entity-scoped tools using access context', () => {
      registry.register(new TeamTool());

      const definitions = registry.getDefinitions(undefined, {
        userId: 'u1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'user_tools', 'system_tools'],
      });

      expect(definitions.some((definition) => definition.name === 'team_tool')).toBe(false);
    });

    it('should reject non-Zod schemas when strict Zod mode is enabled', () => {
      setCachedAgentAppConfig({
        ...DEFAULT_AGENT_APP_CONFIG,
        featureFlags: {
          ...DEFAULT_AGENT_APP_CONFIG.featureFlags,
          strictZodToolSchemas: true,
        },
      });

      expect(() => registry.register(new LegacySchemaTool())).toThrow(
        /migration checklist|legacy_schema_tool|zod/i
      );
    });

    it('should expose a per-tool migration checklist for legacy schemas', () => {
      registry.register(new LegacySchemaTool());

      expect(registry.getLegacyToolSchemaChecklist()).toEqual([
        {
          toolName: 'legacy_schema_tool',
          migrationStatus: 'pending',
          schemaType: 'raw_json_schema',
          action:
            'Replace parameters with a z.object(...) schema and rely on z.toJSONSchema conversion.',
        },
      ]);
    });
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

    it('should refuse execution when the tool is disabled by feature flags', async () => {
      setCachedAgentAppConfig({
        ...DEFAULT_AGENT_APP_CONFIG,
        featureFlags: {
          ...DEFAULT_AGENT_APP_CONFIG.featureFlags,
          disabledTools: ['stub_tool'],
        },
      });

      const result = await registry.execute('stub_tool', {}, { userId: 'u1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool is currently disabled: stub_tool');
      expect(stub.executeFn).not.toHaveBeenCalled();
    });
  });

  describe('matchWithScores', () => {
    it('returns semantic scores for matched tools in descending order', async () => {
      registry.register(new ScoredTool('tool_high', 0.92, false));
      registry.register(new ScoredTool('tool_mid', 0.51, false));
      registry.register(new ScoredTool('tool_low', 0.12, false));

      const matched = await registry.matchWithScores(
        [0.1, 0.2],
        async () => [0.1, 0.2],
        undefined,
        undefined,
        0.2
      );

      const matchedToolNames = matched.map((tool) => tool.name);
      expect(matchedToolNames).toContain('tool_high');
      expect(matchedToolNames).toContain('tool_mid');
      expect(matchedToolNames).not.toContain('tool_low');
      expect(matched.find((tool) => tool.name === 'tool_high')?.semanticScore).toBeCloseTo(0.92, 5);
      expect(matched.find((tool) => tool.name === 'tool_mid')?.semanticScore).toBeCloseTo(0.51, 5);
    });
  });
});
