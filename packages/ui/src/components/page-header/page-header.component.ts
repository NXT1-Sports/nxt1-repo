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
 *   <ng-container pageHeaderSlot="title">
 *     <div class="user-title">
 *       <img [src]="user.avatar" />
 *       <span>@{{ user.username }}</span>
 *     </div>
 *   </ng-container>
 *   <ion-button pageHeaderSlot="end" (click)="openSettings()">
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
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  ellipsisHorizontal,
  ellipsisVertical,
  searchOutline,
  closeOutline,
  menuOutline,
  personCircleOutline,
  // Common action icons for header buttons
  add,
  addOutline,
  addCircleOutline,
  notificationsOutline,
  notifications,
  checkmarkDoneOutline,
  settingsOutline,
  shareOutline,
  createOutline,
  trashOutline,
  heartOutline,
  bookmarkOutline,
  filterOutline,
  optionsOutline,
  refreshOutline,
  downloadOutline,
  cloudUploadOutline,
  cameraOutline,
  imageOutline,
  videocamOutline,
  micOutline,
  sendOutline,
  chatbubbleOutline,
  mailOutline,
  callOutline,
  linkOutline,
  copyOutline,
  pencilOutline,
  eyeOutline,
  eyeOffOutline,
  informationCircleOutline,
  helpCircleOutline,
  warningOutline,
  alertCircleOutline,
  closeCircleOutline,
  checkmarkCircleOutline,
  starOutline,
  star,
  flag,
  flagOutline,
  personAddOutline,
  peopleOutline,
  logOutOutline,
  qrCodeOutline,
  scanOutline,
  expandOutline,
  contractOutline,
  gridOutline,
  listOutline,
  reorderThreeOutline,
  ellipsisHorizontalCircleOutline,
  ellipsisVerticalCircleOutline,
} from 'ionicons/icons';

import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import { NxtAvatarComponent } from '../avatar';
import { NxtLogoComponent } from '../logo';
import { NxtBackButtonComponent } from '../back-button';
import type { PageHeaderAction, PageHeaderConfig, PageHeaderVariant } from './page-header.types';
import { DEFAULT_PAGE_HEADER_CONFIG } from './page-header.types';

