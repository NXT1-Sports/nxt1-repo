import { Component, ChangeDetectionStrategy, computed, inject, OnInit } from '@angular/core';
import {
  IonHeader,
  IonContent,
  IonToolbar,
  NavController,
  AlertController,
} from '@ionic/angular/standalone';
import type { SettingsSection } from '@nxt1/core';
import {
  NxtPageHeaderComponent,
  SettingsSectionComponent,
  SettingsSkeletonComponent,
  NxtBottomSheetService,
  NxtToastService,
  NxtLoggingService,
  NxtBreadcrumbService,
  ANALYTICS_ADAPTER,
  type SettingsActionEvent,
  type SettingsCopyEvent,
} from '@nxt1/ui';
import { SHEET_PRESETS } from '@nxt1/ui/components/bottom-sheet';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-account-information',
  standalone: true,
  imports: [
    IonHeader,
    IonContent,
    IonToolbar,
    NxtPageHeaderComponent,
    SettingsSectionComponent,
    SettingsSkeletonComponent,
  ],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" class="account-information-content">
      <nxt1-page-header title="Account Information" [showBack]="true" (backClick)="onBack()" />

      <div class="account-information-page__container">
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

      .account-information-page__container {
        padding: var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(120px + env(safe-area-inset-bottom, 0));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountInformationComponent implements OnInit {
  private readonly authService = inject(AuthFlowService);
  private readonly navController = inject(NavController);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly alertController = inject(AlertController);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AccountInformationComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;

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
    this.breadcrumb.trackStateChange('account-info:viewed');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_ACCOUNT_INFO_VIEWED);
  }

  protected onBack(): void {
    this.navController.navigateBack('/settings');
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
          await this.navController.navigateRoot('/auth');
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

        // If email/password account, require password re-authentication
        const currentUser = this.authService.user();
        if (currentUser?.email) {
          const passwordAlert = await this.alertController.create({
            header: 'Confirm Identity',
            message: `Enter your password for ${currentUser.email} to confirm account deletion.`,
            inputs: [
              {
                name: 'password',
                type: 'password',
                placeholder: 'Password',
              },
            ],
            buttons: [
              { text: 'Cancel', role: 'cancel' },
              { text: 'Confirm', role: 'destructive' },
            ],
          });

          await passwordAlert.present();
          const { role, data } = await passwordAlert.onDidDismiss<{
            values: { password: string };
          }>();

          if (role === 'cancel' || role === 'backdrop') return;

          const password = data?.values?.password?.trim() ?? '';
          if (!password) {
            this.toast.error('Password is required to delete your account.');
            return;
          }

          const reauthed = await this.authService.reauthenticateWithPassword(password);
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
          await this.navController.navigateRoot('/auth');
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
}
