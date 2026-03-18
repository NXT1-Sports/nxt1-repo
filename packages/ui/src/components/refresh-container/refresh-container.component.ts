/**
 * @fileoverview NxtRefreshContainerComponent - Pull-to-Refresh (2026 Best Practices)
 * @module @nxt1/ui/components
 * @version 2.0.0
 *
 * Professional-grade pull-to-refresh component with native iOS/Android behavior.
 * Uses Ionic's native refresher under the hood with enterprise-grade enhancements:
 *
 * - ✅ Native platform refreshers (iOS rubber-band, Material Design spinner)
 * - ✅ Signal-based state management
 * - ✅ Haptic feedback integration
 * - ✅ Accessibility support (reduced motion)
 * - ✅ Timeout handling for stale refreshes
 * - ✅ Error state handling with automatic recovery
 * - ✅ Pull progress tracking
 * - ✅ Customizable appearance
 *
 * @example Basic Usage
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
 * @example Without Container (for existing ion-content pages)
 * ```html
 * <ion-content>
 *   <nxt-refresher (onRefresh)="loadData($event)" />
 *   <!-- your content -->
 * </ion-content>
 * ```
 *
 * @example With Custom Styling (disables native refresher)
 * ```html
 * <nxt-refresh-container
 *   [pullingIcon]="'chevron-down-circle-outline'"
 *   [refreshingSpinner]="'crescent'"
 *   [pullingText]="'Pull to refresh'"
 *   [refreshingText]="'Loading...'"
 *   [timeout]="10000"
 *   (onRefresh)="loadData($event)"
 *   (onTimeout)="handleTimeout()">
 *   <!-- content -->
 * </nxt-refresh-container>
 * ```
 *
 * @example Programmatic Control
 * ```typescript
 * @ViewChild(NxtRefreshContainerComponent) refresher!: NxtRefreshContainerComponent;
 *
 * // Manually trigger refresh
 * this.refresher.triggerRefresh();
 *
 * // Check state
 * console.log(this.refresher.isRefreshing());
 * console.log(this.refresher.pullProgress());
 * ```
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  signal,
  computed,
  ChangeDetectionStrategy,
  inject,
  OnDestroy,
  booleanAttribute,
  numberAttribute,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  type RefresherCustomEvent,
} from '@ionic/angular/standalone';
import { HapticsService } from '../../services/haptics';

// ============================================
// TYPES & INTERFACES
// ============================================

/** Spinner types available for refreshing state */
export type RefresherSpinner =
  | 'bubbles'
  | 'circles'
  | 'circular'
  | 'crescent'
  | 'dots'
  | 'lines'
  | 'lines-sharp'
  | 'lines-small'
  | 'lines-small-sharp'
  | null;

/** Event emitted when refresh is triggered */
export interface RefreshEvent {
  /** Call this when refresh operation completes successfully */
  complete: () => void;
  /** Call this if refresh fails/is cancelled */
  cancel: () => void;
  /** Current pull progress (0-1) at time of trigger */
  progress: number;
  /** Timestamp when refresh was triggered */
  timestamp: number;
}

/** Event emitted during pull gesture */
export interface RefreshPullEvent {
  /** Progress from 0 (not pulled) to 1 (ready to refresh) and beyond */
  progress: number;
  /** Whether threshold has been reached */
  isReady: boolean;
}

/** Configuration for the refresh container */
export interface RefreshContainerConfig {
  /** Disable pull-to-refresh */
  disabled?: boolean;
  /** Pull factor (multiplier for pull distance) */
  pullFactor?: number;
  /** Minimum pull distance in pixels */
  pullMin?: number;
  /** Maximum pull distance in pixels */
  pullMax?: number;
  /** Enable haptic feedback */
  hapticFeedback?: boolean;
  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;
  /** Cooldown between refreshes in ms (prevents spam) */
  cooldown?: number;
}

/** Default configuration values */
export const DEFAULT_REFRESH_CONFIG: Required<RefreshContainerConfig> = {
  disabled: false,
  pullFactor: 1,
  pullMin: 40, // Low value keeps spinner near top of screen
  pullMax: 80, // Compact pull distance for quick activation
  hapticFeedback: true,
  timeout: 30000, // 30 second default timeout
  cooldown: 500, // 500ms cooldown - responsive but prevents accidental double-refresh
} as const;

// ============================================
// REFRESHER-ONLY COMPONENT
// ============================================

/**
 * Standalone refresher component (no container)
 * Use this inside your own ion-content
 *
 * @example
 * ```html
 * <ion-content>
 *   <nxt-refresher (onRefresh)="loadData($event)" />
 *   <ion-list>...</ion-list>
 * </ion-content>
 * ```
 */