// Register Ionicons used for back button, menu, and common action buttons
// This comprehensive list covers most icons consumers might pass to [actions]
addIcons({
  // Navigation (arrowBack, chevronBack removed - using NxtBackButtonComponent)
  menuOutline,
  closeOutline,

  // More/overflow
  ellipsisHorizontal,
  ellipsisVertical,
  ellipsisHorizontalCircleOutline,
  ellipsisVerticalCircleOutline,

  // Search
  searchOutline,
  filterOutline,

  // User
  personCircleOutline,
  personAddOutline,
  peopleOutline,

  // Common actions
  add,
  addOutline,
  addCircleOutline,
  createOutline,
  pencilOutline,
  trashOutline,
  shareOutline,
  copyOutline,
  linkOutline,
  downloadOutline,
  cloudUploadOutline,
  refreshOutline,

  // Notifications/alerts
  notificationsOutline,
  notifications,
  checkmarkDoneOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  helpCircleOutline,
  warningOutline,
  alertCircleOutline,
  closeCircleOutline,

  // Settings
  settingsOutline,
  optionsOutline,

  // Favorites/bookmarks
  heartOutline,
  bookmarkOutline,
  starOutline,
  star,
  flag,
  flagOutline,

  // Media
  cameraOutline,
  imageOutline,
  videocamOutline,
  micOutline,
  qrCodeOutline,
  scanOutline,

  // Communication
  sendOutline,
  chatbubbleOutline,
  mailOutline,
  callOutline,

  // View controls
  eyeOutline,
  eyeOffOutline,
  expandOutline,
  contractOutline,
  gridOutline,
  listOutline,
  reorderThreeOutline,

  // Auth
  logOutOutline,
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
    IonBadge,
    NxtAvatarComponent,
    NxtLogoComponent,
    NxtBackButtonComponent,
  ],
  template: `
    <ion-header
      [class.header--transparent]="variant() === 'transparent'"
      [class.header--blur]="variant() === 'blur'"
      [class.header--solid]="!config().glass"
      [class.header--glass]="config().glass"
      [class.header--bordered]="config().bordered !== false"
      [translucent]="isTranslucent()"
    >
      <ion-toolbar [class.toolbar--transparent]="variant() === 'transparent'">
        <!-- Left Side: Avatar (Twitter/X style), Back Button, or Custom Start Content -->
        <ion-buttons slot="start" class="start-buttons">
          @if (shouldRenderAvatar()) {
            <!-- Avatar always in DOM to preserve layout; hideAvatar makes it invisible -->
            <button
              type="button"
              class="avatar-button"
              [class.avatar-button--hidden]="hideAvatar()"
              (click)="onAvatarClick()"
              [attr.aria-label]="avatarName() || 'Open profile'"
              [attr.tabindex]="hideAvatar() ? -1 : 0"
            >
              <nxt1-avatar
                [src]="avatarSrc()"
                [name]="avatarName() ?? undefined"
                size="md"
                [clickable]="true"
              />
            </button>
          } @else if (showBack()) {
            <nxt1-back-button
              size="md"
              variant="ghost"
              [ariaLabel]="backLabel()"
              (backClick)="onBackClick()"
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
          <ng-content select="[pageHeaderSlot=start]" />
        </ion-buttons>

        <!-- Center: Logo or Title (properly centered) -->
        @if (showLogo()) {
          <!-- Twitter/X style: Logo centered in header for home page -->
          <!-- Uses NxtLogoComponent for theme-aware logo switching (white logo on custom themes) -->
          <div class="header-logo-container">
            <nxt1-logo size="xs" variant="header" alt="NXT1" />
          </div>
        } @else if (title()) {
          <ion-title [size]="titleSize()" class="header-title">{{ title() }}</ion-title>
        } @else {
          <!-- Custom title content (searchbars, etc.) - centered like ion-title -->
          <div class="header-custom-title" [class.header-custom-title--expanded]="hideAvatar()">
            <ng-content select="[pageHeaderSlot=title]" />
          </div>
        }

        <!-- Inline search: uses toolbar-content flow layout -->
        <div class="header-inline-search" [class.header-inline-search--expanded]="hideAvatar()">
          <ng-content select="[pageHeaderSlot=inline-search]" />
        </div>

        <!-- Right Side: Action Buttons -->
        <ion-buttons slot="end" class="end-buttons">
          <!-- Configured actions using Ionicons -->
          @for (action of actions(); track action.id) {
            <button
              type="button"
              class="action-button"
              [class.action-button--danger]="action.danger"
              [class.action-button--disabled]="action.disabled"
              [disabled]="action.disabled"
              (click)="onActionClick(action)"
              [attr.aria-label]="action.label || action.id"
            >
              <ion-icon [name]="action.icon" class="action-icon" />
              @if (action.badge && action.badge > 0) {
                <ion-badge color="danger" class="action-badge">
                  {{ action.badge > 99 ? '99+' : action.badge }}
                </ion-badge>
              }
            </button>
          }

          <!-- Custom end slot content -->
          <ng-content select="[pageHeaderSlot=end]" />
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
          <ng-content select="[pageHeaderSlot=search]" />
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
        display: block;
        width: 100%;

        /* Map to glass tokens for consistency with footer */
        --header-glass-bg: var(--nxt1-glass-bg);
        --header-glass-bgSolid: var(--nxt1-glass-bgSolid);
        --header-glass-border: var(--nxt1-glass-border);
        --header-glass-shadow: var(--nxt1-glass-shadow);
        --header-glass-backdrop: var(--nxt1-glass-backdrop);

        /* Optical vertical-center correction for toolbar control lane */
        --nxt1-header-control-lane-offset-y: 4px;
        --nxt1-header-control-size: 40px;
        --nxt1-header-control-padding-x: var(--nxt1-spacing-1, 4px);
        --nxt1-header-edge-inset: var(--nxt1-header-control-padding-x);

        /* Solid navigation tokens (from design tokens) */
        --header-solid-bg: var(--nxt1-nav-bgSolid);
        --header-solid-border: var(--nxt1-nav-borderSolid);
        --header-solid-shadow: var(--nxt1-nav-shadowSolid);
      }

      /* Base Header Styles - Solid by default */
      ion-header {
        --background: var(--header-solid-bg);
        --color: var(--nxt1-color-text-primary, var(--ion-text-color));
      }

      /* Solid mode (default) - Opaque background from design tokens */
      ion-header.header--solid {
        --background: var(--header-solid-bg);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      /* Glass mode (opt-in) - iOS 26 Liquid Glass Effect */
      ion-header.header--glass {
        --background: var(--header-glass-bg);
        backdrop-filter: var(--header-glass-backdrop);
        -webkit-backdrop-filter: var(--header-glass-backdrop);
      }

      /* Bordered variant */
      .header--bordered ion-toolbar:last-of-type {
        --border-width: 0 0 0.55px 0;
        --border-color: var(--header-solid-border);
      }

      .header--glass.header--bordered ion-toolbar:last-of-type {
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

      /* Toolbar base - Minimum height for consistent layout
         regardless of whether avatar, back button, or nothing is in slots.
         Min-height accommodates md avatar (40px) + padding (8px) + breathing room.
         Uses !important to prevent parent CSS variable cascade from overriding.
         NOTE: Do NOT set explicit height — Ionic adds padding-top for iOS
         safe area (status bar/Dynamic Island ~47px) to the first toolbar
         in ion-header. A fixed height squeezes content to near-zero. */
      ion-toolbar {
        --padding-start: var(--nxt1-spacing-2, 8px);
        --padding-end: var(--nxt1-spacing-2, 8px);
        --min-height: 56px !important;
        --background: inherit;
      }

      .header--solid ion-toolbar {
        --background: var(--header-solid-bg);
      }

      .header--glass ion-toolbar {
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
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-weight: var(--nxt1-font-weight-semibold, 600);
        font-size: var(--nxt1-font-size-xl, 20px);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        padding-inline: var(--nxt1-spacing-16, 64px);
        pointer-events: none;
        transform: translateY(var(--nxt1-header-control-lane-offset-y));
      }

      /* Custom title content (searchbars, etc.) - direct in toolbar default slot */
      /* ion-toolbar shadow DOM places unslotted children in .toolbar-content between start/end */
      /* This is the proper Ionic pattern for searchbars in toolbars */

      /* Large title (iOS style) */
      .large-title-toolbar ion-title {
        position: relative;
        text-align: left;
        font-size: var(--nxt1-font-size-3xl, 34px);
        font-weight: var(--nxt1-font-weight-bold, 700);
        letter-spacing: var(--nxt1-letter-spacing-tighter, -0.02em);
        padding-inline: var(--nxt1-spacing-4, 16px);
        transform: translateY(var(--nxt1-header-control-lane-offset-y));
      }

      /* ============================================
         CENTER CONTENT - Custom slot for searchbars etc.
         Positioned exactly like ion-title for consistent layout
         ============================================ */

      .header-center-content {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        padding-inline: var(--nxt1-spacing-16, 64px);
        z-index: 0; /* Below start/end buttons */
      }

      /* Allow child elements to fill and be interactive */
      .header-center-content > * {
        width: 100%;
        pointer-events: auto;
      }

      /* ============================================
         CUSTOM TITLE - Searchbars, etc.
         Vertically centered like ion-title
         ============================================ */

      .header-custom-title {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-inline-start: var(--nxt1-header-title-padding-start, 56px);
        padding-inline-end: var(--nxt1-header-title-padding-end, 12px);
        z-index: 0;
        transition: padding 0.25s ease;
        transform: translateY(var(--nxt1-header-control-lane-offset-y));
      }

      /* Direct child wrapper must also center its content */
      .header-custom-title > * {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        pointer-events: auto;
      }

      /* Expanded state: reduce left padding when avatar is hidden */
      .header-custom-title--expanded {
        padding-inline-start: var(--nxt1-spacing-4, 16px);
        padding-inline-end: var(--nxt1-spacing-4, 16px);
      }

      /* ============================================
         LOGO - Twitter/X Style Home Header
         Uses NxtLogoComponent for theme-aware switching
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
        transform: translateY(var(--nxt1-header-control-lane-offset-y));
      }

      /* Style the nxt1-logo component within the container */
      .header-logo-container ::ng-deep nxt1-logo {
        pointer-events: auto;
      }

      .header-logo-container ::ng-deep nxt1-logo img {
        height: 24px;
        width: auto;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
      }

      /* ============================================
         LEFT SIDE - Avatar / Back Button
         ============================================ */

      .start-buttons {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        margin: 0;
        padding-inline-start: var(--nxt1-header-edge-inset);
        padding-inline-end: 0;
      }

      /* Avatar button (Twitter/X style) - stays centered, no transform */
      .avatar-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-header-control-size);
        height: var(--nxt1-header-control-size);
        padding: var(--nxt1-header-control-padding-x);
        margin-left: calc(var(--nxt1-header-edge-inset) + 1px);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transform: translateY(var(--nxt1-header-control-lane-offset-y));
        transition:
          transform 0.15s ease,
          opacity 0.15s ease,
          width 0.25s ease,
          margin 0.25s ease;
      }

      .avatar-button:active {
        opacity: 0.7;
      }

      /* Hidden state: collapsed to allow search bar to expand */
      .avatar-button--hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.15s ease;
      }

      /* ============================================
         RIGHT SIDE - Action Buttons
         ============================================ */

      .end-buttons {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        margin: 0;
        padding-inline-start: 0;
        padding-inline-end: var(--nxt1-header-edge-inset);
      }

      .end-buttons ion-button {
        --color: var(--nxt1-color-primary, #a3e635);
        --padding-start: var(--nxt1-header-control-padding-x);
        --padding-end: var(--nxt1-header-control-padding-x);
        --min-width: var(--nxt1-header-control-size);
        --min-height: var(--nxt1-header-control-size);
        margin: 0;
        position: relative;
        transform: translateY(calc(var(--nxt1-header-control-lane-offset-y) - 3px));
      }

      /* ============================================
         ACTION BUTTON - Professional Design Token Icons
         ============================================ */

      .action-button {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 40px;
        height: 40px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-full, 50%);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transform: translateY(calc(var(--nxt1-header-control-lane-offset-y) - 3px));
        transition:
          background-color 0.15s ease,
          transform 0.1s ease,
          opacity 0.15s ease;
      }

      .action-button:hover:not(.action-button--disabled) {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .action-button:active:not(.action-button--disabled) {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.12));
        transform: translateY(calc(var(--nxt1-header-control-lane-offset-y) - 3px)) scale(0.92);
      }

      .action-button--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .action-icon {
        font-size: 24px;
        color: var(--nxt1-color-text-primary, var(--ion-text-color));
        transition: color 0.15s ease;
      }

      .action-button:hover:not(.action-button--disabled) .action-icon {
        color: var(--nxt1-color-text-primary, var(--ion-text-color));
      }

      /* Danger action styling */
      .action-button--danger .action-icon {
        color: var(--nxt1-color-error, #ff3b30);
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

      /* ============================================
         INLINE SEARCH - Flow-based layout in toolbar
         Uses toolbar-content's natural width (between start/end buttons)
         NOT absolutely positioned — adapts as avatar collapses
         ============================================ */

      .header-inline-search {
        position: absolute;
        top: var(--ion-safe-area-top, 0px);
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        min-height: var(--nxt1-inline-search-min-height, 40px);
        padding-inline: var(--nxt1-spacing-16, 64px);
        z-index: 0;
      }

      .header-inline-search--expanded {
        padding-inline: var(--nxt1-spacing-4, 16px);
      }

      /* Projected content with pageHeaderSlot="inline-search" attribute */
      .header-inline-search ::ng-deep [pageHeaderSlot='inline-search'],
      .header-inline-search ::ng-deep [pageheaderslot='inline-search'] {
        width: 100%;
        display: flex;
        align-items: center;
      }

      .header-inline-search > * {
        width: 100%;
        display: flex;
        align-items: center;
        pointer-events: auto;
      }

      /* Hide container when empty (no projected content) */
      .header-inline-search:empty {
        display: none;
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

  /** Externally hide the avatar visually (e.g. when search is focused) — keeps space reserved */
  readonly hideAvatar = input(false);

  /**
   * Computed: Should render avatar in DOM (has src/name and no back/close/menu).
   * This controls DOM presence only — use hideAvatar input to control visibility.
   */
  protected readonly shouldRenderAvatar = computed(() => {
    const src = this.avatarSrc();
    const name = this.avatarName();
    // Render avatar if we have a source OR a name for initials
    // AND we're not showing back/close/menu buttons
    return (!!src || !!name) && !this.showBack() && !this.showClose() && !this.showMenu();
  });

  /**
   * Computed: Show avatar (fully visible)
   * True when avatar should be rendered AND not externally hidden
   */
  readonly showAvatar = computed(() => {
    return this.shouldRenderAvatar() && !this.hideAvatar();
  });

  // --- Navigation Buttons ---

  /** Show back button */
  readonly showBack = input(false);

  /** Accessible label for back button */
  readonly backLabel = input<string>('Go back');

  /**
   * Default href for back navigation
   * @deprecated No longer used - back navigation handled by parent via backClick event
   */
  readonly backHref = input('/home');

  /**
   * Back button text (iOS only)
   * @deprecated No longer used - NxtBackButtonComponent handles styling
   */
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

  /**
   * Platform-specific back icon
   * @deprecated No longer used - NxtBackButtonComponent handles its own icon
   */
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
   * Note: NxtBackButtonComponent already handles haptics, so we skip them here
   */
  onBackClick(): void {
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
