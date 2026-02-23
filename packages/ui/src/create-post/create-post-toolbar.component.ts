/**
 * @fileoverview Create Post Toolbar Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Action toolbar with media, tag, location, poll, and schedule buttons.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Icon buttons with labels
 * - Active state highlighting
 * - Disabled states per button
 * - Haptic feedback on tap
 * - Tooltips on hover (web)
 *
 * @example
 * ```html
 * <nxt1-create-post-toolbar
 *   [hasMedia]="media().length > 0"
 *   [hasLocation]="!!location()"
 *   [hasPoll]="!!poll()"
 *   (addMedia)="openMediaPicker()"
 *   (addTag)="openTagPicker()"
 *   (addLocation)="openLocationPicker()"
 *   (addPoll)="openPollEditor()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  imageOutline,
  personAddOutline,
  locationOutline,
  statsChartOutline,
  calendarOutline,
  filmOutline,
  happyOutline,
} from 'ionicons/icons';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
interface ToolbarAction {
  id: string;
  icon: string;
  label: string;
  isActive?: boolean;
  isDisabled?: boolean;
}

@Component({
  selector: 'nxt1-create-post-toolbar',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="toolbar" [class.toolbar--disabled]="disabled()">
      <div class="toolbar__actions">
        @for (action of actions(); track action.id) {
          <button
            type="button"
            class="toolbar__action"
            [class.toolbar__action--active]="action.isActive"
            [class.toolbar__action--disabled]="action.isDisabled"
            (click)="onAction(action)"
            [disabled]="disabled() || action.isDisabled"
            [attr.aria-label]="action.label"
            [attr.title]="action.label"
          >
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon [name]="action.icon"></ion-icon>
            @if (showLabels()) {
              <span class="toolbar__action-label">{{ action.label }}</span>
            }
          </button>
        }
      </div>

      @if (showCharacterCount()) {
        <div class="toolbar__count" [class.toolbar__count--warning]="isNearLimit()">
          {{ characterCount() }}/{{ maxCharacters() }}
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         TOOLBAR - Theme-aware Design
         ============================================ */

      :host {
        display: block;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-top: 1px solid var(--nxt1-color-border-default);
      }

      .toolbar--disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ============================================
         ACTIONS
         ============================================ */

      .toolbar__actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .toolbar__action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        border: none;
        color: inherit;
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .toolbar__action ion-icon {
        font-size: 22px;
        color: var(--nxt1-color-text-secondary);
        transition: color 0.15s ease;
      }

      .toolbar__action-label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        transition: color 0.15s ease;
      }

      /* Hover state */
      .toolbar__action:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
      }

      .toolbar__action:hover:not(:disabled) ion-icon,
      .toolbar__action:hover:not(:disabled) .toolbar__action-label {
        color: var(--nxt1-color-primary);
      }

      /* Active state */
      .toolbar__action--active {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .toolbar__action--active ion-icon,
      .toolbar__action--active .toolbar__action-label {
        color: var(--nxt1-color-primary);
      }

      /* Disabled state */
      .toolbar__action--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .toolbar__action--disabled:hover {
        background: transparent;
      }

      .toolbar__action--disabled:hover ion-icon,
      .toolbar__action--disabled:hover .toolbar__action-label {
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         CHARACTER COUNT
         ============================================ */

      .toolbar__count {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        font-variant-numeric: tabular-nums;
      }

      .toolbar__count--warning {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 640px) {
        .toolbar__actions {
          gap: 0;
        }

        .toolbar__action {
          padding: 10px;
        }

        .toolbar__action-label {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostToolbarComponent {
  constructor() {
    addIcons({
      'image-outline': imageOutline,
      'person-add-outline': personAddOutline,
      'location-outline': locationOutline,
      'stats-chart-outline': statsChartOutline,
      'calendar-outline': calendarOutline,
      'film-outline': filmOutline,
      'happy-outline': happyOutline,
    });
  }

  private readonly haptics = inject(HapticsService);

  /** Whether toolbar is disabled */
  readonly disabled = input(false);

  /** Whether to show labels */
  readonly showLabels = input(false);

  /** Whether media has been added */
  readonly hasMedia = input(false);

  /** Whether location has been added */
  readonly hasLocation = input(false);

  /** Whether poll has been added */
  readonly hasPoll = input(false);

  /** Whether media can be added */
  readonly canAddMedia = input(true);

  /** Whether poll can be added (disabled if media) */
  readonly canAddPoll = input(true);

  /** Whether to show character count */
  readonly showCharacterCount = input(false);

  /** Current character count */
  readonly characterCount = input(0);

  /** Max characters */
  readonly maxCharacters = input(2000);

  /** Emitted when add media is clicked */
  readonly addMedia = output<void>();

  /** Emitted when add tag is clicked */
  readonly addTag = output<void>();

  /** Emitted when add location is clicked */
  readonly addLocation = output<void>();

  /** Emitted when add poll is clicked */
  readonly addPoll = output<void>();

  /** Emitted when add GIF is clicked */
  readonly addGif = output<void>();

  /** Emitted when add emoji is clicked */
  readonly addEmoji = output<void>();

  /** Emitted when schedule is clicked */
  readonly schedulePost = output<void>();

  /** Whether near character limit */
  protected isNearLimit(): boolean {
    return this.maxCharacters() - this.characterCount() <= 100;
  }

  /** Build actions array */
  protected actions(): ToolbarAction[] {
    return [
      {
        id: 'media',
        icon: 'image-outline',
        label: 'Photo/Video',
        isActive: this.hasMedia(),
        isDisabled: !this.canAddMedia(),
      },
      {
        id: 'tag',
        icon: 'person-add-outline',
        label: 'Tag',
        isActive: false,
        isDisabled: false,
      },
      {
        id: 'location',
        icon: 'location-outline',
        label: 'Location',
        isActive: this.hasLocation(),
        isDisabled: false,
      },
      {
        id: 'poll',
        icon: 'stats-chart-outline',
        label: 'Poll',
        isActive: this.hasPoll(),
        isDisabled: !this.canAddPoll(),
      },
      {
        id: 'gif',
        icon: 'film-outline',
        label: 'GIF',
        isActive: false,
        isDisabled: false,
      },
      {
        id: 'emoji',
        icon: 'happy-outline',
        label: 'Emoji',
        isActive: false,
        isDisabled: false,
      },
    ];
  }

  /**
   * Handle action click.
   */
  protected async onAction(action: ToolbarAction): Promise<void> {
    if (action.isDisabled || this.disabled()) return;

    await this.haptics.impact('light');

    switch (action.id) {
      case 'media':
        this.addMedia.emit();
        break;
      case 'tag':
        this.addTag.emit();
        break;
      case 'location':
        this.addLocation.emit();
        break;
      case 'poll':
        this.addPoll.emit();
        break;
      case 'gif':
        this.addGif.emit();
        break;
      case 'emoji':
        this.addEmoji.emit();
        break;
      case 'schedule':
        this.schedulePost.emit();
        break;
    }
  }
}
