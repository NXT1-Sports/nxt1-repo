/**
 * @fileoverview Agent X Identity Section — Marketing Differentiation Block
 * @module @nxt1/ui/components/agent-x-identity-section
 * @version 3.0.0
 *
 * Shared section used on Agent X landing surfaces to communicate
 * product identity and domain specialization.
 *
 * "The Ultimate AI Sports Coordinators" — differentiates Agent X
 * from generic AI assistants by visualising domain-specific inputs
 * as a tree branching from a central "Agent X Brain" node.
 *
 * Visual features:
 * - Each tree node has a design-token SVG icon via NxtIconComponent
 * - Staggered CSS "learning" animation cycles through nodes sequentially
 *   (border glow + icon highlight pulse — like an AI scanning/processing)
 * - Brain root uses same borderRadius-lg as child nodes for visual harmony
 *
 * Design constraints:
 * - 100% design-token driven — zero hardcoded colors, fonts, or sizes
 * - SSR-safe — deterministic heading IDs via monotonic counter, no browser APIs
 *   (CSS-only animation — no `afterNextRender`, no IntersectionObserver)
 * - Semantic HTML5 (`<section>`, `<figure>`, `<figcaption>`, `<ul>`, `<h3>`)
 * - Delegates header to shared `NxtSectionHeaderComponent` (no duplication)
 * - `prefers-reduced-motion` fully respected
 * - Mobile-first responsive
 *
 * @example
 * ```html
 * <!-- Default usage -->
 * <nxt1-agent-x-identity-section />
 *
 * <!-- Custom inputs -->
 * <nxt1-agent-x-identity-section [inputs]="customInputs" />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';
import { NxtIconComponent } from '../icon';

// ============================================
// TYPES
// ============================================

/** A single knowledge-domain input feeding the Agent X Brain. */
export interface IdentityTreeInput {
  /** Stable unique id for `@for` tracking and SSR hydration. */
  readonly id: string;
  /** Design-token icon name from the icon registry. */
  readonly icon: string;
  /** Short label displayed as the node heading. */
  readonly title: string;
  /** Supporting sentence explaining the domain's value. */
  readonly description: string;
}

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_TREE_INPUTS: readonly IdentityTreeInput[] = [
  {
    id: 'ncaa-rulebook',
    icon: 'school',
    title: 'NCAA Rulebook',
    description: 'Compliance-aware guidance grounded in recruiting regulation context.',
  },
  {
    id: 'sport-specific-strategy',
    icon: 'football',
    title: 'Sport-Specific Strategy',
    description: 'Playbook-level direction tuned for the realities of each sport and position.',
  },
  {
    id: 'viral-design-trends',
    icon: 'sparkles',
    title: 'Viral Design Trends',
    description: 'Elite creative standards for graphics and content that actually earns attention.',
  },
  {
    id: 'verified-stats',
    icon: 'barChart',
    title: 'Verified Stats',
    description: 'Data-backed decision support built on trusted and performance-relevant metrics.',
  },
];

