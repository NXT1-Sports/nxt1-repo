/**
 * @fileoverview Scout Report Sort Selector Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Dropdown selector for sorting scout reports.
 * Clean minimal design with icon indicator.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Multiple sort options
 * - Current selection indicator
 * - Compact inline design
 * - Haptic feedback on change
 *
 * @example
 * ```html
 * <nxt1-scout-report-sort-selector
 *   [value]="'rating-desc'"
 *   (valueChange)="onSortChange($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonPopover, IonList, IonItem, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  swapVerticalOutline,
  chevronDownOutline,
  checkmarkOutline,
  starOutline,
  timeOutline,
  trendingUpOutline,
  trendingDownOutline,
  textOutline,
} from 'ionicons/icons';
import type { ScoutReportSortBy, SortOrder } from '@nxt1/core';

// Register icons
/**
 * Combined sort option (sortBy + sortOrder).
 */
export type ScoutReportSortOption = `${ScoutReportSortBy}-${SortOrder}`;

/**
 * Sort option configuration.
 */
interface SortOptionConfig {
  readonly value: ScoutReportSortOption;
  readonly label: string;
  readonly icon: string;
}

/**
 * Available sort options.
 */
const SORT_OPTIONS: SortOptionConfig[] = [
  { value: 'rating-desc', label: 'Highest Rated', icon: 'star-outline' },
  { value: 'rating-asc', label: 'Lowest Rated', icon: 'star-outline' },
  { value: 'recent-desc', label: 'Most Recent', icon: 'time-outline' },
  { value: 'recent-asc', label: 'Oldest First', icon: 'time-outline' },
  { value: 'trending-desc', label: 'Most Viewed', icon: 'trending-up-outline' },
  { value: 'name-asc', label: 'Name (A-Z)', icon: 'text-outline' },
  { value: 'name-desc', label: 'Name (Z-A)', icon: 'text-outline' },
];

