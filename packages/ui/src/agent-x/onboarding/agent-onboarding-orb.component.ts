/**
 * @fileoverview Agent Onboarding Orb — Shared Animated Logo
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Shared animated orb component used across Agent X onboarding steps.
 * Renders the pulsing concentric rings with the Agent X bolt-mark logo
 * at center. Size is variant-driven — no duplicate markup needed.
 *
 * Uses the single-source-of-truth SVG constants from
 * `@nxt1/ui/agent-x/fab/agent-x-logo.constants`.
 *
 * ⭐ SHARED SUB-COMPONENT — Used by Welcome & Goals steps ⭐
 *
 * @example
 * ```html
 * <!-- Large (welcome step) -->
 * <nxt1-agent-onboarding-orb size="lg" />
 *
 * <!-- Medium (goals step) -->
 * <nxt1-agent-onboarding-orb size="md" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../fab/agent-x-logo.constants';

/** Orb size variant */
export type OrbSize = 'lg' | 'md';

@Component({
  selector: 'nxt1-agent-onboarding-orb',
  standalone: true,
  imports: [],
  host: {
    '[class]': '"onboarding-orb onboarding-orb--" + size()',
  },
  template: `
    <div class="orb-wrapper" aria-hidden="true">
      <div class="orb-ring orb-ring--outer"></div>
      <div class="orb-ring orb-ring--middle"></div>
      <div class="orb-ring orb-ring--inner"></div>
      <div class="orb-core">
        <svg
          class="orb-agent-logo"
          viewBox="0 0 612 792"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="12"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path [attr.d]="logoPath" />
          <polygon [attr.points]="logoPolygon" />
        </svg>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;

        /* Scoped orb sizing tokens — override per variant via host class */
        --_orb-wrapper: 132px;
        --_orb-outer: 132px;
        --_orb-middle: 98px;
        --_orb-inner: 66px;
        --_orb-core: 58px;
        --_orb-logo: 40px;
        --_orb-glow: var(--nxt1-glow-md);
      }

      .orb-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--_orb-wrapper);
        height: var(--_orb-wrapper);
      }

      .orb-ring {
        position: absolute;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-primary);
      }

      .orb-ring--outer {
        width: var(--_orb-outer);
        height: var(--_orb-outer);
        opacity: 0.1;
        animation: orb-pulse 3s ease-in-out infinite;
      }

      .orb-ring--middle {
        width: var(--_orb-middle);
        height: var(--_orb-middle);
        opacity: 0.2;
        animation: orb-pulse 3s ease-in-out 0.5s infinite;
      }

      .orb-ring--inner {
        width: var(--_orb-inner);
        height: var(--_orb-inner);
        opacity: 0.3;
        animation: orb-pulse 3s ease-in-out 1s infinite;
      }

      .orb-core {
        width: var(--_orb-core);
        height: var(--_orb-core);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        box-shadow: var(--_orb-glow);
      }

      .orb-agent-logo {
        width: var(--_orb-logo);
        height: var(--_orb-logo);
        color: var(--nxt1-color-bg-primary);
      }

      @keyframes orb-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.15;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.3;
        }
      }

      /* ──────────────────────────────────
       Size: lg (Welcome step)
      ────────────────────────────────── */
      :host(.onboarding-orb--lg) {
        --_orb-wrapper: 132px;
        --_orb-outer: 132px;
        --_orb-middle: 98px;
        --_orb-inner: 66px;
        --_orb-core: 58px;
        --_orb-logo: 40px;
        --_orb-glow: var(--nxt1-glow-md);
      }

      /* ──────────────────────────────────
       Size: md (Goals step)
      ────────────────────────────────── */
      :host(.onboarding-orb--md) {
        --_orb-wrapper: 112px;
        --_orb-outer: 112px;
        --_orb-middle: 84px;
        --_orb-inner: 58px;
        --_orb-core: 50px;
        --_orb-logo: 34px;
        --_orb-glow: var(--nxt1-glow-sm);
      }

      /* ──────────────────────────────────
       Mobile Responsive Overrides
    ────────────────────────────────── */
      @media (max-width: 480px) {
        :host(.onboarding-orb--lg) .orb-wrapper {
          width: 108px;
          height: 108px;
        }

        :host(.onboarding-orb--lg) .orb-ring--outer {
          width: 108px;
          height: 108px;
        }

        :host(.onboarding-orb--lg) .orb-ring--middle {
          width: 80px;
          height: 80px;
        }

        :host(.onboarding-orb--lg) .orb-ring--inner {
          width: 54px;
          height: 54px;
        }

        :host(.onboarding-orb--lg) .orb-core {
          width: 52px;
          height: 52px;
        }

        :host(.onboarding-orb--lg) .orb-agent-logo {
          width: 34px;
          height: 34px;
        }

        :host(.onboarding-orb--md) .orb-wrapper {
          width: 98px;
          height: 98px;
        }

        :host(.onboarding-orb--md) .orb-ring--outer {
          width: 98px;
          height: 98px;
        }

        :host(.onboarding-orb--md) .orb-ring--middle {
          width: 74px;
          height: 74px;
        }

        :host(.onboarding-orb--md) .orb-ring--inner {
          width: 50px;
          height: 50px;
        }

        :host(.onboarding-orb--md) .orb-core {
          width: 46px;
          height: 46px;
        }

        :host(.onboarding-orb--md) .orb-agent-logo {
          width: 30px;
          height: 30px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingOrbComponent {
  /** Orb size variant — 'lg' for welcome, 'md' for goals */
  readonly size = input<OrbSize>('lg');

  /** SVG logo path from shared constants (single source of truth) */
  protected readonly logoPath = AGENT_X_LOGO_PATH;

  /** SVG logo polygon from shared constants */
  protected readonly logoPolygon = AGENT_X_LOGO_POLYGON;
}