/** Monotonic counter for deterministic, SSR-hydration-safe IDs. */
let identitySectionInstanceCounter = 0;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-agent-x-identity-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent, NxtIconComponent],
  template: `
    <section class="identity-section" [attr.aria-labelledby]="titleId()">
      <div class="identity-shell">
        <!-- Copy — shared section header (eyebrow + title + subtitle) -->
        <div class="identity-copy">
          <nxt1-section-header
            [titleId]="titleId()"
            eyebrow="The Ultimate AI Sports Coordinators"
            title="It doesn't just know code."
            accentText="It knows Ball."
            [headingLevel]="2"
            variant="hero"
            subtitle="Agent X is built for sports. It is trained on real recruiting context, sport-specific strategy, compliance-aware decision patterns, and elite design principles so output is accurate, relevant, and ready for game-speed execution."
          />
        </div>

        <!-- Tree visualisation — "Brain" node + 4 domain branches -->
        <figure class="identity-tree" [attr.aria-label]="'Agent X Brain knowledge inputs'">
          <figcaption class="sr-only">Agent X Brain fed by four core knowledge domains</figcaption>

          <!-- Root node — same rounded edges as branch nodes -->
          <div class="tree-root" role="img" aria-label="Agent X Brain">
            <span class="tree-root__icon" aria-hidden="true">
              <nxt1-icon name="sparklesFilled" [size]="18" />
            </span>
            <span class="tree-root__label">Agent X Brain</span>
          </div>

          <div class="tree-trunk" aria-hidden="true"></div>

          <ul class="tree-branch-list" role="list">
            @for (item of inputs(); track item.id; let i = $index) {
              <li class="tree-node" [class]="'tree-node tree-node--idx-' + i" role="listitem">
                <span class="tree-node__connector" aria-hidden="true"></span>

                <span class="tree-node__icon" aria-hidden="true">
                  <nxt1-icon [name]="item.icon" [size]="18" />
                </span>

                <h3 class="tree-node__title">{{ item.title }}</h3>
                <p class="tree-node__description">{{ item.description }}</p>
              </li>
            }
          </ul>
        </figure>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
         HOST
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         SECTION SHELL
         ============================================ */
      .identity-section {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .identity-shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      @media (min-width: 992px) {
        .identity-shell {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: center;
          gap: var(--nxt1-spacing-10);
        }
      }

      /* ============================================
         COPY (delegates to NxtSectionHeaderComponent)
         ============================================ */
      .identity-copy {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         TREE FIGURE — container card
         ============================================ */
      .identity-tree {
        margin: 0;
        padding: var(--nxt1-spacing-6);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
      }

      /* ============================================
         TREE ROOT — "Agent X Brain" card
         Same borderRadius-lg as child nodes for visual harmony.
         ============================================ */
      .tree-root {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary10);
        animation: nxt1-brain-pulse 8s ease-in-out infinite;
      }

      .tree-root__icon {
        display: inline-flex;
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .tree-root__label {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-align: center;
        white-space: nowrap;
      }

      /* ============================================
         TREE TRUNK — vertical line from root to branches
         ============================================ */
      .tree-trunk {
        width: 1px;
        height: var(--nxt1-spacing-6);
        margin: 0 auto;
        background: var(--nxt1-color-border-default);
      }

      /* ============================================
         TREE BRANCH LIST — 2×2 grid with horizontal bar
         ============================================ */
      .tree-branch-list {
        position: relative;
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      /* Horizontal connector bar — visible ≥576 px (2-col mode) */
      .tree-branch-list::before {
        content: '';
        position: absolute;
        top: 0;
        left: 25%;
        right: 25%;
        height: 1px;
        background: var(--nxt1-color-border-default);
        display: none;
      }

      @media (min-width: 576px) {
        .tree-branch-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: var(--nxt1-spacing-3);
          row-gap: var(--nxt1-spacing-4);
        }

        .tree-branch-list::before {
          display: block;
        }
      }

      /* ============================================
         TREE NODE — individual input card
         ============================================ */
      .tree-node {
        position: relative;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: auto auto;
        column-gap: var(--nxt1-spacing-2_5);
        row-gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-4);
        padding-top: calc(var(--nxt1-spacing-4) + var(--nxt1-spacing-3));
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        transition:
          border-color var(--nxt1-motion-duration-normal, 300ms)
            var(--nxt1-motion-easing-default, ease),
          box-shadow var(--nxt1-motion-duration-normal, 300ms)
            var(--nxt1-motion-easing-default, ease);
      }

      /* Vertical stub connecting node to horizontal bar */
      .tree-node__connector {
        position: absolute;
        top: calc(var(--nxt1-spacing-3) * -1);
        left: 50%;
        width: 1px;
        height: var(--nxt1-spacing-3);
        transform: translateX(-50%);
        background: var(--nxt1-color-border-default);
      }

      /* ---- Icon badge — row-spanning left column ---- */
      .tree-node__icon {
        grid-row: 1 / 3;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-9, 2.25rem);
        height: var(--nxt1-spacing-9, 2.25rem);
        flex-shrink: 0;
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-primary);
        transition:
          background var(--nxt1-motion-duration-normal, 300ms)
            var(--nxt1-motion-easing-default, ease),
          color var(--nxt1-motion-duration-normal, 300ms) var(--nxt1-motion-easing-default, ease),
          border-color var(--nxt1-motion-duration-normal, 300ms)
            var(--nxt1-motion-easing-default, ease);
      }

      .tree-node__title {
        margin: 0;
        align-self: end;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .tree-node__description {
        margin: 0;
        grid-column: 2;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         LEARNING ANIMATION — sequential highlight cycle
         Total cycle: 8s (4 nodes × 2s each)
         Each node lights up for ~1.6s out of 8s (20%)
         Uses border-glow + icon fill to mimic "processing"
         ============================================ */

      /* Brain root subtle pulse — synchronized with children */
      @keyframes nxt1-brain-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
        12%,
        37%,
        62%,
        87% {
          box-shadow:
            0 0 0 1px var(--nxt1-color-alpha-primary20),
            0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary10);
        }
        25%,
        50%,
        75% {
          box-shadow: 0 0 0 0 transparent;
        }
      }

      /* Node 0: active at 0–20% of 8s cycle */
      @keyframes nxt1-learn-0 {
        0% {
          border-color: var(--nxt1-color-alpha-primary30);
          box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary20);
        }
        5% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        18% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        25% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        100% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
      }

      @keyframes nxt1-learn-icon-0 {
        0% {
          background: var(--nxt1-color-surface-100);
          color: var(--nxt1-color-primary);
        }
        5% {
          background: var(--nxt1-color-alpha-primary10);
          color: var(--nxt1-color-primary);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        18% {
          background: var(--nxt1-color-alpha-primary10);
          color: var(--nxt1-color-primary);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        25% {
          background: var(--nxt1-color-surface-100);
          color: var(--nxt1-color-primary);
          border-color: var(--nxt1-color-border-subtle);
        }
        100% {
          background: var(--nxt1-color-surface-100);
          color: var(--nxt1-color-primary);
          border-color: var(--nxt1-color-border-subtle);
        }
      }

      /* Node 1: active at 25–45% */
      @keyframes nxt1-learn-1 {
        0%,
        24% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        30% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        43% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        50% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        100% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
      }

      @keyframes nxt1-learn-icon-1 {
        0%,
        24% {
          background: var(--nxt1-color-surface-100);
        }
        30% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        43% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        50% {
          background: var(--nxt1-color-surface-100);
          border-color: var(--nxt1-color-border-subtle);
        }
        100% {
          background: var(--nxt1-color-surface-100);
          border-color: var(--nxt1-color-border-subtle);
        }
      }

      /* Node 2: active at 50–70% */
      @keyframes nxt1-learn-2 {
        0%,
        49% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        55% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        68% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        75% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        100% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
      }

      @keyframes nxt1-learn-icon-2 {
        0%,
        49% {
          background: var(--nxt1-color-surface-100);
        }
        55% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        68% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        75% {
          background: var(--nxt1-color-surface-100);
          border-color: var(--nxt1-color-border-subtle);
        }
        100% {
          background: var(--nxt1-color-surface-100);
          border-color: var(--nxt1-color-border-subtle);
        }
      }

      /* Node 3: active at 75–95% */
      @keyframes nxt1-learn-3 {
        0%,
        74% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
        80% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        93% {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 var(--nxt1-spacing-3) var(--nxt1-color-alpha-primary20);
        }
        100% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }
      }

      @keyframes nxt1-learn-icon-3 {
        0%,
        74% {
          background: var(--nxt1-color-surface-100);
        }
        80% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        93% {
          background: var(--nxt1-color-alpha-primary10);
          border-color: var(--nxt1-color-alpha-primary30);
        }
        100% {
          background: var(--nxt1-color-surface-100);
          border-color: var(--nxt1-color-border-subtle);
        }
      }

      /* Apply per-node animation */
      .tree-node--idx-0 {
        animation: nxt1-learn-0 8s ease-in-out infinite;
      }
      .tree-node--idx-0 .tree-node__icon {
        animation: nxt1-learn-icon-0 8s ease-in-out infinite;
      }

      .tree-node--idx-1 {
        animation: nxt1-learn-1 8s ease-in-out infinite;
      }
      .tree-node--idx-1 .tree-node__icon {
        animation: nxt1-learn-icon-1 8s ease-in-out infinite;
      }

      .tree-node--idx-2 {
        animation: nxt1-learn-2 8s ease-in-out infinite;
      }
      .tree-node--idx-2 .tree-node__icon {
        animation: nxt1-learn-icon-2 8s ease-in-out infinite;
      }

      .tree-node--idx-3 {
        animation: nxt1-learn-3 8s ease-in-out infinite;
      }
      .tree-node--idx-3 .tree-node__icon {
        animation: nxt1-learn-icon-3 8s ease-in-out infinite;
      }

      /* ============================================
         SCREEN READER ONLY
         ============================================ */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      /* ============================================
         RESPONSIVE — mobile single-column adjustments
         ============================================ */
      @media (max-width: 575px) {
        .identity-tree {
          padding: var(--nxt1-spacing-4);
        }

        .tree-trunk {
          height: var(--nxt1-spacing-4);
        }

        .tree-node {
          padding: var(--nxt1-spacing-3);
          padding-top: calc(var(--nxt1-spacing-3) + var(--nxt1-spacing-3));
        }

        .tree-node__icon {
          width: var(--nxt1-spacing-8, 2rem);
          height: var(--nxt1-spacing-8, 2rem);
        }
      }

      /* ============================================
         REDUCED MOTION — respect user preference
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXIdentitySectionComponent {
  private readonly instanceId = ++identitySectionInstanceCounter;

  /** Agent X knowledge-domain inputs displayed as tree branches. */
  readonly inputs = input<readonly IdentityTreeInput[]>(DEFAULT_TREE_INPUTS);

  /** Deterministic heading ID — SSR-hydration safe via monotonic counter. */
  readonly titleId = computed(() => `agent-x-identity-title-${this.instanceId}`);
}
