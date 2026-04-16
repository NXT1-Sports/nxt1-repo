import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  HostListener,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { NxtIconComponent } from '../icon';
import { NxtThemeSelectorComponent } from '../theme-selector';
import { HapticsService } from '../../services/haptics';
import { NxtBrowserService } from '../../services/browser';
import { NxtPlatformService } from '../../services/platform';
import { SUPPORT_CONFIG } from '@nxt1/core/constants';
import type { FloatingActionBarConfig, FloatingBarFollowItem } from './floating-action-bar.types';
import {
  DEFAULT_FLOATING_ACTION_BAR_CONFIG,
  IOS_APP_STORE_URL,
  GOOGLE_PLAY_URL,
} from './floating-action-bar.types';

@Component({
  selector: 'nxt1-floating-action-bar',
  standalone: true,
  imports: [RouterModule, NxtIconComponent, NxtThemeSelectorComponent],
  template: `
    <!-- Slide-Up Panel -->
    <div
      class="fab__panel"
      [class.fab__panel--open]="panelOpen()"
      [attr.aria-hidden]="!panelOpen()"
      (click)="$event.stopPropagation()"
      (touchmove)="onPanelTouchMove($event)"
    >
      <!-- Theme Selector -->
      @if (config().showThemeToggle !== false) {
        <div class="fab__panel-section fab__panel-section--theme">
          <nxt1-theme-selector
            variant="compact"
            [showLabels]="false"
            [showAppearance]="true"
            [showSportThemes]="true"
            [singleRow]="true"
          />
        </div>
      }

      <!-- Follow Us Row -->
      @if (followItems().length > 0) {
        <div class="fab__panel-section fab__panel-section--follow">
          @if (config().followUsLabel) {
            <div class="fab__panel-row-label">{{ config().followUsLabel }}</div>
          }
          <div class="fab__follow-row" role="list">
            @for (item of followItems(); track item.id) {
              @if (!item.hidden) {
                <a
                  [href]="item.href"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="fab__follow-btn"
                  [attr.aria-label]="item.ariaLabel ?? item.label"
                  role="listitem"
                  (click)="onFollowClick()"
                >
                  <span class="fab__follow-icon-wrap">
                    <nxt1-icon [name]="item.icon" [size]="18" />
                  </span>
                  <span class="fab__follow-label">{{ item.label }}</span>
                </a>
              }
            }
          </div>
        </div>
      }

      <!-- Legal -->
      @if (config().showLegal !== false) {
        <div class="fab__panel-legal">
          <nav class="fab__legal" aria-label="Legal">
            <a routerLink="/terms" class="fab__legal-link" (click)="onFollowClick()">Terms</a>
            <a routerLink="/privacy" class="fab__legal-link" (click)="onFollowClick()">Privacy</a>
            <a [href]="contactEmailHref" class="fab__legal-link" (click)="onContactClick($event)"
              >Contact</a
            >
          </nav>
          <p class="fab__copyright">&copy; {{ currentYear }} NXT1 Sports. All rights reserved.</p>
        </div>
      }
    </div>

    <!-- Floating Bar -->
    <div class="fab__wrap" (click)="$event.stopPropagation()">
      <div class="fab__bar">
        @if (config().appButtonAction) {
          <!-- Action button variant: emits ctaAction instead of linking to app store -->
          <button
            type="button"
            class="fab__app-btn"
            (click)="onCtaClick()"
            [attr.aria-label]="config().appButtonLabel || 'New Session'"
          >
            <nxt1-icon [name]="config().appButtonIcon || 'plusCircle'" [size]="16" />
            <span>{{ config().appButtonLabel || 'New Session' }}</span>
          </button>
        } @else {
          <!-- Default link variant: opens app store -->
          <a
            [href]="appStoreLink()"
            target="_blank"
            rel="noopener noreferrer"
            class="fab__app-btn"
            [attr.aria-label]="config().appButtonLabel || 'Download the NXT1 app'"
          >
            <nxt1-icon [name]="config().appButtonIcon || 'download'" [size]="16" />
            <span>{{ config().appButtonLabel || 'Download the NXT1 app' }}</span>
          </a>
        }
        <button
          type="button"
          class="fab__more-btn"
          [class.fab__more-btn--active]="panelOpen()"
          (click)="togglePanel($event)"
          [attr.aria-expanded]="panelOpen()"
          aria-label="More options"
        >
          <nxt1-icon name="moreHorizontal" [size]="18" aria-hidden="true" />
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
        --fab-bg: var(--nxt1-color-bg-primary);
        --fab-surface: var(--nxt1-color-surface-100, var(--nxt1-color-surface-200));
        --fab-surface-hover: var(--nxt1-color-surface-300);
        --fab-border: var(--nxt1-color-border-default);
        --fab-text-secondary: var(--nxt1-color-text-secondary);
        --fab-text-tertiary: var(--nxt1-color-text-tertiary);
        --fab-accent: var(--nxt1-color-primary);
        --fab-radius: var(--nxt1-borderRadius-xl);
        --fab-transition: var(--nxt1-duration-normal, 250ms) cubic-bezier(0.4, 0, 0.2, 1);
        --fab-transition-fast: var(--nxt1-duration-fast, 150ms) ease-out;
        --fab-press-scale: 0.97;
        --fab-bar-height: 52px;
        --fab-wrap-pb: var(--nxt1-spacing-3, 0.75rem);
        --fab-wrap-px: var(--nxt1-spacing-3, 0.75rem);
        --fab-wrap-pt: var(--nxt1-spacing-2, 0.5rem);
      }

      /* ── Wrapper (floats absolutely over host parent) ── */
      .fab__wrap {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--fab-wrap-pt) var(--fab-wrap-px) var(--fab-wrap-pb);
        z-index: 11;
        background: linear-gradient(to bottom, transparent 0%, var(--fab-bg) 40%);
        /* Restore pointer events when parent overlay uses pointer-events:none */
        pointer-events: auto;
      }

      /* ── Pill bar ── */
      .fab__bar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: var(--nxt1-spacing-1_5, 0.375rem);
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        box-shadow:
          0 4px 20px rgba(0, 0, 0, 0.28),
          0 1px 4px rgba(0, 0, 0, 0.15);
        min-height: var(--fab-bar-height);
        background: var(--fab-surface);
      }

      /* ── CTA pill ── */
      .fab__app-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 0.375rem);
        flex: 1;
        min-width: 0;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        text-decoration: none;
        color: var(--fab-text-secondary);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        transition: background var(--fab-transition-fast);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .fab__app-btn:hover {
        background: var(--fab-surface-hover);
      }
      .fab__app-btn:active {
        background: var(--fab-surface-hover);
        transform: scale(var(--fab-press-scale));
      }

      /* ── Three-dot circle button ── */
      .fab__more-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        border: none;
        cursor: pointer;
        color: var(--fab-text-secondary);
        flex-shrink: 0;
        transition:
          background var(--fab-transition-fast),
          color var(--fab-transition-fast);
        -webkit-tap-highlight-color: transparent;
      }

      .fab__more-btn:hover {
        background: var(--fab-surface-hover);
      }
      .fab__more-btn:active {
        transform: scale(var(--fab-press-scale));
      }
      .fab__more-btn--active {
        background: var(--fab-accent);
        color: var(--nxt1-color-white, #ffffff);
      }

      /* ── Slide-up panel ── */
      .fab__panel {
        position: absolute;
        left: var(--fab-wrap-px);
        right: var(--fab-wrap-px);
        bottom: calc(
          var(--fab-bar-height) + var(--fab-wrap-pt) + var(--fab-wrap-pb) +
            var(--nxt1-spacing-0_5, 0.125rem)
        );
        background: var(--fab-surface);
        border: 1px solid var(--fab-border);
        border-radius: var(--nxt1-borderRadius-2xl, 1rem);
        transform: translateY(calc(100% + var(--fab-wrap-pb)));
        transition: transform var(--fab-transition);
        z-index: 10;
        max-height: 70%;
        overflow-y: auto;
        overflow-x: hidden;
        /* Prevent scroll chaining to the sidebar nav behind the panel */
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        box-shadow:
          0 -4px 24px rgba(0, 0, 0, 0.22),
          0 -1px 6px rgba(0, 0, 0, 0.12);
        /* Restore pointer events when parent overlay uses pointer-events:none */
        pointer-events: auto;
      }

      .fab__panel--open {
        transform: translateY(0);
      }

      /* ── Panel sections ── */
      .fab__panel-section {
        border-bottom: 1px solid var(--fab-border);
      }
      .fab__panel-section:last-child {
        border-bottom: none;
      }

      .fab__panel-section--theme {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
      }

      .fab__panel-section--follow {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-3, 0.75rem);
      }

      .fab__panel-row-label {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fab-text-secondary);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-1, 0.25rem);
      }

      /* ── Follow row ── */
      .fab__follow-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        /* Isolate horizontal scroll so it doesn't bleed into vertical nav scroll */
        overscroll-behavior-x: contain;
        touch-action: pan-x;
      }
      .fab__follow-row::-webkit-scrollbar {
        display: none;
      }

      .fab__follow-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
        padding: var(--nxt1-spacing-1_5, 0.375rem) var(--nxt1-spacing-2, 0.5rem);
        background: none;
        border: none;
        border-radius: var(--fab-radius);
        cursor: pointer;
        text-decoration: none;
        color: var(--fab-text-secondary);
        transition: all var(--fab-transition-fast);
        -webkit-tap-highlight-color: transparent;
      }

      .fab__follow-btn:hover .fab__follow-icon-wrap {
        background: var(--fab-surface-hover);
      }
      .fab__follow-btn:active {
        transform: scale(var(--fab-press-scale));
      }

      .fab__follow-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200);
        transition: background var(--fab-transition-fast);
        flex-shrink: 0;
        color: var(--fab-text-secondary);
      }

      .fab__follow-label {
        font-size: 11px;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--fab-text-secondary);
        text-align: center;
        line-height: var(--nxt1-lineHeight-tight, 1.25);
        white-space: nowrap;
      }

      /* ── Legal footer ── */
      .fab__panel-legal {
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem)
          var(--nxt1-spacing-4, 1rem);
        border-top: 1px solid var(--fab-border);
      }

      .fab__legal {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .fab__legal-link {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--fab-text-tertiary);
        text-decoration: none;
        transition: color var(--fab-transition-fast);
      }
      .fab__legal-link:hover {
        color: var(--fab-text-secondary);
      }

      .fab__copyright {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        color: var(--fab-text-tertiary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .fab__panel,
        .fab__app-btn,
        .fab__more-btn,
        .fab__follow-btn,
        .fab__follow-icon-wrap {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtFloatingActionBarComponent {
  private readonly haptics = inject(HapticsService);
  private readonly browser = inject(NxtBrowserService);
  private readonly platform = inject(NxtPlatformService);

  protected readonly defaultConfig = DEFAULT_FLOATING_ACTION_BAR_CONFIG;
  protected readonly contactEmailHref = `mailto:${SUPPORT_CONFIG.SUPPORT_EMAIL}`;
  protected readonly currentYear = new Date().getFullYear();

  /** Resolves to iOS App Store, Google Play, or the config override based on user's device */
  protected readonly appStoreLink = computed(() => {
    if (this.config().appStoreUrl) return this.config().appStoreUrl!;
    if (this.platform.isAndroid()) return GOOGLE_PLAY_URL;
    return IOS_APP_STORE_URL; // iOS + desktop default → App Store
  });

  // ── Inputs ──────────────────────────────────────────────────────────────
  readonly config = input<FloatingActionBarConfig>(DEFAULT_FLOATING_ACTION_BAR_CONFIG);
  readonly followItems = input<readonly FloatingBarFollowItem[]>([]);

  // ── Outputs ─────────────────────────────────────────────────────────────
  /** Emitted when the panel is toggled (true = open, false = closed) */
  readonly panelToggle = output<boolean>();
  /** Emitted when a follow link or legal link is clicked (parent may want to close a drawer) */
  readonly linkClick = output<void>();
  /** Emitted when the CTA pill is clicked and config().appButtonAction is true */
  readonly ctaAction = output<void>();

  // ── State ────────────────────────────────────────────────────────────────
  readonly panelOpen = signal(false);

  // ── Methods ──────────────────────────────────────────────────────────────

  /** Close the panel when tapping anywhere outside the bar or panel */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      this.panelToggle.emit(false);
    }
  }

  /** Internal: CTA pill clicked in action mode */
  protected onCtaClick(): void {
    this.haptics.impact('medium');
    this.ctaAction.emit();
  }

  /** Open / close the slide-up panel */
  togglePanel(event: Event): void {
    event.stopPropagation();
    this.haptics.impact('light');
    this.panelOpen.update((v) => !v);
    this.panelToggle.emit(this.panelOpen());
  }

  /** Close the panel. Call this from a parent when e.g. the sidebar closes. */
  closePanel(): void {
    this.panelOpen.set(false);
  }

  /** Internal: follow / legal link clicked */
  protected onFollowClick(): void {
    this.linkClick.emit();
  }

  /**
   * Prevent touchmove events from escaping the panel and scrolling the sidebar nav behind it.
   * iOS Safari does not honour overscroll-behavior:contain on absolutely-positioned elements, so
   * stopping propagation here is the reliable cross-browser fallback.
   */
  protected onPanelTouchMove(event: TouchEvent): void {
    event.stopPropagation();
  }

  /** Internal: contact link — open mail client */
  protected onContactClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.linkClick.emit();
    void this.browser.openMailto({
      to: SUPPORT_CONFIG.SUPPORT_EMAIL,
      subject: 'Support Request - NXT1 Sports',
      body: ['Hi NXT1 Support Team,', '', 'I need help with:', '', 'My account email:'].join('\n'),
    });
  }
}
