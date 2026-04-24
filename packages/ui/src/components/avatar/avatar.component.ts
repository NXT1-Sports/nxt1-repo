/**
 * @fileoverview NxtAvatarComponent - Professional Avatar Component
 * @module @nxt1/ui/components/avatar
 * @version 1.0.0
 *
 * Enterprise-grade avatar component following patterns from Instagram, Discord,
 * Slack, LinkedIn, and Twitter. Provides image display with intelligent fallback
 * to generated initials, status indicators, and badge support.
 *
 * Design Philosophy:
 * - Instagram: Clean circular avatars with story ring borders
 * - Discord: Status indicators (online/idle/dnd/offline)
 * - Slack: Rounded squares for workspaces, circles for users
 * - LinkedIn: Verified badges and premium indicators
 * - Twitter: Blue checkmark verification badges
 *
 * Features:
 * - Image loading with skeleton placeholder
 * - Automatic initials generation from name/email
 * - Consistent color generation per user (hash-based)
 * - Online/presence status indicators
 * - Multiple badge types (verified, premium, pro, count)
 * - Multiple sizes (xs through 2xl)
 * - Multiple shapes (circle, rounded, square)
 * - Border/ring support (Instagram stories style)
 * - Clickable with haptic feedback
 * - Full accessibility support
 * - SSR-safe implementation
 * - Dark/light theme aware
 *
 * @example Basic usage
 * ```html
 * <nxt1-avatar
 *   [src]="user.photoUrl"
 *   [name]="user.displayName"
 *   size="md"
 * />
 * ```
 *
 * @example With status indicator
 * ```html
 * <nxt1-avatar
 *   [src]="user.photoUrl"
 *   [name]="user.displayName"
 *   size="lg"
 *   status="online"
 * />
 * ```
 *
 * @example With verification badge
 * ```html
 * <nxt1-avatar
 *   [src]="user.photoUrl"
 *   [name]="user.displayName"
 *   size="xl"
 *   badge="verified"
 * />
 * ```
 *
 * @example With notification count
 * ```html
 * <nxt1-avatar
 *   [src]="user.photoUrl"
 *   [name]="user.displayName"
 *   [badge]="{ type: 'count', count: 5, position: 'top-right' }"
 * />
 * ```
 *
 * @example Clickable with ring border
 * ```html
 * <nxt1-avatar
 *   [src]="user.photoUrl"
 *   [name]="user.displayName"
 *   [clickable]="true"
 *   borderColor="var(--nxt-color-primary)"
 *   [borderWidth]="2"
 *   (avatarClick)="openProfile()"
 * />
 * ```
 *
 * @example Initials fallback (no image)
 * ```html
 * <nxt1-avatar
 *   [name]="'John Doe'"
 *   size="lg"
 * />
 * <!-- Displays "JD" on colored background -->
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  OnChanges,
  SimpleChanges,
  PLATFORM_ID,
  booleanAttribute,
  numberAttribute,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { HapticsService } from '../../services/haptics';
import {
  extractInitials,
  getInitialsColor,
  getContrastingTextColor,
  formatBadgeCount,
  sanitizeImageUrl,
} from './avatar.utils';
import {
  type AvatarSize,
  type AvatarShape,
  type AvatarStatus,
  type AvatarBadgeType,
  type AvatarBadgeConfig,
  type AvatarLoadState,
  type AvatarClickEvent,
  AVATAR_SIZES,
  AVATAR_FONT_SIZES,
  AVATAR_STATUS_SIZES,
  AVATAR_BADGE_SIZES,
  AVATAR_STATUS_COLORS,
} from './avatar.types';

interface AvatarReactiveInputs {
  readonly src?: string | null;
  readonly alt?: string;
  readonly name?: string;
  readonly initials?: string;
  readonly size: AvatarSize;
  readonly customSize?: number;
  readonly shape: AvatarShape;
  readonly status?: AvatarStatus;
  readonly badge?: AvatarBadgeConfig | AvatarBadgeType;
  readonly fallbackSrc?: string;
  readonly clickable: boolean;
  readonly showSkeleton: boolean;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly cssClass?: string;
  readonly isTeamRole: boolean;
  readonly defaultIcon?: string;
}

@Component({
  selector: 'nxt1-avatar',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div
      class="nxt1-avatar"
      [class]="containerClasses()"
      [style.--avatar-size]="sizeInPx() + 'px'"
      [style.--avatar-font-size]="fontSizeInPx() + 'px'"
      [style.--avatar-border-color]="borderColor || 'transparent'"
      [style.--avatar-border-width]="(borderWidth || 0) + 'px'"
      [style.--avatar-initials-bg]="initialsBackground()"
      [style.--avatar-initials-color]="initialsTextColor()"
      [attr.role]="clickable ? 'button' : 'img'"
      [attr.tabindex]="clickable ? 0 : null"
      [attr.aria-label]="ariaLabel()"
      (click)="onClick($event)"
      (keydown)="onKeydown($event)"
    >
      <!-- Border/Ring (Instagram stories style) -->
      @if (borderColor && borderWidth) {
        <div class="avatar-ring" aria-hidden="true"></div>
      }

      <!-- Main avatar container -->
      <div class="avatar-inner">
        <!-- Loading skeleton -->
        @if (loadState() === 'loading' && showSkeleton) {
          <div class="avatar-skeleton" aria-hidden="true">
            <div class="skeleton-shimmer"></div>
          </div>
        }

        <!-- Image (hidden during loading/error) -->
        @if (sanitizedSrc()) {
          <img
            class="avatar-image"
            [class.loaded]="loadState() === 'loaded'"
            [class.hidden]="loadState() === 'error'"
            [src]="sanitizedSrc()"
            [alt]="alt || name || 'Avatar'"
            (load)="onImageLoad()"
            (error)="onImageError()"
            loading="lazy"
            decoding="async"
          />
        }

        <!-- Initials fallback -->
        @if (showInitials()) {
          <div class="avatar-initials" [attr.aria-label]="'Avatar initials: ' + displayInitials()">
            <span class="initials-text">{{ displayInitials() }}</span>
          </div>
        }

        <!-- Default icon fallback (no name, no image) -->
        @if (showDefaultIcon()) {
          <div class="avatar-default" aria-hidden="true">
            <nxt1-icon
              [name]="defaultIcon || (isTeamRole ? 'shield' : 'person')"
              [size]="iconSize()"
            />
          </div>
        }
      </div>

      <!-- Status indicator -->
      @if (status && status !== 'none') {
        <div
          class="avatar-status"
          [class]="'status-' + status"
          [style.--status-size]="statusSizeInPx() + 'px'"
          [style.--status-color]="statusColor()"
          [attr.aria-label]="status + ' status'"
          role="status"
        ></div>
      }

      <!-- Badge -->
      @if (showBadge()) {
        <div
          class="avatar-badge"
          [class]="badgeClasses()"
          [style.--badge-size]="badgeSizeInPx() + 'px'"
          [attr.aria-label]="badgeAriaLabel()"
        >
          @switch (normalizedBadge()?.type) {
            @case ('verified') {
              <nxt1-icon name="verified" [size]="badgeIconSize()" />
            }
            @case ('premium') {
              <nxt1-icon name="star" [size]="badgeIconSize()" />
            }
            @case ('pro') {
              <span class="badge-text">PRO</span>
            }
            @case ('coach') {
              <nxt1-icon name="whistle" [size]="badgeIconSize()" />
            }
            @case ('athlete') {
              <nxt1-icon name="sports" [size]="badgeIconSize()" />
            }
            @case ('team') {
              <nxt1-icon name="people" [size]="badgeIconSize()" />
            }
            @case ('count') {
              <span class="badge-count">{{ formattedBadgeCount() }}</span>
            }
            @case ('custom') {
              @if (normalizedBadge()?.icon) {
                <nxt1-icon [name]="normalizedBadge()!.icon!" [size]="badgeIconSize()" />
              }
            }
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         NXT1 AVATAR COMPONENT STYLES
         Uses --nxt1-* design tokens for theming
         ============================================ */

      :host {
        display: inline-block;
        vertical-align: middle;
      }

      .nxt1-avatar {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--avatar-size);
        height: var(--avatar-size);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', ui-sans-serif, system-ui, sans-serif);
      }

      /* ============================================
         SHAPE VARIANTS
         ============================================ */

      .shape-circle .avatar-ring,
      .shape-circle .avatar-inner,
      .shape-circle .avatar-image,
      .shape-circle .avatar-initials,
      .shape-circle .avatar-default,
      .shape-circle .avatar-skeleton {
        border-radius: 50%;
      }

      .shape-rounded .avatar-ring,
      .shape-rounded .avatar-inner,
      .shape-rounded .avatar-image,
      .shape-rounded .avatar-initials,
      .shape-rounded .avatar-default,
      .shape-rounded .avatar-skeleton {
        border-radius: calc(var(--avatar-size) * 0.2);
      }

      .shape-square .avatar-ring,
      .shape-square .avatar-inner,
      .shape-square .avatar-image,
      .shape-square .avatar-initials,
      .shape-square .avatar-default,
      .shape-square .avatar-skeleton {
        border-radius: calc(var(--avatar-size) * 0.08);
      }

      /* ============================================
         CLICKABLE STATE
         ============================================ */

      .clickable {
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .clickable:focus-visible {
        outline: 2px solid var(--nxt1-ui-primary, #ccff00);
        outline-offset: 2px;
      }

      .clickable:hover .avatar-inner {
        transform: scale(1.02);
      }

      .clickable:active .avatar-inner {
        transform: scale(0.98);
      }

      /* ============================================
         BORDER RING (Instagram Stories Style)
         ============================================ */

      .avatar-ring {
        position: absolute;
        inset: calc(var(--avatar-border-width) * -1 - 2px);
        border: var(--avatar-border-width) solid var(--avatar-border-color);
        pointer-events: none;
        z-index: 0;
      }

      .avatar-ring.gradient {
        border: none;
        background: var(
          --nxt1-avatar-ring-gradient,
          linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)
        );
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        padding: var(--avatar-border-width);
      }

      /* ============================================
         MAIN AVATAR CONTAINER
         ============================================ */

      .avatar-inner {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: var(--nxt1-ui-bg-input, rgba(255, 255, 255, 0.08));
        transition: transform 0.15s ease-out;
        z-index: 1;
      }

      /* ============================================
         IMAGE
         ============================================ */

      .avatar-image {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .avatar-image.loaded {
        opacity: 1;
      }

      .avatar-image.hidden {
        display: none;
      }

      /* ============================================
         INITIALS FALLBACK
         ============================================ */

      .avatar-initials {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--avatar-initials-bg);
        color: var(--avatar-initials-color);
      }

      .initials-text {
        font-size: var(--avatar-font-size);
        font-weight: 600;
        letter-spacing: 0.025em;
        line-height: 1;
        text-transform: uppercase;
      }

      /* ============================================
         DEFAULT ICON FALLBACK
         ============================================ */

      .avatar-default {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--nxt1-ui-bg-input, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-ui-text-muted, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         LOADING SKELETON
         ============================================ */

      .avatar-skeleton {
        position: absolute;
        inset: 0;
        background-color: var(--nxt1-ui-bg-input, rgba(255, 255, 255, 0.08));
        overflow: hidden;
      }

      .skeleton-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.1) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s ease-in-out infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      /* ============================================
         STATUS INDICATOR
         ============================================ */

      .avatar-status {
        position: absolute;
        bottom: 0;
        right: 0;
        width: var(--status-size);
        height: var(--status-size);
        background-color: var(--status-color);
        border: 2px solid var(--nxt1-ui-bg-page, #0a0a0a);
        border-radius: 50%;
        z-index: 2;
      }

      .shape-rounded .avatar-status {
        bottom: -2px;
        right: -2px;
      }

      .avatar-status.status-online::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        background-color: var(--status-color);
        opacity: 0;
        animation: status-pulse 2s ease-in-out infinite;
      }

      @keyframes status-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0;
        }
        50% {
          transform: scale(1.5);
          opacity: 0.3;
        }
      }

      /* ============================================
         BADGE
         ============================================ */

      .avatar-badge {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: var(--badge-size);
        height: var(--badge-size);
        padding: 0 2px;
        border-radius: calc(var(--badge-size) / 2);
        font-size: calc(var(--badge-size) * 0.55);
        font-weight: 600;
        line-height: 1;
        z-index: 3;
        border: 2px solid var(--nxt1-ui-bg-page, #0a0a0a);
      }

      .badge-top-right {
        top: -4px;
        right: -4px;
      }

      .badge-bottom-right {
        bottom: -4px;
        right: -4px;
      }

      .badge-top-left {
        top: -4px;
        left: -4px;
      }

      .badge-bottom-left {
        bottom: -4px;
        left: -4px;
      }

      .badge-verified {
        background-color: var(--nxt1-color-info, #1d9bf0);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-premium {
        background: var(--nxt1-color-secondary, linear-gradient(135deg, #ffd700 0%, #ff8c00 100%));
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-pro {
        background-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px 6px;
        font-size: calc(var(--badge-size) * 0.45);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .badge-coach {
        background-color: var(--nxt1-color-accent, #8b5cf6);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-athlete {
        background-color: var(--nxt1-color-feedback-success, #22c55e);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-team {
        background-color: var(--nxt1-color-feedback-warning, #f59e0b);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-count {
        background-color: var(--nxt1-color-feedback-error);
        color: var(--nxt1-color-text-onPrimary);
        min-width: var(--badge-size);
        padding: 0 4px;
      }

      .badge-custom {
        background-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px;
        border-radius: 50%;
      }

      .badge-text,
      .badge-count {
        white-space: nowrap;
      }

      /* ============================================
         SIZE ADJUSTMENTS
         ============================================ */

      .size-xs .avatar-status {
        border-width: 1px;
      }

      .size-xs .avatar-badge {
        border-width: 1px;
        padding: 0 1px;
        min-width: 10px;
        height: 10px;
      }

      .size-sm .avatar-status {
        border-width: 1.5px;
      }

      .size-sm .avatar-badge {
        border-width: 1.5px;
      }

      /* ============================================
         AVATAR GROUP SUPPORT
         ============================================ */

      :host-context(.nxt1-avatar-group) {
        margin-left: -8px;
      }

      :host-context(.nxt1-avatar-group):first-child {
        margin-left: 0;
      }

      :host-context(.nxt1-avatar-group) .avatar-inner {
        border: 2px solid var(--nxt1-ui-bg-page, #0a0a0a);
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .avatar-inner,
        .avatar-image,
        .skeleton-shimmer,
        .avatar-status::after {
          transition: none;
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAvatarComponent implements OnChanges {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Image source URL */
  @Input() src?: string | null;

  /** Alt text for image */
  @Input() alt?: string;

  /** Full name (used for initials generation) */
  @Input() name?: string;

  /** Explicit initials override (max 2 chars) */
  @Input() initials?: string;

  /** Avatar size preset */
  @Input() size: AvatarSize = 'md';

  /** Custom size in pixels (overrides size preset) */
  @Input({ transform: numberAttribute }) customSize?: number;

  /** Avatar shape */
  @Input() shape: AvatarShape = 'circle';

  /** Online/presence status */
  @Input() status?: AvatarStatus;

  /** Badge configuration (string shorthand or full config) */
  @Input() badge?: AvatarBadgeConfig | AvatarBadgeType;

  /** Fallback image URL */
  @Input() fallbackSrc?: string;

  /** Whether avatar is clickable */
  @Input({ transform: booleanAttribute }) clickable = false;

  /** Show skeleton during loading */
  @Input({ transform: booleanAttribute }) showSkeleton = true;

  /** Border color (stories ring) */
  @Input() borderColor?: string;

  /** Border width in pixels */
  @Input({ transform: numberAttribute }) borderWidth?: number;

  /** Custom CSS class */
  @Input() cssClass?: string;

  /**
   * Whether this avatar represents a team role (coach/director).
   * When true and no image/name is available, shows a shield icon instead of person icon.
   */
  @Input({ transform: booleanAttribute }) isTeamRole = false;

  /**
   * Override the default fallback icon name.
   * When set, this icon is shown instead of the default 'person' or 'shield' icon
   * when no image or initials are available.
   * Example: 'athlete' for athlete sport profile placeholders.
   */
  @Input() defaultIcon?: string;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when avatar is clicked (if clickable) */
  @Output() avatarClick = new EventEmitter<AvatarClickEvent>();

  /** Emits when image loads successfully */
  @Output() imageLoad = new EventEmitter<void>();

  /** Emits when image fails to load */
  @Output() imageError = new EventEmitter<void>();

  // ============================================
  // INTERNAL STATE (Private Writeable Signals)
  // ============================================

  /** Current image loading state (private, use loadState() computed) */
  private readonly _loadState = signal<AvatarLoadState>('idle');

  /** Whether fallback image is being used */
  private readonly _usingFallback = signal(false);

  /** Reactive mirror for any @Input consumed inside computed signals */
  private readonly _inputState = signal<AvatarReactiveInputs>({
    src: undefined,
    alt: undefined,
    name: undefined,
    initials: undefined,
    size: 'md',
    customSize: undefined,
    shape: 'circle',
    status: undefined,
    badge: undefined,
    fallbackSrc: undefined,
    clickable: false,
    showSkeleton: true,
    borderColor: undefined,
    borderWidth: undefined,
    cssClass: undefined,
    isTeamRole: false,
    defaultIcon: undefined,
  });

  /** Browser detection */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Readonly)
  // ============================================

  /** Current image loading state */
  readonly loadState = computed(() => this._loadState());

  // ============================================
  // COMPUTED VALUES
  // ============================================

  /** Sanitized and validated image source */
  readonly sanitizedSrc = computed(() => {
    const inputs = this._inputState();
    if (this._usingFallback()) {
      return sanitizeImageUrl(inputs.fallbackSrc);
    }
    return sanitizeImageUrl(inputs.src);
  });

  /** Size in pixels */
  readonly sizeInPx = computed(() => {
    const inputs = this._inputState();
    if (inputs.customSize && inputs.customSize > 0) {
      return inputs.customSize;
    }
    return AVATAR_SIZES[inputs.size];
  });

  /** Font size for initials */
  readonly fontSizeInPx = computed(() => {
    const inputs = this._inputState();
    if (inputs.customSize && inputs.customSize > 0) {
      // Calculate proportionally
      return Math.round(inputs.customSize * 0.35);
    }
    return AVATAR_FONT_SIZES[inputs.size];
  });

  /** Status indicator size */
  readonly statusSizeInPx = computed(() => {
    const inputs = this._inputState();
    if (inputs.customSize && inputs.customSize > 0) {
      return Math.round(inputs.customSize * 0.25);
    }
    return AVATAR_STATUS_SIZES[inputs.size];
  });

  /** Badge size */
  readonly badgeSizeInPx = computed(() => {
    const inputs = this._inputState();
    if (inputs.customSize && inputs.customSize > 0) {
      return Math.round(inputs.customSize * 0.4);
    }
    return AVATAR_BADGE_SIZES[inputs.size];
  });

  /** Icon size for default/badge icons */
  readonly iconSize = computed(() => Math.round(this.sizeInPx() * 0.5));

  /** Badge icon size */
  readonly badgeIconSize = computed(() => Math.round(this.badgeSizeInPx() * 0.7));

  /** Display initials */
  readonly displayInitials = computed(() => {
    const inputs = this._inputState();
    if (inputs.initials) {
      return inputs.initials.substring(0, 2).toUpperCase();
    }
    return extractInitials(inputs.name || inputs.alt);
  });

  /** Background color for initials */
  readonly initialsBackground = computed(() => {
    const inputs = this._inputState();
    return getInitialsColor(inputs.name || inputs.alt || inputs.initials);
  });

  /** Text color for initials (contrasting) */
  readonly initialsTextColor = computed(() => {
    return getContrastingTextColor(this.initialsBackground());
  });

  /** Status indicator color */
  readonly statusColor = computed(() => {
    const { status } = this._inputState();
    if (!status || status === 'none') {
      return 'transparent';
    }
    return AVATAR_STATUS_COLORS[status];
  });

  /** Normalized badge config (handles string shorthand) */
  readonly normalizedBadge = computed((): AvatarBadgeConfig | null => {
    const { badge } = this._inputState();
    if (!badge) return null;
    if (typeof badge === 'string') {
      if (badge === 'none') return null;
      return { type: badge, position: 'bottom-right' };
    }
    return {
      ...badge,
      position: badge.position || 'bottom-right',
    };
  });

  /** Formatted badge count */
  readonly formattedBadgeCount = computed(() => {
    const badge = this.normalizedBadge();
    if (!badge || badge.type !== 'count') return '';
    return formatBadgeCount(badge.count || 0, badge.maxCount || 99);
  });

  /** Whether to show initials fallback */
  readonly showInitials = computed(() => {
    const inputs = this._inputState();
    const state = this.loadState();
    const hasSrc = !!this.sanitizedSrc();
    const hasName = !!(inputs.name || inputs.alt || inputs.initials);

    // Team roles without an image show the shield icon, not personal initials
    if (inputs.isTeamRole && (!hasSrc || state === 'error')) return false;

    // When a defaultIcon is set, prefer the icon over initials
    if (inputs.defaultIcon && (!hasSrc || state === 'error')) return false;

    // Show initials if:
    // 1. No image source and has name
    // 2. Image failed to load and has name
    return (!hasSrc || state === 'error') && hasName;
  });

  /** Whether to show default person/shield icon */
  readonly showDefaultIcon = computed(() => {
    const inputs = this._inputState();
    const state = this.loadState();
    const hasSrc = !!this.sanitizedSrc();
    const hasName = !!(inputs.name || inputs.alt || inputs.initials);

    // Team roles without an image always show the shield icon
    if (inputs.isTeamRole && (!hasSrc || state === 'error')) return true;

    // When a defaultIcon is set, always show it when no image is available
    if (inputs.defaultIcon && (!hasSrc || state === 'error')) return true;

    // Show default icon if no image and no name for initials
    return (!hasSrc || state === 'error') && !hasName;
  });

  /** Whether to show badge */
  readonly showBadge = computed(() => {
    const badge = this.normalizedBadge();
    if (!badge || badge.type === 'none') return false;
    if (badge.type === 'count' && (!badge.count || badge.count <= 0)) return false;
    return true;
  });

  /** ARIA label for accessibility */
  readonly ariaLabel = computed(() => {
    const inputs = this._inputState();
    const parts: string[] = [];

    // Name/initials
    if (inputs.name) {
      parts.push(inputs.name);
    } else if (inputs.alt) {
      parts.push(inputs.alt);
    } else {
      parts.push('User avatar');
    }

    // Status
    if (inputs.status && inputs.status !== 'none') {
      parts.push(`(${inputs.status})`);
    }

    // Badge
    const badge = this.normalizedBadge();
    if (badge) {
      if (badge.type === 'verified') {
        parts.push('- Verified');
      } else if (badge.type === 'premium') {
        parts.push('- Premium member');
      } else if (badge.type === 'count' && badge.count) {
        parts.push(`- ${badge.count} notification${badge.count > 1 ? 's' : ''}`);
      }
    }

    return parts.join(' ');
  });

  /** Badge ARIA label */
  readonly badgeAriaLabel = computed(() => {
    const badge = this.normalizedBadge();
    if (!badge) return '';

    if (badge.ariaLabel) return badge.ariaLabel;

    switch (badge.type) {
      case 'verified':
        return 'Verified account';
      case 'premium':
        return 'Premium member';
      case 'pro':
        return 'Pro account';
      case 'coach':
        return 'Coach account';
      case 'athlete':
        return 'Athlete account';
      case 'team':
        return 'Team account';
      case 'count':
        return `${badge.count || 0} notifications`;
      default:
        return 'Badge';
    }
  });

  /** Container CSS classes */
  readonly containerClasses = computed(() => {
    const inputs = this._inputState();
    const classes = ['avatar-container'];

    // Shape
    classes.push(`shape-${inputs.shape}`);

    // Size
    classes.push(`size-${inputs.size}`);

    // Clickable
    if (inputs.clickable) {
      classes.push('clickable');
    }

    // Loading state
    classes.push(`state-${this.loadState()}`);

    // Custom class
    if (inputs.cssClass) {
      classes.push(inputs.cssClass);
    }

    return classes.join(' ');
  });

  /** Badge CSS classes */
  readonly badgeClasses = computed(() => {
    const badge = this.normalizedBadge();
    if (!badge) return '';

    const classes = ['badge'];
    classes.push(`badge-${badge.type}`);
    classes.push(`badge-${badge.position || 'bottom-right'}`);

    return classes.join(' ');
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnChanges(changes: SimpleChanges): void {
    this.syncInputState();

    // Reset loading state when src changes
    if (changes['src']) {
      this._usingFallback.set(false);
      if (sanitizeImageUrl(this.src)) {
        this._loadState.set('loading');
      } else {
        this._loadState.set('idle');
      }
    }
  }

  private syncInputState(): void {
    this._inputState.set({
      src: this.src,
      alt: this.alt,
      name: this.name,
      initials: this.initials,
      size: this.size,
      customSize: this.customSize,
      shape: this.shape,
      status: this.status,
      badge: this.badge,
      fallbackSrc: this.fallbackSrc,
      clickable: this.clickable,
      showSkeleton: this.showSkeleton,
      borderColor: this.borderColor,
      borderWidth: this.borderWidth,
      cssClass: this.cssClass,
      isTeamRole: this.isTeamRole,
      defaultIcon: this.defaultIcon,
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle image load success */
  onImageLoad(): void {
    this._loadState.set('loaded');
    this.imageLoad.emit();
  }

  /** Handle image load error */
  onImageError(): void {
    // Try fallback if available
    if (this.fallbackSrc && !this._usingFallback()) {
      this._usingFallback.set(true);
      this._loadState.set('loading');
      return;
    }

    this._loadState.set('error');
    this.imageError.emit();
  }

  /** Handle keyboard activation */
  onKeydown(event: KeyboardEvent): void {
    // Only respond to Enter and Space keys
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    // Prevent page scroll on space
    event.preventDefault();
    this.onClick(event as unknown as MouseEvent);
  }

  /** Handle avatar click */
  async onClick(event: MouseEvent): Promise<void> {
    if (!this.clickable) return;

    // Haptic feedback
    if (this.isBrowser) {
      await this.haptics.impact('light');
    }

    this.avatarClick.emit({
      event,
      config: {
        src: this.src,
        alt: this.alt,
        name: this.name,
        initials: this.initials,
        size: this.size,
        customSize: this.customSize,
        shape: this.shape,
        status: this.status,
        badge: this.badge,
        fallbackSrc: this.fallbackSrc,
        clickable: this.clickable,
        showSkeleton: this.showSkeleton,
        borderColor: this.borderColor,
        borderWidth: this.borderWidth,
        cssClass: this.cssClass,
      },
    });
  }
}
