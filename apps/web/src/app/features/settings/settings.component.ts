/**
 * @fileoverview Settings Page - Web App Wrapper
 * @module @nxt1/web/features/settings
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
 * - User context from AuthService
 * - Confirmation dialogs
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  effect,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  SettingsShellComponent,
  type SettingsUser,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
  SettingsService,
} from '@nxt1/ui/settings';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtBottomSheetService, SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';
import type { SettingsUserInfo, SettingsSubscription } from '@nxt1/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [SettingsShellComponent],
  template: `
    <div class="min-h-screen bg-[var(--nxt1-color-bg-primary)]" data-testid="settings-page">
      <nxt1-settings-shell
        [user]="userInfo()"
        [showPageHeader]="false"
        (back)="onBack()"
        (editProfile)="onEditProfile()"
        (navigate)="onNavigate($event)"
        (action)="onAction($event)"
        (signOut)="onSignOut()"
        (deleteAccount)="onDeleteAccount()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly settingsService = inject(SettingsService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly toast = inject(NxtToastService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('SettingsComponent');
  private readonly seo = inject(SeoService);

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
          emailVerified: firebaseUser?.emailVerified ?? false,
          createdAt: user.createdAt,
          lastLoginAt: firebaseUser?.metadata?.lastSignInTime ?? null,
        };
        this.settingsService.setUser(settingsUser);

        // Derive subscription from auth state
        const subscription: SettingsSubscription = {
          tier: user.isPremium ? 'premium' : 'free',
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

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Settings',
      description: 'Manage your account settings, preferences, and privacy options.',
      keywords: ['settings', 'preferences', 'account', 'privacy'],
      noIndex: true, // Protected page - don't index
    });
    // Preferences are now loaded via SETTINGS_PERSISTENCE_ADAPTER injected into SettingsService.
    // The shell component calls settingsService.loadSettings() on ngOnInit which triggers the adapter.
  }

  /**
   * Transform auth user to SettingsUser interface.
   */
  protected readonly userInfo = computed<SettingsUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
    };
  });

  /**
   * Handle back navigation.
   */
  protected onBack(): void {
    this.router.navigate(['/home']);
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.router.navigate(['/settings/account-information']);
  }

  /**
   * Handle navigation requests from settings items.
   */
  protected onNavigate(event: SettingsNavigateEvent): void {
    this.logger.debug('Navigate requested', { itemId: event.itemId, route: event.route });

    // Handle external URLs (opens in new tab) - used for other external links
    if (event.externalUrl) {
      window.open(event.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Handle internal routes (including iframe-embedded legal pages)
    if (event.route) {
      this.router.navigateByUrl(event.route);
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
        this.router.navigate(['/auth']);
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

    // Step 1: Warn the user
    const confirm = await this.bottomSheet.show({
      title: 'Delete Account',
      subtitle:
        'This action cannot be undone. All your data will be permanently deleted. Are you sure you want to continue?',
      destructive: true,
      actions: [
        { label: 'Delete My Account', role: 'destructive' },
        { label: 'Cancel', role: 'cancel' },
      ],
    });

    if (!confirm.confirmed) return;

    // Delete directly
    const result = await this.authService.deleteAccount();

    if (result.success) {
      this.logger.info('Account deleted — redirecting to auth');
      this.router.navigate(['/auth']);
    } else {
      this.logger.error('Account deletion failed', result.error);
      this.toast.error(`Failed to delete account: ${result.error ?? 'Unknown error'}`);
    }
  }
}
