import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { ListRecurringTasksTool } from '../list-recurring.tool.js';
import { AgentJobRepository } from '../../../queue/job.repository.js';

describe('list-recurring.tool', () => {
  it('prefers a pending initial run over the repeatable cron nextRun', async () => {
    vi.spyOn(AgentJobRepository.prototype, 'getExecutionSummaryByScheduleKey').mockResolvedValue(
      null
    );
    const firstRunAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const queueService = {
      getAllRepeatableJobs: vi.fn().mockResolvedValue([
        {
          key: 'repeat:key:1',
          next: Date.now() + 7 * 24 * 60 * 60 * 1000,
          tz: 'America/Chicago',
        },
      ]),
      getJobStatus: vi.fn().mockResolvedValue({ status: 'queued' }),
    };

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: [
                {
                  id: 'repeat:key:1',
                  data: () => ({
                    actionSummary: 'Weekly recap',
                    cronExpression: '0 22 * * 2',
                    timezone: 'America/Chicago',
                    firstRunAt,
                    initialRunJobId: 'initial-1',
                    createdAt: { toDate: () => new Date('2026-06-09T01:00:00.000Z') },
                  }),
                },
              ],
            }),
          })),
        })),
      })),
    } as unknown as Firestore;

    const tool = new ListRecurringTasksTool(queueService as never, db);
    const result = await tool.execute({ userId: 'user-1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        tasks: [
          expect.objectContaining({
            key: 'repeat:key:1',
            nextRun: firstRunAt,
          }),
        ],
      })
    );
    expect(queueService.getJobStatus).toHaveBeenCalledWith('initial-1');
  });

  it('falls back to the repeatable cron nextRun when the initial run is no longer queued', async () => {
    vi.spyOn(AgentJobRepository.prototype, 'getExecutionSummaryByScheduleKey').mockResolvedValue(
      null
    );
    const repeatableNextRun = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const queueService = {
      getAllRepeatableJobs: vi.fn().mockResolvedValue([
        {
          key: 'repeat:key:1',
          next: Date.parse(repeatableNextRun),
          tz: 'America/Chicago',
        },
      ]),
      getJobStatus: vi.fn().mockResolvedValue({ status: 'completed' }),
    };

    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: [
                {
                  id: 'repeat:key:1',
                  data: () => ({
                    actionSummary: 'Weekly recap',
                    cronExpression: '0 22 * * 2',
                    timezone: 'America/Chicago',
                    firstRunAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                    initialRunJobId: 'initial-1',
                    createdAt: { toDate: () => new Date('2026-06-09T01:00:00.000Z') },
                  }),
                },
              ],
            }),
          })),
        })),
      })),
    } as unknown as Firestore;

    const tool = new ListRecurringTasksTool(queueService as never, db);
    const result = await tool.execute({ userId: 'user-1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        tasks: [
          expect.objectContaining({
            key: 'repeat:key:1',
            nextRun: repeatableNextRun,
          }),
        ],
      })
    );
  });
});