@Component({
  selector: 'nxt1-scout-report-sort-selector',
  standalone: true,
  imports: [CommonModule, IonIcon, IonPopover, IonList, IonItem, IonLabel],
  template: `
    <!-- Trigger Button -->
    <button class="sort-trigger" [id]="triggerId" (click)="togglePopover()">
      <ion-icon name="swap-vertical-outline" class="sort-trigger__icon"></ion-icon>
      <span class="sort-trigger__label">{{ currentLabel() }}</span>
      <ion-icon
        name="chevron-down-outline"
        class="sort-trigger__chevron"
        [class.sort-trigger__chevron--open]="isOpen()"
      ></ion-icon>
    </button>

    <!-- Popover -->
    <ion-popover
      [trigger]="triggerId"
      [isOpen]="isOpen()"
      (didDismiss)="onDismiss()"
      [dismissOnSelect]="true"
      alignment="end"
      side="bottom"
    >
      <ng-template>
        <ion-list class="sort-list">
          @for (option of sortOptions; track option.value) {
            <ion-item
              class="sort-option"
              [class.sort-option--active]="option.value === value()"
              button
              (click)="selectOption(option.value)"
            >
              <ion-icon [name]="option.icon" slot="start" class="sort-option__icon"></ion-icon>
              <ion-label>{{ option.label }}</ion-label>
              @if (option.value === value()) {
                <ion-icon name="checkmark-outline" slot="end" class="sort-option__check"></ion-icon>
              }
            </ion-item>
          }
        </ion-list>
      </ng-template>
    </ion-popover>
  `,
  styles: [
    `
      /* ============================================
         SORT TRIGGER BUTTON
         ============================================ */

      :host {
        display: block;
      }

      .sort-trigger {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-surface-elevated, #252525);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .sort-trigger:hover {
        color: var(--nxt1-color-text-primary, #ffffff);
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .sort-trigger:active {
        transform: scale(0.98);
      }

      .sort-trigger__icon {
        font-size: 16px;
        color: var(--nxt1-color-primary, #3b82f6);
      }

      .sort-trigger__label {
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sort-trigger__chevron {
        font-size: 14px;
        transition: transform 0.2s ease;
      }

      .sort-trigger__chevron--open {
        transform: rotate(180deg);
      }

      /* ============================================
         SORT LIST
         ============================================ */

      .sort-list {
        --background: var(--nxt1-color-surface, #1a1a1a);
        padding: var(--nxt1-spacing-2, 8px);
      }

      .sort-option {
        --background: transparent;
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --padding-start: var(--nxt1-spacing-3, 12px);
        --padding-end: var(--nxt1-spacing-3, 12px);
        --inner-padding-end: 0;
        --min-height: 44px;
        border-radius: var(--nxt1-radius-md, 8px);
        margin-bottom: var(--nxt1-spacing-1, 4px);
        font-size: 14px;
      }

      .sort-option:last-child {
        margin-bottom: 0;
      }

      .sort-option:hover {
        --background: var(--nxt1-color-surface-elevated, #252525);
        --color: var(--nxt1-color-text-primary, #ffffff);
      }

      .sort-option--active {
        --background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
        --color: var(--nxt1-color-primary, #3b82f6);
      }

      .sort-option__icon {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin-right: var(--nxt1-spacing-2, 8px);
      }

      .sort-option--active .sort-option__icon {
        color: var(--nxt1-color-primary, #3b82f6);
      }

      .sort-option__check {
        font-size: 18px;
        color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         POPOVER OVERRIDES
         ============================================ */

      ion-popover {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --backdrop-opacity: 0.3;
        --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        --width: 200px;
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .sort-trigger {
          color: var(--nxt1-color-gray-600, #4b5563);
          background: var(--nxt1-color-gray-100, #f3f4f6);
          border-color: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .sort-trigger:hover {
          color: var(--nxt1-color-gray-900, #111827);
          border-color: var(--nxt1-color-gray-300, #d1d5db);
        }

        .sort-list {
          --background: var(--nxt1-color-white, #ffffff);
        }

        .sort-option {
          --color: var(--nxt1-color-gray-600, #4b5563);
        }

        .sort-option:hover {
          --background: var(--nxt1-color-gray-100, #f3f4f6);
          --color: var(--nxt1-color-gray-900, #111827);
        }

        .sort-option__icon {
          color: var(--nxt1-color-gray-400, #9ca3af);
        }

        ion-popover {
          --background: var(--nxt1-color-white, #ffffff);
          --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportSortSelectorComponent {
  constructor() {
    addIcons({
      swapVerticalOutline,
      chevronDownOutline,
      checkmarkOutline,
      starOutline,
      timeOutline,
      trendingUpOutline,
      trendingDownOutline,
      textOutline,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Current sort value */
  readonly value = input<ScoutReportSortOption>('rating-desc');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when sort changes */
  readonly valueChange = output<ScoutReportSortOption>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Whether popover is open */
  protected readonly isOpen = signal(false);

  /** Unique trigger ID */
  protected readonly triggerId = `sort-trigger-${Math.random().toString(36).slice(2, 9)}`;

  /** Available sort options */
  protected readonly sortOptions = SORT_OPTIONS;

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Get current option label.
   */
  protected readonly currentLabel = computed(() => {
    const current = SORT_OPTIONS.find((opt) => opt.value === this.value());
    return current?.label ?? 'Sort';
  });

  // ============================================
  // METHODS
  // ============================================

  /**
   * Toggle popover.
   */
  protected togglePopover(): void {
    this.isOpen.update((v) => !v);
  }

  /**
   * Handle popover dismiss.
   */
  protected onDismiss(): void {
    this.isOpen.set(false);
  }

  /**
   * Select a sort option.
   */
  protected selectOption(option: ScoutReportSortOption): void {
    this.valueChange.emit(option);
    this.isOpen.set(false);
  }
}
