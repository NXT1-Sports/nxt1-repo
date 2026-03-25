/**
 * @fileoverview Activity Item Component - Single Activity Row
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Compact card row component for a single activity/notification item.
 * Twitter/Instagram style with icon/avatar, title, preview, and actions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Icon or avatar display based on type
 * - Unread indicator (dot + background tint)
 * - Time formatting (relative for recent, date for older)
 * - Primary action button
 * - Swipe gestures (archive/mark read) - mobile only
 *
 * @example
 * ```html
 * <nxt1-activity-item
 *   [item]="item"
 *   (read)="onMarkRead(item.id)"
 *   (action)="onAction(item)"
 *   (archive)="onArchive(item.id)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import { type ActivityItem, ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_COLORS } from '@nxt1/core';
import type { MessageActivityMetadata } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../agent-x/fab/agent-x-logo.constants';

// Register all icons
@Component({
  selector: 'nxt1-activity-item',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, IonRippleEffect],
  template: `
    <div
      class="activity-item"
      [class.activity-item--unread]="!item().isRead"
      [class.activity-item--urgent]="item().priority === 'urgent'"
      [class.activity-item--high]="item().priority === 'high'"
      [class.activity-item--message]="isMessage()"
      (click)="handleClick()"
      role="article"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Left: Icon or Avatar -->
      <div class="activity-item__visual">
        @if (showAvatarVisual()) {
          <div class="activity-item__avatar">
            @if (avatarUrl()) {
              <img [src]="avatarUrl()" [alt]="item().source?.userName ?? ''" />
            } @else {
              <div class="activity-item__avatar-placeholder" aria-hidden="true">
                {{ avatarInitials() }}
              </div>
            }
          </div>
        } @else {
          <div
            class="activity-item__icon-circle"
            [style.--activity-icon-accent]="iconAccentColor()"
          >
            @if (isAgentItem()) {
              <svg
                class="activity-item__agent-logo"
                viewBox="0 0 612 792"
                width="32"
                height="32"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
            } @else {
              <nxt1-icon [name]="typeIcon()" [size]="21" />
            }
          </div>
        }
      </div>

      <!-- Center: Content -->
      <div class="activity-item__content">
        <div class="activity-item__header">
          <span class="activity-item__title" [class.activity-item__title--bold]="!item().isRead">
            {{ item().title }}
          </span>
          <span class="activity-item__time">{{ formattedTime() }}</span>
        </div>

        @if (item().body) {
          <p
            class="activity-item__body"
            [class.activity-item__body--dimmed]="isMessage() && msgMeta()?.isOwnLastMessage"
          >
            {{ item().body }}
          </p>
        }

        @if (showSourceName()) {
          <span class="activity-item__source">{{ item().source?.userName }}</span>
        }
      </div>

      <!-- Right: Actions & Indicators -->
      <div class="activity-item__trailing">
        <!-- Message indicators: muted -->
        @if (isMessage()) {
          @if (msgMeta()?.isMuted) {
            <nxt1-icon name="volumeMuteOutline" [size]="14" class="activity-item__mute-icon" />
          }
        }

        <!-- Unread indicator: badge count for messages, dot for others -->
        @if (!item().isRead) {
          @if (isMessage() && (msgMeta()?.unreadCount ?? 0) > 1) {
            <span
              class="activity-item__unread-badge"
              [class.activity-item__unread-badge--muted]="msgMeta()?.isMuted"
            >
              {{ msgMeta()?.unreadCount }}
            </span>
          } @else {
            <div class="activity-item__unread-dot"></div>
          }
        }

        <!-- Media thumbnail (Twitter/X style) — replaces chevron when media attached -->
        @if (item().mediaUrl) {
          <div
            class="activity-item__media-thumb"
            [class.activity-item__media-thumb--video]="item().mediaType === 'video'"
          >
            <img [src]="item().mediaUrl" [alt]="item().title" loading="lazy" />
            @if (item().mediaType === 'video') {
              <nxt1-icon name="playCircle" [size]="24" class="activity-item__media-play" />
            }
          </div>
        } @else if (item().action) {
          <button
            type="button"
            class="activity-item__action"
            [class.activity-item__action--primary]="item().action?.variant === 'primary'"
            (click)="handleActionClick($event)"
          >
            @if (item().action?.icon) {
              <nxt1-icon [name]="item().action?.icon ?? ''" [size]="16" />
            }
            <span>{{ item().action?.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       ACTIVITY ITEM - Professional Notification Row
       Twitter/Instagram Pattern
       ============================================ */

      :host {
        display: block;
      }

      .activity-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color));
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        position: relative;
        cursor: pointer;
        transition: background-color 0.15s ease;
        overflow: hidden;
      }

      .activity-item:active {
        background: var(--nxt1-color-surface-hover, rgba(255, 255, 255, 0.04));
      }

      /* Unread state - subtle brand tint (volt green) */
      .activity-item--unread {
        background: var(--nxt1-color-alpha-primary6, rgba(204, 255, 0, 0.06));
      }

      .activity-item--unread:active {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      /* Urgent/High priority */
      .activity-item--urgent {
        border-left: 3px solid var(--nxt1-color-error, #ef4444);
      }

      .activity-item--high {
        border-left: 3px solid var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
       VISUAL (Icon/Avatar)
       ============================================ */

      .activity-item__visual {
        position: relative;
        flex-shrink: 0;
      }

      .activity-item__avatar {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        background:
          radial-gradient(
            circle at 30% 22%,
            var(--nxt1-color-alpha-white20, rgba(255, 255, 255, 0.2)),
            transparent 44%
          ),
          linear-gradient(
            145deg,
            var(--nxt1-color-primary, #ccff00),
            var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.1))
          );
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.24));
        box-shadow:
          0 10px 18px var(--nxt1-color-alpha-black30, rgba(0, 0, 0, 0.3)),
          inset 0 1px 1px var(--nxt1-color-alpha-white28, rgba(255, 255, 255, 0.28));
      }

      .activity-item__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        display: block;
      }

      .activity-item__avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
      }

      .activity-item__icon-circle {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(
            circle at 30% 22%,
            var(--nxt1-color-alpha-white20, rgba(255, 255, 255, 0.2)),
            transparent 44%
          ),
          linear-gradient(
            145deg,
            var(--activity-icon-accent, var(--nxt1-color-primary, #ccff00)),
            var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.1))
          );
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.24));
        box-shadow:
          0 10px 18px var(--nxt1-color-alpha-black30, rgba(0, 0, 0, 0.3)),
          inset 0 1px 1px var(--nxt1-color-alpha-white28, rgba(255, 255, 255, 0.28));
      }

      .activity-item__icon-circle nxt1-icon {
        color: var(--nxt1-color-text-onDark, #ffffff);
      }

      .activity-item__agent-logo {
        color: #ffffff;
        display: block;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
      }

      /* ============================================
       CONTENT
       ============================================ */

      .activity-item__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .activity-item__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .activity-item__title {
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
        flex: 1;
      }

      .activity-item__time {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        white-space: nowrap;
        flex-shrink: 0;
      }

      .activity-item__body {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: 1.4;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .activity-item__source {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
       TRAILING (Actions & Indicators)
       ============================================ */

      .activity-item__trailing {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .activity-item__unread-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      /* ============================================
       MEDIA THUMBNAIL (Twitter/X Pattern)
       ============================================ */

      .activity-item__media-thumb {
        position: relative;
        width: 64px;
        height: 64px;
        border-radius: 10px;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .activity-item__media-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .activity-item__media-thumb--video::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, transparent 40%, rgba(0, 0, 0, 0.5) 100%);
        pointer-events: none;
      }

      .activity-item__media-play {
        position: absolute;
        bottom: 4px;
        left: 4px;
        font-size: 22px;
        color: rgba(255, 255, 255, 0.92);
        z-index: 1;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
      }

      .activity-item__chevron {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .activity-item__action {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: 16px;
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .activity-item__action:hover {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .activity-item__action--primary {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      .activity-item__action--primary:hover {
        background: var(--nxt1-color-primaryDark, #a3cc00);
      }

      .activity-item__action nxt1-icon {
        font-size: 14px;
      }

      /* ============================================
       MESSAGE-SPECIFIC STYLES
       ============================================ */

      /* Bold title for unread messages */
      .activity-item__title--bold {
        font-weight: 700;
      }

      /* Dimmed body for own last message ("You: ...") */
      .activity-item__body--dimmed {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Unread count badge (number) */
      .activity-item__unread-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
        line-height: 1;
      }

      .activity-item__unread-badge--muted {
        background: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* Mute icon */
      .activity-item__mute-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityItemComponent {
  /** The activity item to display */
  readonly item = input.required<ActivityItem>();

  /** Emitted when item is clicked */
  readonly itemClick = output<ActivityItem>();

  /** Emitted when action button is clicked */
  readonly actionClick = output<ActivityItem>();

  /** Emitted when requesting to mark as read */
  readonly markRead = output<string>();

  /** Emitted when requesting to archive */
  readonly archive = output<string>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Whether this item is a message/conversation type */
  protected readonly isMessage = computed(() => this.item().type === 'message');

  /** Whether this item is a social reaction type */
  protected readonly isReactionType = computed(() => {
    const type = this.item().type;
    return type === 'follow' || type === 'like' || type === 'comment' || type === 'mention';
  });

  /** Whether to render source name under the body */
  protected readonly showSourceName = computed(() => {
    return !this.isMessage() && !this.isReactionType() && !!this.item().source?.userName;
  });

  /** Message-specific metadata (only for type === 'message') */
  protected readonly msgMeta = computed((): MessageActivityMetadata | null => {
    if (this.item().type !== 'message') return null;
    return (this.item().metadata as unknown as MessageActivityMetadata) ?? null;
  });

  /** Whether we should show avatar visual (image or sleek placeholder) */
  protected readonly showAvatarVisual = computed(() => {
    const source = this.item().source;
    // Keep avatars for direct person-driven items; alerts use semantic type icons.
    const shouldUseAvatar = this.isMessage() || this.isReactionType();
    return (
      shouldUseAvatar &&
      !!(source?.userName || source?.teamName || source?.avatarUrl || source?.teamLogoUrl)
    );
  });

  /** Avatar URL to display */
  protected readonly avatarUrl = computed(() => {
    const source = this.item().source;
    return source?.avatarUrl ?? source?.teamLogoUrl ?? '';
  });

  /** Avatar fallback initials when no image is available */
  protected readonly avatarInitials = computed(() => {
    const source = this.item().source;
    const name = source?.userName ?? source?.teamName ?? 'NXT1';
    const parts = name
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return 'N';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  });

  /** Agent tab/system visual uses branded Agent X mark */
  protected readonly isAgentItem = computed(() => this.item().type === 'agent_task');

  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Icon name for the activity type */
  protected readonly typeIcon = computed(() => {
    return ACTIVITY_TYPE_ICONS[this.item().type] ?? 'information-circle-outline';
  });

  /** Color for the activity type */
  protected readonly typeColor = computed(() => {
    return ACTIVITY_TYPE_COLORS[this.item().type] ?? 'var(--nxt1-color-primary)';
  });

  /** Accent color used by the premium icon container */
  protected readonly iconAccentColor = computed(() => {
    if (this.isAgentItem()) {
      return 'var(--nxt1-color-primary, #ccff00)';
    }
    return this.typeColor();
  });

  /** Formatted time string */
  protected readonly formattedTime = computed(() => {
    return this.getRelativeTime(this.item().timestamp);
  });

  /** Accessibility label */
  protected readonly ariaLabel = computed(() => {
    const item = this.item();
    const readStatus = item.isRead ? 'read' : 'unread';
    return `${readStatus} ${item.type}: ${item.title}`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected handleClick(): void {
    const item = this.item();

    // Mark as read if unread
    if (!item.isRead) {
      this.markRead.emit(item.id);
    }

    this.itemClick.emit(item);
  }

  protected handleActionClick(event: Event): void {
    event.stopPropagation();
    this.actionClick.emit(this.item());
  }

  // ============================================
  // HELPERS
  // ============================================

  private getRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    // Format as date for older items
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
