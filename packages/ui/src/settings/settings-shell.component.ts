/**
 * @fileoverview Settings Shell Component - Main Container
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Top-level container component for Settings feature.
 * Orchestrates header, user card, sections, and all interactions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Professional page header with back navigation
 * - User profile card at top
 * - Grouped sections with items
 * - Pull-to-refresh support
 * - Full skeleton loading state
 * - Theme-aware styling
 *
 * @example
 * ```html
 * <nxt1-settings-shell
 *   [user]="currentUser()"
 *   (back)="navigateBack()"
 *   (editProfile)="goToEditProfile()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { SettingsService } from './settings.service';
import {
  SettingsSectionComponent,
  type SettingsSectionToggleEvent,
} from './settings-section.component';
import { SettingsSkeletonComponent } from './settings-skeleton.component';
import type {
  SettingsToggleEvent,
  SettingsNavigateEvent,
  SettingsActionEvent,
  SettingsSelectEvent,
  SettingsCopyEvent,
} from './settings-item.component';

/**
 * User info for header display.
 */
export interface SettingsUser {
  readonly photoURL?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-settings-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    SettingsSectionComponent,
    SettingsSkeletonComponent,
  ],
  template: `
    <!-- Professional Page Header with Back Button -->
    <nxt1-page-header
      title="Settings"
      [showBack]="true"
      [actions]="headerActions()"
      (backClick)="back.emit()"
      (actionClick)="onHeaderAction($event)"
    />

    <ion-content [fullscreen]="true" class="settings-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="settings-container">
        <!-- Loading State -->
        @if (settings.isLoading()) {
          <nxt1-settings-skeleton [sectionCount]="3" [itemsPerSection]="4" />
        } @else {
          <!-- Settings Sections -->
          <div class="settings-sections">
            @for (section of settings.sections(); track section.id) {
              <nxt1-settings-section
                [section]="section"
                (sectionToggle)="onSectionToggle($event)"
                (toggle)="onToggle($event)"
                (navigate)="onNavigate($event)"
                (action)="onAction($event)"
                (select)="onSelect($event)"
                (copy)="onCopy($event)"
              />
            }
          </div>

          <!-- Footer -->
          <footer class="settings-footer">
            <p class="settings-footer__text">Made with ❤️ by NXT1 Sports</p>
            <p class="settings-footer__version">Version {{ appVersion }}</p>
          </footer>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       SETTINGS SHELL - iOS 26 LIQUID GLASS DESIGN
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables */
        --settings-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --settings-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      /* Light mode overrides */
      :host-context(.light),
      :host-context([data-theme='light']) {
        --settings-bg: var(--nxt1-color-bg-primary, #f5f5f5);
        --settings-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
      }

      /* Content area */
      .settings-content {
        --background: var(--settings-bg);
      }

      .settings-container {
        min-height: 100%;
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
      }

      /* ============================================
       SECTIONS CONTAINER
       ============================================ */

      .settings-sections {
        padding: 16px 16px 0 16px;
      }

      /* ============================================
       FOOTER
       ============================================ */

      .settings-footer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 32px 16px;
        margin-top: 16px;
      }

      .settings-footer__text {
        margin: 0;
        font-size: 13px;
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .settings-footer__version {
        margin: 0;
        font-size: 12px;
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      /* Light mode */
      :host-context(.light) .settings-footer__text,
      :host-context([data-theme='light']) .settings-footer__text {
        color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
      }

      :host-context(.light) .settings-footer__version,
      :host-context([data-theme='light']) .settings-footer__version {
        color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.3));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent implements OnInit {
  protected readonly settings = inject(SettingsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('SettingsShellComponent');

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<SettingsUser | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when back button is clicked */
  readonly back = output<void>();

  /** Emitted when user wants to edit profile */
  readonly editProfile = output<void>();

  /** Emitted when navigation is requested */
  readonly navigate = output<SettingsNavigateEvent>();

  /** Emitted when an action is triggered */
  readonly action = output<SettingsActionEvent>();

  /** Emitted when sign out is requested */
  readonly signOut = output<void>();

  /** Emitted when delete account is requested */
  readonly deleteAccount = output<void>();

  // ============================================
  // CONSTANTS
  // ============================================

  protected readonly appVersion = '2.0.0';

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly headerActions = computed<PageHeaderAction[]>(() => []);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load settings data when component initializes
    this.settings.loadSettings();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onHeaderAction(action: PageHeaderAction): void {
    this.logger.debug('Header action clicked', { actionId: action.id });
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.settings.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.warning('Refresh is taking longer than expected');
  }

  protected onEditProfile(): void {
    this.editProfile.emit();
    this.navigate.emit({
      itemId: 'profile',
      route: '/profile/edit',
    });
  }

  protected onSectionToggle(event: SettingsSectionToggleEvent): void {
    this.logger.debug('Section toggled', {
      sectionId: event.sectionId,
      collapsed: event.collapsed,
    });
  }

  protected async onToggle(event: SettingsToggleEvent): Promise<void> {
    this.logger.debug('Toggle changed', {
      itemId: event.itemId,
      settingKey: event.settingKey,
      value: event.value,
    });
    await this.settings.updatePreference(event.settingKey, event.value);
  }

  protected onNavigate(event: SettingsNavigateEvent): void {
    this.logger.debug('Navigation requested', { itemId: event.itemId, route: event.route });

    if (event.externalUrl) {
      // Open external URL
      window.open(event.externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Emit navigation event for parent to handle
      this.navigate.emit(event);
    }
  }

  protected async onAction(event: SettingsActionEvent): Promise<void> {
    this.logger.debug('Action triggered', { itemId: event.itemId, action: event.action });

    // Handle built-in actions
    switch (event.action) {
      case 'signOut':
        await this.settings.signOut();
        this.signOut.emit();
        break;

      case 'deleteAccount':
        // Parent should show confirmation dialog
        this.deleteAccount.emit();
        this.action.emit(event);
        break;

      case 'checkUpdate':
        await this.settings.checkForUpdates();
        break;

      case 'reportBug':
        await this.settings.reportBug();
        break;

      default:
        this.action.emit(event);
    }
  }

  protected async onSelect(event: SettingsSelectEvent): Promise<void> {
    this.logger.debug('Select triggered', {
      itemId: event.itemId,
      settingKey: event.settingKey,
      value: event.value,
    });
    // Parent should show picker/action sheet
    // For now, we'll just log it
    this.toast.info('Picker selection coming soon');
  }

  protected onCopy(event: SettingsCopyEvent): void {
    this.logger.debug('Value copied', { itemId: event.itemId, value: event.value });
    this.toast.success('Copied to clipboard');
  }
}
