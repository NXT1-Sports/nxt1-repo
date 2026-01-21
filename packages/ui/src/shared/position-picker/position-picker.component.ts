/**
 * @fileoverview Position Picker Component
 * @module @nxt1/ui/shared/position-picker
 * @version 1.0.0
 *
 * Reusable position picker modal content component.
 * This component is rendered inside a modal by the PositionPickerService.
 *
 * Features:
 * - Grouped position list with checkboxes
 * - Real-time selection count
 * - Maximum position limit enforcement
 * - Platform-adaptive styling (bottom sheet on mobile, modal on web)
 * - Haptic feedback on selection
 * - Full accessibility support
 *
 * Architecture:
 * - This component receives data via modal componentProps
 * - It manages its own internal state (working copy of selections)
 * - On dismiss, it passes the result back via ModalController
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonCheckbox,
  IonBadge,
  ModalController,
} from '@ionic/angular/standalone';
import { formatPositionDisplay } from '@nxt1/core/constants';
import type { PositionGroup } from '@nxt1/core/constants';
import { HapticButtonDirective } from '../../services/haptics';
import type { PositionPickerResult, PositionPickerState } from './position-picker.types';
import { POSITION_PICKER_DEFAULTS } from './position-picker.types';

@Component({
  selector: 'nxt1-position-picker',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonCheckbox,
    IonBadge,
    HapticButtonDirective,
  ],
  template: `
    <ion-header class="nxt1-picker-header">
      <ion-toolbar class="nxt1-picker-toolbar">
        <ion-buttons slot="start">
          <ion-button (click)="onCancel()" class="nxt1-cancel-btn" nxtHaptic="light">
            Cancel
          </ion-button>
        </ion-buttons>

        <ion-title class="nxt1-picker-title">
          {{ title() }}
          @if (showCount()) {
            <ion-badge class="nxt1-count-badge" [class.at-max]="isAtMax()">
              {{ selectedCount() }}/{{ maxPositions() }}
            </ion-badge>
          }
        </ion-title>

        <ion-buttons slot="end">
          <ion-button
            (click)="onConfirm()"
            [strong]="true"
            class="nxt1-done-btn"
            nxtHaptic="medium"
          >
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="nxt1-picker-content">
      <ion-list class="nxt1-positions-list" lines="none">
        @for (group of positionGroups(); track group.category) {
          <!-- Group Divider (only if multiple groups) -->
          @if (hasMultipleGroups()) {
            <ion-item-divider class="nxt1-group-divider" sticky>
              <ion-label>{{ group.category }}</ion-label>
            </ion-item-divider>
          }

          <!-- Position Items -->
          @for (position of group.positions; track position) {
            <ion-item
              class="nxt1-position-item"
              [button]="true"
              [detail]="false"
              (click)="togglePosition(position)"
              [class.selected]="isSelected(position)"
              [class.disabled]="isDisabled(position)"
            >
              <ion-checkbox
                slot="start"
                [checked]="isSelected(position)"
                [disabled]="isDisabled(position)"
                class="nxt1-position-checkbox"
                mode="ios"
              />
              <ion-label class="nxt1-position-label">
                {{ formatPosition(position) }}
              </ion-label>
            </ion-item>
          }
        }
      </ion-list>

      <!-- Empty State -->
      @if (positionGroups().length === 0) {
        <div class="nxt1-empty-state">
          <p>No positions available for this sport.</p>
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         HEADER & TOOLBAR
         ============================================ */
      .nxt1-picker-header {
        --ion-safe-area-top: 0;
      }

      .nxt1-picker-toolbar {
        --background: var(--nxt1-color-surface-elevated);
        --color: var(--nxt1-color-text-primary);
        --border-color: var(--nxt1-color-border-subtle);
        --min-height: 56px;
      }

      .nxt1-picker-title {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
      }

      .nxt1-cancel-btn {
        --color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
      }

      .nxt1-done-btn {
        --color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
      }

      .nxt1-count-badge {
        --background: var(--nxt1-color-surface-default);
        --color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        padding: 4px 8px;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .nxt1-count-badge.at-max {
        --background: var(--nxt1-color-warning);
        --color: var(--nxt1-color-text-onWarning, #000);
      }

      /* ============================================
         CONTENT
         ============================================ */
      .nxt1-picker-content {
        --background: var(--nxt1-color-surface-default);
      }

      .nxt1-positions-list {
        background: transparent;
        padding: 0;
      }

      /* ============================================
         GROUP DIVIDER
         ============================================ */
      .nxt1-group-divider {
        --background: var(--nxt1-color-surface-elevated);
        --color: var(--nxt1-color-text-secondary);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --inner-padding-end: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        min-height: 36px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      /* ============================================
         POSITION ITEM
         ============================================ */
      .nxt1-position-item {
        --background: var(--nxt1-color-surface-default);
        --background-hover: var(--nxt1-color-state-hover);
        --background-activated: var(--nxt1-color-state-pressed);
        --color: var(--nxt1-color-text-primary);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --inner-padding-end: 0;
        --min-height: 52px;
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        transition: background var(--nxt1-duration-fast) ease;
      }

      .nxt1-position-item.selected {
        --background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-position-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .nxt1-position-label {
        font-size: var(--nxt1-fontSize-base);
      }

      /* ============================================
         CHECKBOX
         ============================================ */
      .nxt1-position-checkbox {
        --size: 24px;
        --checkbox-background: transparent;
        --checkbox-background-checked: var(--nxt1-color-primary);
        --border-color: var(--nxt1-color-border-strong);
        --border-color-checked: var(--nxt1-color-primary);
        --border-width: 2px;
        --border-radius: 6px;
        --checkmark-color: var(--nxt1-color-text-onPrimary);
        margin-inline-end: var(--nxt1-spacing-3);
      }

      /* ============================================
         EMPTY STATE
         ============================================ */
      .nxt1-empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        padding: var(--nxt1-spacing-6);
      }

      .nxt1-empty-state p {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPositionPickerComponent implements OnInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly modalCtrl = inject(ModalController);

  // ============================================
  // INPUT PROPERTIES (from componentProps)
  // ============================================

  /** Sport identifier */
  sport = '';

  /** Initial position groups */
  initialPositionGroups: PositionGroup[] = [];

  /** Initial selected positions */
  initialSelectedPositions: string[] = [];

  /** Maximum positions allowed */
  initialMaxPositions = POSITION_PICKER_DEFAULTS.maxPositions;

  /** Modal title */
  initialTitle = POSITION_PICKER_DEFAULTS.title;

  /** Whether to show count badge */
  initialShowCount = POSITION_PICKER_DEFAULTS.showCount;

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Working copy of selected positions */
  private readonly _selectedPositions = signal<string[]>([]);

  /** Position groups */
  private readonly _positionGroups = signal<PositionGroup[]>([]);

  /** Maximum positions */
  private readonly _maxPositions = signal<number>(POSITION_PICKER_DEFAULTS.maxPositions);

  /** Modal title */
  private readonly _title = signal<string>(POSITION_PICKER_DEFAULTS.title);

  /** Show count badge */
  private readonly _showCount = signal<boolean>(POSITION_PICKER_DEFAULTS.showCount);

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  readonly positionGroups = computed(() => this._positionGroups());
  readonly title = computed(() => this._title());
  readonly showCount = computed(() => this._showCount());
  readonly maxPositions = computed(() => this._maxPositions());
  readonly selectedCount = computed(() => this._selectedPositions().length);
  readonly isAtMax = computed(() => this._selectedPositions().length >= this._maxPositions());
  readonly hasMultipleGroups = computed(() => this._positionGroups().length > 1);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Initialize from componentProps passed by ModalController
    this._positionGroups.set(this.initialPositionGroups);
    this._selectedPositions.set([...this.initialSelectedPositions]);
    this._maxPositions.set(this.initialMaxPositions);
    this._title.set(this.initialTitle);
    this._showCount.set(this.initialShowCount);
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /** Check if a position is currently selected */
  isSelected(position: string): boolean {
    return this._selectedPositions().includes(position);
  }

  /** Check if a position should be disabled (at max and not selected) */
  isDisabled(position: string): boolean {
    return this.isAtMax() && !this.isSelected(position);
  }

  /** Format position for display */
  formatPosition(position: string): string {
    return formatPositionDisplay(position);
  }

  /** Toggle a position's selection state */
  togglePosition(position: string): void {
    const current = this._selectedPositions();

    if (current.includes(position)) {
      // Remove position
      this._selectedPositions.set(current.filter((p) => p !== position));
    } else if (current.length < this._maxPositions()) {
      // Add position
      this._selectedPositions.set([...current, position]);
    }
    // If at max and not selected, do nothing (button is disabled anyway)
  }

  /** Cancel and dismiss without changes */
  onCancel(): void {
    const result: PositionPickerResult = {
      confirmed: false,
      positions: [],
    };
    this.modalCtrl.dismiss(result, 'cancel');
  }

  /** Confirm and dismiss with selected positions */
  onConfirm(): void {
    const result: PositionPickerResult = {
      confirmed: true,
      positions: [...this._selectedPositions()],
    };
    this.modalCtrl.dismiss(result, 'confirm');
  }
}
