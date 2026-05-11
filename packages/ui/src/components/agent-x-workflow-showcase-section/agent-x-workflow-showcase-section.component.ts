import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

type WorkflowModeId = 'game-plan' | 'outreach' | 'graphics' | 'leads' | 'performance' | 'admin';

interface WorkflowMode {
  readonly id: WorkflowModeId;
  readonly label: string;
  readonly coordinator: string;
  readonly coordinatorSummary: string;
  readonly request: string;
  readonly inputs: readonly string[];
  readonly quickStarts: readonly string[];
  readonly deliverables: readonly string[];
  readonly outcome: string;
}

const WORKFLOW_MODES: readonly WorkflowMode[] = [
  {
    id: 'game-plan',
    label: 'Weekly Plan',
    coordinator: 'Strategy Coordinator',
    coordinatorSummary: 'Builds the weekly operating plan your staff can actually run.',
    request: 'Build my weekly game plan and tell the staff what needs to happen next.',
    inputs: ['Team priorities', 'Schedule and opponent notes', 'Content and recruiting needs'],
    quickStarts: ['Build the game plan', 'Summarize focus areas', 'Set checkpoints'],
    deliverables: [
      'A weekly operating plan with priorities, owners, and timing',
      'A practice emphasis summary for the week',
      'Clear recruiting and content checkpoints to follow through on',
    ],
    outcome:
      'Instead of scattered reminders, your team gets one clear plan everyone can execute this week.',
  },
  {
    id: 'outreach',
    label: 'Coach Outreach',
    coordinator: 'Recruiting Coordinator',
    coordinatorSummary: 'Turns warm signals into coach outreach that is ready to send.',
    request: 'Find the best-fit programs and draft the next coach messages for me.',
    inputs: [
      'Coach views and replies',
      'Program fit signals',
      'Recent highlights and stat updates',
    ],
    quickStarts: ['Build target list', 'Draft outreach', 'Queue follow-ups'],
    deliverables: [
      'A ranked list of the programs that deserve attention first',
      'Coach outreach drafts personalized to the right contacts',
      'Follow-up timing so conversations do not stall out',
    ],
    outcome:
      'You get a prioritized outreach workflow with the list, the drafts, and the follow-up plan already mapped.',
  },
  {
    id: 'graphics',
    label: 'Content Pack',
    coordinator: 'Brand Coordinator',
    coordinatorSummary:
      'Turns a week of moments into a content package people can use immediately.',
    request: 'Turn this week’s best moments into graphics, captions, and a posting plan.',
    inputs: ['Top plays and performance moments', 'Brand style', 'Publishing windows'],
    quickStarts: ['Create highlight graphics', 'Draft captions', 'Build posting order'],
    deliverables: [
      'A set of social-ready graphics built from the best moments',
      'Caption options and hooks matched to the story of the week',
      'A posting sequence so content can go out without extra planning',
    ],
    outcome: 'You get a finished content pack, not just ideas about what to post.',
  },
  {
    id: 'leads',
    label: 'Lead Tracking',
    coordinator: 'Data Coordinator',
    coordinatorSummary: 'Turns scattered activity into clear recruiting signals and next steps.',
    request: 'Show me which programs are warming up and what I should do next.',
    inputs: ['Coach views and replies', 'Profile traffic spikes', 'Outreach performance'],
    quickStarts: ['Track warm leads', 'Rank high-intent programs', 'Flag momentum shifts'],
    deliverables: [
      'A board showing which programs are warming up',
      'Priority signals that explain why each lead matters',
      'Clear next actions based on the strength of the momentum',
    ],
    outcome: 'You stop guessing at interest and start working from a ranked list of real momentum.',
  },
  {
    id: 'performance',
    label: 'Performance Review',
    coordinator: 'Performance Coordinator',
    coordinatorSummary: 'Turns film and metrics into a concise review your staff can act on.',
    request: 'Review the film and stats, then show me what to improve this week.',
    inputs: ['Uploaded game film', 'Position metrics', 'Coach notes'],
    quickStarts: ['Summarize film review', 'List development points', 'Create player feedback'],
    deliverables: [
      'A film review summary with the most important patterns surfaced',
      'Development priorities that matter for the next week',
      'Coach-ready feedback that can be shared immediately',
    ],
    outcome:
      'You get a performance brief with the takeaways, the coaching points, and the next actions in one place.',
  },
  {
    id: 'admin',
    label: 'Ops Radar',
    coordinator: 'Admin Coordinator',
    coordinatorSummary:
      'Keeps deadlines, approvals, and follow-through visible for the whole staff.',
    request: 'Show me what deadlines need attention and what the staff should do next.',
    inputs: ['Schedules and milestones', 'Approvals and checkpoints', 'Open staff follow-through'],
    quickStarts: ['Surface deadlines', 'Write status recap', 'Schedule follow-through'],
    deliverables: [
      'A deadline radar showing what needs attention first',
      'A clean status recap the staff can work from',
      'A follow-through schedule so important work does not get lost',
    ],
    outcome: 'You get an operating recap with clear priorities so nothing important gets buried.',
  },
] as const;

