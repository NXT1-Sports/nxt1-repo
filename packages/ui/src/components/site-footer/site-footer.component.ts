/**
 * @fileoverview NxtSiteFooterComponent — Professional Website Footer
 * @module @nxt1/ui/components/site-footer
 * @version 1.0.0
 *
 * Shared, responsive site footer for public/logged-out web pages.
 * Follows 2026 enterprise footer patterns seen in Stripe, Linear, Vercel,
 * and major sports platforms (ESPN, Bleacher Report).
 *
 * Layout:
 *   Desktop (≥1024px): Multi-column grid — Logo + tagline | Link groups | Social + CTA
 *   Tablet  (768–1023): 2-column with stacked groups
 *   Mobile  (<768px):   Single-column, centered, collapsible link groups
 *
 * Features:
 * - Configurable link groups via input
 * - Social media icons from @nxt1/core DEFAULT_SOCIAL_LINKS
 * - Optional newsletter CTA / sign-up button
 * - Design-token-only CSS (no hardcoded values)
 * - SSR-safe, OnPush, standalone
 * - WCAG 2.1 AA accessible (landmark, roles, contrast)
 * - Reduced-motion safe
 *
 * Usage:
 * ```html
 * <nxt1-site-footer
 *   [linkGroups]="footerLinks"
 *   ctaLabel="Sign Up Free"
 *   ctaRoute="/auth/register"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE (web only for now) ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { DEFAULT_SOCIAL_LINKS, type SocialLink } from '@nxt1/core';

// ============================================
// TYPES
// ============================================

/** Single link in a footer group. */
export interface SiteFooterLink {
  readonly label: string;
  readonly route?: string;
  readonly href?: string;
  readonly ariaLabel?: string;
}

/** Group of links under a heading. */
export interface SiteFooterLinkGroup {
  readonly heading: string;
  readonly links: readonly SiteFooterLink[];
}

// ============================================
// DEFAULTS
// ============================================

