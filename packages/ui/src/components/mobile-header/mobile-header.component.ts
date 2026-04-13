/**
 * @fileoverview NxtMobileHeaderComponent - YouTube-Style Mobile Top Navigation Bar
 * @module @nxt1/ui/components/mobile-header
 * @version 1.0.0
 *
 * Professional mobile top navigation bar for web applications.
 * YouTube mobile app pattern: hamburger | logo | search | notifications | sign-in/avatar.
 *
 * Design Philosophy:
 * - YouTube/Google mobile app navigation bar
 * - Clean, minimal top bar with essential actions
 * - Full design token + theme-aware system
 * - SSR-safe implementation
 * - Accessibility first
 *
 * Features:
 * - Hamburger menu button (opens mobile sidebar)
 * - NXT1 Logo centered/left aligned
 * - Search icon button
 * - Notifications bell with badge
 * - Sign-in button (unauthenticated) or user avatar (authenticated)
 * - Sticky positioning with optional hide-on-scroll
 *
 * ⭐ MOBILE WEB ONLY — Use NxtHeaderComponent for desktop ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  input,
  output,
  PLATFORM_ID,
  afterNextRender,
  HostBinding,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { HapticsService } from '../../services/haptics';
import type { MobileHeaderConfig, MobileHeaderUserData } from './mobile-header.types';
import { DEFAULT_MOBILE_HEADER_CONFIG } from './mobile-header.types';

@Component({
  selector: 'nxt1-mobile-header',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtLogoComponent, NxtIconComponent, NxtAvatarComponent],
  template: `
    <header
      class="mobile-header"
      [class.mobile-header--bordered]="config().bordered !== false"
      [class.mobile-header--blur]="config().variant === 'blur'"
      [class.mobile-header--elevated]="config().variant === 'elevated'"
      [class.mobile-header--hidden]="isHidden()"
      role="banner"
    >
      <div class="mobile-header__container">
        <!-- Left: Back Arrow or Hamburger Menu Button -->
        @if (config().showBack) {
          <button
            type="button"
            class="mobile-header__action-btn"
            aria-label="Go back"
            (click)="onBackClick($event)"
          >
            <nxt1-icon name="chevronLeft" [size]="24" />
          </button>
        } @else {
          <button
            type="button"
            class="mobile-header__action-btn"
            aria-label="Open navigation menu"
            (click)="onMenuClick($event)"
          >
            <nxt1-icon name="menu" [size]="24" />
          </button>
        }

        <!-- Center: Logo (logged-out) or Page Title (logged-in) -->
        @if (config().showLogo !== false) {
          <button
            type="button"
            class="mobile-header__logo-btn"
            aria-label="Go to home"
            (click)="onLogoClick($event)"
          >
            <nxt1-logo size="sm" variant="header" />
          </button>
        } @else if (config().title) {
          <h1 class="mobile-header__page-title">{{ config().title }}</h1>
        }

        <!-- Spacer -->
        <div class="mobile-header__spacer"></div>

        <!-- Right: Action Buttons -->
        <div class="mobile-header__actions">
          <!-- Budget Button (billing page, org users only) -->
          @if (config().showBudget) {
            <button
              type="button"
              class="mobile-header__action-btn"
              aria-label="Manage budget"
              (click)="onBudgetClick($event)"
            >
              <nxt1-icon name="settings-outline" [size]="22" />
            </button>
          }

          <!-- Help Button (billing page) -->
          @if (config().showHelp) {
            <button
              type="button"
              class="mobile-header__action-btn"
              aria-label="How billing works"
              (click)="onHelpClick($event)"
            >
              <nxt1-icon name="help-circle-outline" [size]="22" />
            </button>
          }

          <!-- Filter Button (explore page only) -->
          @if (config().showFilter) {
            <button
              type="button"
              class="mobile-header__action-btn mobile-header__filter-btn"
              [class.mobile-header__filter-btn--active]="(config().filterActiveCount ?? 0) > 0"
              [attr.aria-label]="
                (config().filterActiveCount ?? 0) > 0
                  ? 'Filters (' + config().filterActiveCount + ' active)'
                  : 'Open filters'
              "
              (click)="onFilterClick($event)"
            >
              <nxt1-icon name="funnel" [size]="22" />
              @if ((config().filterActiveCount ?? 0) > 0) {
                <span class="mobile-header__filter-badge" aria-hidden="true"></span>
              }
            </button>
          }

          <!-- Mark All Read Button (activity page only) -->
          @if (config().showMarkAllRead) {
            <button
              type="button"
              class="mobile-header__action-btn"
              aria-label="Mark all as read"
              (click)="onMarkAllReadClick($event)"
            >
              <nxt1-icon name="checkmarkDone" [size]="22" />
            </button>
          }

          <!-- Edit Button (pencil — own profile only) -->
          @if (config().showEdit) {
            <button
              type="button"
              class="mobile-header__action-btn"
              aria-label="Edit profile"
              (click)="onEditClick($event)"
            >
              <nxt1-icon name="pencil" [size]="22" />
            </button>
          }

          <!-- More Button (kebab menu) -->
          @if (config().showMore) {
            <button
              type="button"
              class="mobile-header__action-btn"
              aria-label="More options"
              (click)="onMoreClick($event)"
            >
              <nxt1-icon name="moreHorizontal" [size]="22" />
            </button>
          }

          <!-- Sign In / User Avatar — mutually exclusive -->
          @if (user()) {
            <!-- User Avatar (authenticated) -->
            @if (config().showAvatar !== false) {
              <button
                type="button"
                class="mobile-header__avatar-btn"
                [attr.aria-label]="'User menu for ' + user()!.name"
                (click)="onUserClick($event)"
              >
                <nxt1-avatar
                  [src]="user()!.profileImg"
                  [name]="user()!.name"
                  [initials]="user()!.initials"
                  [isTeamRole]="user()!.isTeamRole ?? false"
                  [customSize]="32"
                  [showSkeleton]="false"
                />
              </button>
            }
          } @else if (config().showSignIn) {
            <!-- Sign In Button (unauthenticated) -->
            <a class="mobile-header__signin-btn" routerLink="/auth" aria-label="Sign in">
              Sign In
            </a>
          }
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      /* ============================================
         CSS CUSTOM PROPERTIES (Design Tokens)
         ============================================ */
      :host {
        --mobile-header-height: var(--nxt1-spacing-14, 3.5rem);
        --mobile-header-bg: var(--nxt1-color-bg-primary);
        --mobile-header-border: var(--nxt1-color-border-subtle);
        --mobile-header-text: var(--nxt1-color-text-primary);
        --mobile-header-text-secondary: var(--nxt1-color-text-secondary);
        --mobile-header-hover-bg: var(--nxt1-color-state-hover);
        --mobile-header-active-bg: var(--nxt1-color-state-pressed);
        --mobile-header-accent: var(--nxt1-color-primary);
        --mobile-header-badge-bg: var(--nxt1-color-error);
        --mobile-header-badge-text: var(--nxt1-color-text-onPrimary, #fff);
        --mobile-header-transition: var(--nxt1-duration-fast, 150ms) ease-out;

        /* Interaction feedback tokens */
        --mobile-header-hover-opacity: 0.8;
        --mobile-header-press-scale-sm: 0.93;
        --mobile-header-press-scale-md: 0.96;
        --mobile-header-press-scale-lg: 0.97;

        /* Focus ring tokens */
        --mobile-header-focus-width: var(--nxt1-borderWidth-focus, 2px);
        --mobile-header-focus-offset: var(--nxt1-spacing-0_5, 0.125rem);

        display: block;
        position: relative;
        z-index: var(--nxt1-zIndex-sticky, 200);
      }

      :host(.sticky) {
        position: sticky;
        top: 0;
      }

      /* ============================================
         HEADER CONTAINER
         ============================================ */
      .mobile-header {
        display: flex;
        align-items: center;
        width: 100%;
        height: var(--mobile-header-height);
        background: var(--mobile-header-bg);
        transition: transform var(--nxt1-duration-normal, 250ms) ease-out;
        will-change: transform;
      }

      .mobile-header--bordered {
        border-bottom: 1px solid var(--mobile-header-border);
      }

      .mobile-header--blur {
        background: var(--nxt1-glass-bg);
        backdrop-filter: var(--nxt1-glass-backdrop);
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop);
      }

      .mobile-header--elevated {
        background: var(--nxt1-color-bg-elevated);
        box-shadow: var(--nxt1-navigation-elevated);
      }

      .mobile-header--hidden {
        transform: translateY(-100%);
        pointer-events: none;
      }

      /* ============================================
         INNER CONTAINER
         ============================================ */
      .mobile-header__container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        height: 100%;
        padding: 0 var(--nxt1-spacing-2, 0.5rem);
        gap: var(--nxt1-spacing-1, 0.25rem);
      }

      /* ============================================
         PAGE TITLE (authenticated view)
         Absolutely centered like native iOS/Android nav bars
         ============================================ */
      .mobile-header__page-title {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        margin: 0;
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--mobile-header-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        /* Ensure title never overlaps the left/right buttons */
        max-width: calc(100% - 9rem);
        pointer-events: none;
        line-height: var(--nxt1-lineHeight-tight, 1.25);
        letter-spacing: var(--nxt1-letterSpacing-tight, -0.02em);
      }

      /* ============================================
         SPACER
         ============================================ */
      .mobile-header__spacer {
        flex: 1;
      }

      /* ============================================
         LOGO BUTTON
         ============================================ */
      .mobile-header__logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--nxt1-spacing-1, 0.25rem);
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        transition:
          opacity var(--mobile-header-transition),
          transform var(--mobile-header-transition);
      }

      .mobile-header__logo-btn:hover {
        opacity: var(--mobile-header-hover-opacity);
      }

      .mobile-header__logo-btn:active {
        transform: scale(var(--mobile-header-press-scale-md));
      }

      /* ============================================
         ACTION BUTTONS
         ============================================ */
      .mobile-header__actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-0_5, 0.125rem);
      }

      .mobile-header__action-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10, 2.5rem);
        height: var(--nxt1-spacing-10, 2.5rem);
        padding: 0;
        background: transparent;
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        color: var(--mobile-header-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--mobile-header-transition),
          color var(--mobile-header-transition),
          transform var(--mobile-header-transition);
      }

      .mobile-header__action-btn:hover {
        background: var(--mobile-header-hover-bg);
      }

      .mobile-header__action-btn:active {
        background: var(--mobile-header-active-bg);
        transform: scale(var(--mobile-header-press-scale-sm));
      }

      .mobile-header__action-btn:focus-visible {
        outline: var(--mobile-header-focus-width) solid var(--nxt1-color-focus-ring);
        outline-offset: var(--mobile-header-focus-offset);
      }

      /* ============================================
         NOTIFICATION BADGE
         ============================================ */
      .mobile-header__badge {
        position: absolute;
        top: var(--nxt1-spacing-1, 0.25rem);
        right: var(--nxt1-spacing-1, 0.25rem);
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: var(--nxt1-spacing-4, 1rem);
        height: var(--nxt1-spacing-4, 1rem);
        padding: 0 var(--nxt1-spacing-1, 0.25rem);
        background: var(--mobile-header-badge-bg);
        color: var(--mobile-header-badge-text);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        line-height: var(--nxt1-lineHeight-none, 1);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: var(--mobile-header-focus-width) solid var(--mobile-header-bg);
        animation: nxt1-badge-pop 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      /* ============================================
         SIGN-IN BUTTON
         ============================================ */
      .mobile-header__signin-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: var(--nxt1-ui-btn-height-sm, 32px);
        padding: 0 var(--nxt1-spacing-4, 1rem);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-ui-text-inverse, #000000);
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-decoration: none;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: var(--nxt1-glow-md);
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--mobile-header-transition),
          transform var(--mobile-header-transition),
          box-shadow var(--mobile-header-transition);
      }

      .mobile-header__signin-btn:hover {
        background: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
        transform: translateY(-1px);
      }

      .mobile-header__signin-btn:active {
        transform: translateY(0);
        box-shadow: var(--nxt1-glow-sm);
      }

      .mobile-header__signin-btn:focus-visible {
        outline: var(--mobile-header-focus-width) solid var(--nxt1-color-focus-ring);
        outline-offset: var(--mobile-header-focus-offset);
      }

      /* ============================================
         USER AVATAR BUTTON
         ============================================ */
      .mobile-header__avatar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-8, 2rem);
        height: var(--nxt1-spacing-8, 2rem);
        padding: 0;
        background: var(--mobile-header-hover-bg);
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        cursor: pointer;
        overflow: hidden;
        margin-left: var(--nxt1-spacing-1, 0.25rem);
        -webkit-tap-highlight-color: transparent;
        transition: transform var(--mobile-header-transition);
      }

      .mobile-header__avatar-btn:active {
        transform: scale(var(--mobile-header-press-scale-sm));
      }

      .mobile-header__avatar-btn:focus-visible {
        outline: var(--mobile-header-focus-width) solid var(--nxt1-color-focus-ring);
        outline-offset: var(--mobile-header-focus-offset);
      }

      .mobile-header__avatar-btn nxt1-avatar {
        width: 100%;
        height: 100%;
      }

      /* ============================================
         FILTER BUTTON ACTIVE STATE
         ============================================ */
      .mobile-header__filter-btn {
        position: relative;
      }

      .mobile-header__filter-btn--active {
        color: var(--nxt1-color-primary);
      }

      .mobile-header__filter-badge {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 7px;
        height: 7px;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1.5px solid var(--mobile-header-bg);
        animation: nxt1-badge-pop 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      /* ============================================
         BADGE ANIMATION (shared keyframe)
         ============================================ */
      @keyframes nxt1-badge-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        60% {
          transform: scale(1.15);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .mobile-header,
        .mobile-header__action-btn,
        .mobile-header__logo-btn,
        .mobile-header__signin-btn,
        .mobile-header__avatar-btn {
          transition: none;
        }

        .mobile-header__badge {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileHeaderComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);
  private readonly destroy$ = new Subject<void>();

  // ============================================
  // INPUTS
  // ============================================

  /** Configuration */
  readonly config = input<MobileHeaderConfig>(DEFAULT_MOBILE_HEADER_CONFIG);

  /** User data (null = unauthenticated) */
  readonly user = input<MobileHeaderUserData | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when hamburger menu button is clicked */
  readonly menuClick = output<Event>();

  /** Emitted when back button is clicked (when showBack is true) */
  readonly backClick = output<Event>();

  /** Emitted when logo is clicked */
  readonly logoClick = output<Event>();

  /** Emitted when search button is clicked */
  readonly searchClick = output<Event>();

  /** Emitted when notifications button is clicked */
  readonly notificationsClick = output<Event>();

  /** Emitted when more button (kebab menu) is clicked */
  readonly moreClick = output<Event>();

  /** Emitted when edit (pencil) button is clicked */
  readonly editClick = output<Event>();

  /** Emitted when mark-all-read button is clicked */
  readonly markAllReadClick = output<Event>();

  /** Emitted when filter button is clicked (explore page) */
  readonly filterClick = output<Event>();

  /** Emitted when help button is clicked (billing page) */
  readonly helpClick = output<Event>();

  /** Emitted when budget button is clicked (billing page, org users) */
  readonly budgetClick = output<Event>();

  /** Emitted when user avatar is clicked */
  readonly userClick = output<Event>();

  // ============================================
  // STATE
  // ============================================

  /** Whether the header is hidden (scroll-to-hide) */
  readonly isHidden = signal(false);

  /** Last scroll position for hide-on-scroll */
  private lastScrollY = 0;

  /** Scroll threshold before hiding */
  private readonly scrollThreshold = 56;

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-mobile-header-host')
  readonly hostClass = true;

  @HostBinding('class.sticky')
  get isSticky(): boolean {
    return this.config().sticky !== false;
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    afterNextRender(() => {
      this.setupScrollTracking();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onMenuClick(event: Event): void {
    this.haptics.impact('light');
    this.menuClick.emit(event);
  }

  onBackClick(event: Event): void {
    this.haptics.impact('light');
    this.backClick.emit(event);
  }

  onLogoClick(event: Event): void {
    this.haptics.impact('light');
    this.logoClick.emit(event);
  }

  onSearchClick(event: Event): void {
    this.haptics.impact('light');
    this.searchClick.emit(event);
  }

  onNotificationsClick(event: Event): void {
    this.haptics.impact('medium');
    this.notificationsClick.emit(event);
  }

  onMoreClick(event: Event): void {
    this.haptics.impact('light');
    this.moreClick.emit(event);
  }

  onEditClick(event: Event): void {
    this.haptics.impact('light');
    this.editClick.emit(event);
  }

  onMarkAllReadClick(event: Event): void {
    this.haptics.impact('light');
    this.markAllReadClick.emit(event);
  }

  onFilterClick(event: Event): void {
    this.haptics.impact('light');
    this.filterClick.emit(event);
  }

  onHelpClick(event: Event): void {
    this.haptics.impact('light');
    this.helpClick.emit(event);
  }

  onBudgetClick(event: Event): void {
    this.haptics.impact('light');
    this.budgetClick.emit(event);
  }

  onUserClick(event: Event): void {
    this.haptics.impact('light');
    this.userClick.emit(event);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Set up scroll tracking for hide-on-scroll behavior
   */
  private setupScrollTracking(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.config().hideOnScroll) return;

    const onScroll = (): void => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > this.lastScrollY && currentScrollY > this.scrollThreshold) {
        this.isHidden.set(true);
      } else {
        this.isHidden.set(false);
      }

      this.lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroy$.subscribe(() => {
      window.removeEventListener('scroll', onScroll);
    });
  }
}
