/**
 * @fileoverview 404 Not Found Page Component
 * @module @nxt1/ui/components/not-found
 *
 * Standalone Angular component for 404 error page.
 * Works cross-platform for both web and mobile apps.
 *
 * @example
 * ```typescript
 * // In routes:
 * {
 *   path: '**',
 *   loadComponent: () => import('@nxt1/ui').then(m => m.NotFoundComponent)
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DEFAULT_FOOTER_TABS, DEFAULT_USER_MENU_ITEMS } from '@nxt1/core';
import { NxtLogoComponent } from '../logo/logo.component';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtLogoComponent, NxtIconComponent],
  template: `
    <section class="nf">
      <div class="nf__ambient" aria-hidden="true"></div>

      <div class="nf__inner">
        <!-- Logo -->
        <nxt1-logo class="nf__logo" size="lg" />

        <!-- Card -->
        <div class="nf__card">
          <div class="nf__icon-wrap">
            <nxt1-icon name="alert-circle-outline" [size]="40" />
          </div>

          <h1 class="nf__code">404</h1>
          <h2 class="nf__title">Page Not Found</h2>
          <p class="nf__desc">The page you're looking for doesn't exist or has been moved.</p>

          <div class="nf__buttons">
            <button (click)="goBack()" class="nf__btn nf__btn--ghost">
              <nxt1-icon name="arrow-back-outline" [size]="18" />
              Go Back
            </button>
            <button [routerLink]="[homeRoute]" class="nf__btn nf__btn--fill">
              <nxt1-icon name="home-outline" [size]="18" />
              Go Home
            </button>
          </div>
        </div>

        <!-- Help -->
        <nav class="nf__help">
          <span class="nf__help-label">Need help?</span>
          <a [routerLink]="[helpRoute]">Help Center</a>
          <span class="nf__dot" aria-hidden="true">&middot;</span>
          <a [routerLink]="[agentRoute]">Contact Agent X</a>
        </nav>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Host ── */
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      /* ── Page ── */
      .nf {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        padding: var(--nxt1-spacing-6);
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
        overflow: hidden;
      }

      /* Subtle ambient glow */
      .nf__ambient {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(
            ellipse 50% 40% at 35% 25%,
            var(--nxt1-color-alpha-primary10),
            transparent
          ),
          radial-gradient(ellipse 45% 50% at 70% 65%, var(--nxt1-color-alpha-primary5), transparent);
        pointer-events: none;
      }

      /* ── Inner layout ── */
      .nf__inner {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6);
        width: 100%;
        max-width: 28rem;
      }

      /* ── Logo ── */
      .nf__logo {
        flex-shrink: 0;
      }

      /* ── Card ── */
      .nf__card {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        box-shadow: var(--nxt1-shadow-md);
        text-align: center;
      }

      /* ── Icon ── */
      .nf__icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-1);
      }

      /* ── Typography ── */
      .nf__code {
        margin: 0;
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-5xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        color: var(--nxt1-color-text-primary);
      }

      .nf__title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        color: var(--nxt1-color-text-primary);
      }

      .nf__desc {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-secondary);
        max-width: 22rem;
      }

      /* ── Buttons ── */
      .nf__buttons {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        margin-top: var(--nxt1-spacing-3);
      }

      .nf__btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        height: 44px;
        padding: 0 var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-none);
        cursor: pointer;
        border: 1px solid transparent;
        transition:
          background var(--nxt1-duration-fast) var(--nxt1-easing-out),
          border-color var(--nxt1-duration-fast) var(--nxt1-easing-out),
          box-shadow var(--nxt1-duration-fast) var(--nxt1-easing-out),
          transform var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nf__btn:focus-visible {
        outline: 2px solid var(--nxt1-color-focus-ring);
        outline-offset: 2px;
      }

      .nf__btn:active {
        transform: scale(0.97);
      }

      /* Ghost */
      .nf__btn--ghost {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-border-default);
      }

      .nf__btn--ghost:hover {
        background: var(--nxt1-color-surface-400);
        border-color: var(--nxt1-color-border-strong);
      }

      /* Primary fill */
      .nf__btn--fill {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border-color: var(--nxt1-color-primaryDark);
      }

      .nf__btn--fill:hover {
        background: var(--nxt1-color-primaryLight);
        box-shadow: var(--nxt1-glow-sm);
      }

      /* ── Help nav ── */
      .nf__help {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .nf__help-label {
        margin-right: var(--nxt1-spacing-1);
      }

      .nf__dot {
        color: var(--nxt1-color-text-disabled);
        user-select: none;
      }

      .nf__help a {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-decoration: none;
        transition: color var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nf__help a:hover {
        text-decoration: underline;
        color: var(--nxt1-color-primaryLight);
      }

      /* ── Responsive ── */
      @media (min-width: 640px) {
        .nf__card {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-10);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly platformId = inject(PLATFORM_ID);

  /** Derive routes from shared @nxt1/core navigation constants — zero hardcoding */
  protected readonly homeRoute = DEFAULT_FOOTER_TABS.find((t) => t.id === 'home')?.route ?? '/home';
  protected readonly agentRoute = DEFAULT_FOOTER_TABS.find((t) => t.id === 'ai')?.route ?? '/agent';
  protected readonly helpRoute =
    DEFAULT_USER_MENU_ITEMS.find((m) => m.id === 'help')?.route ?? '/help-center';

  goBack(): void {
    const isBrowser = isPlatformBrowser(this.platformId);
    const hasHistory = isBrowser && window.history.length > 1;

    if (hasHistory) {
      this.location.back();
    } else {
      void this.router.navigate([this.homeRoute]);
    }
  }
}
