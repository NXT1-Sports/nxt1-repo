/**
 * @fileoverview NxtAvatarGroupComponent - Avatar Stack/Group Display
 * @module @nxt1/ui/components/avatar
 * @version 1.0.0
 *
 * Displays multiple avatars in a stacked/overlapping layout, commonly used
 * for showing team members, participants, or followers.
 *
 * Follows patterns from:
 * - GitHub: Contributor avatars on repos
 * - Figma: Collaborator avatars
 * - Slack: Channel member previews
 * - Linear: Assignee stacks
 *
 * @example Basic usage
 * ```html
 * <nxt1-avatar-group [users]="teamMembers" [max]="4" size="sm" />
 * ```
 *
 * @example With click handler
 * ```html
 * <nxt1-avatar-group
 *   [users]="participants"
 *   [max]="5"
 *   size="md"
 *   (viewAll)="showAllParticipants()"
 * />
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
  computed,
  booleanAttribute,
  numberAttribute,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtAvatarComponent } from './avatar.component';
import { HapticsService } from '../../services/haptics';
import type { AvatarSize, AvatarShape } from './avatar.types';
import { AVATAR_SIZES } from './avatar.types';

/**
 * User data for avatar group display
 */
export interface AvatarGroupUser {
  /** Unique identifier */
  id: string;
  /** User's display name */
  name?: string;
  /** Profile photo URL */
  photoUrl?: string | null;
  /** Explicit initials override */
  initials?: string;
}

/**
 * Event emitted when overflow indicator is clicked
 */
export interface AvatarGroupOverflowEvent {
  /** Original DOM event */
  event: MouseEvent;
  /** Total number of users */
  total: number;
  /** Number of hidden users */
  hidden: number;
  /** All users in the group */
  users: AvatarGroupUser[];
}

