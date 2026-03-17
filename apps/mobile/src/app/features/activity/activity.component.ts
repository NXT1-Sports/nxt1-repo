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

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ActivityShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtToastService,
  type ActivityUser,
} from '@nxt1/ui';
import type { ActivityTabId, ActivityItem, InboxEmailProvider } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { AgentXService } from '../agent-x/services';
import { environment } from '../../../environments/environment';

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
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
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
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly agentX = inject(AgentXService);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly toast = inject(NxtToastService);

  constructor() {
    // No deep link listener needed for Gmail/Microsoft connection
    // Using direct API calls with credentials instead of OAuth redirect
  }

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ActivityTabId): void {
    this.logger.debug('Activity tab changed', { tab });
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Uses NavController for native page transitions.
   *
   * For agent_task items with imageUrl metadata (e.g. welcome graphic),
   * injects the image into the Agent X chat before navigating.
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

    // Agent task with image (welcome graphic, generated content) —
    // inject the message into Agent X chat so it's visible on arrival.
    const imageUrl = item.metadata?.['imageUrl'] as string | undefined;
    if (item.type === 'agent_task' && imageUrl && item.deepLink.includes('agent')) {
      this.agentX.pushMessage({
        role: 'assistant',
        content: item.body ?? "Here's your personalized welcome graphic!",
        imageUrl,
      });
    }

    // Normalize deep link: web uses /agent-x, mobile uses /agent
    const normalizedLink = item.deepLink.replace(/^\/agent-x(\/|$)/, '/agent$1');
    void this.navController.navigateForward(normalizedLink);
  }

  /**
   * Handle connect email provider request.
   * Connects Gmail or Microsoft email for inbox sync.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    this.logger.info('Connecting email provider', { provider: provider.id });

    try {
      // Get Firebase ID token for authentication
      const user = this.authFlow.user();
      if (!user?.uid) {
        this.toast.error('Please sign in to connect email');
        return;
      }

      // Get Firebase Auth instance to retrieve ID token
      const { getAuth } = await import('@angular/fire/auth');
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        throw new Error('Failed to get authentication token');
      }

      if (provider.id === 'gmail') {
        // TODO: Implement native Google Sign-In to get serverAuthCode
        // For now, show placeholder message
        this.toast.error('Gmail connection requires native SDK integration (coming soon)');
        this.logger.warn('[Gmail Connect] Native Google Sign-In SDK not yet integrated');
        return;

        // Future implementation:
        // const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        // const result = await GoogleAuth.signIn();
        // const serverAuthCode = result.serverAuthCode;
        //
        // await fetch(`${environment.apiUrl}/auth/google/connect-gmail`, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${idToken}`,
        //   },
        //   body: JSON.stringify({ serverAuthCode }),
        // });
      }

      if (provider.id === 'microsoft') {
        // TODO: Implement Microsoft MSAL to get accessToken
        this.toast.error('Microsoft connection requires MSAL SDK integration (coming soon)');
        this.logger.warn('[Microsoft Connect] MSAL SDK not yet integrated');
        return;

        // Future implementation:
        // const { PublicClientApplication } = await import('@azure/msal-browser');
        // const result = await msalInstance.acquireTokenPopup(config);
        // const accessToken = result.accessToken;
        //
        // await fetch(`${environment.apiUrl}/auth/microsoft/connect-mail`, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${idToken}`,
        //   },
        //   body: JSON.stringify({ accessToken }),
        // });
      }

      this.toast.error(`${provider.name} connection not yet available`);
    } catch (error) {
      this.logger.error('Failed to connect email provider', error, { provider: provider.id });
      this.toast.error(`Failed to connect ${provider.name}. Please try again.`);
    }
  }

  /**
   * TODO: Handle Gmail/Microsoft connection callback.
   * Currently not implemented - needs native SDK integration.
   */
  private async handleOAuthCallback(_url: string): Promise<void> {
    // Placeholder - will be implemented when native SDKs are integrated
  }
}
