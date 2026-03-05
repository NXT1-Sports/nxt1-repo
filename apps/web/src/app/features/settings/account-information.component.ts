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
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-account-information',
  standalone: true,
  imports: [NxtDesktopPageHeaderComponent, SettingsSectionComponent, SettingsSkeletonComponent],
  template: `
    <div class="account-information-page">
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
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AccountInformationComponent');
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
    ],
  }));

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Account Information',
      description: 'Manage your account email and password settings.',
      keywords: ['account', 'email', 'password', 'settings'],
      noIndex: true,
    });
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

  protected onBack(): void {
    this.router.navigateByUrl('/settings');
  }
}
