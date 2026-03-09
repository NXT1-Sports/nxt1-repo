import { Component, ChangeDetectionStrategy, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import type { SettingsSection } from '@nxt1/core';
import {
  SettingsSectionComponent,
  SettingsSkeletonComponent,
  type SettingsActionEvent,
  type SettingsCopyEvent,
} from '@nxt1/ui/settings';
import { NxtDesktopPageHeaderComponent } from '@nxt1/ui/components/desktop-page-header';
import { NxtBottomSheetService, SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-account-information',
  standalone: true,
  imports: [NxtDesktopPageHeaderComponent, SettingsSectionComponent, SettingsSkeletonComponent],
  template: `
    <div class="account-information-page" data-testid="settings-account-info-page">
      <div class="account-information-page__container">
        <nxt1-desktop-page-header
          title="Account Information"
          subtitle="Manage your sign-in email and password security settings."
        />

        @if (isAuthLoading()) {
          <nxt1-settings-skeleton [sectionCount]="1" [itemsPerSection]="2" />
        } @else {
          <nxt1-settings-section
            [section]="accountSection()"
            (action)="onAction($event)"
            (copy)="onCopy($event)"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .account-information-page {
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .account-information-page__container {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        max-width: 880px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountInformationComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AccountInformationComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;
  private readonly seo = inject(SeoService);

  protected readonly isAuthLoading = computed(
    () => !this.authService.isInitialized() || this.authService.isLoading()
  );

  protected readonly userEmail = computed(() => this.authService.user()?.email?.trim() ?? '');

  protected readonly accountSection = computed<SettingsSection>(() => ({
    id: 'account',
    title: 'Account Information',
    description: 'Manage your email and password for secure account access.',
    icon: 'shield-outline',
    items: [
      {
        id: 'accountEmail',
        section: 'account',
        type: 'info',
        label: 'Email',
        description: 'Primary email used for sign in and account recovery',
        icon: 'mail-outline',
        value: this.userEmail() || 'No email available',
        copyable: !!this.userEmail(),
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
    ],
  }));

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Account Information',
      description: 'Manage your account email and password settings.',
      keywords: ['account', 'email', 'password', 'settings'],
      noIndex: true,
    });
    this.breadcrumb.trackStateChange('account-info:viewed');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_ACCOUNT_INFO_VIEWED);
  }

  protected async onAction(event: SettingsActionEvent): Promise<void> {
    switch (event.action) {
      case 'changePassword': {
        const email = this.userEmail();
        if (!email) {
          this.toast.error('No account email found. Please refresh and try again.');
          return;
        }

        this.logger.info('Sending password reset email', { itemId: event.itemId });
        this.breadcrumb.trackUserAction('password-reset-requested');
        this.analytics?.trackEvent(APP_EVENTS.AUTH_PASSWORD_RESET, { source: 'account-info' });

        const sent = await this.authService.sendPasswordResetEmail(email);
        if (sent) {
          this.toast.success(`Password reset link sent to ${email}`);
          return;
        }

        this.toast.error('Unable to send password reset email. Please try again.');
        return;
      }

      case 'signOut': {
        const confirm = await this.bottomSheet.show({
          title: 'Sign Out',
          subtitle: 'Are you sure you want to sign out?',
          ...SHEET_PRESETS.COMPACT,
          actionsLayout: 'horizontal',
          actions: [
            { label: 'Cancel', role: 'cancel' },
            { label: 'Sign Out', role: 'destructive' },
          ],
        });

        if (!confirm.confirmed) return;

        try {
          await this.authService.signOut();
          this.router.navigateByUrl('/auth');
        } catch (err) {
          this.logger.error('Sign out failed', err);
          this.toast.error('Unable to sign out. Please try again.');
        }
        return;
      }

      case 'deleteAccount': {
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

        // Re-auth required for email/password accounts
        const currentUser = this.authService.user();
        if (currentUser?.email) {
          const password = window.prompt(
            `Enter your password for ${currentUser.email} to confirm account deletion:`
          );

          if (password === null) return; // user cancelled

          if (!password.trim()) {
            this.toast.error('Password is required to delete your account.');
            return;
          }

          const reauthed = await this.authService.reauthenticateWithPassword(password.trim());
          if (!reauthed) {
            this.toast.error('Incorrect password. Please try again.');
            return;
          }
        }

        this.logger.info('Delete account requested from account information');
        this.breadcrumb.trackUserAction('delete-account-requested');

        const result = await this.authService.deleteAccount();

        if (result.success) {
          this.logger.info('Account deleted — redirecting to auth');
          this.router.navigateByUrl('/auth');
        } else {
          this.logger.error('Account deletion failed', result.error);
          this.toast.error(`Failed to delete account: ${result.error ?? 'Unknown error'}`);
        }
        return;
      }

      default:
        return;
    }
  }

  protected onCopy(event: SettingsCopyEvent): void {
    this.logger.debug('Account info copied', { itemId: event.itemId });
    this.toast.success('Email copied to clipboard');
  }

  protected onBack(): void {
    this.router.navigateByUrl('/settings');
  }
}
