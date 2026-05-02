/**
 * @fileoverview Activity Page - Web App Wrapper
 * @module @nxt1/web/features/activity
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Activity shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActivityShellComponent, type ActivityUser } from '@nxt1/ui/activity';
import { AgentXOperationChatComponent } from '@nxt1/ui/agent-x';
import { NxtBottomSheetService, SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ManageTeamMembershipModalService } from '@nxt1/ui/manage-team';
import type { ActivityItem, InboxEmailProvider, AgentTaskActivityMetadata } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';
import { WebEmailConnectionService } from '../../core/services/web/email-connection.service';
import { OAuthTokensService } from '../../core/services/web/oauth-tokens.service';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [ActivityShellComponent],
  template: `
    <nxt1-activity-shell
      [user]="userInfo()"
      [showHeader]="false"
      (avatarClick)="onAvatarClick()"
      (itemNavigate)="onItemNavigate($event)"
      (connectProviderRequest)="onConnectProvider($event)"
    />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly seo = inject(SeoService);
  private readonly emailConnection = inject(WebEmailConnectionService);
  private readonly oauthTokens = inject(OAuthTokensService);
  private readonly membershipModal = inject(ManageTeamMembershipModalService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Activity',
      description: 'Stay updated with notifications, messages, and activity from your network.',
      keywords: ['activity', 'notifications', 'messages', 'updates'],
      noIndex: true, // Protected page - don't index
    });
  }

  /**
   * Transform auth user to ActivityUser interface.
   * Uses the oauthTokens subcollection as the source of truth for connected providers.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      email: user.email,
      connectedEmails: this.oauthTokens.connectedEmails(),
      uid: user.uid,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Message items navigate to /messages/:id, others use deepLink.
   */
  protected onItemNavigate(item: ActivityItem): void {
    if (!item.deepLink) {
      this.logger.debug('Item clicked without deepLink', { id: item.id, type: item.type });
      return;
    }

    this.logger.debug('Navigating to item', {
      id: item.id,
      type: item.type,
      deepLink: item.deepLink,
    });

    const normalizedLink = item.deepLink.replace(/^\/agent(?=[/?]|$)/, '/agent-x');

    // Handle /manage-team deep links by opening the membership modal directly
    if (normalizedLink.startsWith('/manage-team')) {
      try {
        const url = new URL(normalizedLink, 'https://nxt1.local');
        const teamId = url.searchParams.get('teamId');
        const tab = url.searchParams.get('tab');
        if (teamId) {
          void this.membershipModal.open({
            teamId,
            initialFilter: tab === 'pending' ? 'pending' : null,
          });
          return;
        }
      } catch (err) {
        this.logger.warn('Failed to parse manage-team deep link', { deepLink: normalizedLink });
      }
    }

    const threadId = this.resolveAgentThreadId(item, normalizedLink);
    if (this.shouldOpenAgentThread(item, normalizedLink, threadId)) {
      void this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: item.id,
          contextTitle: item.title,
          contextIcon: 'sparkles',
          contextType: 'operation',
          threadId,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      return;
    }

    void this.router.navigateByUrl(normalizedLink);
  }

  private resolveAgentThreadId(item: ActivityItem, deepLink: string): string | null {
    const metadata = item.metadata as AgentTaskActivityMetadata | undefined;
    if (metadata?.threadId?.trim()) {
      return metadata.threadId.trim();
    }

    if (!deepLink.startsWith('/agent-x')) {
      return null;
    }

    try {
      const url = new URL(deepLink, 'https://nxt1.local');
      return url.searchParams.get('thread');
    } catch (error) {
      this.logger.warn('Failed to parse agent deep link', {
        deepLink,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private shouldOpenAgentThread(
    item: ActivityItem,
    deepLink: string,
    threadId: string | null
  ): threadId is string {
    if (!threadId) return false;

    if (item.type === 'agent_task') return true;
    if (deepLink.startsWith('/agent-x')) return true;

    const metadata = item.metadata as AgentTaskActivityMetadata | undefined;
    return Boolean(metadata?.operationId?.trim() || metadata?.sessionId?.trim());
  }

  /**
   * Handle connect email provider request.
   * Uses EmailConnectionService to connect Gmail or Microsoft.
   * Browser popups automatically show account picker for user selection.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    const user = this.authService.user();
    if (!user?.uid) {
      this.logger.warn('User not authenticated, cannot connect email provider');
      return;
    }

    await this.emailConnection.connectProvider(provider, user.uid);
  }
}