@Component({
  selector: 'nxt1-agent-x-workflow-showcase-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="workflow-showcase" aria-labelledby="workflow-showcase-title">
      <div class="workflow-showcase__shell">
        <nxt1-section-header
          class="workflow-showcase__header"
          titleId="workflow-showcase-title"
          eyebrow="How You Can Use NXT1"
          align="center"
          [headingLevel]="2"
          title="Turn Requests Into Finished Work"
          subtitle="Pick a workflow and see how Agent X turns one request into context, deliverables, and an outcome your team can actually use."
        />

        <div class="workflow-showcase__modes" role="tablist" aria-label="Agent X workflow modes">
          @for (mode of workflowModes; track mode.id) {
            <button
              type="button"
              class="workflow-showcase__mode"
              role="tab"
              [attr.aria-selected]="activeModeId() === mode.id"
              [attr.tabindex]="activeModeId() === mode.id ? 0 : -1"
              [class.workflow-showcase__mode--active]="activeModeId() === mode.id"
              (click)="setActiveMode(mode.id)"
            >
              {{ mode.label }}
            </button>
          }
        </div>

        <div class="workflow-showcase__stage" role="img" aria-label="NXT1 workflow example">
          <div class="workflow-showcase__stage-grid" aria-hidden="true"></div>

          <article class="workflow-card workflow-card--left">
            <header class="workflow-card__bar"><span></span><span></span><span></span></header>
            <div class="workflow-card__content">
              <p class="workflow-card__eyebrow">Who Handles It</p>
              <div class="workflow-card__coordinator-row">
                <h3 class="workflow-card__coordinator">{{ activeMode().coordinator }}</h3>
              </div>
              <p class="workflow-card__summary">{{ activeMode().coordinatorSummary }}</p>

              <div class="workflow-card__prompt-shell">
                <p class="workflow-card__prompt-label">What You Ask</p>
                <p class="workflow-card__prompt">{{ activeMode().request }}</p>
              </div>

              <div class="workflow-card__inputs-block">
                <p class="workflow-card__block-title">What Agent X Uses</p>
                <ul class="workflow-card__list">
                  @for (item of activeMode().inputs; track $index) {
                    <li>{{ item }}</li>
                  }
                </ul>
              </div>
            </div>
          </article>

          <div class="workflow-showcase__stack">
            <article class="workflow-card workflow-card--rail">
              <p class="workflow-card__block-title">Where It Starts</p>
              <div class="workflow-card__action-list">
                @for (action of activeMode().quickStarts; track $index) {
                  <span class="workflow-card__action-chip">{{ action }}</span>
                }
              </div>
            </article>

            <article class="workflow-card workflow-card--rail">
              <h3 class="workflow-card__title">Clear Deliverables</h3>
              <ul class="workflow-card__steps">
                @for (step of activeMode().deliverables; track $index) {
                  <li>{{ step }}</li>
                }
              </ul>
              <p class="workflow-card__footnote">{{ activeMode().outcome }}</p>
            </article>
          </div>
        </div>

        <div class="workflow-showcase__footer">
          <h3 class="workflow-showcase__footer-title">Less Explaining. More Finished Work.</h3>
          <p class="workflow-showcase__footer-text">{{ activeMode().outcome }}</p>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .workflow-showcase {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .workflow-showcase__shell {
        display: grid;
        gap: var(--nxt1-spacing-6, 24px);
      }

      .workflow-showcase__header {
        margin-inline: auto;
      }

      .workflow-showcase__modes {
        margin: 0 auto;
        display: inline-flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 58%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 48%, transparent);
      }

      .workflow-showcase__mode {
        border: 0;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        padding: 7px 13px;
        color: var(--nxt1-color-text-tertiary, #a3a3a3);
        background: transparent;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        transition:
          background 0.2s ease,
          color 0.2s ease,
          transform 0.2s ease;
      }

      .workflow-showcase__mode:hover {
        color: var(--nxt1-color-text-primary, #f5f5f5);
        transform: translateY(-1px);
      }

      .workflow-showcase__mode--active {
        color: var(--nxt1-color-text-primary, #f5f5f5);
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 12%,
          var(--nxt1-color-surface-100) 88%
        );
      }

      .workflow-showcase__stage {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 44%, transparent);
        background:
          radial-gradient(
            circle at 72% 28%,
            color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 14%, transparent),
            transparent 38%
          ),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--nxt1-color-surface-100) 88%, var(--nxt1-color-bg-primary) 12%),
            color-mix(in srgb, var(--nxt1-color-surface-200) 78%, var(--nxt1-color-bg-primary) 22%)
          );
        min-height: 460px;
        padding: clamp(16px, 2.5vw, 24px);
        display: grid;
        grid-template-columns: minmax(0, 1.28fr) minmax(280px, 0.82fr);
        gap: clamp(14px, 2vw, 24px);
        align-items: start;
      }

      .workflow-showcase__stage-grid {
        position: absolute;
        inset: 0;
        background-image:
          repeating-linear-gradient(
            0deg,
            transparent 0,
            transparent 38px,
            color-mix(in srgb, var(--nxt1-color-border-subtle) 18%, transparent) 39px
          ),
          repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent 38px,
            color-mix(in srgb, var(--nxt1-color-border-subtle) 12%, transparent) 39px
          );
        opacity: 0.24;
        pointer-events: none;
      }

      .workflow-card {
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 35%, transparent);
        background: color-mix(
          in srgb,
          var(--nxt1-color-bg-primary) 92%,
          var(--nxt1-color-surface-100) 8%
        );
        box-shadow: 0 22px 50px rgba(0, 0, 0, 0.28);
      }

      .workflow-card--left {
        min-height: 100%;
      }

      .workflow-showcase__stack {
        display: grid;
        gap: 12px;
        align-content: start;
        position: relative;
        z-index: 1;
      }

      .workflow-card--rail {
        padding: 14px;
      }

      .workflow-card__bar {
        display: flex;
        gap: 6px;
        padding: 8px 10px;
        border-bottom: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-subtle) 38%, transparent);
      }

      .workflow-card__bar span {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--nxt1-color-text-tertiary) 70%, transparent);
      }

      .workflow-card__content {
        padding: 16px;
        display: grid;
        gap: 14px;
      }

      .workflow-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary, #9a9a9a);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.6875rem;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .workflow-card__coordinator-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .workflow-card__coordinator {
        margin: 0;
        color: var(--nxt1-color-text-primary, #f5f5f5);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: clamp(1rem, 1.35vw, 1.25rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .workflow-card__workspace {
        display: inline-flex;
        align-items: center;
        padding: 5px 9px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 44%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 50%, transparent);
        color: var(--nxt1-color-text-tertiary, #9a9a9a);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.7rem;
        white-space: nowrap;
      }

      .workflow-card__summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary, #b4b4b4);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.92rem;
        line-height: 1.55;
      }

      .workflow-card__prompt-shell {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 42%, transparent);
        border-left-color: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 62%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 54%, transparent);
      }

      .workflow-card__prompt-label,
      .workflow-card__block-title {
        margin: 0;
        color: var(--nxt1-color-text-primary, #f5f5f5);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: 0.9rem;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .workflow-card__prompt {
        margin: 0;
        color: var(--nxt1-color-text-secondary, #c6c6c6);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.9rem;
        line-height: 1.6;
      }

      .workflow-card__inputs-block {
        display: grid;
        gap: 8px;
      }

      .workflow-card__list,
      .workflow-card__steps {
        margin: 0;
        padding-left: 16px;
        display: grid;
        gap: 7px;
      }

      .workflow-card__list li,
      .workflow-card__steps li {
        color: var(--nxt1-color-text-secondary, #c6c6c6);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.84rem;
        line-height: 1.55;
      }

      .workflow-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary, #f5f5f5);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: 1rem;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .workflow-card__steps strong {
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .workflow-card__action-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .workflow-card__action-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 42%, transparent);
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 10%,
          var(--nxt1-color-surface-100) 90%
        );
        color: var(--nxt1-color-text-primary, #f5f5f5);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.75rem;
      }

      .workflow-card__footnote {
        margin: var(--nxt1-spacing-2, 8px) 0 0;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 20%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 8%, transparent);
        color: var(--nxt1-color-text-secondary, #c6c6c6);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: 0.78rem;
        line-height: 1.5;
      }

      .workflow-showcase__footer {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
        max-width: 860px;
        margin: 0 auto;
        text-align: center;
      }

      .workflow-showcase__footer-title {
        margin: 0;
        color: var(--nxt1-color-text-primary, #f5f5f5);
        font-family: var(--nxt1-fontFamily-display, sans-serif);
        font-size: clamp(1.25rem, 1.8vw, 1.8rem);
      }

      .workflow-showcase__footer-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary, #a3a3a3);
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        line-height: var(--nxt1-lineHeight-relaxed, 1.65);
      }

      @media (max-width: 1024px) {
        .workflow-showcase__stage {
          grid-template-columns: minmax(0, 1fr);
          min-height: auto;
        }
      }

      @media (max-width: 767px) {
        .workflow-showcase__stage {
          min-height: auto;
          border-radius: 22px;
        }

        .workflow-showcase__modes {
          width: 100%;
          justify-content: flex-start;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .workflow-showcase__modes::-webkit-scrollbar {
          display: none;
        }

        .workflow-card--left,
        .workflow-showcase__stack {
          width: 100%;
        }

        .workflow-showcase__footer {
          text-align: left;
        }

        .workflow-card__coordinator-row {
          align-items: flex-start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXWorkflowShowcaseSectionComponent {
  protected readonly workflowModes = WORKFLOW_MODES;
  protected readonly activeModeId = signal<WorkflowModeId>('game-plan');
  protected readonly activeMode = computed(
    () => WORKFLOW_MODES.find((mode) => mode.id === this.activeModeId()) ?? WORKFLOW_MODES[0]
  );

  protected setActiveMode(modeId: WorkflowModeId): void {
    this.activeModeId.set(modeId);
  }
}