@Component({
  selector: 'nxt-refresher',
  standalone: true,
  imports: [CommonModule, IonRefresher, IonRefresherContent],
  template: `
    <!-- 
      CRITICAL: ion-refresher MUST be inside ion-content.
      On web shells without ion-content, this component renders nothing.
      This prevents the "ion-refresher must be used inside ion-content" error.
    -->
    @if (isInsideIonContent()) {
      <ion-refresher
        slot="fixed"
        [pullFactor]="pullFactor"
        [pullMin]="pullMin"
        [pullMax]="pullMax"
        [closeDuration]="closeDuration"
        [snapbackDuration]="snapbackDuration"
        [disabled]="disabled || isInCooldown()"
        [attr.aria-label]="ariaLabel"
        role="status"
        [attr.aria-busy]="isRefreshing()"
        (ionStart)="onPullStart()"
        (ionPull)="onPull($event)"
        (ionRefresh)="onRefreshTriggered($event)"
      >
        <!-- 
          CRITICAL: For native iOS/Android refreshers, we must NOT set pullingIcon 
          or refreshingSpinner at all. Only bind them when custom values are provided.
        -->
        @if (pullingIcon || refreshingSpinner) {
          <!-- Custom spinner mode (non-native) -->
          <ion-refresher-content
            [pullingIcon]="pullingIcon"
            [pullingText]="pullingText"
            [refreshingSpinner]="refreshingSpinner"
            [refreshingText]="refreshingText"
          />
        } @else {
          <!-- Native refresher mode (iOS rubber-band / Android Material) -->
          <ion-refresher-content [pullingText]="pullingText" [refreshingText]="refreshingText" />
        }
      </ion-refresher>
    }
  `,
  styles: `
    /* Accessibility: Respect reduced motion preferences */
    @media (prefers-reduced-motion: reduce) {
      ion-refresher {
        --ion-refresher-pull-time: 0ms;
        --ion-refresher-transition-duration: 0ms;
      }

      ion-refresher-content {
        transition: none !important;
        animation: none !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRefresherComponent implements OnDestroy {
  private readonly haptics = inject(HapticsService);
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private refresherElement: HTMLIonRefresherElement | null = null;
  private lastRefreshEndTime = 0;

  /**
   * Whether this component is inside an ion-content element.
   * ion-refresher REQUIRES ion-content to function properly.
   * On web shells without ion-content, this will be false and nothing renders.
   */
  readonly isInsideIonContent = signal<boolean>(false);

  constructor() {
    // Detect if inside ion-content on client-side
    afterNextRender(() => {
      if (isPlatformBrowser(this.platformId)) {
        const element = this.elementRef.nativeElement as HTMLElement;
        const ionContent = element.closest('ion-content');
        this.isInsideIonContent.set(ionContent !== null);

        if (!ionContent) {
          // Silent noop - web shells don't have ion-content and that's fine
          // Pull-to-refresh is a mobile pattern primarily
        }
      }
    });
  }

  // ============================================
  // INPUTS - Behavior
  // ============================================

  /** Disable pull-to-refresh */
  @Input({ transform: booleanAttribute }) disabled = DEFAULT_REFRESH_CONFIG.disabled;

  /** How much to multiply the pull by (slows down / speeds up) */
  @Input({ transform: numberAttribute }) pullFactor = DEFAULT_REFRESH_CONFIG.pullFactor;

  /** Minimum distance to pull before refresh activates (px) */
  @Input({ transform: numberAttribute }) pullMin = DEFAULT_REFRESH_CONFIG.pullMin;

  /** Maximum distance to pull (px) */
  @Input({ transform: numberAttribute }) pullMax = DEFAULT_REFRESH_CONFIG.pullMax;

  /** How long to wait after releasing before closing */
  @Input() closeDuration = '280ms';

  /** How long snapback animation takes */
  @Input() snapbackDuration = '280ms';

  /** Enable haptic feedback */
  @Input({ transform: booleanAttribute }) hapticFeedback = DEFAULT_REFRESH_CONFIG.hapticFeedback;

  /** Timeout in milliseconds (0 = no timeout) */
  @Input({ transform: numberAttribute }) timeout = DEFAULT_REFRESH_CONFIG.timeout;

  /** Cooldown between refreshes in ms (0 = no cooldown) */
  @Input({ transform: numberAttribute }) cooldown = DEFAULT_REFRESH_CONFIG.cooldown;

  /** Accessible label for screen readers */
  @Input() ariaLabel = 'Pull down to refresh content';

  // ============================================
  // INPUTS - Visual
  // ============================================

  /**
   * Icon shown while pulling (Ionicons name)
   * NOTE: Setting this disables the native refresher
   */
  @Input() pullingIcon: string | null = null;

  /** Text shown while pulling */
  @Input() pullingText = '';

  /**
   * Spinner type while refreshing
   * NOTE: Setting to non-null disables the native refresher
   */
  @Input() refreshingSpinner: RefresherSpinner = null;

  /** Text shown while refreshing */
  @Input() refreshingText = '';

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when user triggers refresh */
  @Output() onRefresh = new EventEmitter<RefreshEvent>();

  /** Emits when pull starts */
  @Output() onPullStart$ = new EventEmitter<void>();

  /** Emits during pull with progress */
  @Output() onPull$ = new EventEmitter<RefreshPullEvent>();

  /** Emits when refresh times out */
  @Output() onTimeout = new EventEmitter<void>();

  // ============================================
  // STATE (Signal-based)
  // ============================================

  private readonly _isRefreshing = signal(false);
  private readonly _isPulling = signal(false);
  private readonly _pullProgress = signal(0);
  private readonly _lastRefreshTime = signal<number | null>(null);

  /** Whether currently refreshing */
  readonly isRefreshing = computed(() => this._isRefreshing());

  /** Whether user is actively pulling */
  readonly isPulling = computed(() => this._isPulling());

  /** Current pull progress (0 to 1+) */
  readonly pullProgress = computed(() => this._pullProgress());

  /** Whether pull threshold has been reached */
  readonly isReady = computed(() => this._pullProgress() >= 1);

  /** Timestamp of last refresh completion */
  readonly lastRefreshTime = computed(() => this._lastRefreshTime());

  /** Whether currently in cooldown period (prevents spam) */
  readonly isInCooldown = computed(() => {
    if (this.cooldown <= 0) return false;
    const timeSinceLastRefresh = Date.now() - this.lastRefreshEndTime;
    return timeSinceLastRefresh < this.cooldown;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnDestroy(): void {
    this.clearTimeout();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onPullStart(): void {
    this._isPulling.set(true);
    this._pullProgress.set(0);
    this.onPullStart$.emit();
    // No haptic on start - keeps the pull smooth and native-feeling
  }

  protected onPull(event: CustomEvent): void {
    // Use detail from event directly - avoids async jitter from getProgress()
    const detail = (event as CustomEvent<{ progress: number }>).detail;
    const progress = detail?.progress ?? 0;
    const previousProgress = this._pullProgress();

    this._pullProgress.set(progress);
    this.onPull$.emit({
      progress,
      isReady: progress >= 1,
    });

    // Single haptic when threshold reached (not on every pull update)
    if (progress >= 1 && previousProgress < 1 && this.hapticFeedback) {
      this.haptics.impact('medium');
    }
  }

  protected onRefreshTriggered(event: RefresherCustomEvent): void {
    this._isPulling.set(false);
    this._isRefreshing.set(true);
    this.refresherElement = event.target;

    // Haptic feedback on refresh trigger
    if (this.hapticFeedback) {
      this.haptics.impact('medium');
    }

    // Set up timeout
    if (this.timeout > 0) {
      this.timeoutId = setTimeout(() => {
        if (this._isRefreshing()) {
          this.completeRefresh(false);
          this.onTimeout.emit();
        }
      }, this.timeout);
    }

    const currentProgress = this._pullProgress();
    const timestamp = Date.now();

    this.onRefresh.emit({
      complete: () => this.completeRefresh(true),
      cancel: () => this.completeRefresh(false),
      progress: currentProgress,
      timestamp,
    });
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Programmatically complete the refresh
   * @param success - Whether refresh was successful
   */
  completeRefresh(success = true): void {
    this.clearTimeout();
    this._isRefreshing.set(false);
    this._pullProgress.set(0);
    this._lastRefreshTime.set(Date.now());
    this.lastRefreshEndTime = Date.now(); // Track for cooldown

    if (this.refresherElement) {
      if (success) {
        this.refresherElement.complete();
      } else {
        this.refresherElement.cancel();
      }
      this.refresherElement = null;
    }
    // No haptic on completion - keeps it smooth and non-intrusive
  }

  /**
   * Reset the refresher state (useful for error recovery)
   */
  reset(): void {
    this.clearTimeout();
    this._isRefreshing.set(false);
    this._isPulling.set(false);
    this._pullProgress.set(0);

    if (this.refresherElement) {
      this.refresherElement.cancel();
      this.refresherElement = null;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

// ============================================
// FULL CONTAINER COMPONENT
// ============================================

/**
 * Full refresh container with ion-content wrapper
 * Use this when you want a complete refresh-enabled content area
 *
 * @example
 * ```html
 * <nxt-refresh-container (onRefresh)="loadData($event)">
 *   <ion-list>
 *     @for (item of items(); track item.id) {
 *       <ion-item>{{ item.name }}</ion-item>
 *     }
 *   </ion-list>
 * </nxt-refresh-container>
 * ```
 */
@Component({
  selector: 'nxt-refresh-container',
  standalone: true,
  imports: [CommonModule, IonContent, NxtRefresherComponent],
  template: `
    <ion-content [fullscreen]="fullscreen" [scrollY]="scrollY" [scrollX]="scrollX">
      <nxt-refresher
        [disabled]="disabled"
        [pullFactor]="pullFactor"
        [pullMin]="pullMin"
        [pullMax]="pullMax"
        [closeDuration]="closeDuration"
        [snapbackDuration]="snapbackDuration"
        [hapticFeedback]="hapticFeedback"
        [timeout]="timeout"
        [cooldown]="cooldown"
        [ariaLabel]="ariaLabel"
        [pullingIcon]="pullingIcon"
        [pullingText]="pullingText"
        [refreshingSpinner]="refreshingSpinner"
        [refreshingText]="refreshingText"
        (onRefresh)="onRefresh.emit($event)"
        (onPullStart$)="onPullStart$.emit()"
        (onPull$)="onPull$.emit($event)"
        (onTimeout)="onTimeout.emit()"
      />
      <ng-content />
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRefreshContainerComponent {
  @ViewChild(NxtRefresherComponent) private refresher!: NxtRefresherComponent;

  // ============================================
  // CONTENT INPUTS
  // ============================================

  /** Whether ion-content should be fullscreen */
  @Input({ transform: booleanAttribute }) fullscreen = true;

  /** Enable/disable Y-axis scrolling */
  @Input({ transform: booleanAttribute }) scrollY = true;

  /** Enable/disable X-axis scrolling */
  @Input({ transform: booleanAttribute }) scrollX = false;

  // ============================================
  // REFRESHER BEHAVIOR (pass-through)
  // ============================================

  @Input({ transform: booleanAttribute }) disabled = DEFAULT_REFRESH_CONFIG.disabled;
  @Input({ transform: numberAttribute }) pullFactor = DEFAULT_REFRESH_CONFIG.pullFactor;
  @Input({ transform: numberAttribute }) pullMin = DEFAULT_REFRESH_CONFIG.pullMin;
  @Input({ transform: numberAttribute }) pullMax = DEFAULT_REFRESH_CONFIG.pullMax;
  @Input() closeDuration = '280ms';
  @Input() snapbackDuration = '280ms';
  @Input({ transform: booleanAttribute }) hapticFeedback = DEFAULT_REFRESH_CONFIG.hapticFeedback;
  @Input({ transform: numberAttribute }) timeout = DEFAULT_REFRESH_CONFIG.timeout;
  @Input({ transform: numberAttribute }) cooldown = DEFAULT_REFRESH_CONFIG.cooldown;
  @Input() ariaLabel = 'Pull down to refresh content';

  // ============================================
  // VISUAL CUSTOMIZATION (pass-through)
  // ============================================

  @Input() pullingIcon: string | null = null;
  @Input() pullingText = '';
  @Input() refreshingSpinner: RefresherSpinner = null;
  @Input() refreshingText = '';

  // ============================================
  // EVENTS (pass-through)
  // ============================================

  @Output() onRefresh = new EventEmitter<RefreshEvent>();
  @Output() onPullStart$ = new EventEmitter<void>();
  @Output() onPull$ = new EventEmitter<RefreshPullEvent>();
  @Output() onTimeout = new EventEmitter<void>();

  // ============================================
  // PUBLIC API (delegate to refresher)
  // ============================================

  /** Whether currently refreshing */
  get isRefreshing() {
    return this.refresher?.isRefreshing ?? signal(false);
  }

  /** Whether user is actively pulling */
  get isPulling() {
    return this.refresher?.isPulling ?? signal(false);
  }

  /** Current pull progress (0 to 1+) */
  get pullProgress() {
    return this.refresher?.pullProgress ?? signal(0);
  }

  /** Whether pull threshold has been reached */
  get isReady() {
    return this.refresher?.isReady ?? signal(false);
  }

  /** Timestamp of last refresh completion */
  get lastRefreshTime() {
    return this.refresher?.lastRefreshTime ?? signal(null);
  }

  /** Whether currently in cooldown period */
  get isInCooldown() {
    return this.refresher?.isInCooldown ?? signal(false);
  }

  /** Complete the refresh programmatically */
  completeRefresh(success = true): void {
    this.refresher?.completeRefresh(success);
  }

  /** Reset the refresher state */
  reset(): void {
    this.refresher?.reset();
  }
}
