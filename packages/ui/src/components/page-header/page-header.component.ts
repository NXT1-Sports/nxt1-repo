/**
 * @fileoverview NxtPageHeaderComponent - Professional Page Header
 * @module @nxt1/ui/components/page-header
 * @version 1.1.0
 *
 * Reusable, professional-grade page header following Instagram/TikTok/Twitter patterns.
 * Each page uses this component to configure its own contextual header.
 *
 * Features:
 * - Logo icon display for home page (Twitter/X style)
 * - Profile avatar on left side (Twitter/X style) with tap to open profile
 * - Center-aligned title with proper design system typography
 * - Contextual back navigation with haptic feedback
 * - Large title support with iOS-style collapse on scroll
 * - Configurable action buttons (notifications, settings, share, etc.)
 * - Search bar integration (optional)
 * - Platform-aware styling (iOS translucent, Android elevated)
 * - Safe area handling for notched devices
 * - Full accessibility support
 *
 * @example
 * ```html
 * <!-- Home page with logo (Twitter/X style) -->
 * <nxt1-page-header
 *   [showLogo]="true"
 *   [avatarSrc]="user.photoUrl"
 *   [avatarName]="user.displayName"
 *   (avatarClick)="openProfile()"
 * />
 *
 * <!-- Simple page header with avatar -->
 * <nxt1-page-header
 *   title="Home"
 *   [avatarSrc]="user.photoUrl"
 *   [avatarName]="user.displayName"
 *   (avatarClick)="openProfile()"
 * />
 *
 * <!-- Header with actions -->
 * <nxt1-page-header
 *   title="Messages"
 *   [avatarSrc]="user.photoUrl"
 *   [avatarName]="user.displayName"
 *   [actions]="[{ id: 'compose', icon: 'create-outline', label: 'New Message' }]"
 *   (actionClick)="onAction($event)"
 * />
 *
 * <!-- Header with back button (no avatar) -->
 * <nxt1-page-header title="Profile" [showBack]="true" />
 *
 * <!-- Header with custom content -->
 * <nxt1-page-header [showBack]="true">
 *   <ng-container slot="title">
 *     <div class="user-title">
 *       <img [src]="user.avatar" />
 *       <span>@{{ user.username }}</span>
 *     </div>
 *   </ng-container>
 *   <ion-button slot="end" (click)="openSettings()">
 *     <ion-icon name="settings-outline"></ion-icon>
 *   </ion-button>
 * </nxt1-page-header>
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonBackButton,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  chevronBack,
  ellipsisHorizontal,
  ellipsisVertical,
  notificationsOutline,
  searchOutline,
  settingsOutline,
  shareOutline,
  closeOutline,
  menuOutline,
  personCircleOutline,
} from 'ionicons/icons';

import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import { NxtAvatarComponent } from '../avatar';
import type { PageHeaderAction, PageHeaderConfig, PageHeaderVariant } from './page-header.types';
import { DEFAULT_PAGE_HEADER_CONFIG } from './page-header.types';

// Register icons used in this component
addIcons({
  arrowBack,
  chevronBack,
  ellipsisHorizontal,
  ellipsisVertical,
  notificationsOutline,
  searchOutline,
  settingsOutline,
  shareOutline,
  closeOutline,
  menuOutline,
  personCircleOutline,
});

@Component({
  selector: 'nxt1-page-header',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonBackButton,
    IonBadge,
    NxtAvatarComponent,
  ],
  template: `
    <ion-header
      [class.header--transparent]="variant() === 'transparent'"
      [class.header--blur]="variant() === 'blur'"
      [class.header--bordered]="config().bordered !== false"
      [translucent]="isTranslucent()"
    >
      <ion-toolbar [class.toolbar--transparent]="variant() === 'transparent'">
        <!-- Left Side: Avatar (Twitter/X style), Back Button, or Custom Start Content -->
        <ion-buttons slot="start" class="start-buttons">
          @if (showAvatar()) {
            <button
              type="button"
              class="avatar-button"
              (click)="onAvatarClick()"
              [attr.aria-label]="avatarName() || 'Open profile'"
            >
              <nxt1-avatar
                [src]="avatarSrc()"
                [name]="avatarName() ?? undefined"
                size="md"
                [clickable]="true"
              />
            </button>
          } @else if (showBack()) {
            <ion-back-button
              [defaultHref]="backHref()"
              [text]="backText()"
              [icon]="backIcon()"
              (click)="onBackClick($event)"
            />
          } @else if (showClose()) {
            <ion-button
              fill="clear"
              (click)="onCloseClick()"
              [attr.aria-label]="closeLabel() || 'Close'"
            >
              <ion-icon slot="icon-only" name="close-outline" />
            </ion-button>
          } @else if (showMenu()) {
            <ion-button fill="clear" (click)="onMenuClick()" aria-label="Open menu">
              <ion-icon slot="icon-only" name="menu-outline" />
            </ion-button>
          }
          <!-- Custom start slot content -->
          <ng-content select="[slot=start]" />
        </ion-buttons>

        <!-- Center: Logo or Title (properly centered) -->
        @if (showLogo()) {
          <!-- Twitter/X style: Logo icon centered in header for home page -->
          <div class="header-logo-container">
            <img
              src="assets/shared/logo/nxt1_icon.png"
              alt="NXT1"
              class="header-logo-icon"
              width="28"
              height="28"
            />
          </div>
        } @else if (title()) {
          <ion-title [size]="titleSize()" class="header-title">{{ title() }}</ion-title>
        } @else {
          <!-- Custom title slot for complex titles (avatar + name, etc.) -->
          <ion-title [size]="titleSize()" class="header-title">
            <ng-content select="[slot=title]" />
          </ion-title>
        }

        <!-- Right Side: Action Buttons -->
        <ion-buttons slot="end" class="end-buttons">
          <!-- Configured actions -->
          @for (action of actions(); track action.id) {
            <ion-button
              fill="clear"
              [disabled]="action.disabled"
              [class.action--danger]="action.danger"
              (click)="onActionClick(action)"
              [attr.aria-label]="action.label || action.id"
            >
              <ion-icon slot="icon-only" [name]="action.icon" />
              @if (action.badge && action.badge > 0) {
                <ion-badge color="danger" class="action-badge">
                  {{ action.badge > 99 ? '99+' : action.badge }}
                </ion-badge>
              }
            </ion-button>
          }

          <!-- Custom end slot content -->
          <ng-content select="[slot=end]" />
        </ion-buttons>
      </ion-toolbar>

      <!-- Optional: Large Title for iOS-style collapsible headers -->
      @if (largeTitle() && title()) {
        <ion-toolbar class="large-title-toolbar">
          <ion-title size="large">{{ title() }}</ion-title>
        </ion-toolbar>
      }

      <!-- Optional: Search Bar -->
      @if (showSearch()) {
        <ion-toolbar class="search-toolbar">
          <ng-content select="[slot=search]" />
        </ion-toolbar>
      }
    </ion-header>
  `,
  styles: [
    `
      /* ============================================
         PAGE HEADER - Using Glass Design Tokens
         Consistent with footer component
         ============================================ */

      :host {
        /* Map to glass tokens for consistency with footer */
        --header-glass-bg: var(--nxt1-glass-bg);
        --header-glass-bgSolid: var(--nxt1-glass-bgSolid);
        --header-glass-border: var(--nxt1-glass-border);
        --header-glass-shadow: var(--nxt1-glass-shadow);
        --header-glass-backdrop: var(--nxt1-glass-backdrop);
      }

      /* Base Header Styles - Glass effect by default */
      ion-header {
        --background: var(--header-glass-bg);
        --color: var(--nxt1-color-text-primary, var(--ion-text-color));
      }

      /* Bordered variant */
      .header--bordered ion-toolbar:last-of-type {
        --border-width: 0 0 0.55px 0;
        --border-color: var(--header-glass-border);
      }

      /* Transparent variant */
      .header--transparent,
      .header--transparent ion-toolbar {
        --background: transparent;
        --ion-toolbar-background: transparent;
      }

      /* Blur variant (iOS style) - Uses glass tokens */
      .header--blur {
        --background: var(--header-glass-bg);
        backdrop-filter: var(--header-glass-backdrop);
        -webkit-backdrop-filter: var(--header-glass-backdrop);
      }

      /* Toolbar base */
      ion-toolbar {
        --padding-start: var(--nxt1-spacing-2, 8px);
        --padding-end: var(--nxt1-spacing-2, 8px);
        --min-height: 44px;
        --background: var(--header-glass-bg);
      }

      /* ============================================
         TITLE - Center Aligned
         ============================================ */

      ion-title.header-title {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        text-align: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-weight: var(--nxt1-font-weight-semibold, 600);
        font-size: var(--nxt1-font-size-xl, 20px);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        padding-inline: var(--nxt1-spacing-16, 64px);
        pointer-events: none;
      }

      /* Large title (iOS style) */
      .large-title-toolbar ion-title {
        position: relative;
        text-align: left;
        font-size: var(--nxt1-font-size-3xl, 34px);
        font-weight: var(--nxt1-font-weight-bold, 700);
        letter-spacing: var(--nxt1-letter-spacing-tighter, -0.02em);
        padding-inline: var(--nxt1-spacing-4, 16px);
      }

      /* ============================================
         LOGO - Twitter/X Style Home Header
         ============================================ */

      .header-logo-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }

      .header-logo-icon {
        height: 28px;
        width: auto;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: auto;
      }

      /* ============================================
         LEFT SIDE - Avatar / Back Button
         ============================================ */

      .start-buttons {
        position: relative;
        z-index: 1;
      }

      /* Avatar button (Twitter/X style) */
      .avatar-button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1, 4px);
        margin-left: var(--nxt1-spacing-2, 8px);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity var(--nxt1-transition-fast, 150ms) ease;
      }

      .avatar-button:active {
        opacity: 0.7;
      }

      /* Back button styling */
      ion-back-button {
        --color: var(--nxt1-color-primary, #a3e635);
        --icon-font-size: 24px;
        --icon-margin-end: var(--nxt1-spacing-1, 4px);
        --padding-start: 0;
        --margin-start: 0;
      }

      /* iOS: Use chevron, Android: Use arrow */
      :host-context(.ios) ion-back-button {
        --icon-font-size: 28px;
      }

      /* ============================================
         RIGHT SIDE - Action Buttons
         ============================================ */

      .end-buttons {
        position: relative;
        z-index: 1;
      }

      .end-buttons ion-button {
        --color: var(--nxt1-color-primary, #a3e635);
        --padding-start: var(--nxt1-spacing-2, 8px);
        --padding-end: var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .end-buttons ion-button ion-icon {
        font-size: 24px;
      }

      /* Danger action styling */
      .action--danger {
        --color: var(--nxt1-color-error, #ff3b30);
      }

      /* Action badge */
      .action-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: var(--nxt1-font-size-2xs, 10px);
        min-width: 16px;
        height: 16px;
        padding: 0 var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-radius-full, 9999px);
        --background: var(--nxt1-color-error, #ff3b30);
        --color: var(--nxt1-color-text-inverse, white);
      }

      /* Search toolbar */
      .search-toolbar {
        --padding-top: 0;
        --padding-bottom: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 320px) {
        ion-title.header-title {
          font-size: var(--nxt1-font-size-lg, 17px);
          padding-inline: var(--nxt1-spacing-12, 48px);
        }
      }

      /* Active/pressed states */
      ion-button:active {
        opacity: 0.7;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPageHeaderComponent {
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Page title text */
  readonly title = input<string>();

  /** Show logo icon instead of title (Twitter/X home style) */
  readonly showLogo = input(false);

  /** Title size variant */
  readonly titleSize = input<'small' | 'large'>('small');

  /** Enable iOS-style large collapsible title */
  readonly largeTitle = input(false);

  // --- Avatar (Twitter/X style left side) ---

  /** Avatar image URL (shows avatar on left if provided) */
  readonly avatarSrc = input<string | null | undefined>();

  /** User's name for avatar fallback initials */
  readonly avatarName = input<string | null | undefined>();

  /** Computed: Show avatar when src or name is provided */
  readonly showAvatar = computed(() => {
    const src = this.avatarSrc();
    const name = this.avatarName();
    // Only show avatar if we have a source OR a name for initials
    // AND we're not showing back/close/menu buttons
    return (!!src || !!name) && !this.showBack() && !this.showClose() && !this.showMenu();
  });

  // --- Navigation Buttons ---

  /** Show back button */
  readonly showBack = input(false);

  /** Default href for back navigation */
  readonly backHref = input('/tabs/home');

  /** Back button text (iOS only, empty by default) */
  readonly backText = input('');

  /** Show close button instead of back */
  readonly showClose = input(false);

  /** Close button accessible label */
  readonly closeLabel = input<string>();

  /** Show hamburger menu button */
  readonly showMenu = input(false);

  /** Show search toolbar */
  readonly showSearch = input(false);

  /** Action buttons configuration */
  readonly actions = input<PageHeaderAction[]>([]);

  /** Header configuration */
  readonly configInput = input<Partial<PageHeaderConfig>>({}, { alias: 'config' });

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked */
  readonly avatarClick = output<void>();

  /** Emitted when back button is clicked */
  readonly backClick = output<void>();

  /** Emitted when close button is clicked */
  readonly closeClick = output<void>();

  /** Emitted when menu button is clicked */
  readonly menuClick = output<void>();

  /** Emitted when an action button is clicked */
  readonly actionClick = output<PageHeaderAction>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Merged config with defaults */
  readonly config = computed<PageHeaderConfig>(() => ({
    ...DEFAULT_PAGE_HEADER_CONFIG,
    ...this.configInput(),
  }));

  /** Current variant */
  readonly variant = computed<PageHeaderVariant>(() => this.config().variant || 'default');

  /** Whether to use iOS translucent effect */
  readonly isTranslucent = computed(() => {
    const cfg = this.config();
    if (cfg.translucent === false) return false;
    return this.platform.os() === 'ios' || cfg.translucent === true;
  });

  /** Platform-specific back icon */
  readonly backIcon = computed(() =>
    this.platform.os() === 'ios' ? 'chevron-back' : 'arrow-back'
  );

  // ============================================
  // HANDLERS
  // ============================================

  /**
   * Handle avatar click with haptic feedback
   */
  onAvatarClick(): void {
    void this.haptics.impact('light');
    this.avatarClick.emit();
  }

  /**
   * Handle back button click with haptic feedback
   */
  onBackClick(_event: Event): void {
    // Haptic feedback for navigation
    void this.haptics.impact('light');
    this.backClick.emit();
  }

  /**
   * Handle close button click
   */
  onCloseClick(): void {
    void this.haptics.impact('light');
    this.closeClick.emit();
  }

  /**
   * Handle menu button click
   */
  onMenuClick(): void {
    void this.haptics.impact('light');
    this.menuClick.emit();
  }

  /**
   * Handle action button click
   */
  onActionClick(action: PageHeaderAction): void {
    if (action.disabled) return;
    void this.haptics.impact('light');
    this.actionClick.emit(action);
  }
}
