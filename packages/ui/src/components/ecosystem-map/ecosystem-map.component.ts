/**
 * @fileoverview NXT1 Ecosystem Map (Education) — Full-Stack Pipeline Visualization
 * @module @nxt1/ui/components/ecosystem-map
 * @version 1.0.0
 *
 * Animated four-step pipeline section that educates users on how NXT1 transforms
 * raw athlete inputs into recruiter-facing distribution. Each step card features
 * a numbered badge, inline SVG icon, title, and supporting detail.
 *
 * Horizontal layout on desktop (4-column grid) with animated directional
 * chevron connectors between steps. Vertical stack on mobile with downward
 * flow connectors. Cards use staggered entrance animation for premium feel.
 *
 * Design philosophy:
 * - 100 % design-token driven — zero hardcoded colors, sizes, or spacing
 * - SSR-safe — pure CSS animations, no DOM / browser APIs, deterministic IDs
 * - Semantic HTML (`<ol>`, `<article>`, `<em>`) with ARIA for screen readers
 * - `prefers-reduced-motion` fully respected
 * - Mobile-first responsive design
 *
 * @example
 * ```html
 * <!-- Default usage with built-in steps -->
 * <nxt1-ecosystem-map />
 *
 * <!-- Custom steps -->
 * <nxt1-ecosystem-map [steps]="customSteps" />
 * ```
 */

import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

// ============================================
// PUBLIC TYPES
// ============================================

