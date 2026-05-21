import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  input,
  output,
  computed,
} from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { AuthFlowService } from '../core/services/auth';

export interface PublicNavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly href?: string;
}

@Component({
  selector: 'app-public-marketing-header',
  standalone: true,
  imports: [RouterLink],
  host: {
    class: 'nxt1-desktop-nav-host sticky',
  },
  template: `
    <header
      class="nxt1-desktop-nav bordered"
      [class.mobile-menu-open]="mobileMenuOpen()"
      role="banner"
    >
      <div class="nav-container relative flex h-full w-full max-w-[1536px] items-center gap-6 px-6">
        <!-- ============================================
             LOGO (Desktop)
             ============================================ -->
        <div class="nav-logo z-2 shrink-0">
          <a
            routerLink="/"
            href="/"
            class="logo-btn"
            aria-label="Go to home"
            (click)="onLogoClick()"
          >
            <img
              src="assets/shared/logo/nxt1_logo.avif"
              alt="NXT1"
              width="120"
              height="36"
              class="public-header-logo"
              loading="eager"
              fetchpriority="high"
            />
          </a>
        </div>

        <!-- ============================================
             PRIMARY NAVIGATION (hidden on mobile)
             ============================================ -->
        <nav
          class="nav-primary z-1 absolute left-1/2 hidden h-full min-w-0 -translate-x-1/2 items-center md:flex"
          role="navigation"
          aria-label="Main navigation"
        >
          <ul class="nav-list m-0 flex h-full list-none items-center gap-1 p-0" role="menubar">
            @for (item of items(); track item.id) {
              <li
                class="nav-item relative flex h-full items-center"
                [class.active]="isActiveRoute(item.route)"
                role="none"
              >
                <a
                  class="nav-item-btn"
                  [routerLink]="item.route"
                  [attr.href]="item.href ?? item.route"
                  [class.active]="isActiveRoute(item.route)"
                  [attr.aria-label]="item.label"
                  [attr.aria-current]="isActiveRoute(item.route) ? 'page' : null"
                  role="menuitem"
                  (click)="onItemClick(item)"
                >
                  <span class="nav-item-label">{{ item.label }}</span>
                </a>

                <!-- Active Indicator -->
                @if (isActiveRoute(item.route)) {
                  <span class="nav-active-indicator" aria-hidden="true"></span>
                }
              </li>
            }
          </ul>
        </nav>

        <!-- ============================================
             ACTIONS SECTION
             ============================================ -->
        <div class="nav-actions z-2 ml-auto flex shrink-0 items-center gap-3">
          <!-- Mobile hamburger button -->
          <button
            type="button"
            class="mobile-hamburger-btn md:hidden"
            [class.open]="mobileMenuOpen()"
            [attr.aria-expanded]="mobileMenuOpen()"
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
            (click)="toggleMobileMenu()"
          >
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
          </button>

          <!-- Auth CTA (desktop only) -->
          <a
            class="nav-auth-btn nav-auth-btn--primary"
            routerLink="/auth"
            [attr.aria-label]="authCtaLabel()"
          >
            {{ authCtaLabel() }}
          </a>
        </div>
      </div>
    </header>

    <!-- ============================================
         MOBILE MENU PANEL (slide-out drawer)
         ============================================ -->
    <div
      class="mobile-menu-overlay"
      [class.open]="mobileMenuOpen()"
      (click)="closeMobileMenu()"
      aria-hidden="true"
    ></div>

    <nav
      id="mobile-menu"
      class="mobile-menu"
      [class.open]="mobileMenuOpen()"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div class="mobile-menu-content">
        <div class="mobile-menu-shell">
          <div class="mobile-menu-header">
            <a
              href="/"
              routerLink="/"
              class="mobile-menu-brand"
              aria-label="Go to home page"
              (click)="onLogoClick(); closeMobileMenu()"
            >
              <span class="mobile-menu-brand__logo">
                <img src="assets/shared/logo/nxt1_icon.png" alt="" width="22" height="22" />
              </span>
              <span class="mobile-menu-brand__copy">
                <span class="mobile-menu-brand__eyebrow">NXT1</span>
                <span class="mobile-menu-brand__title">Menu</span>
              </span>
            </a>
          </div>

          <div class="mobile-menu-body">
            <ul class="mobile-nav-list m-0 list-none p-0" aria-label="Primary navigation">
              @for (item of items(); track item.id) {
                <li class="mobile-nav-item" [class.active]="isActiveRoute(item.route)">
                  <a
                    class="mobile-nav-btn"
                    [routerLink]="item.route"
                    [attr.href]="item.href ?? item.route"
                    [class.active]="isActiveRoute(item.route)"
                    (click)="onItemClick(item); closeMobileMenu()"
                  >
                    <span class="mobile-nav-label flex-1">{{ item.label }}</span>
                  </a>
                </li>
              }
            </ul>

            <div class="mobile-auth-section mt-auto">
              <div class="mobile-auth-actions">
                <a
                  class="mobile-auth-btn mobile-auth-btn--primary"
                  routerLink="/auth"
                  href="/auth"
                  (click)="closeMobileMenu()"
                >
                  Create Account
                </a>
                <a
                  class="mobile-auth-btn mobile-auth-btn--secondary"
                  routerLink="/auth"
                  href="/auth"
                  (click)="closeMobileMenu()"
                >
                  Sign In
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .public-header-logo {
        display: block;
        width: 120px;
        height: auto;
        max-height: 36px;
        object-fit: contain;
        user-select: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicMarketingHeaderComponent {
  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);

  /** Auth state: true if logged in, false if not */
  readonly isLoggedIn = computed(() => this.authFlow.isAuthenticated());
  readonly authCtaLabel = computed(() => (this.isLoggedIn() ? 'Open NXT1' : 'Try NXT1'));

  readonly items = input<readonly PublicNavItem[]>([]);
  readonly logoClick = output<void>();
  readonly navigate = output<PublicNavItem>();
  readonly mobileMenuOpen = signal(false);

  isActiveRoute(route: string): boolean {
    const current = this.router.url;
    const normalizedCurrent = current.split('?')[0].replace(/\/$/, '') || '/';
    const normalizedRoute = route.replace(/\/$/, '') || '/';

    // Exact match for root
    if (normalizedRoute === '/') {
      return normalizedCurrent === '/';
    }

    // Prefix match for other routes
    return (
      normalizedCurrent === normalizedRoute || normalizedCurrent.startsWith(normalizedRoute + '/')
    );
  }

  onLogoClick(): void {
    this.logoClick.emit();
    this.closeMobileMenu();
  }

  onItemClick(item: PublicNavItem): void {
    this.navigate.emit(item);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
}
