import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleRecurringTaskTool } from '../schedule-recurring.tool.js';

describe('schedule-recurring.tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid IANA timezones', async () => {
    const queueService = {
      enqueueRecurring: vi.fn(),
    };

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              data: () => ({ count: 0 }),
            }),
          })),
        })),
        doc: vi.fn(() => ({
          set: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);

    const result = await tool.execute({
      userId: 'user-1',
      actionSummary: 'Send intro email',
      cronExpression: '0 8 * * 2',
      timezone: 'Not/A_Real_Timezone',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timezone must be a valid IANA timezone');
    expect(queueService.enqueueRecurring).not.toHaveBeenCalled();
  });

  it('passes timezone to BullMQ scheduling and persists timezone in Firestore', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:123'),
      enqueueDelayed: vi.fn(),
    };

    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const countGet = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) });
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({ get: countGet })),
        })),
        doc,
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);

    const result = await tool.execute(
      {
        userId: 'user-1',
        actionSummary: 'Send intro email',
        cronExpression: '0 8 * * 2',
        timezone: 'America/Chicago',
        sourceId: 'thread-123',
      },
      {
        userId: 'user-1',
        environment: 'staging',
      }
    );

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '0 8 * * 2',
      'America/Chicago',
      expect.objectContaining({
        userId: 'user-1',
        intent: 'Send intro email',
        origin: 'system_cron',
        context: expect.objectContaining({
          sourceId: 'thread-123',
          threadId: 'thread-123',
          timezone: 'America/Chicago',
        }),
      }),
      undefined,
      'staging'
    );

    expect(doc).toHaveBeenCalledWith('repeat:key:123');
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actionSummary: 'Send intro email',
        cronExpression: '0 8 * * 2',
        timezone: 'America/Chicago',
        sourceId: 'thread-123',
        environment: 'staging',
      })
    );
  });

  it('falls back to execution thread context when sourceId is omitted', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:456'),
      enqueueDelayed: vi.fn(),
    };

    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const countGet = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) });
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({ get: countGet })),
        })),
        doc,
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);

    const result = await tool.execute(
      {
        userId: 'user-1',
        actionSummary: 'Weekly recap',
        cronExpression: '0 10 * * 1',
        timezone: 'America/Chicago',
      },
      {
        userId: 'user-1',
        threadId: '663f7c99f9b6aa3f9f77c4ad',
        environment: 'staging',
      }
    );

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '0 10 * * 1',
      'America/Chicago',
      expect.objectContaining({
        context: expect.objectContaining({
          sourceId: '663f7c99f9b6aa3f9f77c4ad',
          threadId: '663f7c99f9b6aa3f9f77c4ad',
          timezone: 'America/Chicago',
        }),
      }),
      undefined,
      'staging'
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: '663f7c99f9b6aa3f9f77c4ad',
        environment: 'staging',
      })
    );
  });

  it('does not inject sourceId when neither input nor execution context provides a thread', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:789'),
      enqueueDelayed: vi.fn(),
    };

    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const countGet = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) });
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({ get: countGet })),
        })),
        doc,
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);

    const result = await tool.execute(
      {
        userId: 'user-1',
        actionSummary: 'Weekly recap',
        cronExpression: '0 10 * * 1',
        timezone: 'America/Chicago',
      },
      {
        userId: 'user-1',
      }
    );

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '0 10 * * 1',
      'America/Chicago',
      expect.objectContaining({
        context: { timezone: 'America/Chicago' },
      }),
      undefined,
      'staging'
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'staging',
      })
    );
    expect(set).toHaveBeenCalledWith(expect.not.objectContaining({ sourceId: expect.anything() }));
  });

  it('allows recurring schedules more frequent than once per hour', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:fast'),
      enqueueDelayed: vi.fn(),
    };

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              data: () => ({ count: 0 }),
            }),
          })),
        })),
        doc: vi.fn(() => ({
          set: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);

    const result = await tool.execute(
      {
        actionSummary: 'Send a reminder',
        cronExpression: '*/2 * * * *',
        timezone: 'America/Chicago',
      },
      {
        userId: 'user-1',
        environment: 'staging',
      }
    );

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '*/2 * * * *',
      'America/Chicago',
      expect.objectContaining({
        userId: 'user-1',
        intent: 'Send a reminder',
      }),
      undefined,
      'staging'
    );
  });

  it('schedules a pending initial run when firstRunAt is provided', async () => {
    const queueService = {
      enqueueRecurring: vi.fn().mockResolvedValue('repeat:key:future'),
      enqueueDelayed: vi.fn().mockResolvedValue('recurring-initial-user-1-123'),
    };

    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const countGet = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) });
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          count: vi.fn(() => ({ get: countGet })),
        })),
        doc,
      })),
    } as unknown as Firestore;

    const tool = new ScheduleRecurringTaskTool(queueService as never, db);
    const firstRunAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    const result = await tool.execute(
      {
        actionSummary: 'Weekly recap',
        cronExpression: '0 22 * * 2',
        timezone: 'America/Chicago',
        sourceId: 'thread-123',
        firstRunAt,
      },
      {
        userId: 'user-1',
        environment: 'staging',
      }
    );

    expect(result.success).toBe(true);
    expect(queueService.enqueueRecurring).toHaveBeenCalledWith(
      expect.stringMatching(/^recv:user-1:/),
      '0 22 * * 2',
      'America/Chicago',
      expect.any(Object),
      {
        startDate: new Date(Date.parse(firstRunAt) + 60_000).toISOString(),
      },
      'staging'
    );

    expect(queueService.enqueueDelayed).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueDelayed).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        origin: 'system_cron',
        context: expect.objectContaining({
          sourceId: 'thread-123',
          threadId: 'thread-123',
          recurringTaskKey: 'repeat:key:future',
          recurringInitialRun: true,
        }),
      }),
      expect.any(Number),
      'staging'
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        firstRunAt,
        initialRunJobId: 'recurring-initial-user-1-123',
      })
    );
  });
});
