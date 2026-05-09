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
import { EditProfileApiService } from '../../core/services';
import {
  SettingsShellComponent,
  type SettingsUser,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
  SettingsService,
} from '@nxt1/ui/settings';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { NxtBottomSheetService, SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtModalService } from '@nxt1/ui/services/modal';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';
import {
  buildLinkSourcesFormData,
  mapToConnectedSources,
  type SettingsUserInfo,
  type SettingsSubscription,
  type SettingsItem,
} from '@nxt1/core';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';
import { SettingsConfirmModalComponent } from './settings-confirm-modal.component';

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
  private readonly overlay = inject(NxtOverlayService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly platform = inject(NxtPlatformService);
  private readonly toast = inject(NxtToastService);
  private readonly router = inject(Router);
  private readonly editProfileApi = inject(EditProfileApiService);
  private readonly logger = inject(NxtLoggingService).child('SettingsComponent');
  private readonly modal = inject(NxtModalService);
  private readonly seo = inject(SeoService);

  /** Responsive: true on mobile viewport, false on desktop */
  protected readonly isMobile = computed(() => this.platform.isMobile());

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
          authProvider: firebaseUser?.providerData?.[0]?.providerId ?? undefined,
          isNativeMobile: false,
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

    // Override account section items for desktop: show inline items instead of navigation to child route
    effect(() => {
      const email = this.authService.user()?.email?.trim() ?? '';
      const inlineAccountItems: readonly SettingsItem[] = [
        {
          id: 'accountEmail',
          section: 'account',
          type: 'info',
          label: 'Email',
          description: 'Primary email used for sign in and account recovery',
          icon: 'mail-outline',
          value: email || 'No email available',
          copyable: !!email,
        },
        {
          id: 'accountChangePassword',
          section: 'account',
          type: 'action',
          label: 'Change Password',
          description: 'Send a secure password reset link to your email',
          icon: 'lock-closed-outline',
          action: 'changePassword',
        },
        {
          id: 'accountSignOut',
          section: 'account',
          type: 'action',
          label: 'Sign Out',
          description: 'Sign out from your current session',
          icon: 'logout',
          action: 'signOut',
        },
        {
          id: 'accountDelete',
          section: 'account',
          type: 'action',
          label: 'Delete Account',
          description: 'Permanently delete your account and all data',
          icon: 'trash',
          action: 'deleteAccount',
          variant: 'danger',
        },
      ];
      this.settingsService.overrideSectionItems('account', inlineAccountItems);
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
    const firebaseUser = this.authService.firebaseUser();
    const linkSourcesData = buildLinkSourcesFormData({
      connectedSources: user.connectedSources ?? [],
      connectedEmails: user.connectedEmails ?? [],
      firebaseProviders: firebaseUser?.providerData ?? [],
    }) as LinkSourcesFormData | null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      role: (user.role as OnboardingUserType) ?? null,
      selectedSports: user.selectedSports ?? user.sports?.map(({ sport }) => sport) ?? [],
      linkSourcesData,
      scope:
        user.role === 'coach' || user.role === 'director'
          ? ('team' as const)
          : ('athlete' as const),
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
      const confirmed = await this.confirm({
        title: 'Confirm Action',
        message: event.confirmationMessage,
        confirmText: 'Confirm',
        destructive: event.action === 'deleteAccount',
        icon: event.action === 'deleteAccount' ? 'trash' : 'alert-circle-outline',
      });

      if (!confirmed) {
        return;
      }
    }

    // Handle specific actions
    switch (event.action) {
      case 'changePassword': {
        const email = this.authService.user()?.email?.trim();
        if (!email) {
          this.toast.error('No account email found. Please refresh and try again.');
          return;
        }
        this.logger.info('Sending password reset email', { itemId: event.itemId });
        const sent = await this.authService.sendPasswordResetEmail(email);
        if (sent) {
          this.toast.success(`Password reset link sent to ${email}`);
        } else {
          this.toast.error('Unable to send password reset email. Please try again.');
        }
        break;
      }

      case 'saveConnectedAccounts': {
        const user = this.authService.user();
        if (!user) {
          this.toast.error('Unable to save: user not found.');
          return;
        }
        const data = (
          event as SettingsActionEvent & {
            data?: {
              linkSources?: LinkSourcesFormData;
              requestResync?: boolean;
              resyncSources?: readonly {
                platform: string;
                label?: string;
                username?: string;
                url?: string;
                connected?: boolean;
                connectionType?: string;
              }[];
            };
          }
        ).data;
        if (!data?.linkSources) {
          this.logger.warn('saveConnectedAccounts: no linkSources in event data');
          return;
        }
        const connectedSources = mapToConnectedSources(data.linkSources.links);
        this.logger.info('Saving connected accounts from settings', {
          count: connectedSources.length,
        });
        const result = await this.editProfileApi.updateSection(user.uid, 'connected-sources', {
          connectedSources,
        });
        if (result.success) {
          // Re-sync the AppUser signal so the settings UI reflects the new links immediately
          await this.authService.refreshUserProfile();
          if (data.requestResync) {
            await this.settingsService.requestConnectedAccountsResync(data.resyncSources ?? []);
          } else {
            this.toast.success('Connected accounts updated');
          }
        } else {
          this.logger.error('Failed to save connected accounts', undefined, {
            error: result.error,
          });
          this.toast.error(result.error ?? 'Failed to save connected accounts');
        }
        break;
      }

      default:
        this.logger.debug('Unhandled action', { action: event.action });
    }
  }

  /**
   * Handle sign out request.
   */
  protected async onSignOut(): Promise<void> {
    this.logger.info('Sign out requested');

    const confirmed = await this.confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      icon: 'logout',
    });

    if (confirmed) {
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

    const confirmed = await this.confirm({
      title: 'Delete Account',
      message:
        'This action cannot be undone. All your data will be permanently deleted. Are you sure you want to continue?',
      confirmText: 'Delete My Account',
      cancelText: 'Cancel',
      destructive: true,
      icon: 'trash',
    });

    if (!confirmed) return;

    try {
      await this.modal.showLoading({ message: 'Deleting your account...' });
      const result = await this.authService.deleteAccount();

      if (result.success) {
        this.logger.info('Account deleted — redirecting to auth');
        this.router.navigate(['/auth']);
      } else {
        this.logger.error('Account deletion failed', result.error);
        this.toast.error(`Failed to delete account: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      this.logger.error('Account deletion threw', err);
      this.toast.error('Failed to delete account. Please try again.');
    } finally {
      await this.modal.hideLoading();
    }
  }

  private async confirm(config: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    icon?: string;
  }): Promise<boolean> {
    if (this.isMobile()) {
      return this.openMobileConfirm(config);
    }
    return this.openDesktopConfirm(config);
  }

  private async openMobileConfirm(config: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    icon?: string;
  }): Promise<boolean> {
    const result = await this.bottomSheet.show({
      title: config.title,
      subtitle: config.message,
      ...SHEET_PRESETS.COMPACT,
      actionsLayout: 'horizontal',
      destructive: config.destructive,
      actions: [
        {
          label: config.cancelText ?? 'Cancel',
          role: 'cancel',
        },
        {
          label: config.confirmText ?? 'Confirm',
          role: config.destructive ? 'destructive' : 'primary',
        },
      ],
    });

    return result.confirmed;
  }

  private async openDesktopConfirm(config: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    icon?: string;
  }): Promise<boolean> {
    const result = await this.overlay.open<SettingsConfirmModalComponent, { confirmed: boolean }>({
      component: SettingsConfirmModalComponent,
      inputs: {
        title: config.title,
        message: config.message ?? '',
        confirmText: config.confirmText ?? 'Confirm',
        cancelText: config.cancelText ?? 'Cancel',
        destructive: config.destructive ?? false,
        icon: config.icon,
      },
      size: 'sm',
      backdropDismiss: true,
      escDismiss: true,
      showCloseButton: false,
      ariaLabel: config.title,
      panelClass: 'nxt1-settings-confirm-overlay',
    }).closed;

    return result.data?.confirmed === true;
  }
}
