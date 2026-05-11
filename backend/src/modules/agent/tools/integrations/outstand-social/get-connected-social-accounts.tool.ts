import { logger } from '../../../../../utils/logger.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OutstandSocialBridgeService } from './outstand-social-bridge.service.js';
import {
  getUserConnectedSocialAccountsByPlatform,
  listUserConnectedSocialAccounts,
} from './user-social-account-store.js';
import { GetConnectedSocialAccountsInputSchema, type OutstandSocialAccount } from './schemas.js';

export class GetConnectedSocialAccountsTool extends BaseTool {
  readonly name = 'get_connected_social_accounts';
  readonly description =
    "List the user's connected social accounts across X, Instagram, YouTube, and TikTok.";
  readonly parameters = GetConnectedSocialAccountsInputSchema;

  readonly isMutation = false;
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

    const parsed = GetConnectedSocialAccountsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    try {
      const requestedPlatforms = parsed.data.platforms;
      const storedAccounts = requestedPlatforms
        ? Object.values(
            await getUserConnectedSocialAccountsByPlatform(
              context.userId,
              requestedPlatforms,
              context.environment
            )
          ).filter((account): account is OutstandSocialAccount => !!account)
        : await listUserConnectedSocialAccounts(context.userId, context.environment);

      const remoteAccounts = requestedPlatforms
        ? (
            await Promise.all(
              requestedPlatforms.map((platform) => this.bridge.listSocialAccounts(platform))
            )
          ).flat()
        : await this.bridge.listSocialAccounts();

      const remoteById = new Map(remoteAccounts.map((account) => [account.id, account]));

      const merged = storedAccounts.map((stored) => {
        const remote = remoteById.get(stored.id);
        return {
          id: stored.id,
          network: stored.network,
          username: remote?.username ?? stored.username,
          displayName: remote?.displayName ?? stored.displayName,
          profileUrl: remote?.profileUrl ?? stored.profileUrl,
          followerCount: remote?.followerCount ?? stored.followerCount ?? 0,
          connectedAt: stored.connectedAt ?? remote?.connectedAt,
          isActive: stored.isActive,
          source: remote ? 'stored+remote' : 'stored',
        };
      });

      const markdown = merged.length
        ? [
            '### Connected Social Accounts',
            ...merged.map(
              (account) =>
                `- ${account.network}: @${account.username} (${account.followerCount} followers)`
            ),
          ].join('\n')
        : 'No connected social accounts found. Connect X, Instagram, YouTube, or TikTok first.';

      return {
        success: true,
        data: {
          accounts: merged,
          count: merged.length,
          platformsRequested: requestedPlatforms ?? null,
        },
        markdown,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to list connected social accounts.';
      logger.error('[Outstand] get_connected_social_accounts failed', {
        userId: context.userId,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
