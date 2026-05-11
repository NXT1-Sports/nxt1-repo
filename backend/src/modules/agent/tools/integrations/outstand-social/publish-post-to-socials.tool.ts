import { logger } from '../../../../../utils/logger.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import type { OutstandSocialBridgeService } from './outstand-social-bridge.service.js';
import { getUserConnectedSocialAccountsByPlatform } from './user-social-account-store.js';
import { PublishPostToSocialsInputSchema } from './schemas.js';

export class PublishPostToSocialsTool extends BaseTool {
  readonly name = 'publish_post_to_socials';
  readonly description =
    'Publish a post to connected social platforms (X, Instagram, YouTube, TikTok). ' +
    'Supports immediate publishing and scheduled publishing with scheduledAt.';
  readonly parameters = PublishPostToSocialsInputSchema;

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

    const parsed = PublishPostToSocialsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    context.emitStage?.('fetching_data', {
      icon: 'processing',
      phase: 'resolve_social_accounts',
    });

    try {
      const accountLookup = await getUserConnectedSocialAccountsByPlatform(
        context.userId,
        parsed.data.platforms,
        context.environment
      );

      const missing = parsed.data.platforms.filter(
        (platform) => !accountLookup[platform] || accountLookup[platform]?.isActive === false
      );

      if (missing.length > 0) {
        return {
          success: false,
          error:
            `No active connected account found for: ${missing.join(', ')}. ` +
            'Connect these platforms in Settings -> Connected Socials before posting.',
        };
      }

      const accountIdsByPlatform = parsed.data.platforms.reduce(
        (acc, platform) => {
          const account = accountLookup[platform];
          if (account) acc[platform] = account.id;
          return acc;
        },
        {} as Record<(typeof parsed.data.platforms)[number], string>
      );

      context.emitStage?.('submitting_job', {
        icon: 'processing',
        phase: 'create_post',
      });

      const result = await this.bridge.publishPostForPlatforms(parsed.data, accountIdsByPlatform);

      const scheduledPhrase = result.scheduledAt
        ? `Scheduled for ${new Date(result.scheduledAt).toLocaleString()}.`
        : 'Published successfully.';

      const markdown = [
        `### Social Post Created`,
        `- Platforms: ${parsed.data.platforms.join(', ')}`,
        `- Post IDs: ${result.postIds.join(', ')}`,
        `- Status: ${result.status ?? 'created'}`,
        `- ${scheduledPhrase}`,
      ].join('\n');

      return {
        success: true,
        data: {
          postIds: result.postIds,
          status: result.status ?? 'created',
          platforms: parsed.data.platforms,
          scheduledAt: result.scheduledAt,
          isScheduled: !!result.scheduledAt,
          raw: result.raw,
        },
        markdown,
      };
    } catch (error) {
      const message =
        error instanceof AgentEngineError || error instanceof Error
          ? error.message
          : 'Failed to publish post to socials.';

      logger.error('[Outstand] publish_post_to_socials failed', {
        userId: context.userId,
        error: message,
      });

      return { success: false, error: message };
    }
  }
}
