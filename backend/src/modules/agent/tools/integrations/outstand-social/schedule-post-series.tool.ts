import { randomUUID } from 'node:crypto';
import { logger } from '../../../../../utils/logger.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OutstandSocialBridgeService } from './outstand-social-bridge.service.js';
import { getUserConnectedSocialAccountsByPlatform } from './user-social-account-store.js';
import { SchedulePostSeriesInputSchema } from './schemas.js';

export class SchedulePostSeriesTool extends BaseTool {
  readonly name = 'schedule_post_series';
  readonly description =
    'Schedule a batch series of social posts across connected X, Instagram, YouTube, and TikTok accounts.';
  readonly parameters = SchedulePostSeriesInputSchema;

  readonly isMutation = true;
  readonly category = 'communication' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly bridge: OutstandSocialBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const parsed = SchedulePostSeriesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const batchId = randomUUID();
    const successes: Array<{
      readonly index: number;
      readonly postIds: string[];
      readonly scheduledAt?: string;
      readonly platforms: string[];
    }> = [];
    const failures: Array<{ readonly index: number; readonly error: string }> = [];

    for (const [index, post] of parsed.data.posts.entries()) {
      context.emitStage?.('submitting_job', {
        icon: 'processing',
        phase: 'schedule_post_series',
        step: `post_${index + 1}`,
      });

      try {
        const accountLookup = await getUserConnectedSocialAccountsByPlatform(
          context.userId,
          post.platforms,
          context.environment
        );

        const missing = post.platforms.filter(
          (platform) => !accountLookup[platform] || accountLookup[platform]?.isActive === false
        );

        if (missing.length > 0) {
          throw new Error(
            `No active connected account for: ${missing.join(', ')}. Connect these profiles before scheduling.`
          );
        }

        const socialAccountIds = post.platforms.map((platform) => accountLookup[platform]!.id);

        const result = await this.bridge.createPost({
          content: post.content,
          socialAccountIds,
          mediaIds: post.mediaIds,
          scheduledAt: post.scheduledAt,
          firstComment: post.firstComment,
          threadContent: post.threadContent,
          platformOverrides: post.platformOverrides,
        });

        successes.push({
          index,
          postIds: result.postIds,
          scheduledAt: result.scheduledAt,
          platforms: [...post.platforms],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown scheduling error';
        failures.push({ index, error: message });

        if (parsed.data.failFast) {
          break;
        }
      }
    }

    if (successes.length === 0) {
      return {
        success: false,
        error:
          failures[0]?.error ??
          'Unable to schedule post series. Ensure social accounts are connected and try again.',
      };
    }

    const firstScheduledTime = successes
      .map((entry) => entry.scheduledAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()[0];

    const lastScheduledTime = successes
      .map((entry) => entry.scheduledAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .at(-1);

    const markdown = [
      `### Post Series Scheduled`,
      `- Batch ID: ${batchId}`,
      `- Successful posts: ${successes.length}`,
      `- Failed posts: ${failures.length}`,
      ...(firstScheduledTime
        ? [`- First scheduled: ${new Date(firstScheduledTime).toLocaleString()}`]
        : []),
      ...(lastScheduledTime
        ? [`- Last scheduled: ${new Date(lastScheduledTime).toLocaleString()}`]
        : []),
    ].join('\n');

    if (failures.length > 0) {
      logger.warn('[Outstand] schedule_post_series partial failure', {
        userId: context.userId,
        batchId,
        failures,
      });
    }

    return {
      success: true,
      data: {
        batchId,
        successCount: successes.length,
        failureCount: failures.length,
        posts: successes,
        failures,
        firstScheduledTime,
        lastScheduledTime,
      },
      markdown,
    };
  }
}
