/**
 * @fileoverview Mobile-First Design Section
 * @module @nxt1/ui/components/mobile-first-design-section
 * @version 1.0.0
 *
 * Shared marketing section that demonstrates responsive profile rendering
 * across phone, tablet, and laptop viewports.
 *
 * Standards:
 * - SSR-safe deterministic IDs (instance counter)
 * - 100% design-token driven — all colors, spacing, typography, radii, shadows
 * - Component-scoped CSS custom properties for layout constraints
 * - Semantic HTML (<section>, <article>, <figure>, <ul>) for SEO and a11y
 * - Mobile-first responsive layout via min-width breakpoint
 * - Configurable via `input()` signal with sensible defaults
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface DevicePreview {
  readonly id: string;
  readonly label: string;
  readonly viewport: string;
}

const DEFAULT_DEVICE_PREVIEWS: readonly DevicePreview[] = [
  { id: 'phone', label: 'Phone', viewport: '390 × 844' },
  { id: 'tablet', label: 'Tablet', viewport: '834 × 1112' },
  { id: 'laptop', label: 'Laptop', viewport: '1440 × 900' },
] as const;

let mobileFirstDesignInstanceCounter = 0;

@Component({
  selector: 'nxt1-mobile-first-design-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="mobile-first" [attr.aria-labelledby]="titleId()">
      <div class="mobile-first__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Mobile-First Design"
          [headingLevel]="2"
          layout="split"
          contentPosition="end"
          title="Built for the Phone."
          accentText=" Unstoppable on Desktop."
          subtitle="One elite Super Profile experience, perfectly responsive across every screen college coaches use."
          support="90% of recruiting happens on a phone. We look perfect on every screen."
        >
          <article class="device-showcase" [attr.aria-labelledby]="panelTitleId()">
            <header class="device-showcase__header">
              <h3 class="device-showcase__title" [id]="panelTitleId()">
                Same Profile. Every Viewport.
              </h3>
              <p class="device-showcase__subtitle">
                Adaptive profile rendering across phone, tablet, and laptop.
              </p>
            </header>

            <figure
              class="device-showcase__figure"
              role="img"
              aria-roledescription="responsive device comparison"
              [attr.aria-describedby]="insightId()"
            >
              <figcaption class="sr-only">
                Three responsive device previews showing the same NXT1 Super Profile across phone,
                tablet, and laptop.
              </figcaption>

              <ul class="device-list" role="list" aria-label="Responsive profile previews">
                @for (device of displayDevices(); track device.id) {
                  <li class="device-list__item">
                    <article class="device" [class]="'device device--' + device.id">
                      <header class="device__meta">
                        <p class="device__label">{{ device.label }}</p>
                        <p class="device__viewport">{{ device.viewport }}</p>
                      </header>

                      <div class="device__surface" aria-hidden="true">
                        <div class="device__profile-header">
                          <span class="device__avatar"></span>
                          <span class="device__identity"></span>
                        </div>
                        <div class="device__chip-row">
                          <span class="device__chip"></span>
                          <span class="device__chip"></span>
                          <span class="device__chip"></span>
                        </div>
                        <div class="device__stack">
                          <span class="device__row"></span>
                          <span class="device__row"></span>
                          <span class="device__row"></span>
                        </div>
                      </div>
                    </article>
                  </li>
                }
              </ul>
            </figure>

            <aside class="device-showcase__insight" [id]="insightId()">
              <p class="device-showcase__insight-text">
                Coaches recruit from the sideline, the office, and the couch — your profile is ready
                everywhere.
              </p>
            </aside>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Component-scoped layout tokens ── */
      :host {
        --_device-phone-max-width: var(--nxt1-spacing-56, 14rem);
        --_device-tablet-max-width: var(--nxt1-spacing-72, 18rem);
        --_device-phone-desktop-width: var(--nxt1-spacing-52, 13rem);
        --_device-tablet-desktop-width: var(--nxt1-spacing-64, 16rem);

        display: block;
      }

      /* ── Section container ── */
      .mobile-first {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .mobile-first__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      /* ── Showcase card ── */
      .device-showcase {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .device-showcase__header {
        display: grid;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4) 0;
      }

      .device-showcase__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .device-showcase__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Figure (device grid) ── */
      .device-showcase__figure {
        margin: 0;
        padding: 0 var(--nxt1-spacing-4);
      }

      .device-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .device-list__item {
        min-width: 0;
      }

      /* ── Individual device card ── */
      .device {
        display: grid;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          160deg,
          var(--nxt1-color-alpha-primary8) 0%,
          var(--nxt1-color-surface-100) 72%
        );
      }

      .device__meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .device__label,
      .device__viewport {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .device__label {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .device__viewport {
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ── Device mockup surface ── */
      .device__surface {
        display: grid;
        gap: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-2_5);
      }

      .device__profile-header {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .device__avatar {
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: var(--nxt1-borderRadius-full);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-primaryLight) 100%
        );
      }

      .device__identity {
        height: var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-300);
      }

      .device__chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1_5);
      }

      .device__chip {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary15);
      }

      .device__stack {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .device__row {
        display: block;
        width: 100%;
        height: var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-300) 0%,
          var(--nxt1-color-surface-400) 50%,
          var(--nxt1-color-surface-300) 100%
        );
      }

      /* ── Per-device sizing via scoped tokens ── */
      .device--phone {
        max-width: var(--_device-phone-max-width);
      }

      .device--tablet {
        max-width: var(--_device-tablet-max-width);
      }

      .device--laptop {
        max-width: 100%;
      }

      /* ── Insight callout ── */
      .device-showcase__insight {
        margin: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .device-showcase__insight-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Accessibility ── */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      /* ── Desktop: 3-column device grid ── */
      @media (min-width: 768px) {
        .device-list {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: end;
        }

        .device {
          height: 100%;
        }

        .device--phone {
          justify-self: center;
          width: min(100%, var(--_device-phone-desktop-width));
        }

        .device--tablet {
          justify-self: center;
          width: min(100%, var(--_device-tablet-desktop-width));
        }

        .device--laptop {
          width: 100%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileFirstDesignSectionComponent {
  private readonly instanceId = ++mobileFirstDesignInstanceCounter;

  /** Configurable device previews — override defaults for custom viewports. */
  readonly items = input<readonly DevicePreview[]>(DEFAULT_DEVICE_PREVIEWS);

  /** Resolved list — falls back to defaults when empty input is provided. */
  readonly displayDevices = computed<readonly DevicePreview[]>(() => {
    const configured = this.items();
    return configured.length > 0 ? configured : DEFAULT_DEVICE_PREVIEWS;
  });

  readonly titleId = computed(() => `mobile-first-design-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `mobile-first-design-panel-title-${this.instanceId}`);
  readonly insightId = computed(() => `mobile-first-design-insight-${this.instanceId}`);
}
