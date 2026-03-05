import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import type { SettingsSection } from '@nxt1/core';
import {
  NxtPageHeaderComponent,
  SettingsSectionComponent,
  SettingsSkeletonComponent,
  NxtToastService,
  NxtLoggingService,
  type SettingsActionEvent,
  type SettingsCopyEvent,
} from '@nxt1/ui';
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
export class AccountInformationComponent {
  private readonly authService = inject(AuthFlowService);
  private readonly navController = inject(NavController);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AccountInformationComponent');

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
    ],
  }));

  protected onBack(): void {
    this.navController.navigateBack('/settings');
  }

  protected async onAction(event: SettingsActionEvent): Promise<void> {
    if (event.action !== 'changePassword') return;

    const email = this.userEmail();
    if (!email) {
      this.toast.error('No account email found. Please refresh and try again.');
      return;
    }

    this.logger.info('Sending password reset email', { itemId: event.itemId });

    const sent = await this.authService.sendPasswordResetEmail(email);
    if (sent) {
      this.toast.success(`Password reset link sent to ${email}`);
      return;
    }

    this.toast.error('Unable to send password reset email. Please try again.');
  }

  protected onCopy(event: SettingsCopyEvent): void {
    this.logger.debug('Account info copied', { itemId: event.itemId });
    this.toast.success('Email copied to clipboard');
  }
}
