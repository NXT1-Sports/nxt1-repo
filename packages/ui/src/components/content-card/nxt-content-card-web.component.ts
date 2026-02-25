/**
 * @fileoverview NXT Content Card — Shared Glass Card Shell
 * @module @nxt1/ui/components/content-card
 * @version 2.0.0
 *
 * Reusable glass-morphism card used across the entire app — profile tabs
 * (News, Scouting), explore feed, search results, and any content grid.
 * Provides the consistent card chrome — optional hero image, body slot,
 * optional CTA button, footer with source pill + metadata — while
 * consumers project their own body content via <ng-content>.
 *
 * Design-token CSS only (no Tailwind, no Ionic). SSR-safe.
 *
 * ⭐ WEB ONLY — SSR-optimized, zero Ionic ⭐
 *
 * @example
 * ```html
 * <nxt1-content-card
 *   [imageUrl]="article.heroImageUrl"
 *   [imageAlt]="article.title"
 *   [title]="article.title"
 *   [excerpt]="article.excerpt"
 *   [sourceAvatarUrl]="article.source.avatarUrl"
 *   [sourceName]="article.source.name"
 *   [metaLeft]="'3m ago'"
 *   [metaRight]="'2m read'"
 *   [ctaLabel]="'Read Article'"
 *   (cardClick)="onClick(article)"
 * >
 *   <!-- Badge overlay (absolute top-right, works with or without image) -->
 *   <span slot="badge" class="premium-badge">Premium</span>
 *
 *   <!-- Optional extra body content via default slot -->
 *   <div class="custom-section">Extra content here</div>
 * </nxt1-content-card>
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtImageComponent } from '../image';

@Component({
  selector: 'nxt1-content-card',
  standalone: true,
  imports: [NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="content-card"
      [class.content-card--no-image]="!imageUrl()"
      [attr.aria-label]="ariaLabel() || title()"
      tabindex="0"
      (click)="onCardClick()"
      (keydown.enter)="onCardClick()"
      (keydown.space)="onCardKeydown($event)"
    >
      <!-- Badge overlay (absolute top-right; works with AND without hero image) -->
      <div class="content-card__badge-area">
        <ng-content select="[slot=badge]" />
      </div>

      <!-- Hero Image (optional) -->
      @if (imageUrl()) {
        <div class="content-card__image-wrap">
          <nxt1-image
            [src]="imageUrl()!"
            [alt]="imageAlt() || title()"
            class="content-card__image"
            fit="cover"
          />
        </div>
      }

      <!-- Card Body -->
      <div class="content-card__body">
        <!-- Title -->
        @if (title()) {
          <h3 class="content-card__title">{{ title() }}</h3>
        }

        <!-- Excerpt / description -->
        @if (excerpt()) {
          <p class="content-card__excerpt">{{ excerpt() }}</p>
        }

        <!-- Projected content (ratings, highlights, etc.) -->
        <ng-content />

        <!-- CTA Button (optional) -->
        @if (ctaLabel()) {
          <button
            class="content-card__cta"
            type="button"
            (click)="$event.stopPropagation(); onCardClick()"
          >
            {{ ctaLabel() }}
            <svg
              class="content-card__cta-arrow"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        }

        <!-- Footer: Source + Meta -->
        @if (sourceName() || metaLeft() || metaRight()) {
          <div class="content-card__footer">
            @if (sourceName()) {
              <div class="content-card__source-pill">
                @if (sourceAvatarUrl()) {
                  <nxt1-image
                    [src]="sourceAvatarUrl()"
                    alt=""
                    [width]="18"
                    [height]="18"
                    variant="avatar"
                    fit="contain"
                    [showPlaceholder]="false"
                    class="content-card__source-logo"
                  />
                }
                <span class="content-card__source-name">{{ sourceName() }}</span>
              </div>
            }
            @if (metaLeft() || metaRight()) {
              <div class="content-card__stats">
                @if (metaLeft()) {
                  <span class="content-card__stat">{{ metaLeft() }}</span>
                }
                @if (metaLeft() && metaRight()) {
                  <span class="content-card__stat-dot" aria-hidden="true">·</span>
                }
                @if (metaRight()) {
                  <span class="content-card__stat">{{ metaRight() }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    </article>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
       NXT CONTENT CARD — Shared Glass Shell
       Consistent glass-morphism card for content grids app-wide.
       Used in: Profile (News, Scouting), Explore, Search, etc.
       Design-token CSS only. SSR-safe.
       ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        height: 100%;
      }

      /* ── Card Chrome ── */

      .content-card {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow: var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;
      }

      .content-card:hover {
        transform: translateY(-2px);
        box-shadow:
          var(--nxt1-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.45)),
          var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-glass-border-hover, rgba(255, 255, 255, 0.18));
      }

      .content-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* ── Hero Image ── */

      .content-card__badge-area {
        position: absolute;
        top: var(--nxt1-spacing-2, 8px);
        right: var(--nxt1-spacing-2, 8px);
        z-index: 2;
        pointer-events: none;
      }

      .content-card__badge-area > * {
        pointer-events: auto;
      }

      .content-card__image-wrap {
        position: relative;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }

      .content-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ── Card Body ── */

      .content-card__body {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px);
        flex: 1;
      }

      .content-card--no-image .content-card__body {
        padding: var(--nxt1-spacing-4, 16px);
      }

      .content-card__title {
        font-size: var(--nxt1-font-size-sm, 14px);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
      }

      .content-card__excerpt {
        font-size: var(--nxt1-font-size-xs, 12px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
      }

      /* ── Footer ── */

      .content-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: auto;
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.04));
      }

      .content-card__source-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        padding: 3px 10px 3px 4px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        min-width: 0;
        max-width: 100%;
      }

      .content-card__source-logo {
        width: 18px;
        height: 18px;
        border-radius: var(--nxt1-radius-full, 9999px);
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-100, #141414);
      }

      .content-card__source-name {
        font-size: var(--nxt1-font-size-2xs, 11px);
        font-weight: 700;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.01em;
      }

      .content-card__stats {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        flex-shrink: 0;
      }

      .content-card__stat {
        font-size: var(--nxt1-font-size-2xs, 11px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        white-space: nowrap;
      }

      .content-card__stat-dot {
        font-size: var(--nxt1-font-size-2xs, 11px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.25));
      }

      /* ── CTA Button ── */

      .content-card__cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        width: 100%;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        font-size: var(--nxt1-font-size-xs, 12px);
        font-weight: 700;
        color: #111;
        background: var(--nxt1-color-primary, #ccff00);
        border: none;
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        transition:
          background 0.15s ease,
          transform 0.1s ease;
        letter-spacing: 0.02em;
        margin-top: var(--nxt1-spacing-1, 4px);
      }

      .content-card__cta:hover {
        background: var(--nxt1-color-primary-hover, #b8e600);
        transform: translateY(-1px);
      }

      .content-card__cta:active {
        transform: translateY(0);
      }

      .content-card__cta:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .content-card__cta-arrow {
        flex-shrink: 0;
      }

      /* ── Motion ── */

      @media (prefers-reduced-motion: reduce) {
        .content-card {
          transition: none;
        }
        .content-card__cta {
          transition: none;
        }
      }
    `,
  ],
})
export class NxtContentCardWebComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Hero image URL (omit for no-image card variant). */
  readonly imageUrl = input<string | null | undefined>(null);

  /** Hero image alt text (falls back to title). */
  readonly imageAlt = input<string>('');

  /** Card title (line-clamped to 2 lines). */
  readonly title = input<string>('');

  /** Short description / excerpt (line-clamped to 2 lines). */
  readonly excerpt = input<string>('');

  /** Source avatar/logo URL for footer pill. */
  readonly sourceAvatarUrl = input<string>('');

  /** Source display name for footer pill. */
  readonly sourceName = input<string>('');

  /** Left metadata text (e.g., "3m ago"). */
  readonly metaLeft = input<string>('');

  /** Right metadata text (e.g., "2m read"). */
  readonly metaRight = input<string>('');

  /** Accessible label override (defaults to title). */
  readonly ariaLabel = input<string>('');

  /** Optional CTA button label (e.g. "Read Article", "Read Full Report"). Omit to hide. */
  readonly ctaLabel = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when card is clicked or activated via keyboard. */
  readonly cardClick = output<void>();

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onCardClick(): void {
    this.cardClick.emit();
  }

  /** Prevent scroll on Space, then emit click. */
  onCardKeydown(event: Event): void {
    event.preventDefault();
    this.cardClick.emit();
  }
}
