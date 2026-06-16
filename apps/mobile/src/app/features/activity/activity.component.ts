/**
 * @fileoverview Activity Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/activity
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
 * - User context from AuthFlowService
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  afterNextRender,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ActivityShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtBottomSheetService,
  SHEET_PRESETS,
  AgentXOperationChatComponent,
  AgentXService,
  type ActivityUser,
} from '@nxt1/ui';
import { ManageTeamMembershipModalService } from '@nxt1/ui/manage-team';
import type { ActivityItem, InboxEmailProvider, AgentTaskActivityMetadata } from '@nxt1/core';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { MobileEmailConnectionService } from '../../core/services/api/email-connection.service';
import { ProfileService } from '../../core/services/state/profile.service';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ActivityShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-activity-shell
        [user]="userInfo()"
        [showBack]="true"
        (back)="onBack()"
        (avatarClick)="onAvatarClick()"
        (itemNavigate)="onItemNavigate($event)"
        (connectProviderRequest)="onConnectProvider($event)"
      />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileService = inject(ProfileService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly agentX = inject(AgentXService);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly emailConnection = inject(MobileEmailConnectionService);
  private readonly membershipModal = inject(ManageTeamMembershipModalService);

  constructor() {
    afterNextRender(() => this.openManageMembersFromQuery());
  }

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;
    const connectedEmails = this.profileService.user()?.connectedEmails ?? [];

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      email: user.email,
      connectedEmails,
      uid: user.uid,
    };
  });

  /**
   * Handle back navigation.
   */
  protected onBack(): void {
    void this.navController.back();
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Uses NavController for native page transitions.
   *
   * For agent_task items, opens the thread in a bottom sheet
   * so users can view the conversation and any generated media.
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

    // Normalize deep link: canonical route is /agent-x.
    const normalizedLink = item.deepLink.replace(/^\/agent(?=[/?]|$)/, '/agent-x');

    if (this.openManageMembersFromActivityItem(item, normalizedLink)) {
      return;
    }

    const threadId = this.resolveAgentThreadId(item, normalizedLink);
    if (this.shouldOpenAgentThread(item, normalizedLink, threadId)) {
      this.logger.info('Opening agent task from activity in bottom sheet', {
        id: item.id,
        threadId,
      });

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

    const startupPrompt = this.resolveAgentStartupPrompt(item, normalizedLink);
    if (startupPrompt) {
      this.agentX.queueStartupMessage(startupPrompt);
    }

    void this.navController.navigateForward(normalizedLink);
  }

  private openManageMembersFromQuery(): void {
    const query = this.route.snapshot.queryParamMap;
    const teamId = query.get('manageMembersTeamId');
    if (!teamId) {
      return;
    }

    const initialFilter = this.resolveManageMembersFilter(query.get('filter'));
    void this.membershipModal.open({ teamId, initialFilter }).catch((err) => {
      this.logger.error('Failed to open manage members from activity deep link', err, {
        teamId,
        initialFilter,
      });
    });
  }

  private openManageMembersFromActivityItem(item: ActivityItem, deepLink: string): boolean {
    const request = this.resolveManageMembersRequest(item, deepLink);
    if (!request) {
      return false;
    }

    void this.membershipModal.open(request);
    return true;
  }

  private resolveManageMembersRequest(
    item: ActivityItem,
    deepLink: string
  ): { teamId: string; initialFilter: 'roster' | 'staff' | 'pending' | null } | null {
    const metadata = item.metadata ?? {};
    const metadataTarget = metadata['navigationTarget'];
    const metadataTeamId = metadata['teamId'];
    if (metadataTarget === 'manage-members' && typeof metadataTeamId === 'string') {
      return {
        teamId: metadataTeamId,
        initialFilter: this.resolveManageMembersFilter(metadata['initialFilter']),
      };
    }

    if (!deepLink.startsWith('/manage-team') && !deepLink.startsWith('/activity')) {
      return null;
    }

    try {
      const url = new URL(deepLink, 'https://nxt1.local');
      const teamId = url.searchParams.get('manageMembersTeamId') ?? url.searchParams.get('teamId');
      if (!teamId) {
        return null;
      }

      return {
        teamId,
        initialFilter: this.resolveManageMembersFilter(
          url.searchParams.get('filter') ?? url.searchParams.get('tab')
        ),
      };
    } catch {
      this.logger.warn('Failed to parse manage members deep link', { deepLink });
      return null;
    }
  }

  private resolveManageMembersFilter(value: unknown): 'roster' | 'staff' | 'pending' | null {
    return value === 'pending' || value === 'staff' || value === 'roster' ? value : 'roster';
  }

  /**
   * Handle connect email provider request.
   * Uses EmailConnectionService to connect Gmail or Microsoft.
   * Native SDKs automatically show account picker for user selection.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    const user = this.authFlow.user();
    if (!user?.uid) {
      this.logger.warn('User not authenticated, cannot connect email provider');
      return;
    }

    // Delegate to EmailConnectionService
    // Service handles account selection, OAuth flow, API calls, and error handling
    await this.emailConnection.connectProvider(provider, user.uid);
  }

  private resolveAgentThreadId(item: ActivityItem, normalizedLink: string): string | null {
    const metadata = item.metadata as AgentTaskActivityMetadata | undefined;
    if (metadata?.threadId?.trim()) {
      return metadata.threadId.trim();
    }

    if (!normalizedLink.startsWith('/agent-x')) {
      return null;
    }

    try {
      const url = new URL(normalizedLink, 'https://nxt1.local');
      return url.searchParams.get('thread');
    } catch (error) {
      this.logger.warn('Failed to parse agent deep link', {
        deepLink: item.deepLink,
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

  private resolveAgentStartupPrompt(item: ActivityItem, deepLink: string): string | null {
    if (!deepLink.startsWith('/agent-x')) {
      return null;
    }

    const metadata = item.metadata as AgentTaskActivityMetadata | undefined;
    const startupPrompt = metadata?.startupPrompt?.trim();
    return startupPrompt ? startupPrompt : null;
  }
}
