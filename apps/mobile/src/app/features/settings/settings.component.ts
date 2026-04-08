/**
 * @fileoverview Settings Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/settings
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Settings shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 * - Confirmation dialogs
 */

import { Component, ChangeDetectionStrategy, inject, computed, effect } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  SettingsShellComponent,
  SettingsService,
  NxtLoggingService,
  NxtBottomSheetService,
  NxtToastService,
  SHEET_PRESETS,
  type SettingsUser,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
} from '@nxt1/ui';
import type { SettingsUserInfo, SettingsSubscription, InboxEmailProvider } from '@nxt1/core';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { MobileEmailConnectionService } from '../activity/services/email-connection.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, SettingsShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-settings-shell
        [user]="userInfo()"
        [connectProviderCallback]="connectProviderCallback"
        (back)="onBack()"
        (editProfile)="onEditProfile()"
        (navigate)="onNavigate($event)"
        (action)="onAction($event)"
        (signOut)="onSignOut()"
        (deleteAccount)="onDeleteAccount()"
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
export class SettingsComponent {
  private readonly authService = inject(AuthFlowService);
  private readonly settingsService = inject(SettingsService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly navController = inject(NavController);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('SettingsComponent');
  private readonly emailConnection = inject(MobileEmailConnectionService);

  constructor() {
    // Reactively sync auth user → SettingsService whenever auth state changes
    effect(() => {
      const user = this.authService.user();
      const firebaseUser = this.authService.firebaseUser();

      if (user) {
        const settingsUser: SettingsUserInfo = {
          id: user.uid,
          email: user.email,
          displayName: user.displayName || null,
          profileImg: user.profileImg ?? null,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          lastLoginAt: firebaseUser?.metadata?.lastSignInTime ?? null,
        };
        this.settingsService.setUser(settingsUser);

        // Usage-based billing — no tier derivation needed
        const subscription: SettingsSubscription = {
          tier: 'metered',
          status: 'active',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEnd: null,
        };
        this.settingsService.setSubscription(subscription);
      } else {
        this.settingsService.setUser(null);
      }
    });
  }

  /**
   * Transform auth user to SettingsUser interface.
   */
  protected readonly userInfo = computed<SettingsUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    // Access full profile from ProfileService for sports & connectedSources
    const profile = this.authService.profile();

    // Firebase OAuth provider IDs → platform IDs used in the link drop step
    const PROVIDER_ID_MAP: Record<string, string> = {
      'google.com': 'google',
      'apple.com': 'apple',
      'microsoft.com': 'microsoft',
    };

    // Signed-in OAuth providers from Firebase Auth (mark as connected)
    const firebaseUser = this.authService.firebaseUser();
    const firebaseSigninLinks = (firebaseUser?.providerData ?? [])
      .filter((p) => PROVIDER_ID_MAP[p.providerId])
      .map((p) => ({
        platform: PROVIDER_ID_MAP[p.providerId]!,
        connected: true,
        connectionType: 'signin' as const,
        scopeType: 'global' as const,
      }));

    // Also check backend-stored email token connections (Agent X OAuth flow).
    // provider: 'gmail' → platform: 'google', provider: 'microsoft' → platform: 'microsoft'
    const EMAIL_PROVIDER_PLATFORM: Record<string, string> = {
      gmail: 'google',
      microsoft: 'microsoft',
    };
    const firebasePlatforms = new Set(firebaseSigninLinks.map((l) => l.platform));
    const emailTokenLinks = (user.connectedEmails ?? [])
      .filter((e) => e.isActive !== false && EMAIL_PROVIDER_PLATFORM[e.provider])
      .filter((e) => !firebasePlatforms.has(EMAIL_PROVIDER_PLATFORM[e.provider]))
      .map((e) => ({
        platform: EMAIL_PROVIDER_PLATFORM[e.provider]!,
        connected: true,
        connectionType: 'signin' as const,
        scopeType: 'global' as const,
      }));

    const signinLinks = [...firebaseSigninLinks, ...emailTokenLinks];

    // Convert ConnectedSource[] → LinkSourcesFormData for the shared link drop step
    const linkedSources = (profile?.connectedSources ?? []).map((src) => ({
      platform: src.platform,
      connected: true,
      connectionType: 'link' as const,
      url: src.profileUrl,
      scopeType: src.scopeType ?? 'global',
      scopeId: src.scopeId,
    }));

    const allLinks = [...linkedSources, ...signinLinks];
    const linkSourcesData: LinkSourcesFormData | null = allLinks.length
      ? { links: allLinks }
      : null;

    return {
      profileImg: user.profileImg ?? undefined,
      displayName: user.displayName ?? undefined,
      connectedEmails: user.connectedEmails ?? [],
      role: (profile?.role as OnboardingUserType) ?? null,
      selectedSports: profile?.sports?.map((s) => s.sport).filter(Boolean) ?? [],
      linkSourcesData,
      scope: 'athlete' as const,
    };
  });

  protected readonly connectProviderCallback = (provider: InboxEmailProvider): void => {
    void this.onConnectProvider(provider);
  };

  /**
   * Handle back navigation using Ionic's navigation stack.
   */
  protected onBack(): void {
    this.navController.back();
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.navController.navigateForward('/settings/account-information');
  }

  /**
   * Handle navigation requests from settings items.
   */
  protected async onNavigate(event: SettingsNavigateEvent): Promise<void> {
    this.logger.debug('Navigate requested', { itemId: event.itemId, route: event.route });

    // Handle external URLs (opens in system browser) - used for other external links
    if (event.externalUrl) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: event.externalUrl });
      return;
    }

    // Handle internal routes (including iframe-embedded legal pages)
    if (event.route) {
      this.navController.navigateForward(event.route);
    }
  }

  /**
   * Handle action requests from settings items.
   */
  protected async onAction(event: SettingsActionEvent): Promise<void> {
    this.logger.debug('Action triggered', { itemId: event.itemId, action: event.action });

    // Handle actions that need confirmation dialog
    if (event.requiresConfirmation) {
      const result = await this.bottomSheet.show({
        title: 'Confirm Action',
        subtitle: event.confirmationMessage,
        actions: [
          {
            label: 'Confirm',
            role: event.action === 'deleteAccount' ? 'destructive' : 'primary',
          },
          {
            label: 'Cancel',
            role: 'cancel',
          },
        ],
      });

      if (!result.confirmed) {
        return;
      }
    }

    // Handle specific actions
    switch (event.action) {
      case 'deleteAccount':
        this.logger.info('Delete account confirmed');
        // TODO: Implement actual account deletion
        break;

      default:
        this.logger.debug('Unhandled action', { action: event.action });
    }
  }

  /**
   * Handle sign out request.
   */
  protected async onSignOut(): Promise<void> {
    this.logger.info('Sign out requested');

    const result = await this.bottomSheet.show({
      title: 'Sign Out',
      subtitle: 'Are you sure you want to sign out?',
      ...SHEET_PRESETS.COMPACT,
      actionsLayout: 'horizontal',
      actions: [
        {
          label: 'Cancel',
          role: 'cancel',
        },
        {
          label: 'Sign Out',
          role: 'destructive',
        },
      ],
    });

    if (result.confirmed) {
      try {
        await this.authService.signOut();
        this.navController.navigateRoot('/auth');
      } catch (err) {
        this.logger.error('Sign out failed', err);
      }
    }
  }

  /**
   * Handle delete account request.
   */
  protected async onDeleteAccount(): Promise<void> {
    this.logger.info('Delete account requested');

    const result = await this.bottomSheet.show({
      title: 'Delete Account',
      subtitle:
        'This action cannot be undone. All your data will be permanently deleted. Are you sure you want to continue?',
      ...SHEET_PRESETS.COMPACT,
      actionsLayout: 'horizontal',
      destructive: true,
      actions: [
        {
          label: 'Cancel',
          role: 'cancel',
        },
        {
          label: 'Delete My Account',
          role: 'destructive',
        },
      ],
    });

    if (result.confirmed) {
      this.logger.info('Delete account confirmed');

      const deleteResult = await this.authService.deleteAccount();

      if (deleteResult.success) {
        this.logger.info('Account deleted — redirecting to auth');
        await this.navController.navigateRoot('/auth');
      } else {
        this.logger.error('Account deletion failed', deleteResult.error);
        this.toast.error(`Failed to delete account: ${deleteResult.error ?? 'Unknown error'}`);
      }
    }
  }

  /**
   * Handle email provider connection request (Gmail, Outlook).
   * Delegates to EmailConnectionService for OAuth flow.
   */
  protected async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    console.log('[Settings Component] onConnectProvider called:', provider);
    const user = this.authService.user();
    if (!user?.uid) {
      this.logger.warn('User not authenticated, cannot connect email provider');
      console.warn('[Settings Component] User not authenticated');
      return;
    }

    this.logger.info('Connect provider requested from settings', { provider: provider.id });
    console.log('[Settings Component] Calling emailConnection.connectProvider...');
    await this.emailConnection.connectProvider(provider, user.uid);
    console.log('[Settings Component] emailConnection.connectProvider completed');
  }
}
