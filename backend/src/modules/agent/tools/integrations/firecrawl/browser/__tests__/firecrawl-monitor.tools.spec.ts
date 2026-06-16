import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  DeleteFirecrawlMonitorTool,
  GetFirecrawlMonitorCheckTool,
  GetFirecrawlMonitorTool,
  ListFirecrawlMonitorsTool,
  UpdateFirecrawlMonitorTool,
  WriteFirecrawlMonitorTool,
} from '../firecrawl-monitor.tools.js';
import {
  FirecrawlMonitorServiceError,
  type FirecrawlMonitorService,
  type FirecrawlMonitorSummary,
  type FirecrawlMonitorCheckDetail,
} from '../firecrawl-monitor.service.js';
import type { ToolExecutionContext } from '../../../../base.tool.js';

const TEST_USER_ID = 'user-monitor-1';
const TEST_CONTEXT = { userId: TEST_USER_ID } satisfies ToolExecutionContext;
const mockDb = {} as Firestore;

const monitorSummary: FirecrawlMonitorSummary = {
  enabled: true,
  monitorId: 'mon_123',
  targetUrl: 'https://www.hudl.com/profile/athlete',
  status: 'active',
  schedule: { text: 'every day' },
  goal: 'Track athlete updates',
  judgeEnabled: true,
  metadata: { source: 'connected-accounts' },
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  lastCheckSummary: { changed: 2 },
};

const monitorCheck: FirecrawlMonitorCheckDetail = {
  id: 'check_123',
  monitorId: 'mon_123',
  status: 'completed',
  summary: { changed: 2, new: 1 },
  pages: [{ url: 'https://www.hudl.com/profile/athlete', status: 'changed' }],
};

function createMonitorServiceMock(): FirecrawlMonitorService {
  return {
    listMonitors: vi.fn().mockResolvedValue({ hudl: monitorSummary }),
    getMonitor: vi.fn().mockResolvedValue(monitorSummary),
    createMonitor: vi.fn().mockResolvedValue(monitorSummary),
    updateMonitor: vi
      .fn()
      .mockResolvedValue({ ...monitorSummary, enabled: false, status: 'paused' }),
    deleteMonitor: vi.fn().mockResolvedValue(monitorSummary),
    getMonitorCheck: vi.fn().mockResolvedValue(monitorCheck),
  } as unknown as FirecrawlMonitorService;
}

describe('Firecrawl monitor Agent X tools', () => {
  let service: FirecrawlMonitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMonitorServiceMock();
  });

  it('lists monitors with normalized tool metadata', async () => {
    const tool = new ListFirecrawlMonitorsTool(mockDb, service);

    expect(tool.name).toBe('list_firecrawl_monitors');
    expect(tool.isMutation).toBe(false);

    const result = await tool.execute({}, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(service.listMonitors).toHaveBeenCalledWith(mockDb, TEST_USER_ID);
    expect((result.data as Record<string, unknown>)['count']).toBe(1);
  });

  it('gets one platform monitor by normalized tool name', async () => {
    const tool = new GetFirecrawlMonitorTool(mockDb, service);

    expect(tool.name).toBe('get_firecrawl_monitor');

    const result = await tool.execute({ platform: 'hudl' }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(service.getMonitor).toHaveBeenCalledWith(mockDb, TEST_USER_ID, 'hudl');
  });

  it('creates a monitor through write_firecrawl_monitor', async () => {
    const tool = new WriteFirecrawlMonitorTool(mockDb, service);

    expect(tool.name).toBe('write_firecrawl_monitor');
    expect(tool.isMutation).toBe(true);

    const emitStage = vi.fn();
    const result = await tool.execute(
      {
        platform: 'hudl',
        targetUrl: 'https://www.hudl.com/profile/athlete',
        schedule: { text: 'every day' },
        goal: 'Track athlete updates',
        judgeEnabled: true,
        metadata: { source: 'connected-accounts' },
      },
      { ...TEST_CONTEXT, emitStage }
    );

    expect(result.success).toBe(true);
    expect(emitStage).toHaveBeenCalledWith(
      'submitting_job',
      expect.objectContaining({ phase: 'write_firecrawl_monitor' })
    );
    expect(service.createMonitor).toHaveBeenCalledWith(
      mockDb,
      TEST_USER_ID,
      expect.objectContaining({
        platform: 'hudl',
        targetUrl: 'https://www.hudl.com/profile/athlete',
      })
    );
  });

  it('updates a monitor through update_firecrawl_monitor', async () => {
    const tool = new UpdateFirecrawlMonitorTool(mockDb, service);

    expect(tool.name).toBe('update_firecrawl_monitor');

    const result = await tool.execute(
      {
        platform: 'hudl',
        enabled: false,
        schedule: { text: 'every week' },
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(service.updateMonitor).toHaveBeenCalledWith(
      mockDb,
      TEST_USER_ID,
      'hudl',
      expect.objectContaining({ enabled: false })
    );
  });

  it('deletes a monitor through delete_firecrawl_monitor', async () => {
    const tool = new DeleteFirecrawlMonitorTool(mockDb, service);

    expect(tool.name).toBe('delete_firecrawl_monitor');

    const result = await tool.execute({ platform: 'hudl' }, TEST_CONTEXT);

    expect(result.success).toBe(true);
    expect(service.deleteMonitor).toHaveBeenCalledWith(mockDb, TEST_USER_ID, 'hudl');
  });

  it('loads a check through the stored platform monitor id', async () => {
    const tool = new GetFirecrawlMonitorCheckTool(mockDb, service);

    expect(tool.name).toBe('get_firecrawl_monitor_check');

    const result = await tool.execute(
      {
        platform: 'hudl',
        checkId: 'check_123',
        limit: 10,
        pageStatus: 'changed',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(service.getMonitor).toHaveBeenCalledWith(mockDb, TEST_USER_ID, 'hudl');
    expect(service.getMonitorCheck).toHaveBeenCalledWith('mon_123', 'check_123', {
      limit: 10,
      pageStatus: 'changed',
    });
  });

  it('rejects mismatched explicit user scope', async () => {
    const tool = new ListFirecrawlMonitorsTool(mockDb, service);

    const result = await tool.execute({ userId: 'someone-else' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Authenticated tool context is required');
  });

  it('maps service errors into tool failures', async () => {
    const failingService = createMonitorServiceMock();
    vi.mocked(failingService.deleteMonitor).mockRejectedValue(
      new FirecrawlMonitorServiceError(
        'MONITOR_NOT_FOUND',
        'No Firecrawl monitor exists for hudl.',
        404
      )
    );

    const tool = new DeleteFirecrawlMonitorTool(mockDb, failingService);
    const result = await tool.execute({ platform: 'hudl' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No Firecrawl monitor exists for hudl.');
  });
});
