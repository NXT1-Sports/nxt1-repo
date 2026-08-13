import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../base.tool.js';
import { SaveMemoryTool } from '../save-memory.tool.js';

describe('SaveMemoryTool', () => {
  const store = vi.fn();
  const vectorMemory = {
    store,
  } as never;

  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-123',
    environment: 'staging',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the execution-context userId for canonical payloads', async () => {
    store.mockResolvedValue({ id: 'mem-1' });

    const tool = new SaveMemoryTool(vectorMemory);
    const result = await tool.execute(
      {
        content: 'User prefers SEC schools for recruiting.',
        category: 'preference',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(store).toHaveBeenCalledWith(
      'user-123',
      'User prefers SEC schools for recruiting.',
      'preference',
      undefined
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        memoryId: 'mem-1',
        memoryIds: ['mem-1'],
        category: 'preference',
        count: 1,
      })
    );
  });

  it('accepts the legacy fact payload shape', async () => {
    store.mockResolvedValue({ id: 'mem-2' });

    const tool = new SaveMemoryTool(vectorMemory);
    const result = await tool.execute(
      {
        category: 'recruiting_context',
        fact: 'Christian Bright has a 27-program target list.',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(store).toHaveBeenCalledWith(
      'user-123',
      'Christian Bright has a 27-program target list.',
      'recruiting_context',
      undefined
    );
    expect(result.data).toEqual(expect.objectContaining({ memoryId: 'mem-2' }));
  });

  it('accepts the legacy facts array shape and stores each entry', async () => {
    store.mockResolvedValueOnce({ id: 'mem-3' }).mockResolvedValueOnce({ id: 'mem-4' });

    const tool = new SaveMemoryTool(vectorMemory);
    const result = await tool.execute(
      {
        metadata: { sport: 'basketball' },
        facts: [
          {
            category: 'recruiting_context',
            fact: 'Christian Bright is a 2027 SG at Green Hill HS.',
          },
          {
            category: 'goal',
            content: 'Christian Bright wants a Division I scholarship.',
            metadata: { priority: 'high' },
          },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(store).toHaveBeenNthCalledWith(
      1,
      'user-123',
      'Christian Bright is a 2027 SG at Green Hill HS.',
      'recruiting_context',
      { sport: 'basketball' }
    );
    expect(store).toHaveBeenNthCalledWith(
      2,
      'user-123',
      'Christian Bright wants a Division I scholarship.',
      'goal',
      { sport: 'basketball', priority: 'high' }
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        memoryIds: ['mem-3', 'mem-4'],
        count: 2,
        categories: ['recruiting_context', 'goal'],
      })
    );
  });

  it('returns a validation error when no userId is available anywhere', async () => {
    const tool = new SaveMemoryTool(vectorMemory);
    const result = await tool.execute({
      content: 'User prefers morning workouts.',
      category: 'preference',
    });

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(result.error).toContain('userId is required');
    expect(store).not.toHaveBeenCalled();
  });

  it('returns isValidationError for malformed payloads', async () => {
    const tool = new SaveMemoryTool(vectorMemory);
    const result = await tool.execute(
      {
        facts: ['just a string, not an object'],
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(store).not.toHaveBeenCalled();
  });
});
