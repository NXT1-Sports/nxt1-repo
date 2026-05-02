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
  signal,
  viewChild,
  OnInit,
  AfterViewInit,
  OnDestroy,
  type TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtHeaderPortalService } from '../services/header-portal';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBrowserService } from '../services/browser';
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
  SettingsCopyEvent,
} from './settings-item.component';
import { NxtSectionNavWebComponent } from '../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../components/section-nav-web';
import { NxtPlatformService } from '../services/platform';
import { ConnectedAccountsModalService } from '../components/connected-sources';
import type { SettingsSectionId, InboxEmailProvider } from '@nxt1/core';
import { APP_VERSION } from './settings-version.token';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';

/**
 * User info for header display.
 */
export interface SettingsUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly connectedEmails?: readonly { provider: string; email: string; isActive: boolean }[];
  /** User role for connected accounts role-aware recommendations */
  readonly role?: OnboardingUserType | null;
  /** User's sport names for sport-scoped platform filtering */
  readonly selectedSports?: readonly string[];
  /** Existing connected sources data to pre-populate the link drop step */
  readonly linkSourcesData?: LinkSourcesFormData | null;
  /** Scope: 'athlete' or 'team' */
  readonly scope?: 'athlete' | 'team';
}

@Component({
  selector: 'nxt1-settings-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtSectionNavWebComponent,
    NxtRefresherComponent,
    SettingsSectionComponent,
    SettingsSkeletonComponent,
  ],
  template: `
    <!-- Portal: center — "Settings" title in top nav (desktop only) -->
    <ng-template #centerPortalContent>
      <div class="nxt1-header-portal">
        <span class="nxt1-header-portal__title">Settings</span>
      </div>
    </ng-template>

    <!-- Professional Page Header with Back Button (hidden on desktop web) -->
    @if (showPageHeader()) {
      <nxt1-page-header
        title="Settings"
        [showBack]="true"
        [actions]="headerActions()"
        (backClick)="back.emit()"
        (actionClick)="onHeaderAction($event)"
      />
    }

    <!-- Use ion-content only on mobile (showPageHeader = true) -->
    @if (showPageHeader()) {
      <ion-content [fullscreen]="true" class="settings-content">
        <!-- Pull-to-Refresh -->
        <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

        <div class="settings-container">
          <!-- Settings Sections -->
          <div class="settings-sections">
            @if (settings.isLoading()) {
              <nxt1-settings-skeleton [sectionCount]="3" [itemsPerSection]="4" />
            } @else {
              @for (section of visibleSections(); track section.id) {
                <nxt1-settings-section
                  [section]="section"
                  (sectionToggle)="onSectionToggle($event)"
                  (toggle)="onToggle($event)"
                  (navigate)="onNavigate($event)"
                  (action)="onAction($event)"
                  (copy)="onCopy($event)"
                />
              }
            }

            <!-- Footer -->
            <footer class="settings-footer">
              <p class="settings-footer__text">Made with ❤️ by NXT1 Sports</p>
              <p class="settings-footer__version">Version {{ appVersion }}</p>
            </footer>
          </div>
        </div>
      </ion-content>
    }

    <!-- Desktop: Use regular div without ion-content -->
    @if (!showPageHeader()) {
      <div class="settings-content-wrapper">
        <div class="settings-container">
          <div class="settings-layout settings-layout--desktop nxt1-section-layout">
            <nxt1-section-nav-web
              [items]="sectionNavItems()"
              [activeId]="activeSectionId()"
              ariaLabel="Settings sections"
              (selectionChange)="onSectionNavChange($event)"
            />

            <div
              class="settings-content-panel nxt1-section-content"
              [attr.id]="'section-' + activeSectionId()"
              role="tabpanel"
            >
              <!-- Loading State -->
              @if (settings.isLoading()) {
                <nxt1-settings-skeleton [sectionCount]="1" [itemsPerSection]="6" />
              } @else {
                <!-- Settings Sections -->
                <div class="settings-sections">
                  @for (section of visibleSections(); track section.id) {
                    <nxt1-settings-section
                      [section]="section"
                      (sectionToggle)="onSectionToggle($event)"
                      (toggle)="onToggle($event)"
                      (navigate)="onNavigate($event)"
                      (action)="onAction($event)"
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
          </div>
        </div>
      </div>
    }
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
        --padding-bottom: calc(
          var(--nxt1-footer-height, 80px) + env(safe-area-inset-bottom, 0px) + 32px
        );
      }

      /* Desktop wrapper (replaces ion-content) */
      .settings-content-wrapper {
        min-height: 100vh;
        background: var(--settings-bg);
        display: block;
      }

      .settings-container {
        min-height: 100%;
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      .settings-layout--desktop {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
      }

      /* Header portal styles (wrapper + title from design-tokens .nxt1-header-portal) */

      .settings-content-panel {
        min-width: 0;
      }

      /* ============================================
       SECTIONS CONTAINER
       ============================================ */

      .settings-sections {
        padding: 0;
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

      @media (max-width: 768px) {
        .settings-layout--desktop {
          display: block;
        }

        nxt1-section-nav-web {
          display: none;
        }

        .settings-content-wrapper {
          padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
        }

        .settings-container {
          padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-4, 16px)
            var(--nxt1-spacing-8, 32px);
        }

        .settings-footer {
          padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-3, 12px);
        }

        .nxt1-header-portal {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly settings = inject(SettingsService);
  private readonly toast = inject(NxtToastService);
  private readonly browser = inject(NxtBrowserService);
  private readonly connectedAccountsModal = inject(ConnectedAccountsModalService);
  private readonly logger = inject(NxtLoggingService).child('SettingsShellComponent');
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly platform = inject(NxtPlatformService);
  private readonly _activeSection = signal<SettingsSectionId | null>(null);

  // Template ref for header portal (desktop only)
  private readonly centerPortalContent = viewChild<TemplateRef<unknown>>('centerPortalContent');

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<SettingsUser | null>(null);

  /** Whether to show the page header (back arrow + title). Hide on desktop web. */
  readonly showPageHeader = input<boolean>(true);

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

  /** Emitted when user wants to connect an email provider (Gmail, Microsoft, etc.) */
  readonly connectProviderRequest = output<InboxEmailProvider>();

  /** Optional direct callback (bypasses modal dismiss chain) */
  readonly connectProviderCallback = input<((provider: InboxEmailProvider) => void) | undefined>(
    undefined
  );

  // ============================================
  // CONSTANTS
  // ============================================

  protected readonly appVersion = inject(APP_VERSION, { optional: true }) ?? '2.0.0';

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly headerActions = computed<PageHeaderAction[]>(() => []);

  protected readonly sectionNavItems = computed((): readonly SectionNavItem[] =>
    this.settings.sections().map((section) => ({
      id: section.id,
      label: section.title,
    }))
  );

  protected readonly activeSectionId = computed<SettingsSectionId>(() => {
    const sections = this.settings.sections();
    const selected = this._activeSection();

    if (selected && sections.some((section) => section.id === selected)) {
      return selected;
    }

    return (sections[0]?.id ?? 'account') as SettingsSectionId;
  });

  /** On mobile app (showPageHeader) or mobile web viewport: show ALL sections.
   *  On desktop web: show only the active section (sidebar nav selects). */
  protected readonly visibleSections = computed(() => {
    const sections = this.settings.sections();

    if (this.showPageHeader()) {
      return sections;
    }

    // Mobile web viewport — show all sections like the mobile app
    if (this.platform.isMobile()) {
      return sections;
    }

    // Desktop — filter to active section (sidebar nav controls)
    const activeSection = this.activeSectionId();
    return sections.filter((section) => section.id === activeSection);
  });

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSection.set(event.id as SettingsSectionId);
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load settings data when component initializes
    this.settings.loadSettings();
  }

  ngAfterViewInit(): void {
    // Only register portal content on desktop web (not mobile)
    if (!this.showPageHeader()) {
      const centerTpl = this.centerPortalContent();
      if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    }
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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
      route: '/settings/account-information',
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
      void this.browser.openLink({
        url: event.externalUrl,
        source: 'settings_external_link',
        surface: 'page',
      });
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

      case 'contactSupport':
        await this.settings.contactSupport();
        break;

      case 'reportBug':
        await this.settings.reportBug();
        break;

      case 'connectedAccounts':
        await this.openConnectedAccounts();
        break;

      default:
        this.action.emit(event);
    }
  }

  protected onCopy(event: SettingsCopyEvent): void {
    this.logger.debug('Value copied', { itemId: event.itemId, value: event.value });
    this.toast.success('Copied to clipboard');
  }

  private async openConnectedAccounts(): Promise<void> {
    this.logger.info('Opening connected accounts');

    const currentUser = this.user();

    const result = await this.connectedAccountsModal.open({
      role: currentUser?.role ?? null,
      selectedSports: currentUser?.selectedSports ?? [],
      linkSourcesData: currentUser?.linkSourcesData ?? null,
      scope: currentUser?.scope ?? 'athlete',
      // In web shell mode (desktop + mobile viewport), always use modal.
      preferWebOverlayOnBrowser: !this.showPageHeader(),
    });

    this.logger.debug('Connected accounts dismissed', {
      saved: result.saved,
      resync: result.resync,
    });

    // Save link changes if any were made
    if (result.linkSources && result.updatedLinks) {
      this.action.emit({
        itemId: 'connectedAccounts',
        action: 'saveConnectedAccounts',
        data: {
          updatedLinks: result.updatedLinks,
          linkSources: result.linkSources,
          // If resync was also requested, the parent will trigger it AFTER saving
          requestResync: result.resync === true,
          resyncSources: result.sources ?? [],
        },
      } as SettingsActionEvent);
      return;
    }

    // Resync only (no link changes) — handle directly via SettingsService so the
    // toast is guaranteed regardless of which platform wrapper is the parent.
    if (result.resync === true) {
      // Collect sources: prefer what the modal returned, fall back to all connected
      // links from the user's current data so resync always has something to work with.
      const resyncSources =
        result.sources && result.sources.length > 0
          ? result.sources
          : (currentUser?.linkSourcesData?.links ?? [])
              .filter((l) => l.connected)
              .map((l) => ({
                platform: l.platform,
                label: l.platform,
                connected: true,
                username: l.username,
                url: l.url,
              }));

      this.logger.info('Resync requested from connected accounts (no link changes)', {
        sourceCount: resyncSources.length,
      });
      await this.settings.requestConnectedAccountsResync(resyncSources);
    }
  }
}
