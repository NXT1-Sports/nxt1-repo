import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolExecutionContext, ToolResult } from '../base.tool.js';
import { BaseTool } from '../base.tool.js';
import { ToolRegistry } from '../tool-registry.js';

class StubCommunicationTool extends BaseTool {
  readonly name = 'send_email';
  readonly description = 'Stub send email';
  readonly parameters = z.object({});
  readonly isMutation = true;
  readonly category = 'communication' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    _input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    return { success: true };
  }
}

describe('ToolRegistry email access filtering', () => {
  it('excludes blocked tools from definitions', () => {
    const registry = new ToolRegistry();
    registry.register(new StubCommunicationTool());

    const definitions = registry.getDefinitions(undefined, {
      userId: 'user-123',
      role: 'athlete',
      allowedEntityGroups: ['system_tools'],
      blockedToolNames: ['send_email'],
    });

    expect(definitions.some((definition) => definition.name === 'send_email')).toBe(false);
  });
});
