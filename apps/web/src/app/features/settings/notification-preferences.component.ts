/**
 * @fileoverview Notification Preferences Page
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Dedicated notification preferences page accessible from
 * /settings/notification-preferences. Provides detailed control
 * over push, email, and marketing notification channels.
 *
 * Uses the shared SettingsSectionComponent for consistent toggle UI
 * (IonToggle, haptics, accessibility) and SettingsService for
 * persisting via the debounced PATCH pipeline.
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import type { SettingsSection, SettingsPreferences, SettingsToggleItem } from '@nxt1/core';
import { SETTINGS_PREFERENCES_ITEMS } from '@nxt1/core';
import {
  SettingsSectionComponent,
  SettingsService,
  type SettingsToggleEvent,
} from '@nxt1/ui/settings';
import { NxtDesktopPageHeaderComponent } from '@nxt1/ui/components/desktop-page-header';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [NxtDesktopPageHeaderComponent, SettingsSectionComponent],
  template: `
    <div class="notification-preferences-page" data-testid="notification-preferences-page">
      <div class="notification-preferences-page__container">
        <nxt1-desktop-page-header
          title="Notification Preferences"
          subtitle="Control how and when you receive notifications from NXT1."
        />

        <nxt1-settings-section [section]="notificationSection()" (toggle)="onToggle($event)" />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .notification-preferences-page {
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .notification-preferences-page__container {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        max-width: 880px;
      }

      @media (max-width: 768px) {
        .notification-preferences-page__container {
          padding: var(--nxt1-spacing-4, 16px);
          padding-bottom: calc(120px + env(safe-area-inset-bottom, 0));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPreferencesComponent implements OnInit {
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('NotificationPreferencesComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;
  private readonly seo = inject(SeoService);

  /**
   * Extended descriptions for the dedicated preferences page.
   * The SSOT in SETTINGS_PREFERENCES_ITEMS provides short labels;
   * this page adds richer context per toggle.
   */
  private readonly detailedDescriptions: Readonly<Record<string, string>> = {
    pushNotifications:
      'Real-time alerts on your device for followers, recruiting activity, team updates, and more.',
    emailNotifications:
      'Important updates delivered to your inbox including recruiting alerts, team invites, and security notices.',
    marketingEmails:
      'Product announcements, feature updates, special offers, and the weekly digest from NXT1.',
  };

  /**
   * Build the notification section reactively from SSOT items + live preferences.
   * Structure (id, label, icon, settingKey) comes from SETTINGS_PREFERENCES_ITEMS.
   * Values come from SettingsService.preferences(). Descriptions are overridden
   * for this detailed page context.
   */
  protected readonly notificationSection = computed<SettingsSection>(() => {
    const prefs = this.settings.preferences();

    const toggleItems = SETTINGS_PREFERENCES_ITEMS.filter(
      (item): item is SettingsToggleItem => item.type === 'toggle'
    ).map((item) => ({
      ...item,
      description: this.detailedDescriptions[item.id] ?? item.description,
      value: prefs[item.settingKey as keyof SettingsPreferences] as boolean,
    }));

    return {
      id: 'preferences',
      title: 'Notification Channels',
      description: 'Choose which types of notifications you want to receive.',
      icon: 'notifications-outline',
      items: toggleItems,
    };
  });

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Notification Preferences',
      description: 'Control push, email, and marketing notification preferences.',
      keywords: ['notifications', 'preferences', 'push', 'email', 'settings'],
      noIndex: true,
    });
    this.breadcrumb.trackStateChange('notification-preferences:viewed');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_VIEWED, {
      section: 'notification-preferences',
    });
  }

  protected onToggle(event: SettingsToggleEvent): void {
    this.logger.info('Notification preference toggled', {
      key: event.settingKey,
      value: event.value,
    });
    this.breadcrumb.trackUserAction('notification-preference-toggled', {
      key: event.settingKey,
      value: event.value,
    });
    this.settings.updatePreference(event.settingKey, event.value);
  }

  protected onBack(): void {
    this.router.navigateByUrl('/settings');
  }
}
