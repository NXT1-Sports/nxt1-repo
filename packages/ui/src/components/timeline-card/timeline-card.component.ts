/**
 * @fileoverview Shared Timeline Card Component
 * @module @nxt1/ui/components/timeline-card
 * @version 1.0.0
 *
 * A fully reusable card for any vertical-timeline display.
 * Shows a graphic area (image OR big-logo fallback), status badge,
 * body with title, tags, subtitle, and footer.
 *
 * Used by: Profile Offers, Events, Activity feeds, etc.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  TimelineVariant,
  TimelineCardTag,
  TimelineBadge,
  TimelineCardLayout,
} from '@nxt1/core';
import { getTimelineVariantClass } from '@nxt1/core';
import { NxtIconComponent } from '../icon';

@Component({
  selector: 'nxt1-timeline-card',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="tl-card" [class]="cardClass()">
      <!-- ═══ GRAPHIC AREA ═══ -->
      <div class="tl-card__graphic">
        <!-- Gradient background -->
        <div class="tl-card__graphic-bg" [class]="graphicBgClass()"></div>

        @if (graphicUrl()) {
          <!-- Has graphic image — show image with small corner logo -->
          <img
            class="tl-card__graphic-img"
            [src]="graphicUrl()"
            [alt]="title() + ' graphic'"
            loading="lazy"
          />
          <div class="tl-card__logo-circle" [class]="logoCircleClass()">
            @if (logoUrl()) {
              <img [src]="logoUrl()" [alt]="title() + ' logo'" loading="lazy" />
            } @else {
              <nxt1-icon [name]="fallbackIcon()" [size]="22" />
            }
          </div>
        } @else {
          <!-- No graphic — logo IS the image -->
          <div class="tl-card__big-logo">
            @if (logoUrl()) {
              <img [src]="logoUrl()" [alt]="title() + ' logo'" loading="lazy" />
            } @else {
              <nxt1-icon [name]="fallbackIcon()" [size]="48" />
            }
          </div>
        }

        <!-- Status badge -->
        @if (badge()) {
          <div class="tl-card__status" [class]="statusClass()" [attr.data-variant]="variantCss()">
            <nxt1-icon [name]="badge()!.icon" [size]="12" />
            <span>{{ badge()!.label }}</span>
          </div>
        }
      </div>

      <!-- ═══ BODY ═══ -->
      <div class="tl-card__body">
        <h4 class="tl-card__title">{{ title() }}</h4>

        @if (tags() && tags()!.length > 0) {
          <div class="tl-card__meta">
            @for (tag of tags(); track tag.label) {
              <span class="tl-card__tag" [class]="'tl-card__tag--' + getTagVariantCss(tag.variant)">
                {{ tag.label }}
              </span>
            }
          </div>
        }

        @if (subtitle()) {
          <p class="tl-card__coach">{{ subtitle() }}</p>
        }

        @if (footerLeft() || footerRight()) {
          <div class="tl-card__footer">
            @if (footerLeft()) {
              <span class="tl-card__sport">{{ footerLeft() }}</span>
            }
            @if (footerRight()) {
              <span class="tl-card__date-inline">{{ footerRight() }}</span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         TIMELINE CARD — 2026 Shared Design
         Reusable card for any timeline display.
         ============================================ */

      :host {
        display: block;

        /* ── Core palette (design tokens) ── */
        --tl-bg: var(--nxt1-color-bg-primary);
        --tl-surface: var(--nxt1-color-surface-100);
        --tl-border: var(--nxt1-color-border-default);
        --tl-border-subtle: var(--nxt1-color-border-subtle);
        --tl-text-1: var(--nxt1-color-text-primary);
        --tl-text-2: var(--nxt1-color-text-secondary);
        --tl-text-3: var(--nxt1-color-text-tertiary);
        --tl-accent: var(--nxt1-color-primary);
        --tl-success: var(--nxt1-color-successLight);

        /* ── Alpha variants ── */
        --tl-accent-alpha-5: var(--nxt1-color-alpha-primary5);
        --tl-accent-alpha-10: var(--nxt1-color-alpha-primary10);
        --tl-accent-alpha-15: var(--nxt1-color-alpha-primary15);
        --tl-accent-alpha-20: var(--nxt1-color-alpha-primary20);

        /* ── Layout ── */
        --tl-card-radius: 14px;
      }

      /* ═══ CARD SHELL ═══ */

      .tl-card {
        border-radius: var(--tl-card-radius);
        overflow: hidden;
        border: 1px solid var(--tl-border-subtle);
        background: var(--tl-surface);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .tl-card--committed {
        border-color: color-mix(in srgb, var(--tl-success) 15%, transparent);
      }

      /* ═══ GRAPHIC AREA ═══ */

      .tl-card__graphic {
        position: relative;
        width: 100%;
        height: 200px;
        overflow: hidden;

        @media (max-width: 768px) {
          height: 160px;
        }
      }

      .tl-card__graphic-bg {
        position: absolute;
        inset: 0;
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .tl-card__graphic-bg--committed {
        background:
          linear-gradient(
            135deg,
            color-mix(in srgb, var(--tl-success) 18%, transparent) 0%,
            color-mix(in srgb, var(--tl-success) 4%, transparent) 50%,
            color-mix(in srgb, var(--tl-bg) 90%, transparent) 100%
          ),
          repeating-linear-gradient(
            45deg,
            color-mix(in srgb, var(--tl-success) 3%, transparent) 0px,
            color-mix(in srgb, var(--tl-success) 3%, transparent) 1px,
            transparent 1px,
            transparent 12px
          );
      }

      .tl-card__graphic-bg--offer {
        background:
          linear-gradient(
            135deg,
            var(--tl-accent-alpha-15) 0%,
            var(--tl-accent-alpha-5) 50%,
            color-mix(in srgb, var(--tl-bg) 90%, transparent) 100%
          ),
          repeating-linear-gradient(
            45deg,
            var(--tl-accent-alpha-5) 0px,
            var(--tl-accent-alpha-5) 1px,
            transparent 1px,
            transparent 12px
          );
      }

      .tl-card__graphic-bg--interest {
        background:
          linear-gradient(
            135deg,
            color-mix(in srgb, var(--tl-text-3) 10%, transparent) 0%,
            color-mix(in srgb, var(--tl-text-3) 2%, transparent) 50%,
            color-mix(in srgb, var(--tl-bg) 90%, transparent) 100%
          ),
          repeating-linear-gradient(
            45deg,
            color-mix(in srgb, var(--tl-text-3) 2%, transparent) 0px,
            color-mix(in srgb, var(--tl-text-3) 2%, transparent) 1px,
            transparent 1px,
            transparent 12px
          );
      }

      /* ═══ LOGO CIRCLE (bottom-right corner of graphic) ═══ */

      .tl-card__logo-circle {
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--tl-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        z-index: 2;
        box-shadow:
          0 2px 12px var(--nxt1-color-alpha-black30),
          0 0 0 2px var(--tl-border-subtle);

        img {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 50%;
        }

        @media (max-width: 768px) {
          width: 44px;
          height: 44px;

          img {
            width: 30px;
            height: 30px;
          }
        }
      }

      .tl-card__logo-circle--committed {
        box-shadow:
          0 2px 12px var(--nxt1-color-alpha-black30),
          0 0 0 2px color-mix(in srgb, var(--tl-success) 25%, transparent);
      }

      .tl-card__logo-circle--offer {
        box-shadow:
          0 2px 12px var(--nxt1-color-alpha-black30),
          0 0 0 2px var(--tl-accent-alpha-20);
      }

      .tl-card__logo-circle--interest {
        box-shadow:
          0 2px 12px var(--nxt1-color-alpha-black30),
          0 0 0 2px var(--tl-border-subtle);
      }

      /* ═══ GRAPHIC IMAGE (covers entire graphic area) ═══ */

      .tl-card__graphic-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }

      /* ═══ BIG LOGO (no-graphic variant — logo IS the image) ═══ */

      .tl-card__big-logo {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 28px;
        }

        nxt1-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 88px;
          height: 88px;
          border-radius: 20%;
          background: var(--tl-surface);
          box-shadow:
            0 4px 24px var(--nxt1-color-alpha-black20),
            0 0 0 2px var(--tl-border-subtle);
          color: var(--tl-text-3);
        }

        @media (max-width: 768px) {
          img {
            padding: 20px;
          }

          nxt1-icon {
            width: 72px;
            height: 72px;
          }
        }
      }

      /* Committed big-logo ring tint (icon fallback only) */
      .tl-card--committed .tl-card__big-logo nxt1-icon {
        box-shadow:
          0 4px 24px var(--nxt1-color-alpha-black20),
          0 0 0 2px color-mix(in srgb, var(--tl-success) 25%, transparent);
      }

      /* Offer big-logo ring tint (icon fallback only) */
      .tl-card--offer .tl-card__big-logo nxt1-icon {
        box-shadow:
          0 4px 24px var(--nxt1-color-alpha-black20),
          0 0 0 2px var(--tl-accent-alpha-20);
      }

      /* ═══ STATUS BADGE (inside graphic top-left) ═══ */

      .tl-card__status {
        position: absolute;
        top: 12px;
        left: 12px;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        z-index: 2;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .tl-card__status--committed {
        background: color-mix(in srgb, var(--tl-success) 20%, transparent);
        color: var(--tl-success);
        border: 1px solid color-mix(in srgb, var(--tl-success) 25%, transparent);
      }

      .tl-card__status[data-variant='primary'] {
        background: var(--tl-accent);
        color: var(--tl-bg);
        border: 1px solid color-mix(in srgb, var(--tl-accent) 70%, var(--tl-bg) 30%);
      }

      .tl-card__status[data-variant='secondary'] {
        background: color-mix(in srgb, var(--tl-text-3) 15%, transparent);
        color: var(--tl-text-2);
        border: 1px solid color-mix(in srgb, var(--tl-text-3) 15%, transparent);
      }

      /* ═══ CARD BODY ═══ */

      .tl-card__body {
        padding: 16px 18px 18px;

        @media (max-width: 768px) {
          padding: 12px 14px 14px;
        }
      }

      .tl-card__title {
        font-size: 18px;
        font-weight: 700;
        color: var(--tl-text-1);
        margin: 0 0 8px;
        letter-spacing: -0.02em;
        line-height: 1.2;

        @media (max-width: 768px) {
          font-size: 16px;
        }
      }

      .tl-card__meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        flex-wrap: wrap;
      }

      .tl-card__tag {
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .tl-card__tag--committed {
        background: color-mix(in srgb, var(--tl-success) 12%, transparent);
        color: var(--tl-success);
      }

      .tl-card__tag--offer {
        background: var(--tl-accent-alpha-10);
        color: var(--tl-accent);
      }

      .tl-card__tag--interest {
        background: color-mix(in srgb, var(--tl-text-3) 10%, transparent);
        color: var(--tl-text-2);
      }

      .tl-card__coach {
        font-size: 12px;
        color: var(--tl-text-2);
        margin: 2px 0 0;
        font-weight: 500;
      }

      .tl-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--nxt1-color-border-default);
      }

      .tl-card__sport {
        font-size: 11px;
        font-weight: 600;
        color: var(--tl-text-3);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .tl-card__date-inline {
        font-size: 11px;
        font-weight: 500;
        color: var(--tl-text-3);
      }

      /* ═══════════════════════════════════════════════
         HORIZONTAL LAYOUT — Desktop variant
         Body on left, square graphic on right.
         Customizable via --tl-horizontal-graphic-size.
         ═══════════════════════════════════════════════ */

      .tl-card--horizontal {
        --tl-horizontal-graphic-size: 180px;

        display: flex;
        flex-direction: row;

        .tl-card__body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 20px 24px;
          order: 0;
        }

        .tl-card__graphic {
          width: var(--tl-horizontal-graphic-size);
          height: auto;
          flex-shrink: 0;
          aspect-ratio: 1;
          order: 1;
        }

        .tl-card__title {
          font-size: 17px;
          margin-bottom: 6px;
        }

        .tl-card__big-logo {
          img {
            padding: 20px;
          }

          nxt1-icon {
            width: 64px;
            height: 64px;
          }
        }

        .tl-card__logo-circle {
          bottom: 8px;
          right: 8px;
          width: 40px;
          height: 40px;

          img {
            width: 28px;
            height: 28px;
          }
        }

        .tl-card__status {
          top: 8px;
          left: auto;
          right: 8px;
          padding: 4px 8px;
          font-size: 9px;
        }

        .tl-card__footer {
          margin-top: 8px;
          padding-top: 8px;
        }

        .tl-card__coach {
          font-size: 12px;
        }

        .tl-card__tag {
          font-size: 9px;
          padding: 2px 8px;
        }
      }

      /* Responsive: horizontal falls back to vertical on small screens.
         Resets ALL horizontal overrides to match true vertical < 768px styles. */
      @media (max-width: 540px) {
        .tl-card--horizontal {
          flex-direction: column;

          .tl-card__graphic {
            width: 100%;
            height: 160px;
            aspect-ratio: auto;
            order: 0;
          }

          .tl-card__body {
            order: 1;
            padding: 12px 14px 14px;
          }

          .tl-card__title {
            font-size: 16px;
            margin-bottom: 8px;
          }

          .tl-card__tag {
            font-size: 10px;
            padding: 3px 10px;
          }

          .tl-card__status {
            left: 12px;
            right: auto;
            top: 12px;
            padding: 5px 12px;
            font-size: 11px;
          }

          .tl-card__logo-circle {
            bottom: 12px;
            right: 12px;
            width: 44px;
            height: 44px;

            img {
              width: 30px;
              height: 30px;
            }
          }

          .tl-card__big-logo {
            img {
              padding: 20px;
            }

            nxt1-icon {
              width: 72px;
              height: 72px;
            }
          }

          .tl-card__footer {
            margin-top: 10px;
            padding-top: 10px;
          }
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtTimelineCardComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Visual variant — controls gradient, badge, tag colors */
  readonly variant = input<TimelineVariant>('primary');

  /** Card layout orientation */
  readonly layout = input<TimelineCardLayout>('vertical');

  /** Primary heading */
  readonly title = input.required<string>();

  /** Logo / avatar URL */
  readonly logoUrl = input<string | undefined>(undefined);

  /** Full graphic banner image URL */
  readonly graphicUrl = input<string | undefined>(undefined);

  /** Tag chips in card body */
  readonly tags = input<readonly TimelineCardTag[] | undefined>(undefined);

  /** Secondary text line */
  readonly subtitle = input<string | undefined>(undefined);

  /** Footer left text */
  readonly footerLeft = input<string | undefined>(undefined);

  /** Footer right text */
  readonly footerRight = input<string | undefined>(undefined);

  /** Status badge in graphic area */
  readonly badge = input<TimelineBadge | undefined>(undefined);

  /** Fallback icon name when no logo URL (defaults to 'school') */
  readonly fallbackIcon = input<string>('school');

  // ============================================
  // COMPUTED CSS CLASSES
  // ============================================

  protected readonly variantCss = computed(() => this.variant());

  protected readonly cardClass = computed(() => {
    const variant = `tl-card--${getTimelineVariantClass(this.variant())}`;
    const layoutMod = this.layout() === 'horizontal' ? ' tl-card--horizontal' : '';
    return `tl-card ${variant}${layoutMod}`;
  });

  protected readonly graphicBgClass = computed(
    () => `tl-card__graphic-bg tl-card__graphic-bg--${getTimelineVariantClass(this.variant())}`
  );

  protected readonly logoCircleClass = computed(
    () => `tl-card__logo-circle tl-card__logo-circle--${getTimelineVariantClass(this.variant())}`
  );

  protected readonly statusClass = computed(() => {
    const v = this.variant();
    return v === 'committed' ? 'tl-card__status tl-card__status--committed' : 'tl-card__status';
  });

  // ============================================
  // HELPERS
  // ============================================

  protected getTagVariantCss(variant: TimelineVariant): string {
    return getTimelineVariantClass(variant);
  }
}
