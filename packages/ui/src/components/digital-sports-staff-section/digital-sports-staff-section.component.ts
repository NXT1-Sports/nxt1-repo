import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

const STAFF_LANES = ['Performance', 'Brand', 'Strategy', 'Recruiting', 'Admin', 'Data'] as const;

@Component({
  selector: 'nxt1-digital-sports-staff-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="digital-staff" aria-labelledby="digital-staff-title">
      <div class="digital-staff__shell">
        <div class="digital-staff__glyph" aria-hidden="true">
          <span class="digital-staff__rail digital-staff__rail--top">
            <span class="digital-staff__pulse"></span>
          </span>
          <span class="digital-staff__rail digital-staff__rail--middle">
            <span class="digital-staff__pulse digital-staff__pulse--middle"></span>
          </span>
          <span class="digital-staff__rail digital-staff__rail--bottom">
            <span class="digital-staff__node digital-staff__node--right"></span>
            <span class="digital-staff__pulse digital-staff__pulse--bottom"></span>
            <span class="digital-staff__dot">●</span>
            <span class="digital-staff__check">✓</span>
          </span>
        </div>

        <div class="digital-staff__header">
          <nxt1-section-header
            titleId="digital-staff-title"
            eyebrow="Always-on Execution"
            align="center"
            [headingLevel]="2"
            title="Your 24/7 Digital"
            accentText="Sports Staff"
            subtitle="NXT1 gives you a full staff of AI Coordinators across performance, brand, strategy, recruiting, admin, and data that executes work for your program around the clock."
          />
        </div>

        <div class="digital-staff__workflow" aria-label="AI coordinator lanes">
          @for (lane of staffLanes; track lane) {
            <span class="digital-staff__chip">{{ lane }}</span>
          }
          <span class="digital-staff__workflow-line" aria-hidden="true"></span>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .digital-staff {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .digital-staff__shell {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-6, 24px);
        text-align: center;
      }

      .digital-staff__header {
        max-width: 760px;
      }

      .digital-staff__glyph {
        position: relative;
        width: 96px;
        height: 80px;
        color: var(--nxt1-color-text-secondary, #c7c7c7);
      }

      .digital-staff__rail {
        position: absolute;
        left: 14px;
        height: 12px;
        border: 2px solid currentColor;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        opacity: 0.9;
      }

      .digital-staff__rail--top {
        top: 8px;
        width: 48px;
      }

      .digital-staff__rail--middle {
        top: 32px;
        width: 64px;
      }

      .digital-staff__rail--bottom {
        top: 56px;
        width: 52px;
      }

      .digital-staff__node {
        position: absolute;
        top: 50%;
        width: 16px;
        height: 16px;
        transform: translateY(-50%);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-bg-primary, #050505);
        border: 2px solid currentColor;
      }

      .digital-staff__node--left {
        left: -8px;
      }

      .digital-staff__node--right {
        right: -8px;
      }

      .digital-staff__pulse {
        position: absolute;
        inset-block: 3px;
        width: 20px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: linear-gradient(90deg, transparent, var(--nxt1-color-primary, #ccff00));
        animation: digital-staff-flow-top 4s ease-in-out infinite;
      }

      .digital-staff__pulse--middle {
        animation: digital-staff-flow-middle 4s ease-in-out infinite;
      }

      .digital-staff__pulse--bottom {
        animation: digital-staff-flow-bottom 4s ease-in-out infinite;
      }

      .digital-staff__dot {
        position: absolute;
        right: -28px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        color: var(--nxt1-color-text-secondary, #a3a3a3);
        font-size: 10px;
        font-weight: bold;
        animation: digital-staff-dot-fade 4s ease-in-out infinite;
      }

      .digital-staff__check {
        position: absolute;
        right: -28px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 12px;
        font-weight: bold;
        animation: digital-staff-check-fade 4s ease-in-out infinite;
      }

      @keyframes digital-staff-flow-top {
        0% {
          left: 0;
          opacity: 0;
        }
        25% {
          left: 0;
          opacity: 0;
        }
        29% {
          opacity: 1;
        }
        41% {
          opacity: 1;
        }
        45% {
          left: calc(100% - 20px);
          opacity: 0;
        }
        100% {
          left: calc(100% - 20px);
          opacity: 0;
        }
      }

      @keyframes digital-staff-flow-middle {
        0% {
          left: 0;
          opacity: 0;
        }
        40% {
          left: 0;
          opacity: 0;
        }
        44% {
          opacity: 1;
        }
        56% {
          opacity: 1;
        }
        60% {
          left: calc(100% - 20px);
          opacity: 0;
        }
        100% {
          left: calc(100% - 20px);
          opacity: 0;
        }
      }

      @keyframes digital-staff-flow-bottom {
        0% {
          left: 0;
          opacity: 0;
        }
        55% {
          left: 0;
          opacity: 0;
        }
        59% {
          opacity: 1;
        }
        71% {
          opacity: 1;
        }
        75% {
          left: calc(100% - 20px);
          opacity: 0;
        }
        100% {
          left: calc(100% - 20px);
          opacity: 0;
        }
      }

      @keyframes digital-staff-dot-fade {
        0% {
          opacity: 1;
        }
        74.5% {
          opacity: 1;
        }
        75% {
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes digital-staff-check-fade {
        0% {
          opacity: 0;
        }
        74.5% {
          opacity: 0;
        }
        75% {
          opacity: 1;
        }
        100% {
          opacity: 1;
        }
      }

      .digital-staff__workflow {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        max-width: 760px;
        padding-bottom: var(--nxt1-spacing-6, 24px);
      }

      .digital-staff__workflow-line {
        position: absolute;
        bottom: -12px;
        left: 10%;
        right: 10%;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 55%, transparent),
          transparent
        );
      }

      .digital-staff__chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 54%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 70%, transparent);
        color: var(--nxt1-color-text-secondary, #d4d4d4);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
        transition: all 0.2s ease;
      }

      .digital-staff__chip:hover {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 20%,
          var(--nxt1-color-surface-100) 70%
        );
        color: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        transform: translateY(-2px);
      }

      @media (max-width: 767px) {
        .digital-staff__chip {
          min-height: 32px;
          padding: 0 var(--nxt1-spacing-3, 12px);
          font-size: var(--nxt1-fontSize-xs, 0.75rem);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .digital-staff__pulse {
          animation: none;
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDigitalSportsStaffSectionComponent {
  protected readonly staffLanes = STAFF_LANES;
}
