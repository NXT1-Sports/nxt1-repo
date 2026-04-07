/**
 * @fileoverview Unit Tests — DelegateTaskTool
 * @module @nxt1/backend/modules/agent/tools/system
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DelegateTaskTool } from '../delegate-task.tool.js';
import {
  isAgentDelegation,
  AgentDelegationException,
} from '../../../errors/agent-delegation.error.js';

describe('DelegateTaskTool', () => {
  const tool = new DelegateTaskTool();

  it('should be named "delegate_task"', () => {
    expect(tool.name).toBe('delegate_task');
  });

  it('should have category "system"', () => {
    expect(tool.category).toBe('system');
  });

  it('should be allowed for all agents', () => {
    expect(tool.allowedAgents).toContain('*');
  });

  it('should not be a mutation', () => {
    expect(tool.isMutation).toBe(false);
  });

  it('should throw AgentDelegationException with the forwarding intent', async () => {
    const intent = 'Send recruiting emails to D2 coaches in Ohio';

    await expect(tool.execute({ forwarding_intent: intent })).rejects.toThrow(
      AgentDelegationException
    );

    try {
      await tool.execute({ forwarding_intent: intent });
    } catch (err) {
      expect(isAgentDelegation(err)).toBe(true);
      const delegation = err as AgentDelegationException;
      expect(delegation.payload.forwardingIntent).toBe(intent);
      expect(delegation.payload.sourceAgent).toBe('delegate_task_tool');
    }
  });

  it('should return paramError when forwarding_intent is missing', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('forwarding_intent');
  });

  it('should return paramError when forwarding_intent is empty string', async () => {
    const result = await tool.execute({ forwarding_intent: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('forwarding_intent');
  });
});
