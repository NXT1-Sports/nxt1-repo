import { logger } from '../../../../../utils/logger.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OutstandSocialBridgeService } from './outstand-social-bridge.service.js';
import { listUserConnectedSocialAccounts } from './user-social-account-store.js';
import { GetProfileAnalyticsInputSchema, type OutstandSocialPlatform } from './schemas.js';

function daysAgoIso(daysBack: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString();
}

export class GetProfileAnalyticsTool extends BaseTool {
  readonly name = 'get_profile_analytics';
  readonly description =
    'Fetch account-level analytics (follower metrics and engagement trends) across connected social profiles.';
  readonly parameters = GetProfileAnalyticsInputSchema;

  readonly isMutation = false;
  readonly category = 'analytics' as const;
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

    const parsed = GetProfileAnalyticsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    try {
      const daysBack = parsed.data.daysBack ?? 30;
      const startDate = daysAgoIso(daysBack);
      const endDate = new Date().toISOString();

      const connectedAccounts = await listUserConnectedSocialAccounts(
        context.userId,
        context.environment
      );
      const activeAccounts = connectedAccounts.filter((account) => account.isActive !== false);

      const selectedPlatforms = new Set<OutstandSocialPlatform>(parsed.data.platforms ?? []);
      const filteredAccounts =
        selectedPlatforms.size > 0
          ? activeAccounts.filter((account) => selectedPlatforms.has(account.network))
          : activeAccounts;

      if (filteredAccounts.length === 0) {
        return {
          success: false,
          error:
            'No connected social profiles found for the requested platforms. Connect X, Instagram, YouTube, or TikTok first.',
        };
      }

      context.emitStage?.('fetching_data', {
        icon: 'search',
        phase: 'get_profile_analytics',
      });

      const metricsResults = await Promise.all(
        filteredAccounts.map(async (account) => {
          const metrics = await this.bridge.getAccountMetrics(account.id, startDate, endDate);
          return {
            account,
            metrics,
          };
        })
      );

      const perPlatform = metricsResults.map(({ account, metrics }) => ({
        platform: account.network,
        socialAccountId: account.id,
        username: account.username,
        followerCount: metrics.followerCount || account.followerCount || 0,
        engagementRate: metrics.engagementRate,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        views: metrics.views,
        impressions: metrics.impressions,
        reach: metrics.reach,
        trendPoints: metrics.trendPoints,
      }));

      const totals = perPlatform.reduce(
        (acc, current) => {
          acc.followerCount += current.followerCount;
          acc.likes += current.likes;
          acc.comments += current.comments;
          acc.shares += current.shares;
          acc.views += current.views;
          acc.impressions += current.impressions;
          acc.reach += current.reach;
          return acc;
        },
        {
          followerCount: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
          impressions: 0,
          reach: 0,
        }
      );

      const avgEngagementRate =
        perPlatform.length > 0
          ? perPlatform.reduce((sum, account) => sum + account.engagementRate, 0) /
            perPlatform.length
          : 0;

      const bestPlatform =
        perPlatform.length > 0
          ? [...perPlatform].sort((left, right) => right.engagementRate - left.engagementRate)[0]
          : null;

      const markdownLines = [
        `### Profile Analytics (${daysBack} days)`,
        `- Total Followers: ${totals.followerCount}`,
        `- Total Engagement: ${totals.likes + totals.comments + totals.shares}`,
        `- Average Engagement Rate: ${avgEngagementRate.toFixed(2)}%`,
      ];

      if (bestPlatform) {
        markdownLines.push(
          `- Best Platform: ${bestPlatform.platform} (@${bestPlatform.username}) ${bestPlatform.engagementRate.toFixed(2)}%`
        );
      }

      for (const row of perPlatform) {
        markdownLines.push(
          `- ${row.platform}: @${row.username} | followers=${row.followerCount} | engagement=${row.engagementRate.toFixed(2)}%`
        );
      }

      return {
        success: true,
        data: {
          daysBack,
          startDate,
          endDate,
          totals,
          averageEngagementRate: avgEngagementRate,
          bestPlatform,
          perPlatform,
        },
        markdown: markdownLines.join('\n'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch profile analytics.';
      logger.error('[Outstand] get_profile_analytics failed', {
        userId: context.userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
