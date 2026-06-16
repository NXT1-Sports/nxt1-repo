import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../../base.tool.js';
import {
  FirecrawlMonitorService,
  FirecrawlMonitorServiceError,
  type FirecrawlMonitorCheckDetail,
  type FirecrawlMonitorSchedule,
} from './firecrawl-monitor.service.js';
import { logger } from '../../../../../../utils/logger.js';

const MONITOR_ALLOWED_AGENTS = [
  'strategy_coordinator',
  'data_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
  'admin_coordinator',
  'brand_coordinator',
] as const;

const monitorScheduleSchema = z
  .object({
    text: z.string().trim().min(1).optional(),
    cron: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
  })
  .refine((value) => !!value.text || !!value.cron, {
    message: 'schedule.text or schedule.cron is required',
    path: ['text'],
  });

const userScopedInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
});

const listFirecrawlMonitorsInputSchema = userScopedInputSchema;

const getFirecrawlMonitorInputSchema = userScopedInputSchema.extend({
  platform: z.string().trim().min(1),
});

const writeFirecrawlMonitorInputSchema = userScopedInputSchema.extend({
  platform: z.string().trim().min(1),
  targetUrl: z.string().trim().url(),
  schedule: monitorScheduleSchema,
  goal: z.string().trim().min(1).optional(),
  judgeEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateFirecrawlMonitorInputSchema = userScopedInputSchema
  .extend({
    platform: z.string().trim().min(1),
    targetUrl: z.string().trim().url().optional(),
    schedule: monitorScheduleSchema.optional(),
    goal: z.string().trim().min(1).optional(),
    judgeEnabled: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.targetUrl !== undefined ||
      value.schedule !== undefined ||
      value.goal !== undefined ||
      value.judgeEnabled !== undefined ||
      value.enabled !== undefined,
    {
      message: 'At least one monitor field must be provided to update.',
      path: ['platform'],
    }
  );

const deleteFirecrawlMonitorInputSchema = userScopedInputSchema.extend({
  platform: z.string().trim().min(1),
});

const getFirecrawlMonitorCheckInputSchema = userScopedInputSchema.extend({
  platform: z.string().trim().min(1),
  checkId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  pageStatus: z.enum(['same', 'new', 'changed', 'removed', 'error']).optional(),
});

function resolveActingUserId(
  inputUserId: string | undefined,
  context?: ToolExecutionContext
): string | null {
  const contextUserId = context?.userId?.trim();
  const explicitUserId = inputUserId?.trim();

  if (contextUserId && explicitUserId && contextUserId !== explicitUserId) {
    return null;
  }

  return contextUserId || explicitUserId || null;
}

function invalidUserScopeResult(): ToolResult {
  return {
    success: false,
    error: 'Authenticated tool context is required and must match the requested user.',
  };
}

function toErrorResult(error: unknown): ToolResult {
  if (error instanceof FirecrawlMonitorServiceError) {
    return { success: false, error: error.message };
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : 'Firecrawl monitor operation failed.',
  };
}

abstract class FirecrawlMonitorBaseTool extends BaseTool {
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = MONITOR_ALLOWED_AGENTS;

  protected readonly db: Firestore;
  protected readonly monitorService: FirecrawlMonitorService;

  constructor(db?: Firestore, monitorService?: FirecrawlMonitorService) {
    super();
    this.db = db ?? getFirestore();
    this.monitorService = monitorService ?? new FirecrawlMonitorService();
  }

  protected resolveUserId(inputUserId: string | undefined, context?: ToolExecutionContext): string {
    const userId = resolveActingUserId(inputUserId, context);
    if (!userId) {
      throw new Error('Authenticated tool context is required and must match the requested user.');
    }
    return userId;
  }

  protected handleToolError(
    toolName: string,
    error: unknown,
    details: Record<string, unknown>
  ): ToolResult {
    logger.error(`[${toolName}] Firecrawl monitor tool failed`, {
      ...details,
      error: error instanceof Error ? error.message : String(error),
    });
    return toErrorResult(error);
  }
}

export class ListFirecrawlMonitorsTool extends FirecrawlMonitorBaseTool {
  readonly name = 'list_firecrawl_monitors';
  readonly description =
    'Lists the connected Firecrawl monitors for the current user by platform. Use this before creating, updating, or deleting a monitor so Agent X can see the current monitoring state.';
  readonly parameters = listFirecrawlMonitorsInputSchema;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = listFirecrawlMonitorsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    try {
      const monitors = await this.monitorService.listMonitors(this.db, userId);
      return {
        success: true,
        data: {
          userId,
          count: Object.keys(monitors).length,
          monitors,
        },
      };
    } catch (error) {
      return this.handleToolError('ListFirecrawlMonitorsTool', error, { userId });
    }
  }
}

export class GetFirecrawlMonitorTool extends FirecrawlMonitorBaseTool {
  readonly name = 'get_firecrawl_monitor';
  readonly description =
    'Gets the Firecrawl monitor configured for one connected platform for the current user, including schedule, status, target URL, and latest check summary when available.';
  readonly parameters = getFirecrawlMonitorInputSchema;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = getFirecrawlMonitorInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    try {
      const monitor = await this.monitorService.getMonitor(this.db, userId, parsed.data.platform);
      if (!monitor) {
        return {
          success: false,
          error: `No Firecrawl monitor exists for ${parsed.data.platform}.`,
        };
      }

      return {
        success: true,
        data: {
          userId,
          platform: parsed.data.platform,
          monitor,
        },
      };
    } catch (error) {
      return this.handleToolError('GetFirecrawlMonitorTool', error, {
        userId,
        platform: parsed.data.platform,
      });
    }
  }
}

export class WriteFirecrawlMonitorTool extends FirecrawlMonitorBaseTool {
  readonly name = 'write_firecrawl_monitor';
  readonly description =
    'Creates a Firecrawl monitor for a connected platform on the current user. Use this when the user wants Agent X to watch a source for updates and send follow-up notifications.';
  readonly parameters = writeFirecrawlMonitorInputSchema;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = writeFirecrawlMonitorInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'write_firecrawl_monitor',
    });

    try {
      const monitor = await this.monitorService.createMonitor(this.db, userId, {
        platform: parsed.data.platform,
        targetUrl: parsed.data.targetUrl,
        schedule: parsed.data.schedule,
        ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
        ...(typeof parsed.data.judgeEnabled === 'boolean'
          ? { judgeEnabled: parsed.data.judgeEnabled }
          : {}),
        ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
      });

      return {
        success: true,
        data: {
          userId,
          platform: parsed.data.platform,
          monitor,
          message: `Firecrawl monitoring is now active for ${parsed.data.platform}.`,
        },
      };
    } catch (error) {
      return this.handleToolError('WriteFirecrawlMonitorTool', error, {
        userId,
        platform: parsed.data.platform,
      });
    }
  }
}