const DEFAULT_LINK_GROUPS: SiteFooterLinkGroup[] = [
  {
    heading: 'Platform',
    links: [
      { label: 'For Athletes', route: '/athletes' },
      { label: 'For Coaches', route: '/college-coaches' },
      { label: 'For Parents', route: '/parents' },
      { label: 'For Scouts', route: '/scouts' },
      { label: 'Explore Athletes', route: '/explore' },
    ],
  },
  {
    heading: 'Sports',
    links: [
      { label: 'Football', route: '/football' },
      { label: 'Basketball', route: '/basketball' },
      { label: 'Baseball', route: '/baseball' },
      { label: 'Soccer', route: '/soccer' },
      { label: 'All Sports', route: '/explore' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Help Center', route: '/help-center' },
      { label: 'Rankings', route: '/rankings' },
      { label: 'News', route: '/news' },
      { label: 'College Search', route: '/colleges' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', route: '/about' },
      { label: 'Terms of Service', route: '/terms' },
      { label: 'Privacy Policy', route: '/privacy' },
      { label: 'Contact', route: '/help-center' },
    ],
  },
];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-site-footer',
  standalone: true,
  imports: [RouterLink, NxtLogoComponent, NxtIconComponent],
  template: `
    <footer class="site-footer" role="contentinfo" aria-label="Site footer">
      <div class="site-footer__inner">
        <!-- Top row: Brand + Link Groups -->
        <div class="site-footer__top">
          <!-- Brand column -->
          <div class="site-footer__brand">
            <nxt1-logo variant="footer" size="sm" />
            <p class="site-footer__tagline">{{ tagline() }}</p>

            <!-- Social icons (desktop: in brand column) -->
            <div class="site-footer__social" aria-label="Social media links">
              @for (social of socials; track social.id) {
                <a
                  class="site-footer__social-link"
                  [href]="social.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.aria-label]="social.ariaLabel"
                >
                  <nxt1-icon [name]="social.icon" [size]="18" />
                </a>
              }
            </div>
          </div>

          <!-- Link groups -->
          <div class="site-footer__groups">
            @for (group of resolvedLinkGroups(); track group.heading) {
              <div class="site-footer__group">
                <h3 class="site-footer__group-heading">{{ group.heading }}</h3>
                <ul class="site-footer__group-list">
                  @for (link of group.links; track link.label) {
                    <li>
                      @if (link.route) {
                        <a
                          class="site-footer__link"
                          [routerLink]="link.route"
                          [attr.aria-label]="link.ariaLabel ?? null"
                        >
                          {{ link.label }}
                        </a>
                      } @else if (link.href) {
                        <a
                          class="site-footer__link"
                          [href]="link.href"
                          target="_blank"
                          rel="noopener noreferrer"
                          [attr.aria-label]="link.ariaLabel ?? null"
                        >
                          {{ link.label }}
                        </a>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>

        <!-- Divider -->
        <hr class="site-footer__divider" aria-hidden="true" />

        <!-- Bottom row: Copyright + Legal + CTA -->
        <div class="site-footer__bottom">
          <p class="site-footer__copyright">
            &copy; {{ currentYear }} {{ companyName() }}. All rights reserved.
          </p>

          <div class="site-footer__bottom-links">
            <a class="site-footer__bottom-link" routerLink="/terms">Terms</a>
            <span class="site-footer__bottom-sep" aria-hidden="true">&middot;</span>
            <a class="site-footer__bottom-link" routerLink="/privacy">Privacy</a>
          </div>

          @if (ctaLabel()) {
            <a class="site-footer__cta" [routerLink]="ctaRoute()" [attr.aria-label]="ctaLabel()">
              {{ ctaLabel() }}
              <nxt1-icon name="arrowRight" [size]="16" />
            </a>
          }
        </div>
      </div>
    </footer>
  `,
  styles: [
    `
      /* ============================================
         HOST
         ============================================ */
      :host {
        display: block;
        width: 100%;
      }

      @media (min-width: 768px) {
        :host {
          display: none;
        }
      }

      /* ============================================
         FOOTER CONTAINER
         ============================================ */
      .site-footer {
        background: var(--nxt1-color-surface-50, #fafafa);
        border-top: 1px solid var(--nxt1-color-border-subtle, #e5e5e5);
        color: var(--nxt1-color-text-secondary, #6b7280);
      }

      .site-footer__inner {
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-12, 48px) var(--nxt1-spacing-6, 24px)
          var(--nxt1-spacing-8, 32px);
      }

      /* ============================================
         TOP: BRAND + LINK GROUPS
         ============================================ */
      .site-footer__top {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-10, 40px);
      }

      @media (min-width: 768px) {
        .site-footer__top {
          grid-template-columns: 260px 1fr;
          gap: var(--nxt1-spacing-12, 48px);
        }
      }

      /* ---- Brand column ---- */
      .site-footer__brand {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
      }

      .site-footer__tagline {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: var(--nxt1-lineHeight-relaxed, 1.65);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        max-width: 260px;
      }

      /* ---- Social icons ---- */
      .site-footer__social {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: var(--nxt1-spacing-1, 4px);
      }

      .site-footer__social-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-9, 36px);
        height: var(--nxt1-spacing-9, 36px);
        border-radius: var(--nxt1-borderRadius-lg, 8px);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        background: transparent;
        transition:
          color 0.2s ease,
          background-color 0.2s ease;
        text-decoration: none;
      }

      .site-footer__social-link:hover,
      .site-footer__social-link:focus-visible {
        color: var(--nxt1-color-text-primary, #111);
        background: var(--nxt1-color-surface-200, #f0f0f0);
      }

      .site-footer__social-link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #3b82f6);
        outline-offset: 2px;
      }

      /* ============================================
         LINK GROUPS
         ============================================ */
      .site-footer__groups {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px);
      }

      @media (min-width: 768px) {
        .site-footer__groups {
          grid-template-columns: repeat(4, 1fr);
          gap: var(--nxt1-spacing-6, 24px);
        }
      }

      .site-footer__group-heading {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--nxt1-color-text-primary, #111);
      }

      .site-footer__group-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .site-footer__link {
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary, #6b7280);
        text-decoration: none;
        transition: color 0.15s ease;
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      .site-footer__link:hover,
      .site-footer__link:focus-visible {
        color: var(--nxt1-color-text-primary, #111);
      }

      .site-footer__link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #3b82f6);
        outline-offset: 2px;
        border-radius: 2px;
      }

      /* ============================================
         DIVIDER
         ============================================ */
      .site-footer__divider {
        border: none;
        border-top: 1px solid var(--nxt1-color-border-subtle, #e5e5e5);
        margin: var(--nxt1-spacing-8, 32px) 0 var(--nxt1-spacing-6, 24px);
      }

      /* ============================================
         BOTTOM: COPYRIGHT + LEGAL + CTA
         ============================================ */
      .site-footer__bottom {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        text-align: center;
      }

      @media (min-width: 768px) {
        .site-footer__bottom {
          flex-direction: row;
          justify-content: space-between;
          text-align: left;
        }
      }

      .site-footer__copyright {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
      }

      .site-footer__bottom-links {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .site-footer__bottom-link {
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        text-decoration: none;
        transition: color 0.15s ease;
      }

      .site-footer__bottom-link:hover,
      .site-footer__bottom-link:focus-visible {
        color: var(--nxt1-color-text-primary, #111);
      }

      .site-footer__bottom-link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #3b82f6);
        outline-offset: 2px;
        border-radius: 2px;
      }

      .site-footer__bottom-sep {
        color: var(--nxt1-color-border-subtle, #e5e5e5);
        user-select: none;
      }

      /* ---- CTA button ---- */
      .site-footer__cta {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 6px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-on-primary, #fff);
        background: var(--nxt1-color-primary, #3b82f6);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        text-decoration: none;
        transition:
          background-color 0.2s ease,
          transform 0.15s ease;
        white-space: nowrap;
      }

      .site-footer__cta:hover {
        background: var(--nxt1-color-primary-hover, #2563eb);
        transform: translateY(-1px);
      }

      .site-footer__cta:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #3b82f6);
        outline-offset: 2px;
      }

      .site-footer__cta:active {
        transform: translateY(0);
      }

      /* ============================================
         DARK THEME
         ============================================ */
      :host-context([data-theme='dark']) .site-footer,
      :host-context(.dark) .site-footer {
        background: var(--nxt1-color-surface-50, #0a0a0a);
        border-top-color: var(--nxt1-color-border-subtle, #1f1f1f);
      }

      :host-context([data-theme='dark']) .site-footer__divider,
      :host-context(.dark) .site-footer__divider {
        border-top-color: var(--nxt1-color-border-subtle, #1f1f1f);
      }

      :host-context([data-theme='dark']) .site-footer__social-link:hover,
      :host-context(.dark) .site-footer__social-link:hover {
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .site-footer__social-link,
        .site-footer__link,
        .site-footer__bottom-link,
        .site-footer__cta {
          transition: none;
        }

        .site-footer__cta:hover {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSiteFooterComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Custom link groups. Falls back to sensible NXT1 defaults. */
  readonly linkGroups = input<SiteFooterLinkGroup[]>([]);

  /** Tagline displayed under logo. */
  readonly tagline = input<string>(
    'The #1 sports recruiting platform for student-athletes, coaches, parents, and scouts.'
  );

  /** CTA button label (omit to hide). */
  readonly ctaLabel = input<string>('Get Started Free');

  /** CTA button route. */
  readonly ctaRoute = input<string>('/auth/register');

  /** Company name for copyright line. */
  readonly companyName = input<string>('NXT1 Sports');

  // ============================================
  // COMPUTED
  // ============================================

  /** Use provided groups or defaults. */
  protected readonly resolvedLinkGroups = computed(() => {
    const custom = this.linkGroups();
    return custom.length > 0 ? custom : DEFAULT_LINK_GROUPS;
  });

  // ============================================
  // CONSTANTS
  // ============================================

  /** Social links from shared core constants. */
  protected readonly socials: readonly SocialLink[] = DEFAULT_SOCIAL_LINKS;

  /** Current year for copyright. */
  protected readonly currentYear = new Date().getFullYear();
}
