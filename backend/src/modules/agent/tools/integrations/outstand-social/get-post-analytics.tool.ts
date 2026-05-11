import { logger } from '../../../../../utils/logger.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OutstandSocialBridgeService } from './outstand-social-bridge.service.js';
import { GetPostAnalyticsInputSchema } from './schemas.js';

export class GetPostAnalyticsTool extends BaseTool {
  readonly name = 'get_post_analytics';
  readonly description =
    'Fetch analytics for a single social post. Returns likes, comments, shares, views, reach, and engagement rate.';
  readonly parameters = GetPostAnalyticsInputSchema;

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

    const parsed = GetPostAnalyticsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    try {
      context.emitStage?.('fetching_data', {
        icon: 'search',
        phase: 'get_post_analytics',
      });

      const analytics = await this.bridge.getPostAnalytics(parsed.data.postId);
      const totalInteractions = analytics.likes + analytics.comments + analytics.shares;

      const markdown = [
        `### Post Analytics`,
        `- Post ID: ${analytics.postId}`,
        `- Likes: ${analytics.likes}`,
        `- Comments: ${analytics.comments}`,
        `- Shares: ${analytics.shares}`,
        `- Views: ${analytics.views}`,
        `- Reach: ${analytics.reach}`,
        `- Impressions: ${analytics.impressions}`,
        `- Engagement Rate: ${analytics.engagementRate.toFixed(2)}%`,
        `- Total Interactions: ${totalInteractions}`,
      ].join('\n');

      return {
        success: true,
        data: {
          ...analytics,
          totalInteractions,
        },
        markdown,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch post analytics.';
      logger.error('[Outstand] get_post_analytics failed', {
        userId: context.userId,
        postId: parsed.data.postId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
