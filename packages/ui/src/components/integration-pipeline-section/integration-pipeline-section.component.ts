import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

/**
 * Represents a single node in the integration pipeline.
 * Each node has a label, icon SVG path(s), and categorization for styling.
 */
interface PipelineNode {
  readonly id: string;
  readonly label: string;
  /** Standard 24×24 SVG path data. Ignored for the core node which uses Agent X logo. */
  readonly iconPath: string;
  readonly category: 'source' | 'output';
  /** Optional second line of text below the label */
  readonly sublabel?: string;
}

/**
 * Source platforms — where athlete data currently lives.
 * Displayed in a 2×2 grid on the left side.
 */
const SOURCE_NODES: readonly PipelineNode[] = [
  {
    id: 'hudl',
    label: 'Hudl',
    sublabel: 'Game Film',
    category: 'source',
    iconPath: 'M8 5v14l11-7z',
  },
  {
    id: 'maxpreps',
    label: 'MaxPreps',
    sublabel: 'Stats & Scores',
    category: 'source',
    iconPath: 'M3 3v18h18v-2H5V3H3zm4 12h2V9H7v6zm4 0h2V5h-2v10zm4 0h2V7h-2v8z',
  },
  {
    id: 'roster-data',
    label: 'Roster Data',
    sublabel: 'Teams & Players',
    category: 'source',
    iconPath:
      'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  },
  {
    id: 'schedule',
    label: 'Schedules',
    sublabel: 'Games & Events',
    category: 'source',
    iconPath:
      'M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
  },
] as const;

/**
 * Output destinations — where NXT1 distributes enhanced content.
 * Displayed in a 2×2 grid on the right side.
 */
const OUTPUT_NODES: readonly PipelineNode[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    sublabel: 'Auto-Graphics',
    category: 'output',
    iconPath:
      'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 01-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 017.8 2zm-.2 2A3.6 3.6 0 004 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 003.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6z',
  },
  {
    id: 'twitter',
    label: '𝕏 / Twitter',
    sublabel: 'Auto-Posts',
    category: 'output',
    iconPath:
      'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    id: 'email',
    label: 'Email',
    sublabel: 'Coach Outreach',
    category: 'output',
    iconPath:
      'M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  },
  {
    id: 'profile',
    label: 'NXT1 Profile',
    sublabel: 'SEO Landing Page',
    category: 'output',
    iconPath:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1a2 2 0 002 2v1.93zm6.9-2.54A1.98 1.98 0 0016 16h-1v-3a1 1 0 00-1-1H8v-2h2a1 1 0 001-1V7h2a2 2 0 002-2v-.41a7.984 7.984 0 013.9 12.8z',
  },
] as const;

let integrationPipelineInstanceCounter = 0;

@Component({
  selector: 'nxt1-integration-pipeline-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="ip" [attr.aria-labelledby]="titleId()">
      <div class="ip__shell">
        <!-- Section header -->
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Seamless Integration"
          title="We Scrape. We Enhance."
          accentText="We Launch."
          [headingLevel]="headingLevel()"
          variant="hero"
          align="center"
          subtitle="Don't change your workflow. We sync directly with the tools you already use."
        />

        <!-- Animated pipeline visual -->
        <div
          class="ip__pipeline"
          role="img"
          aria-label="Data flows from Hudl, MaxPreps, Roster Data, and Schedules through the Agent X AI Engine and out to Instagram, Twitter, Email, and NXT1 Profiles"
        >
          <!-- Source nodes — 2×2 grid -->
          <div class="ip__grid ip__grid--sources">
            @for (node of sourceNodes(); track node.id; let i = $index) {
              <div class="ip__node ip__node--source" [style.animation-delay]="i * 100 + 'ms'">
                <div class="ip__node-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path [attr.d]="node.iconPath" />
                  </svg>
                </div>
                <div class="ip__node-text">
                  <span class="ip__node-label">{{ node.label }}</span>
                  @if (node.sublabel) {
                    <span class="ip__node-sublabel">{{ node.sublabel }}</span>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Flow connector: Sources → Core -->
          <div class="ip__connector" aria-hidden="true">
            <div class="ip__connector-line">
              <div class="ip__connector-particle ip__connector-particle--1"></div>
              <div class="ip__connector-particle ip__connector-particle--2"></div>
              <div class="ip__connector-particle ip__connector-particle--3"></div>
            </div>
            <svg
              class="ip__connector-chevron"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 4l6 6-6 6" />
            </svg>
          </div>

          <!-- Core node — Agent X -->
          <div class="ip__core">
            <div class="ip__core-icon">
              <!-- Agent X Logo SVG — identical to sidebar -->
              <svg
                class="ip__agent-x-logo"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <div class="ip__core-pulse" aria-hidden="true"></div>
              <div class="ip__core-pulse ip__core-pulse--delayed" aria-hidden="true"></div>
            </div>
            <span class="ip__core-label">Agent X</span>
            <span class="ip__core-sublabel">AI Engine</span>
          </div>

          <!-- Flow connector: Core → Outputs -->
          <div class="ip__connector" aria-hidden="true">
            <svg
              class="ip__connector-chevron"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 4l6 6-6 6" />
            </svg>
            <div class="ip__connector-line">
              <div class="ip__connector-particle ip__connector-particle--1"></div>
              <div class="ip__connector-particle ip__connector-particle--2"></div>
              <div class="ip__connector-particle ip__connector-particle--3"></div>
            </div>
          </div>

          <!-- Output nodes — 2×2 grid -->
          <div class="ip__grid ip__grid--outputs">
            @for (node of outputNodes(); track node.id; let i = $index) {
              <div class="ip__node ip__node--output" [style.animation-delay]="i * 100 + 350 + 'ms'">
                <div class="ip__node-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path [attr.d]="node.iconPath" />
                  </svg>
                </div>
                <div class="ip__node-text">
                  <span class="ip__node-label">{{ node.label }}</span>
                  @if (node.sublabel) {
                    <span class="ip__node-sublabel">{{ node.sublabel }}</span>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Bottom quote -->
        <blockquote class="ip__quote">
          <p class="ip__quote-text">
            Your film lives in <strong>Hudl</strong>. Your stats live in <strong>MaxPreps</strong>.
            Your career lives in <strong class="ip__quote-brand">NXT1</strong>.
          </p>
        </blockquote>
      </div>
    </section>
  `,
  styles: [
    `
      /* ─── Host ─── */
      :host {
        display: block;
      }

      /* ─── Section container ─── */
      .ip {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .ip__shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      /* ─── Pipeline visual ─── */
      .ip__pipeline {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        padding: var(--nxt1-spacing-6) 0;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* ─── 2×2 Grids (Sources & Outputs) ─── */
      .ip__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2_5);
        flex-shrink: 0;
      }

      /* ─── Individual node (horizontal card) ─── */
      .ip__node {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        animation: ip-node-enter var(--nxt1-motion-duration-normal, 300ms)
          var(--nxt1-motion-easing-default, ease) both;
        transition:
          border-color var(--nxt1-motion-duration-fast, 150ms) ease,
          background var(--nxt1-motion-duration-fast, 150ms) ease,
          transform var(--nxt1-motion-duration-fast, 150ms) ease;
      }

      .ip__node:hover {
        border-color: var(--nxt1-color-text-tertiary);
        background: var(--nxt1-color-surface-200);
        transform: scale(1.04);
      }

      .ip__node-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        transition: background var(--nxt1-motion-duration-fast, 150ms) ease;
      }

      .ip__node:hover .ip__node-icon {
        background: var(--nxt1-color-surface-300);
      }

      .ip__node-icon svg {
        width: 18px;
        height: 18px;
      }

      .ip__node-text {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5, 2px);
        min-width: 0;
      }

      .ip__node-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-none);
        letter-spacing: var(--nxt1-letterSpacing-normal);
        white-space: nowrap;
      }

      .ip__node-sublabel {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-none);
        white-space: nowrap;
      }

      /* ─── Core node — Agent X ─── */
      .ip__core {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-shrink: 0;
      }

      .ip__core-icon {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary40);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        transition:
          border-color var(--nxt1-motion-duration-fast, 150ms) ease,
          background var(--nxt1-motion-duration-fast, 150ms) ease,
          transform var(--nxt1-motion-duration-fast, 150ms) ease;
      }

      .ip__core:hover .ip__core-icon {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary20);
        transform: scale(1.06);
      }

      .ip__agent-x-logo {
        width: 36px;
        height: 36px;
        z-index: 1;
      }

      .ip__core-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-none);
      }

      .ip__core-sublabel {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-none);
        margin-top: calc(var(--nxt1-spacing-1) * -1);
      }

      /* Core pulse rings */
      .ip__core-pulse {
        position: absolute;
        inset: -8px;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        animation: ip-core-pulse 2.4s ease-in-out infinite;
        pointer-events: none;
      }

      .ip__core-pulse--delayed {
        inset: -14px;
        animation-delay: 0.8s;
      }

      /* ─── Connectors ─── */
      .ip__connector {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: 0 var(--nxt1-spacing-3);
        flex-shrink: 0;
      }

      .ip__connector-line {
        position: relative;
        width: 48px;
        height: 2px;
        background: var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
      }

      .ip__connector-chevron {
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-text-muted);
        flex-shrink: 0;
      }

      /* ─── Animated particles on connector lines ─── */
      .ip__connector-particle {
        position: absolute;
        top: 50%;
        left: -4px;
        width: 4px;
        height: 4px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        transform: translateY(-50%);
        animation: ip-particle-flow 2s ease-in-out infinite;
        opacity: 0;
      }

      .ip__connector-particle--2 {
        animation-delay: 0.6s;
      }

      .ip__connector-particle--3 {
        animation-delay: 1.2s;
      }

      /* ─── Bottom quote ─── */
      .ip__quote {
        margin: 0;
        padding: 0;
        text-align: center;
      }

      .ip__quote-text {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .ip__quote-text strong {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .ip__quote-brand {
        color: var(--nxt1-color-primary) !important;
      }

      /* ─── Animations ─── */
      @keyframes ip-node-enter {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes ip-core-pulse {
        0%,
        100% {
          opacity: 0.4;
          transform: scale(1);
        }
        50% {
          opacity: 0;
          transform: scale(1.3);
        }
      }

      @keyframes ip-particle-flow {
        0% {
          left: -4px;
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% {
          left: calc(100% + 4px);
          opacity: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .ip__node {
          animation: none;
        }
        .ip__core-pulse {
          animation: none;
          display: none;
        }
        .ip__connector-particle {
          animation: none;
          display: none;
        }
        .ip__node:hover,
        .ip__core:hover .ip__core-icon {
          transform: none;
        }
      }

      /* ─── Mobile: Vertical layout ─── */
      @media (max-width: 767px) {
        .ip {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-4);
        }

        .ip__pipeline {
          flex-direction: column;
          gap: 0;
          padding: var(--nxt1-spacing-4) 0;
          overflow-x: visible;
        }

        .ip__grid {
          grid-template-columns: 1fr 1fr;
          gap: var(--nxt1-spacing-2);
          width: 100%;
          max-width: 320px;
        }

        .ip__node {
          padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2);
        }

        .ip__node-icon {
          width: 30px;
          height: 30px;
        }

        .ip__node-icon svg {
          width: 15px;
          height: 15px;
        }

        .ip__connector {
          flex-direction: column;
          padding: var(--nxt1-spacing-2) 0;
        }

        .ip__connector-line {
          width: 2px;
          height: 28px;
        }

        .ip__connector-chevron {
          transform: rotate(90deg);
        }

        /* Vertical particle flow */
        .ip__connector-particle {
          left: 50%;
          top: -4px;
          transform: translateX(-50%);
          animation-name: ip-particle-flow-vertical;
        }

        .ip__core-icon {
          width: 60px;
          height: 60px;
        }

        .ip__agent-x-logo {
          width: 30px;
          height: 30px;
        }

        .ip__quote-text {
          font-size: var(--nxt1-fontSize-base);
        }
      }

      @keyframes ip-particle-flow-vertical {
        0% {
          top: -4px;
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% {
          top: calc(100% + 4px);
          opacity: 0;
        }
      }

      /* ─── Tablet tweaks ─── */
      @media (min-width: 768px) and (max-width: 1023px) {
        .ip__node {
          padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2);
        }

        .ip__node-icon {
          width: 32px;
          height: 32px;
        }

        .ip__node-icon svg {
          width: 16px;
          height: 16px;
        }

        .ip__core-icon {
          width: 60px;
          height: 60px;
        }

        .ip__agent-x-logo {
          width: 30px;
          height: 30px;
        }

        .ip__connector-line {
          width: 32px;
        }

        .ip__connector {
          padding: 0 var(--nxt1-spacing-2);
        }
      }

      /* ─── Large desktop ─── */
      @media (min-width: 1200px) {
        .ip__connector-line {
          width: 64px;
        }

        .ip__connector {
          padding: 0 var(--nxt1-spacing-4);
        }

        .ip__node {
          padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
          gap: var(--nxt1-spacing-2_5);
        }

        .ip__node-icon {
          width: 40px;
          height: 40px;
        }

        .ip__node-icon svg {
          width: 20px;
          height: 20px;
        }

        .ip__core-icon {
          width: 80px;
          height: 80px;
        }

        .ip__agent-x-logo {
          width: 42px;
          height: 42px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtIntegrationPipelineSectionComponent {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  private readonly instanceId = ++integrationPipelineInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);
  readonly sourceNodes = input<readonly PipelineNode[]>(SOURCE_NODES);
  readonly outputNodes = input<readonly PipelineNode[]>(OUTPUT_NODES);

  readonly titleId = computed(() => `integration-pipeline-title-${this.instanceId}`);
}
