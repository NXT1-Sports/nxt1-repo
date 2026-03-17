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
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import type { ActivityTabId, ActivityItem, InboxEmailProvider } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [ActivityShellComponent],
  template: `
    <nxt1-activity-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (tabChange)="onTabChange($event)"
      (itemNavigate)="onItemNavigate($event)"
      (connectProviderRequest)="onConnectProvider($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);

  private oauthWindow: Window | null = null;

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
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authService.user();
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
   * Message items navigate to /messages/:id, others use deepLink.
   */
  protected onItemNavigate(item: ActivityItem): void {
    if (item.deepLink) {
      this.logger.debug('Navigating to item', {
        id: item.id,
        type: item.type,
        deepLink: item.deepLink,
      });
      this.router.navigateByUrl(item.deepLink);
    } else {
      this.logger.debug('Item clicked without deepLink', { id: item.id, type: item.type });
    }
  }

  /**
   * Handle connect email provider request.
   * For web: Uses Google/Microsoft Sign-In SDK to get accessToken.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    this.logger.info('Connecting email provider', { provider: provider.id });

    try {
      // Get Firebase ID token for authentication
      const user = this.authService.user();
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
        // TODO: Implement Google Sign-In popup to get accessToken
        this.toast.error('Gmail connection requires Google SDK integration (coming soon)');
        this.logger.warn('[Gmail Connect] Google Identity Services not yet integrated');
        return;

        // Future implementation:
        // const { GoogleAuthProvider, signInWithPopup } = await import('@angular/fire/auth');
        // const result = await signInWithPopup(auth, new GoogleAuthProvider().addScope('https://www.googleapis.com/auth/gmail.send'));
        // const accessToken = result.user.stsTokenManager.accessToken;
        //
        // const response = await fetch(`${environment.apiURL}/auth/google/connect-gmail`, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${idToken}`,
        //   },
        //   body: JSON.stringify({ accessToken }),
        // });
        //
        // if (response.ok) {
        //   this.toast.success('Gmail connected successfully!');
        // }
      }

      if (provider.id === 'microsoft') {
        // TODO: Implement Microsoft popup to get accessToken
        this.toast.error('Microsoft connection requires MSAL integration (coming soon)');
        this.logger.warn('[Microsoft Connect] MSAL not yet integrated');
        return;

        // Future implementation:
        // const { PublicClientApplication } = await import('@azure/msal-browser');
        // const result = await msalInstance.acquireTokenPopup(config);
        // const accessToken = result.accessToken;
        //
        // const response = await fetch(`${environment.apiURL}/auth/microsoft/connect-mail`, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': `Bearer ${idToken}`,
        //   },
        //   body: JSON.stringify({ accessToken }),
        // });
        //
        // if (response.ok) {
        //   this.toast.success('Microsoft connected successfully!');
        // }
      }

      this.toast.error(`${provider.name} connection not yet available`);
    } catch (error) {
      this.logger.error('Failed to connect email provider', error, { provider: provider.id });
      this.toast.error(
        error instanceof Error
          ? error.message
          : `Failed to connect ${provider.name}. Please try again.`
      );
    }
  }

  /**
   * TODO: Handle Gmail/Microsoft connection result.
   * Currently not implemented - needs SDK integration.
   */
  private handleOAuthMessage(_event: MessageEvent, _provider: InboxEmailProvider): void {
    // Placeholder - will be implemented when SDKs are integrated
  }
}