@Component({
  selector: 'nxt1-avatar-group',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <div
      class="nxt1-avatar-group"
      [class]="containerClasses()"
      [style.--avatar-overlap]="overlapPx() + 'px'"
      role="group"
      [attr.aria-label]="groupAriaLabel()"
    >
      <!-- Visible avatars -->
      @for (user of visibleUsers(); track user.id; let i = $index) {
        <nxt1-avatar
          [src]="user.photoUrl"
          [name]="user.name"
          [initials]="user.initials"
          [size]="size"
          [shape]="shape"
          [clickable]="clickable"
          [showSkeleton]="showSkeleton"
          [style.z-index]="visibleUsers().length - i"
          (avatarClick)="onAvatarClick(user, $event.event)"
        />
      }

      <!-- Overflow indicator -->
      @if (overflowCount() > 0) {
        <button
          type="button"
          class="overflow-indicator"
          [style.width.px]="avatarSize()"
          [style.height.px]="avatarSize()"
          [style.font-size.px]="overflowFontSize()"
          [style.z-index]="0"
          [attr.aria-label]="overflowAriaLabel()"
          (click)="onOverflowClick($event)"
        >
          <span class="overflow-text">+{{ overflowDisplay() }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         NXT1 AVATAR GROUP COMPONENT STYLES
         Uses --nxt1-* design tokens for theming
         ============================================ */

      :host {
        display: inline-block;
      }

      .nxt1-avatar-group {
        display: inline-flex;
        align-items: center;
        flex-direction: row;
      }

      /* Overlap avatars */
      .nxt1-avatar-group ::ng-deep nxt1-avatar {
        margin-left: calc(var(--avatar-overlap) * -1);
      }

      .nxt1-avatar-group ::ng-deep nxt1-avatar:first-child {
        margin-left: 0;
      }

      /* Add border for stacking visibility */
      .nxt1-avatar-group ::ng-deep nxt1-avatar .avatar-inner {
        border: 2px solid var(--nxt1-ui-bg-page, #0a0a0a);
      }

      /* Reverse direction (newest first) */
      .direction-reverse {
        flex-direction: row-reverse;
      }

      .direction-reverse ::ng-deep nxt1-avatar {
        margin-left: 0;
        margin-right: calc(var(--avatar-overlap) * -1);
      }

      .direction-reverse ::ng-deep nxt1-avatar:first-child {
        margin-right: 0;
      }

      /* Overflow indicator */
      .overflow-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: calc(var(--avatar-overlap) * -1);
        border-radius: 50%;
        background-color: var(--nxt1-ui-bg-input-hover, rgba(255, 255, 255, 0.12));
        color: var(--nxt1-ui-text-secondary, rgba(255, 255, 255, 0.7));
        font-weight: 600;
        border: 2px solid var(--nxt1-ui-bg-page, #0a0a0a);
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          transform 0.15s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .overflow-indicator:hover {
        background-color: var(--nxt1-ui-bg-input, rgba(255, 255, 255, 0.08));
        transform: scale(1.05);
      }

      .overflow-indicator:active {
        transform: scale(0.98);
      }

      .overflow-indicator:focus-visible {
        outline: 2px solid var(--nxt1-ui-primary, #ccff00);
        outline-offset: 2px;
      }

      .overflow-text {
        line-height: 1;
      }

      /* Size variants for overflow indicator */
      .size-xs .overflow-indicator {
        border-width: 1px;
      }

      .size-sm .overflow-indicator {
        border-width: 1.5px;
      }

      /* Rounded shape variant */
      .shape-rounded ::ng-deep nxt1-avatar .avatar-inner,
      .shape-rounded .overflow-indicator {
        border-radius: 20%;
      }

      .shape-square ::ng-deep nxt1-avatar .avatar-inner,
      .shape-square .overflow-indicator {
        border-radius: 8%;
      }

      @media (prefers-reduced-motion: reduce) {
        .overflow-indicator {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAvatarGroupComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Array of users to display */
  @Input({ required: true }) users: AvatarGroupUser[] = [];

  /** Maximum number of avatars to show before overflow */
  @Input({ transform: numberAttribute }) max = 4;

  /** Avatar size */
  @Input() size: AvatarSize = 'md';

  /** Avatar shape */
  @Input() shape: AvatarShape = 'circle';

  /** Whether individual avatars are clickable */
  @Input({ transform: booleanAttribute }) clickable = false;

  /** Whether to show loading skeleton */
  @Input({ transform: booleanAttribute }) showSkeleton = true;

  /** Reverse direction (newest first, on the left) */
  @Input({ transform: booleanAttribute }) reverse = false;

  /** Overlap percentage (0-100) */
  @Input({ transform: numberAttribute }) overlap = 25;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when an individual avatar is clicked */
  @Output() avatarClick = new EventEmitter<{ user: AvatarGroupUser; event: MouseEvent }>();

  /** Emits when overflow indicator is clicked */
  @Output() viewAll = new EventEmitter<AvatarGroupOverflowEvent>();

  // ============================================
  // COMPUTED VALUES
  // ============================================

  /** Avatar size in pixels */
  readonly avatarSize = computed(() => AVATAR_SIZES[this.size]);

  /** Overlap in pixels */
  readonly overlapPx = computed(() => {
    return Math.round((this.avatarSize() * this.overlap) / 100);
  });

  /** Font size for overflow indicator */
  readonly overflowFontSize = computed(() => {
    return Math.round(this.avatarSize() * 0.35);
  });

  /** Users to display (limited by max) */
  readonly visibleUsers = computed(() => {
    const list = this.reverse ? [...this.users].reverse() : this.users;
    return list.slice(0, this.max);
  });

  /** Number of hidden users */
  readonly overflowCount = computed(() => {
    return Math.max(0, this.users.length - this.max);
  });

  /** Formatted overflow display */
  readonly overflowDisplay = computed(() => {
    const count = this.overflowCount();
    return count > 99 ? '99' : count.toString();
  });

  /** ARIA label for the group */
  readonly groupAriaLabel = computed(() => {
    const total = this.users.length;
    const visible = this.visibleUsers().length;
    if (total === visible) {
      return `Group of ${total} user${total > 1 ? 's' : ''}`;
    }
    return `Group of ${total} users, showing ${visible}`;
  });

  /** ARIA label for overflow indicator */
  readonly overflowAriaLabel = computed(() => {
    const count = this.overflowCount();
    return `View ${count} more user${count > 1 ? 's' : ''}`;
  });

  /** Container CSS classes */
  readonly containerClasses = computed(() => {
    const classes = [];
    classes.push(`size-${this.size}`);
    classes.push(`shape-${this.shape}`);
    if (this.reverse) {
      classes.push('direction-reverse');
    }
    return classes.join(' ');
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle individual avatar click */
  onAvatarClick(user: AvatarGroupUser, event: MouseEvent): void {
    if (!this.clickable) return;
    this.avatarClick.emit({ user, event });
  }

  /** Handle overflow indicator click */
  async onOverflowClick(event: MouseEvent): Promise<void> {
    await this.haptics.impact('light');

    this.viewAll.emit({
      event,
      total: this.users.length,
      hidden: this.overflowCount(),
      users: this.users,
    });
  }
}
