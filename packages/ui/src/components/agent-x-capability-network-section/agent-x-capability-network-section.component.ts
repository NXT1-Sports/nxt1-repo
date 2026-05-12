import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { NxtLogoComponent } from '../logo';

export interface CapabilityPrimaryNode {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface CapabilitySecondaryNode {
  readonly id: string;
  readonly parentId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

const CENTER = { x: 50, y: 50 } as const;

const PRIMARY_NODES: readonly CapabilityPrimaryNode[] = [
  { id: 'intel', label: 'Sports Intelligence', x: 34, y: 28 },
  { id: 'creative', label: 'Creative Director', x: 28, y: 70 },
  { id: 'workflow', label: 'Workflow Engine', x: 67, y: 28 },
  { id: 'ops', label: 'Operations Manager', x: 74, y: 68 },
  { id: 'analytics', label: 'Command Center', x: 50, y: 84 },
] as const;

const SECONDARY_NODES: readonly CapabilitySecondaryNode[] = [
  { id: 'intel-1', parentId: 'intel', label: 'Film Analysis', x: 23, y: 18 },
  { id: 'intel-2', parentId: 'intel', label: 'Risk Signals', x: 23, y: 36 },
  { id: 'intel-3', parentId: 'intel', label: 'Progression', x: 41, y: 17 },

  { id: 'creative-1', parentId: 'creative', label: 'Highlight Reels', x: 18, y: 60 },
  { id: 'creative-2', parentId: 'creative', label: 'Graphic Packs', x: 18, y: 80 },
  { id: 'creative-3', parentId: 'creative', label: 'Captions', x: 47, y: 70 },

  { id: 'workflow-1', parentId: 'workflow', label: 'Background Ops', x: 78, y: 18 },
  { id: 'workflow-2', parentId: 'workflow', label: 'Daily Briefings', x: 78, y: 36 },
  { id: 'workflow-3', parentId: 'workflow', label: 'Playbooks', x: 59, y: 17 },

  { id: 'ops-1', parentId: 'ops', label: 'Team Comms', x: 83, y: 60 },
  { id: 'ops-2', parentId: 'ops', label: 'Weekly Plans', x: 83, y: 79 },
  { id: 'ops-3', parentId: 'ops', label: 'Scheduling', x: 67, y: 86 },

  { id: 'analytics-1', parentId: 'analytics', label: 'Trend Signals', x: 41, y: 90 },
  { id: 'analytics-2', parentId: 'analytics', label: 'Outcome Plans', x: 61, y: 90 },
] as const;

const MOBILE_PRIMARY_NODES: readonly CapabilityPrimaryNode[] = [
  { id: 'intel', label: 'Sports Intelligence', x: 24, y: 31 },
  { id: 'creative', label: 'Creative Director', x: 25, y: 63 },
  { id: 'workflow', label: 'Workflow Engine', x: 76, y: 31 },
  { id: 'ops', label: 'Operations Manager', x: 75, y: 63 },
  { id: 'analytics', label: 'Command Center', x: 50, y: 83 },
] as const;

const MOBILE_SECONDARY_NODES: readonly CapabilitySecondaryNode[] = [
  { id: 'intel-1', parentId: 'intel', label: 'Film Analysis', x: 17, y: 17 },
  { id: 'intel-2', parentId: 'intel', label: 'Risk Signals', x: 16, y: 42 },
  { id: 'intel-3', parentId: 'intel', label: 'Progression', x: 39, y: 21 },

  { id: 'creative-1', parentId: 'creative', label: 'Highlight Reels', x: 15, y: 55 },
  { id: 'creative-2', parentId: 'creative', label: 'Graphic Packs', x: 17, y: 75 },
  { id: 'creative-3', parentId: 'creative', label: 'Captions', x: 38, y: 71 },

  { id: 'workflow-1', parentId: 'workflow', label: 'Background Ops', x: 83, y: 17 },
  { id: 'workflow-2', parentId: 'workflow', label: 'Daily Briefings', x: 84, y: 42 },
  { id: 'workflow-3', parentId: 'workflow', label: 'Playbooks', x: 61, y: 21 },

  { id: 'ops-1', parentId: 'ops', label: 'Team Comms', x: 84, y: 55 },
  { id: 'ops-2', parentId: 'ops', label: 'Weekly Plans', x: 83, y: 75 },
  { id: 'ops-3', parentId: 'ops', label: 'Scheduling', x: 62, y: 71 },

  { id: 'analytics-1', parentId: 'analytics', label: 'Trend Signals', x: 35, y: 93 },
  { id: 'analytics-2', parentId: 'analytics', label: 'Outcome Plans', x: 65, y: 93 },
] as const;

const CAPABILITY_PILLARS: readonly { id: string; title: string; detail: string }[] = [
  {
    id: 'intel',
    title: 'Break down complexity in real time',
    detail:
      'Agent X turns film, stats, and context into actionable intelligence so athletes, coaches, and program leaders can move faster.',
  },
  {
    id: 'orchestration',
    title: 'Execute complete workflows, not single tasks',
    detail:
      'From media production to outreach and follow-through, Agent X runs coordinated multi-step operations from one command center.',
  },
  {
    id: 'advantage',
    title: 'Compound your operational advantage',
    detail:
      'Every action connects to the broader system so your team captures stronger signals, clearer priorities, and better outcomes.',
  },
] as const;

@Component({
  selector: 'nxt1-agent-x-capability-network-section',
  standalone: true,
  imports: [NxtLogoComponent],
  template: `
    <section class="network" aria-labelledby="agent-x-network-title">
      <div class="network__shell">
        <h2 id="agent-x-network-title" class="network__sr-only">Agent X Capability Network</h2>
        <div class="network__layout">
          <aside class="network__copy" aria-label="Agent X capability summary">
            <ol class="network__pillars" aria-label="Core Agent X capabilities">
              @for (pillar of capabilityPillars; track pillar.id) {
                <li class="network__pillar">
                  <h3 class="network__pillar-title">{{ pillar.title }}</h3>
                  <p class="network__pillar-detail">{{ pillar.detail }}</p>
                </li>
              }
            </ol>
          </aside>

          <article class="network__canvas" role="img" aria-label="Agent X capability network map">
            <svg
              class="network__lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              @for (line of centerLines(); track line.id) {
                <line
                  [attr.x1]="line.x1"
                  [attr.y1]="line.y1"
                  [attr.x2]="line.x2"
                  [attr.y2]="line.y2"
                  class="network__line network__line--primary"
                />
              }
              @for (line of branchLines(); track line.id) {
                <line
                  [attr.x1]="line.x1"
                  [attr.y1]="line.y1"
                  [attr.x2]="line.x2"
                  [attr.y2]="line.y2"
                  class="network__line network__line--secondary"
                />
              }
            </svg>

            <div class="network__center" [style.left.%]="center.x" [style.top.%]="center.y">
              <div class="network__center-orb" aria-hidden="true"></div>
              <nxt1-logo variant="footer" [size]="isMobileViewport ? 'xs' : 'sm'" />
            </div>

            @for (node of primaryNodes; track node.id) {
              <div
                class="network__node network__node--primary"
                [style.left.%]="node.x"
                [style.top.%]="node.y"
              >
                {{ node.label }}
              </div>
            }

            @for (node of secondaryNodes; track node.id) {
              <div
                class="network__node network__node--secondary"
                [style.left.%]="node.x"
                [style.top.%]="node.y"
              >
                {{ node.label }}
              </div>
            }
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .network__sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }

      .network {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .network__shell {
        display: grid;
      }

      .network__layout {
        display: grid;
        gap: var(--nxt1-spacing-10, 40px);
      }

      .network__copy {
        display: grid;
        align-content: start;
        gap: var(--nxt1-spacing-8, 32px);
      }

      .network__pillars {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--nxt1-spacing-6, 24px);
      }

      .network__pillar {
        padding-top: var(--nxt1-spacing-5, 20px);
        border-top: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 44%, transparent);
      }

      .network__pillar-title {
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: clamp(1.125rem, 1.5vw, 1.5rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary, #f3f4f6);
        line-height: 1.25;
      }

      .network__pillar-detail {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        color: var(--nxt1-color-text-secondary, #9ca3af);
        line-height: var(--nxt1-lineHeight-relaxed, 1.7);
      }

      .network__canvas {
        position: relative;
        isolation: isolate;
        min-height: 620px;
        border-radius: 0;
        border: none;
        background: transparent;
        box-shadow: none;
        overflow: hidden;
      }

      .network__canvas::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: linear-gradient(
          to right,
          color-mix(in srgb, var(--nxt1-color-border-subtle) 20%, transparent) 1px,
          transparent 1px
        );
        background-size: 140px 100%;
        opacity: 0.1;
        pointer-events: none;
      }

      .network__lines {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .network__line {
        stroke-linecap: round;
      }

      .network__line--primary {
        stroke: color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent);
        stroke-width: 0.24;
      }

      .network__line--secondary {
        stroke: color-mix(in srgb, var(--nxt1-color-border-subtle) 45%, transparent);
        stroke-width: 0.18;
      }

      .network__center {
        position: absolute;
        transform: translate(-50%, -50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
      }

      .network__center-orb {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 180px;
        height: 180px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        background: radial-gradient(
          circle,
          color-mix(in srgb, var(--nxt1-color-primary) 20%, transparent) 0%,
          transparent 70%
        );
        filter: blur(8px);
        z-index: -1;
      }

      .network__node {
        position: absolute;
        transform: translate(-50%, -50%);
        white-space: nowrap;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .network__node--primary {
        padding: 8px 14px;
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary, #f3f4f6);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 56%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 76%, transparent);
      }

      .network__node--secondary {
        padding: 4px 9px;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, #a3a3a3);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 50%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 58%, transparent);
      }

      @media (min-width: 1100px) {
        .network__layout {
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          align-items: center;
          column-gap: var(--nxt1-spacing-10, 40px);
        }
      }

      @media (max-width: 1024px) {
        .network__canvas {
          min-height: 560px;
        }

        .network__node--primary {
          font-size: var(--nxt1-fontSize-sm, 0.875rem);
          padding: 7px 12px;
        }

        .network__node--secondary {
          font-size: var(--nxt1-fontSize-xs, 0.75rem);
          padding: 4px 8px;
        }
      }

      @media (max-width: 767px) {
        .network {
          padding-inline: var(--nxt1-section-padding-x);
        }

        .network__layout {
          gap: var(--nxt1-spacing-8, 32px);
        }

        .network__copy {
          gap: var(--nxt1-spacing-6, 24px);
        }

        .network__pillar-detail {
          font-size: var(--nxt1-fontSize-base, 1rem);
        }

        .network__canvas {
          width: calc(100% + (var(--nxt1-section-padding-x) * 2));
          margin-inline: calc(-1 * var(--nxt1-section-padding-x));
          min-height: 760px;
          overflow: visible;
        }

        .network__node--primary {
          white-space: nowrap;
          text-align: center;
          font-size: 0.71875rem;
          line-height: 1.15;
          padding: 7px 9px;
          box-shadow: 0 10px 24px color-mix(in srgb, var(--nxt1-color-bg-primary) 70%, transparent);
        }

        .network__node--secondary {
          white-space: nowrap;
          text-align: center;
          font-size: 0.625rem;
          line-height: 1.12;
          padding: 5px 7px;
          background: color-mix(in srgb, var(--nxt1-color-surface-200) 72%, transparent);
          box-shadow: 0 8px 18px color-mix(in srgb, var(--nxt1-color-bg-primary) 78%, transparent);
        }

        .network__center-orb {
          width: 120px;
          height: 120px;
        }

        .network__line--primary {
          stroke-width: 0.2;
          opacity: 0.7;
        }

        .network__line--secondary {
          stroke-width: 0.13;
          opacity: 0.55;
        }
      }

      @media (max-width: 420px) {
        .network__canvas {
          min-height: 800px;
        }

        .network__node--primary {
          font-size: 0.6875rem;
          padding-inline: 8px;
        }

        .network__node--secondary {
          font-size: 0.59375rem;
          padding-inline: 6px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .network__canvas,
        .network__node,
        .network__line {
          transition: none;
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXCapabilityNetworkSectionComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected isMobileViewport = false;

  protected readonly center = CENTER;
  protected primaryNodes: readonly CapabilityPrimaryNode[] = PRIMARY_NODES;
  protected secondaryNodes: readonly CapabilitySecondaryNode[] = SECONDARY_NODES;
  protected readonly capabilityPillars = CAPABILITY_PILLARS;

  protected centerLines(): ReadonlyArray<{
    readonly id: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }> {
    return this.primaryNodes.map((node) => ({
      id: `c-${node.id}`,
      x1: CENTER.x,
      y1: CENTER.y,
      x2: node.x,
      y2: node.y,
    }));
  }

  protected branchLines(): ReadonlyArray<{
    readonly id: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }> {
    return this.secondaryNodes.map((node) => {
      const parent = this.primaryNodes.find((item) => item.id === node.parentId);
      return {
        id: `b-${node.id}`,
        x1: parent?.x ?? CENTER.x,
        y1: parent?.y ?? CENTER.y,
        x2: node.x,
        y2: node.y,
      };
    });
  }

  ngOnInit(): void {
    this.updateViewportMode();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportMode();
  }

  private updateViewportMode(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.isMobileViewport = false;
      this.primaryNodes = PRIMARY_NODES;
      this.secondaryNodes = SECONDARY_NODES;
      return;
    }

    this.isMobileViewport = window.innerWidth <= 767;
    this.primaryNodes = this.isMobileViewport ? MOBILE_PRIMARY_NODES : PRIMARY_NODES;
    this.secondaryNodes = this.isMobileViewport ? MOBILE_SECONDARY_NODES : SECONDARY_NODES;
  }
}
