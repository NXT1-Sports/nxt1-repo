import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { SettingsSection } from '@nxt1/core';
import {
  SettingsSectionComponent,
  SettingsSkeletonComponent,
  type SettingsActionEvent,
  type SettingsCopyEvent,
} from '@nxt1/ui/settings';
import { NxtDesktopPageHeaderComponent } from '@nxt1/ui/components/desktop-page-header';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { NxtBottomSheetService, SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';
import { SettingsConfirmModalComponent } from './settings-confirm-modal.component';

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

      @media (max-width: 768px) {
        .account-information-page__container {
          padding: var(--nxt1-spacing-4, 16px);
          padding-bottom: calc(120px + env(safe-area-inset-bottom, 0));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountInformationComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly overlay = inject(NxtOverlayService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly platform = inject(NxtPlatformService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AccountInformationComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;
  private readonly seo = inject(SeoService);

  /** Responsive: true on mobile viewport, false on desktop */
  protected readonly isMobile = computed(() => this.platform.isMobile());

  protected readonly isDeleting = signal(false);

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
        const confirmed = await this.confirm({
          title: 'Sign Out',
          message: 'Are you sure you want to sign out?',
          confirmText: 'Sign Out',
          icon: 'logout',
        });

        if (!confirmed) return;

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

        await this._executeDeleteAccount();
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

  private async _executeDeleteAccount(): Promise<void> {
    this.isDeleting.set(true);
    this.logger.info('Executing account deletion');
    this.breadcrumb.trackUserAction('delete-account-confirmed');

    try {
      const result = await this.authService.deleteAccount();

      if (result.success) {
        this.logger.info('Account deleted — redirecting to auth');
        this.router.navigateByUrl('/auth');
      } else {
        this.logger.error('Account deletion failed', result.error);
        this.toast.error(`Failed to delete account: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      this.logger.error('Account deletion threw', err);
      this.toast.error('Failed to delete account. Please try again.');
    } finally {
      this.isDeleting.set(false);
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
