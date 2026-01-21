/**
 * @fileoverview Pull-to-Refresh Wrapper Component
 * @module @nxt1/ui/components
 *
 * A drop-in replacement for ion-refresher with signal-based state
 * management and native-feeling animations.
 *
 * Usage:
 * ```html
 * <nxt-refresh-container (onRefresh)="loadData($event)">
 *   <ion-list>
 *     @for (item of items(); track item.id) {
 *       <ion-item>{{ item.name }}</ion-item>
 *     }
 *   </ion-list>
 * </nxt-refresh-container>
 * ```
 *
 * With custom spinner:
 * ```html
 * <nxt-refresh-container
 *   [pullingIcon]="'chevron-down'"
 *   [refreshingSpinner]="'crescent'"
 *   [pullingText]="'Pull to refresh'"
 *   [refreshingText]="'Loading...'"
 *   (onRefresh)="loadData($event)">
 *   <!-- content -->
 * </nxt-refresh-container>
 * ```
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { HapticsService } from '../../services/haptics';

/** Event emitted when refresh is triggered */
export interface RefreshEvent {
  /** Call this when refresh is complete */
  complete: () => void;
  /** Call this if refresh fails */
  cancel: () => void;
}

@Component({
  selector: 'nxt-refresh-container',
  standalone: true,
  imports: [CommonModule, IonContent, IonRefresher, IonRefresherContent],
  template: `
    <ion-content [fullscreen]="fullscreen" [scrollY]="scrollY">
      <ion-refresher
        slot="fixed"
        [pullFactor]="pullFactor"
        [pullMin]="pullMin"
        [pullMax]="pullMax"
        [closeDuration]="closeDuration"
        [snapbackDuration]="snapbackDuration"
        [disabled]="disabled"
        (ionStart)="onPullStart()"
        (ionPull)="onPull()"
        (ionRefresh)="onRefreshTriggered($event)"
      >
        <ion-refresher-content
          [pullingIcon]="pullingIcon"
          [pullingText]="pullingText"
          [refreshingSpinner]="refreshingSpinner"
          [refreshingText]="refreshingText"
        >
        </ion-refresher-content>
      </ion-refresher>

      <ng-content></ng-content>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRefreshContainerComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // CONTENT INPUTS
  // ============================================

  /** Whether ion-content should be fullscreen */
  @Input() fullscreen = true;

  /** Enable/disable Y-axis scrolling */
  @Input() scrollY = true;

  // ============================================
  // REFRESHER BEHAVIOR
  // ============================================

  /** Disable pull-to-refresh */
  @Input() disabled = false;

  /** How much to multiply the pull by (slows down / speeds up) */
  @Input() pullFactor = 1;

  /** Minimum distance to pull before refresh activates (px) */
  @Input() pullMin = 60;

  /** Maximum distance to pull (px) */
  @Input() pullMax = 120;

  /** How long to wait after releasing before closing (ms) */
  @Input() closeDuration = '280ms';

  /** How long snapback animation takes (ms) */
  @Input() snapbackDuration = '280ms';

  // ============================================
  // VISUAL CUSTOMIZATION
  // ============================================

  /** Icon shown while pulling (Ionicons name) */
  @Input() pullingIcon: string | null = null; // null = uses default

  /** Text shown while pulling */
  @Input() pullingText = '';

  /** Spinner type while refreshing */
  @Input() refreshingSpinner:
    | 'bubbles'
    | 'circles'
    | 'circular'
    | 'crescent'
    | 'dots'
    | 'lines'
    | 'lines-sharp'
    | 'lines-small'
    | 'lines-small-sharp'
    | null = null;

  /** Text shown while refreshing */
  @Input() refreshingText = '';

  /** Enable haptic feedback during pull */
  @Input() hapticFeedback = true;

  // ============================================
  // EVENTS
  // ============================================

  /** Emits when user triggers refresh */
  @Output() onRefresh = new EventEmitter<RefreshEvent>();

  // ============================================
  // STATE
  // ============================================

  private _isRefreshing = signal(false);
  private _isPulling = signal(false);

  /** Whether currently refreshing */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Whether user is actively pulling */
  readonly isPulling = computed(() => this._isPulling());

  // ============================================
  // HANDLERS
  // ============================================

  onPullStart(): void {
    this._isPulling.set(true);
  }

  onPull(): void {
    // Could add progressive haptic feedback here
  }

  onRefreshTriggered(event: CustomEvent): void {
    this._isPulling.set(false);
    this._isRefreshing.set(true);

    // Haptic feedback on refresh trigger
    if (this.hapticFeedback) {
      this.haptics.impact('medium');
    }

    const refresher = event.target as HTMLIonRefresherElement;

    this.onRefresh.emit({
      complete: () => {
        this._isRefreshing.set(false);
        refresher.complete();

        // Success haptic
        if (this.hapticFeedback) {
          this.haptics.notification('success');
        }
      },
      cancel: () => {
        this._isRefreshing.set(false);
        refresher.cancel();

        // Error haptic
        if (this.hapticFeedback) {
          this.haptics.notification('error');
        }
      },
    });
  }

  /**
   * Programmatically complete the refresh
   * (useful if you have a reference to this component)
   */
  complete(): void {
    this._isRefreshing.set(false);
  }
}