export class UpdateFirecrawlMonitorTool extends FirecrawlMonitorBaseTool {
  readonly name = 'update_firecrawl_monitor';
  readonly description =
    'Updates an existing Firecrawl monitor for the current user. Use this to change the target URL, schedule, goal, judge setting, or to pause and resume monitoring.';
  readonly parameters = updateFirecrawlMonitorInputSchema;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = updateFirecrawlMonitorInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'update_firecrawl_monitor',
    });

    try {
      const monitor = await this.monitorService.updateMonitor(
        this.db,
        userId,
        parsed.data.platform,
        {
          ...(parsed.data.targetUrl ? { targetUrl: parsed.data.targetUrl } : {}),
          ...(parsed.data.schedule
            ? { schedule: parsed.data.schedule as FirecrawlMonitorSchedule }
            : {}),
          ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
          ...(typeof parsed.data.judgeEnabled === 'boolean'
            ? { judgeEnabled: parsed.data.judgeEnabled }
            : {}),
          ...(typeof parsed.data.enabled === 'boolean' ? { enabled: parsed.data.enabled } : {}),
        }
      );

      return {
        success: true,
        data: {
          userId,
          platform: parsed.data.platform,
          monitor,
          message: `Firecrawl monitor updated for ${parsed.data.platform}.`,
        },
      };
    } catch (error) {
      return this.handleToolError('UpdateFirecrawlMonitorTool', error, {
        userId,
        platform: parsed.data.platform,
      });
    }
  }
}

export class DeleteFirecrawlMonitorTool extends FirecrawlMonitorBaseTool {
  readonly name = 'delete_firecrawl_monitor';
  readonly description =
    'Deletes the Firecrawl monitor for a connected platform on the current user. Use this when the user wants monitoring fully removed instead of merely paused.';
  readonly parameters = deleteFirecrawlMonitorInputSchema;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = deleteFirecrawlMonitorInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'delete_firecrawl_monitor',
    });

    try {
      const deleted = await this.monitorService.deleteMonitor(
        this.db,
        userId,
        parsed.data.platform
      );
      return {
        success: true,
        data: {
          userId,
          platform: parsed.data.platform,
          deleted: true,
          previousMonitor: deleted,
          message: `Firecrawl monitoring was removed for ${parsed.data.platform}.`,
        },
      };
    } catch (error) {
      return this.handleToolError('DeleteFirecrawlMonitorTool', error, {
        userId,
        platform: parsed.data.platform,
      });
    }
  }
}

export class GetFirecrawlMonitorCheckTool extends FirecrawlMonitorBaseTool {
  readonly name = 'get_firecrawl_monitor_check';
  readonly description =
    "Fetches the detailed check result for one of the current user's Firecrawl monitors, including page-level changes and the normalized summary counts.";
  readonly parameters = getFirecrawlMonitorCheckInputSchema;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = getFirecrawlMonitorCheckInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = resolveActingUserId(parsed.data.userId, context);
    if (!userId) return invalidUserScopeResult();

    try {
      const monitor = await this.monitorService.getMonitor(this.db, userId, parsed.data.platform);
      if (!monitor) {
        return {
          success: false,
          error: `No Firecrawl monitor exists for ${parsed.data.platform}.`,
        };
      }

      const check: FirecrawlMonitorCheckDetail = await this.monitorService.getMonitorCheck(
        monitor.monitorId,
        parsed.data.checkId,
        {
          ...(typeof parsed.data.limit === 'number' ? { limit: parsed.data.limit } : {}),
          ...(parsed.data.pageStatus ? { pageStatus: parsed.data.pageStatus } : {}),
        }
      );

      return {
        success: true,
        data: {
          userId,
          platform: parsed.data.platform,
          monitor,
          check,
        },
      };
    } catch (error) {
      return this.handleToolError('GetFirecrawlMonitorCheckTool', error, {
        userId,
        platform: parsed.data.platform,
        checkId: parsed.data.checkId,
      });
    }
  }
}
