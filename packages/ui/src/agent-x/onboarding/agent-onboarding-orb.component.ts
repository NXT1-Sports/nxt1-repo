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
      }

      .orb-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .orb-ring {
        position: absolute;
        border-radius: 50%;
        border: 1px solid var(--nxt1-color-primary);
      }

      .orb-core {
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
      }

      .orb-agent-logo {
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
      :host(.onboarding-orb--lg) .orb-wrapper {
        width: 132px;
        height: 132px;
      }

      :host(.onboarding-orb--lg) .orb-ring--outer {
        width: 132px;
        height: 132px;
        opacity: 0.1;
        animation: orb-pulse 3s ease-in-out infinite;
      }

      :host(.onboarding-orb--lg) .orb-ring--middle {
        width: 98px;
        height: 98px;
        opacity: 0.2;
        animation: orb-pulse 3s ease-in-out 0.5s infinite;
      }

      :host(.onboarding-orb--lg) .orb-ring--inner {
        width: 66px;
        height: 66px;
        opacity: 0.3;
        animation: orb-pulse 3s ease-in-out 1s infinite;
      }

      :host(.onboarding-orb--lg) .orb-core {
        width: 58px;
        height: 58px;
        box-shadow: 0 0 40px rgba(204, 255, 0, 0.3);
      }

      :host(.onboarding-orb--lg) .orb-agent-logo {
        width: 40px;
        height: 40px;
      }

      /* ──────────────────────────────────
       Size: md (Goals step)
    ────────────────────────────────── */
      :host(.onboarding-orb--md) .orb-wrapper {
        width: 112px;
        height: 112px;
      }

      :host(.onboarding-orb--md) .orb-ring--outer {
        width: 112px;
        height: 112px;
        opacity: 0.1;
        animation: orb-pulse 3s ease-in-out infinite;
      }

      :host(.onboarding-orb--md) .orb-ring--middle {
        width: 84px;
        height: 84px;
        opacity: 0.2;
        animation: orb-pulse 3s ease-in-out 0.5s infinite;
      }

      :host(.onboarding-orb--md) .orb-ring--inner {
        width: 58px;
        height: 58px;
        opacity: 0.3;
        animation: orb-pulse 3s ease-in-out 1s infinite;
      }

      :host(.onboarding-orb--md) .orb-core {
        width: 50px;
        height: 50px;
        box-shadow: 0 0 30px rgba(204, 255, 0, 0.25);
      }

      :host(.onboarding-orb--md) .orb-agent-logo {
        width: 34px;
        height: 34px;
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