/** A single step rendered in the ecosystem pipeline. */
export interface EcosystemMapStep {
  /** Stable identifier used for `@for` tracking and ARIA IDs. */
  readonly id: string;
  /** Ordinal position (1-based) shown in the numbered badge. */
  readonly index: number;
  /** Action verb headline (e.g. "Ingest", "Refine"). */
  readonly title: string;
  /** Short supporting description for context (e.g. "Raw Video / Stats"). */
  readonly detail: string;
  /**
   * Inline SVG path data rendered inside a 24 × 24 viewBox.
   * Allows each step to carry a unique icon without external assets.
   */
  readonly svgPath: string;
}

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_STEPS: readonly EcosystemMapStep[] = [
  {
    id: 'ingest',
    index: 1,
    title: 'Ingest',
    detail: 'Raw Video & Stats',
    // upload-cloud icon
    svgPath:
      'M12 16V8m0 0l-3 3m3-3l3 3M4 14.5A3.5 3.5 0 0 1 6.09 8.16a5 5 0 0 1 9.82 0A3.5 3.5 0 0 1 20 14.5',
  },
  {
    id: 'refine',
    index: 2,
    title: 'Refine',
    detail: 'Agent X AI Analysis',
    // sparkles / AI icon
    svgPath:
      'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z',
  },
  {
    id: 'create',
    index: 3,
    title: 'Create',
    detail: 'Videos · Graphics · Posts · Profile',
    // palette / creative icon
    svgPath:
      'M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42',
  },
  {
    id: 'distribute',
    index: 4,
    title: 'Distribute',
    detail: 'Social & Recruiters',
    // share / send icon
    svgPath:
      'M6 12L3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5',
  },
] as const;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-ecosystem-map',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section
      class="ecosystem"
      [attr.aria-labelledby]="headingId()"
      [class.ecosystem--started]="animationStarted()"
    >
      <div class="ecosystem__header">
        <nxt1-section-header
          [titleId]="headingId()"
          eyebrow="Ecosystem Map"
          align="center"
          [headingLevel]="2"
          title="The Full-Stack Recruiting"
          accentText="Pipeline."
          subtitle="From the first upload to coach-facing distribution, NXT1 runs the complete workflow athletes need to get discovered."
        />
      </div>

      <ol class="ecosystem__pipeline" aria-label="NXT1 recruiting ecosystem flow">
        @for (step of steps(); track step.id; let idx = $index) {
          <li class="ecosystem__step" [style.--_flow-index]="idx">
            <article
              class="ecosystem-card"
              [attr.aria-labelledby]="headingId() + '-step-' + step.id"
            >
              <span class="ecosystem-card__trace" aria-hidden="true">
                <span class="ecosystem-card__trace-edge ecosystem-card__trace-edge--top"></span>
                <span class="ecosystem-card__trace-edge ecosystem-card__trace-edge--right"></span>
                <span class="ecosystem-card__trace-edge ecosystem-card__trace-edge--bottom"></span>
                <span class="ecosystem-card__trace-edge ecosystem-card__trace-edge--left"></span>
              </span>

              <!-- Numbered badge -->
              <span class="ecosystem-card__badge" aria-hidden="true">
                {{ step.index }}
              </span>

              <!-- Step icon -->
              @if (step.id === 'refine') {
                <svg
                  class="ecosystem-card__icon ecosystem-card__icon--agent-x"
                  viewBox="0 0 612 792"
                  fill="currentColor"
                  stroke="currentColor"
                  stroke-width="12"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                  />
                  <polygon
                    points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                  />
                </svg>
              } @else {
                <svg
                  class="ecosystem-card__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path [attr.d]="step.svgPath" />
                </svg>
              }

              <h3 class="ecosystem-card__title" [id]="headingId() + '-step-' + step.id">
                {{ step.title }}
              </h3>

              <p class="ecosystem-card__detail">{{ step.detail }}</p>
            </article>

            <!-- Directional connector (hidden on last step via CSS) -->
            @if (idx < steps().length - 1) {
              <span
                class="ecosystem__connector"
                aria-hidden="true"
                [style.--_connector-index]="idx"
              >
                <span class="ecosystem__connector-line"></span>
                <svg
                  class="ecosystem__chevron"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M6 3l5 5-5 5" />
                </svg>
              </span>
            }
          </li>
        }
      </ol>

      <p class="ecosystem__copy">
        From raw footage to scholarship offer.
        <em class="ecosystem__copy-accent">We handle the middle.</em>
      </p>
    </section>
  `,
  styles: [
    `
      /* ============================================
         ECOSYSTEM MAP v1
         Token-driven 4-step pipeline visualization.
         SSR-safe, responsive, accessible.
         ============================================ */

      :host {
        display: block;
      }

      /* ---------- Section layout ---------- */

      .ecosystem {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        --_flow-step-duration: 1.3s;
        --_flow-cycle-duration: calc(var(--_flow-step-duration) * 4);
        --_flow-highlight-glow: var(--nxt1-shadow-md);
      }

      .ecosystem__header {
        margin-bottom: var(--nxt1-spacing-10);
      }

      /* ---------- Pipeline grid ---------- */

      .ecosystem__pipeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      .ecosystem__step {
        position: relative;
        opacity: 1;
        will-change: transform, opacity;
      }

      /* ---------- Card ---------- */

      .ecosystem-card {
        height: 100%;
        position: relative;
        overflow: clip;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--nxt1-spacing-3);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-5);
        box-shadow: var(--nxt1-shadow-sm);
        transform: translateZ(0);
        transition:
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .ecosystem-card::after {
        content: none;
      }

      .ecosystem-card__trace {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        overflow: clip;
      }

      .ecosystem-card__trace-edge {
        position: absolute;
        opacity: 0;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary30),
          var(--nxt1-color-primary)
        );
      }

      .ecosystem-card__trace-edge--top {
        top: 0;
        left: 0;
        width: 100%;
        height: 1px;
        transform-origin: left center;
        transform: scaleX(0);
      }

      .ecosystem-card__trace-edge--right {
        top: 0;
        right: 0;
        width: 1px;
        height: 100%;
        transform-origin: center top;
        transform: scaleY(0);
      }

      .ecosystem-card__trace-edge--bottom {
        right: 0;
        bottom: 0;
        width: 100%;
        height: 1px;
        transform-origin: right center;
        transform: scaleX(0);
      }

      .ecosystem-card__trace-edge--left {
        left: 0;
        bottom: 0;
        width: 1px;
        height: 100%;
        transform-origin: center bottom;
        transform: scaleY(0);
      }

      .ecosystem-card:hover {
        transform: translateY(calc(var(--nxt1-spacing-1) * -1));
        border-color: var(--nxt1-color-alpha-primary30);
        box-shadow: var(--nxt1-shadow-md);
      }

      /* Numbered badge */
      .ecosystem-card__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: 1;
        flex-shrink: 0;
      }

      /* Step icon */
      .ecosystem-card__icon {
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .ecosystem-card__icon--agent-x {
        width: calc(var(--nxt1-spacing-8) + var(--nxt1-spacing-4));
        height: calc(var(--nxt1-spacing-8) + var(--nxt1-spacing-4));
      }

      /* Title */
      .ecosystem-card__title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        color: var(--nxt1-color-text-primary);
      }

      /* Detail */
      .ecosystem-card__detail {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      /* ---------- Connector + Chevron ---------- */

      .ecosystem__connector {
        display: none;
      }

      .ecosystem__connector-line {
        position: relative;
        display: inline-flex;
        width: 100%;
        height: 1px;
        background: var(--nxt1-color-border-subtle);
        overflow: clip;
      }

      .ecosystem__connector-line::after {
        content: '';
        position: absolute;
        inset: 0;
        transform-origin: left center;
        transform: scaleX(0);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary30),
          var(--nxt1-color-primary)
        );
      }

      .ecosystem__chevron {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-alpha-primary30);
        opacity: 0.45;
        transform: translateZ(0);
      }

      .ecosystem--started .ecosystem__step {
        animation: ecosystem-node-activate var(--_flow-cycle-duration)
          var(--nxt1-motion-easing-inOut) infinite;
        animation-delay: calc(var(--_flow-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem-card__trace-edge--top {
        animation: ecosystem-trace-top var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_flow-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem-card__trace-edge--right {
        animation: ecosystem-trace-right var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_flow-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem-card__trace-edge--bottom {
        animation: ecosystem-trace-bottom var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_flow-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem-card__trace-edge--left {
        animation: ecosystem-trace-left var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_flow-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem__connector-line::after {
        animation: ecosystem-connector-fill-horizontal var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_connector-index, 0) * var(--_flow-step-duration));
      }

      .ecosystem--started .ecosystem__connector .ecosystem__chevron {
        animation: ecosystem-chevron-hop var(--_flow-cycle-duration) linear infinite;
        animation-delay: calc(var(--_connector-index, 0) * var(--_flow-step-duration));
      }

      /* ---------- Closing copy ---------- */

      .ecosystem__copy {
        margin: var(--nxt1-spacing-10) 0 0;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .ecosystem__copy-accent {
        display: block;
        font-style: normal;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      /* ---------- Mobile (vertical flow) ---------- */

      @media (max-width: 767px) {
        .ecosystem {
          padding: var(--nxt1-spacing-6) var(--nxt1-spacing-3);
        }

        .ecosystem__header {
          margin-bottom: var(--nxt1-spacing-6);
        }

        .ecosystem__pipeline {
          gap: var(--nxt1-spacing-3);
          justify-items: center;
        }

        .ecosystem__step {
          width: 100%;
        }

        .ecosystem-card {
          width: 100%;
          min-height: calc(var(--nxt1-spacing-10) * 3);
          justify-content: center;
          gap: var(--nxt1-spacing-3);
          padding: var(--nxt1-spacing-4);
        }

        .ecosystem-card__badge {
          width: var(--nxt1-spacing-6);
          height: var(--nxt1-spacing-6);
          font-size: var(--nxt1-fontSize-sm);
        }

        .ecosystem-card__icon {
          width: var(--nxt1-spacing-6);
          height: var(--nxt1-spacing-6);
        }

        .ecosystem-card__icon--agent-x {
          width: calc(var(--nxt1-spacing-6) + var(--nxt1-spacing-4));
          height: calc(var(--nxt1-spacing-6) + var(--nxt1-spacing-4));
        }

        .ecosystem-card__title {
          width: 100%;
          text-align: center;
          font-size: var(--nxt1-fontSize-lg);
          line-height: var(--nxt1-lineHeight-snug);
        }

        .ecosystem-card__detail {
          width: 100%;
          max-width: none;
          margin-inline: auto;
          text-align: center;
          white-space: nowrap;
          font-size: var(--nxt1-fontSize-xs);
          line-height: var(--nxt1-lineHeight-relaxed);
        }

        .ecosystem__connector {
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
          gap: var(--nxt1-spacing-1);
          padding: var(--nxt1-spacing-1) 0;
        }

        .ecosystem__connector-line {
          width: 1px;
          height: var(--nxt1-spacing-4);
        }

        .ecosystem__connector-line::after {
          transform-origin: top center;
          transform: scaleY(0);
        }

        .ecosystem__chevron {
          transform: rotate(90deg);
        }

        .ecosystem--started .ecosystem__connector-line::after {
          animation-name: ecosystem-connector-fill-vertical;
        }

        .ecosystem--started .ecosystem__connector .ecosystem__chevron {
          animation-name: ecosystem-chevron-hop-vertical;
        }

        .ecosystem__copy {
          margin-top: var(--nxt1-spacing-6);
          font-size: var(--nxt1-fontSize-xs);
          line-height: var(--nxt1-lineHeight-normal);
        }
      }

      /* ---------- Desktop (horizontal flow) ---------- */

      @media (min-width: 768px) {
        .ecosystem__pipeline {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--nxt1-spacing-8);
        }

        .ecosystem__connector {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-1);
          position: absolute;
          top: 50%;
          right: calc(var(--nxt1-spacing-8) * -1);
          transform: translate(50%, -50%);
          width: var(--nxt1-spacing-8);
          z-index: 1;
        }

        .ecosystem__connector-line {
          width: calc(var(--nxt1-spacing-8) - var(--nxt1-spacing-4));
        }
      }

      /* ---------- Keyframes ---------- */

      @keyframes ecosystem-node-activate {
        0%,
        7%,
        36%,
        100% {
          transform: translateY(0);
          filter: none;
        }

        14%,
        24% {
          transform: translateY(calc(var(--nxt1-spacing-1) * -1));
        }

        17%,
        24% {
          filter: drop-shadow(0 0 var(--nxt1-spacing-2) var(--nxt1-color-alpha-primary30));
        }
      }

      @keyframes ecosystem-trace-top {
        0%,
        10%,
        38%,
        100% {
          opacity: 0;
          transform: scaleX(0);
        }

        12%,
        20% {
          opacity: 1;
        }

        12% {
          transform: scaleX(0);
        }

        20% {
          transform: scaleX(1);
        }

        34% {
          opacity: 1;
          transform: scaleX(1);
        }
      }

      @keyframes ecosystem-trace-right {
        0%,
        20%,
        38%,
        100% {
          opacity: 0;
          transform: scaleY(0);
        }

        20%,
        26% {
          opacity: 1;
        }

        20% {
          transform: scaleY(0);
        }

        26% {
          transform: scaleY(1);
        }

        34% {
          opacity: 1;
          transform: scaleY(1);
        }
      }

      @keyframes ecosystem-trace-bottom {
        0%,
        24% {
          opacity: 0;
          transform: scaleX(0);
        }

        24%,
        30% {
          opacity: 1;
        }

        24% {
          transform: scaleX(0);
        }

        30% {
          transform: scaleX(1);
        }

        34% {
          opacity: 1;
          transform: scaleX(1);
        }

        38%,
        100% {
          opacity: 0;
          transform: scaleX(0);
        }
      }

      @keyframes ecosystem-trace-left {
        0%,
        28% {
          opacity: 0;
          transform: scaleY(0);
        }

        28%,
        34% {
          opacity: 1;
        }

        28% {
          transform: scaleY(0);
        }

        34% {
          transform: scaleY(1);
        }

        38%,
        100% {
          opacity: 0;
          transform: scaleY(0);
        }
      }

      @keyframes ecosystem-connector-fill-horizontal {
        0%,
        10%,
        40%,
        100% {
          transform: scaleX(0);
        }

        18%,
        30% {
          transform: scaleX(1);
        }
      }

      @keyframes ecosystem-connector-fill-vertical {
        0%,
        10%,
        40%,
        100% {
          transform: scaleY(0);
        }

        18%,
        30% {
          transform: scaleY(1);
        }
      }

      @keyframes ecosystem-chevron-hop {
        0%,
        12%,
        42%,
        100% {
          opacity: 0.45;
          transform: translateX(0);
        }

        20%,
        30% {
          opacity: 1;
          transform: translateX(var(--nxt1-spacing-1));
        }
      }

      @keyframes ecosystem-chevron-hop-vertical {
        0%,
        12%,
        42%,
        100% {
          opacity: 0.45;
          transform: rotate(90deg) translateX(0);
        }

        20%,
        30% {
          opacity: 1;
          transform: rotate(90deg) translateX(var(--nxt1-spacing-1));
        }
      }

      /* ---------- Accessibility ---------- */

      @media (prefers-reduced-motion: reduce) {
        .ecosystem__step {
          will-change: auto;
        }

        .ecosystem--started .ecosystem__step,
        .ecosystem--started .ecosystem-card__trace-edge,
        .ecosystem--started .ecosystem__connector-line::after,
        .ecosystem--started .ecosystem__connector .ecosystem__chevron {
          animation: none;
        }

        .ecosystem__step {
          filter: none;
        }

        .ecosystem-card {
          transition: none;
        }

        .ecosystem-card:hover {
          transform: none;
        }

        .ecosystem__chevron {
          opacity: 0.6;
        }

        .ecosystem-card__trace-edge,
        .ecosystem__connector-line::after {
          transform: none;
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtEcosystemMapComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  /** Pipeline steps rendered in sequence. */
  readonly steps = input<readonly EcosystemMapStep[]>(DEFAULT_STEPS);

  /**
   * Stable identifier prefix used for all ARIA `id` attributes.
   *
   * **Why an input instead of a counter?**
   * Module-level counters (`let n = 0; n++`) persist across SSR requests inside
   * the same Node.js worker. Request 1 produces `ecosystem-map-0`, request 2
   * produces `ecosystem-map-1`, but the **client always restarts at 0** —
   * causing Angular hydration mismatch warnings (NG0500).
   *
   * A deterministic default guarantees server and client emit identical IDs.
   * Override when multiple instances coexist on one page:
   *
   * ```html
   * <nxt1-ecosystem-map id="primary-pipeline" />
   * <nxt1-ecosystem-map id="secondary-pipeline" />
   * ```
   */
  readonly id = input('ecosystem-map');
  protected readonly animationStarted = signal(false);

  /** Derived heading ID — deterministic for SSR hydration safety. */
  protected readonly headingId = computed(() => `${this.id()}-heading`);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const startAnimations = (): void => {
      requestAnimationFrame(() => {
        this.animationStarted.set(true);
      });
    };

    if (document.readyState === 'complete') {
      startAnimations();
      return;
    }

    const onWindowLoad = (): void => {
      startAnimations();
    };

    window.addEventListener('load', onWindowLoad, { once: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('load', onWindowLoad);
    });
  }
}
