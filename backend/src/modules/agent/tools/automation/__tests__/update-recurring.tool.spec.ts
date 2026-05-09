import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateRecurringTaskTool } from '../update-recurring.tool.js';

describe('update-recurring.tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces an existing recurring task with updated schedule', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:new'),
      removeRecurringJob: vi.fn().mockResolvedValue(true),
    };

    const oldDocGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1',
        actionSummary: 'Old summary',
        cronExpression: '0 8 * * 1',
        timezone: 'America/Chicago',
        sourceId: 'thread-1',
      }),
    });

    const newDocSet = vi.fn().mockResolvedValue(undefined);
    const oldDocDelete = vi.fn().mockResolvedValue(undefined);

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn((id: string) => {
          if (id === 'repeat:key:old') {
            return { get: oldDocGet, delete: oldDocDelete };
          }
          return { set: newDocSet, delete: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    } as unknown as Firestore;

    const tool = new UpdateRecurringTaskTool(queueService as never, db);

    const result = await tool.execute({
      userId: 'user-1',
      key: 'repeat:key:old',
      cronExpression: '0 */2 * * *',
    });

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '0 */2 * * *',
      'America/Chicago',
      expect.objectContaining({
        userId: 'user-1',
        intent: 'Old summary',
        displayIntent: 'Old summary',
        origin: 'system_cron',
      }),
      'production'
    );
    expect(queueService.removeRecurringJob).toHaveBeenCalledWith('repeat:key:old');
    expect(newDocSet).toHaveBeenCalled();
    expect(oldDocDelete).toHaveBeenCalled();
  });

  it('rejects update when recurring task key is not owned by user', async () => {
    const queueService = {
      enqueueRecurring: vi.fn(),
      removeRecurringJob: vi.fn(),
    };

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ userId: 'someone-else' }),
          }),
        })),
      })),
    } as unknown as Firestore;

    const tool = new UpdateRecurringTaskTool(queueService as never, db);
    const result = await tool.execute({ userId: 'user-1', key: 'repeat:key:old' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No recurring task with that key');
    expect(queueService.enqueueRecurring).not.toHaveBeenCalled();
  });

  it('treats cancel intent as true cancellation instead of replacement scheduling', async () => {
    const queueService = {
      enqueueRecurring: vi.fn(),
      removeRecurringJob: vi.fn().mockResolvedValue(true),
    };

    const oldDocDelete = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              userId: 'user-1',
              actionSummary: 'Old summary',
              cronExpression: '0 8 * * 1',
              timezone: 'America/Chicago',
            }),
          }),
          delete: oldDocDelete,
        })),
      })),
    } as unknown as Firestore;

    const tool = new UpdateRecurringTaskTool(queueService as never, db);
    const result = await tool.execute({
      userId: 'user-1',
      key: 'repeat:key:old',
      actionSummary: 'Cancel the recurring task',
      cronExpression: '0 0 31 2 *',
      timezone: 'America/Chicago',
    });

    expect(result.success).toBe(true);
    expect(queueService.removeRecurringJob).toHaveBeenCalledWith('repeat:key:old');
    expect(oldDocDelete).toHaveBeenCalled();
    expect(queueService.enqueueRecurring).not.toHaveBeenCalled();
  });
});
