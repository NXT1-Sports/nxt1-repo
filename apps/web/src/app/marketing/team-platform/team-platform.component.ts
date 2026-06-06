import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NxtOldVsNewContrastSectionComponent } from '@nxt1/ui/components/old-vs-new-contrast-section';
import { NxtIntegrationPipelineSectionComponent } from '@nxt1/ui/components/integration-pipeline-section';
import { NxtGenesisMomentComponent } from '@nxt1/ui/components/genesis-moment';
import { NxtSiteFooterCompactComponent } from '@nxt1/ui/components/site-footer-compact';
import { SeoService } from '../../core/services';
import type { SeoConfig } from '@nxt1/core/seo';

const PROGRAMS_PAGE_TITLE = 'NXT1 Programs | The Digital Athletic Department for Sports Programs';
const PROGRAMS_PAGE_DESCRIPTION =
  'NXT1 turns sports programs into autonomous command centers. Agent X coordinates film, rosters, content, outreach, briefings, and recruiting execution for coaches, directors, athletes, and program leaders.';
const PROGRAMS_PAGE_URL = 'https://nxt1sports.com/programs';
const PROGRAMS_PAGE_IMAGE = 'https://nxt1sports.com/assets/shared/images/og-image.jpg';
const PROGRAMS_PAGE_KEYWORDS = [
  'digital athletic department',
  'sports intelligence platform',
  'agent x',
  'ai sports coordinators',
  'program operations',
  'coach command center',
  'sports program software',
  'athlete recruiting operations',
  'ai creative director',
  'ai scout reports',
] as const;
const PROGRAMS_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://nxt1sports.com/programs#webpage',
      url: PROGRAMS_PAGE_URL,
      name: PROGRAMS_PAGE_TITLE,
      description: PROGRAMS_PAGE_DESCRIPTION,
      isPartOf: {
        '@type': 'WebSite',
        '@id': 'https://nxt1sports.com/#website',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      about: { '@id': 'https://nxt1sports.com/programs#software' },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: PROGRAMS_PAGE_IMAGE,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://nxt1sports.com/programs#software',
      name: 'NXT1 Programs',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: PROGRAMS_PAGE_URL,
      description: PROGRAMS_PAGE_DESCRIPTION,
      image: PROGRAMS_PAGE_IMAGE,
      publisher: {
        '@type': 'Organization',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      featureList: [
        'Program command center for coaches and athletic staff',
        'Film, roster, and workflow coordination with Agent X',
        'Creative production and communications workflows',
        'Weekly playbooks and background operations for sports programs',
        'Decision-grade sports intelligence for program leaders',
      ],
    },
  ],
} as const;

interface ProgramStaffRole {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly outcome: string;
}

interface ProgramWorkflowOutput {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

interface ProgramPlaybookItem {
  readonly id: string;
  readonly command: string;
  readonly status: string;
}

interface ProgramPersona {
  readonly id: string;
  readonly persona: string;
  readonly pressure: string;
  readonly nxt1Move: string;
}

const PROGRAM_STAFF_ROLES: readonly ProgramStaffRole[] = [
  {
    id: 'creative-director',
    eyebrow: 'Creative Director',
    title: 'Every athlete looks like a premier recruit.',
    description:
      'Agent X turns film, stats, rosters, and milestones into polished program assets built for social, recruiting, and family engagement.',
    outcome: 'Game day graphics, player spotlights, offer posts, recap assets.',
  },
  {
    id: 'personnel-director',
    eyebrow: 'Director of Player Personnel',
    title: 'Your roster becomes an intelligence layer.',
    description:
      'NXT1 organizes athlete context, evaluates progression, and surfaces the next action for players who need visibility, development, or outreach.',
    outcome: 'Roster briefs, fit signals, athlete summaries, scout-ready packets.',
  },
  {
    id: 'communications-director',
    eyebrow: 'Communications Director',
    title: 'Outreach moves without draining the staff.',
    description:
      'Agent X drafts NCAA-aware messaging, packages athlete proof points, and keeps recruiting communication moving across the week.',
    outcome: 'Coach emails, parent updates, recruiting notes, weekly follow-ups.',
  },
  {
    id: 'operations-manager',
    eyebrow: 'Operations Manager',
    title: 'The program wakes up with a playbook.',
    description:
      'Daily briefings and background operations keep directors, coaches, athletes, and media leads aligned around what needs to happen next.',
    outcome: 'Morning briefings, task queues, active operations, completed work.',
  },
] as const;

const PROGRAM_WORKFLOW_OUTPUTS: readonly ProgramWorkflowOutput[] = [
  {
    id: 'film-review',
    title: 'Film Review',
    description: 'Cut-ups, teaching notes, and player-specific takeaways from the latest game.',
  },
  {
    id: 'game-plans',
    title: 'Game Plans',
    description: 'Opponent tendencies, matchup priorities, and staff talking points for the week.',
  },
  {
    id: 'weekly-playbooks',
    title: 'Weekly Playbooks',
    description: 'Clear actions for coaches, athletes, media leads, and recruiting follow-up.',
  },
  {
    id: 'recruiting-packets',
    title: 'Recruiting Packets',
    description: 'Athlete briefs, proof points, and communication assets ready for outreach.',
  },
] as const;

const PLAYBOOK_ITEMS: readonly ProgramPlaybookItem[] = [
  {
    id: 'roster-sync',
    command: 'Import varsity roster and build athlete command centers',
    status: 'Running',
  },
  {
    id: 'film-package',
    command: 'Generate recruiting packets from Friday night film',
    status: 'Queued',
  },
  {
    id: 'content-drop',
    command: 'Publish weekly player spotlight set for social channels',
    status: 'Ready',
  },
  {
    id: 'college-outreach',
    command: 'Draft coach outreach for high-fit regional programs',
    status: 'Approved',
  },
] as const;

const PROGRAM_PERSONAS: readonly ProgramPersona[] = [
  {
    id: 'head-coach',
    persona: 'Head Coaches',
    pressure: 'Prepare the staff, sharpen the plan, and turn film into wins.',
    nxt1Move:
      'Use Agent X for film review notes, opponent tendencies, game-plan priorities, and weekly practice playbooks.',
  },
  {
    id: 'program-leader',
    persona: 'Program Leaders',
    pressure: 'Operate like a national brand without national staff size.',
    nxt1Move:
      'Unify content, communications, roster intelligence, and reporting in one command center.',
  },
  {
    id: 'media-lead',
    persona: 'Media Teams',
    pressure: 'Create consistent premium content from limited time and raw footage.',
    nxt1Move: 'Turn every game, stat line, and milestone into on-brand assets at program speed.',
  },
  {
    id: 'scout-recruiting',
    persona: 'Scouts and Recruiting Staff',
    pressure: 'Evaluate more athletes with cleaner context and faster distribution.',
    nxt1Move:
      'Package verified athlete data into briefs, reports, and targeted outreach workflows.',
  },
] as const;

@Component({
  selector: 'app-team-platform',
  standalone: true,
  imports: [
    RouterLink,
    NxtOldVsNewContrastSectionComponent,
    NxtIntegrationPipelineSectionComponent,
    NxtGenesisMomentComponent,
    NxtSiteFooterCompactComponent,
  ],
  template: `
    <main class="programs-page">
      <nxt1-genesis-moment
        headline="The Digital Athletic Department for modern sports programs."
        subhead="Agent X turns the systems your staff already uses into autonomous operations: film, rosters, content, outreach, briefings, and recruiting execution."
        commandUrl="https://www.maxpreps.com/al/hoover/hoover-buccaneers/football/"
        [headingLevel]="1"
        [animateOnLoad]="false"
      />

      <section class="program-band program-band--staff" aria-labelledby="digital-staff-title">
        <div class="program-band__inner">
          <header class="program-section-header program-section-header--wide">
            <p class="program-section-header__eyebrow">Digital Athletic Department</p>
            <h2 id="digital-staff-title">
              Most apps give your staff another login. NXT1 gives them leverage.
            </h2>
            <p>
              Built for athletes, coaches, scouts, and program leaders, NXT1 is the active layer
              that executes work while your staff stays focused on winning.
            </p>
          </header>

          <div class="staff-grid" role="list" aria-label="Digital athletic department roles">
            @for (role of staffRoles; track role.id) {
              <article class="staff-card" role="listitem">
                <p class="staff-card__eyebrow">{{ role.eyebrow }}</p>
                <h3>{{ role.title }}</h3>
                <p class="staff-card__description">{{ role.description }}</p>
                <p class="staff-card__outcome">{{ role.outcome }}</p>
              </article>
            }
          </div>

          <div class="program-workflows" aria-label="Program workflow outputs">
            @for (workflow of workflowOutputs; track workflow.id) {
              <div class="program-workflow">
                <span class="program-workflow__title">{{ workflow.title }}</span>
                <span class="program-workflow__description">{{ workflow.description }}</span>
              </div>
            }
          </div>
        </div>
      </section>

      <nxt1-integration-pipeline-section />

      <section class="program-band program-band--war-room" aria-labelledby="war-room-title">
        <div class="program-band__inner war-room">
          <div class="war-room__copy">
            <p class="program-section-header__eyebrow">Unified Command Center</p>
            <h2 id="war-room-title">One weekly playbook. Multiple background operations.</h2>
            <p>
              This is the operational shift: no more waiting for staff to manually clip, package,
              post, email, summarize, and follow up. Program leaders give Agent X the objective.
              NXT1 coordinates the work.
            </p>
          </div>

          <div class="playbook-panel" aria-label="Example Agent X program playbook">
            <div class="playbook-panel__topline">
              <span>Monday Briefing</span>
              <strong>Agent X active</strong>
            </div>
            @for (item of playbookItems; track item.id) {
              <div class="playbook-row">
                <span class="playbook-row__command">{{ item.command }}</span>
                <span class="playbook-row__status">{{ item.status }}</span>
              </div>
            }
          </div>
        </div>
      </section>

      <nxt1-old-vs-new-contrast-section />

      <section class="program-band program-band--personas" aria-labelledby="personas-title">
        <div class="program-band__inner">
          <header class="program-section-header">
            <p class="program-section-header__eyebrow">Program Operators</p>
            <h2 id="personas-title">Built for the people responsible for outcomes.</h2>
            <p>
              NXT1 does not sell passive profiles. It gives each program stakeholder an active
              operating layer for execution, intelligence, and delegation.
            </p>
          </header>

          <div class="persona-grid" role="list" aria-label="Program ideal customer profiles">
            @for (persona of personas; track persona.id) {
              <article class="persona-card" role="listitem">
                <h3>{{ persona.persona }}</h3>
                <p class="persona-card__pressure">{{ persona.pressure }}</p>
                <p class="persona-card__move">{{ persona.nxt1Move }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <section class="program-final" aria-labelledby="program-final-title">
        <div class="program-final__inner">
          <p class="program-section-header__eyebrow">Grade A+ Standard</p>
          <h2 id="program-final-title">Run the program like a national operation.</h2>
          <p>
            Hire the digital staff. Command the work. Let Agent X turn your program's raw activity
            into visible, organized, measurable execution.
          </p>
          <a class="program-final__cta" routerLink="/auth">Start with Agent X</a>
        </div>
      </section>

      <nxt1-site-footer-compact />
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .programs-page {
        position: relative;
        overflow: hidden;
      }

      .programs-page::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(var(--nxt1-color-border-subtle) 1px, transparent 1px),
          linear-gradient(90deg, var(--nxt1-color-border-subtle) 1px, transparent 1px);
        background-size: 72px 72px;
        opacity: 0.08;
      }

      .program-band {
        position: relative;
        z-index: 1;
        padding: var(--nxt1-spacing-16) var(--nxt1-section-padding-x);
      }

      .program-band--staff,
      .program-band--personas {
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 32%, transparent);
        border-block: 1px solid var(--nxt1-color-border-subtle);
      }

      .program-band--war-room {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 28%, transparent);
      }

      .program-band__inner,
      .program-final__inner {
        width: min(100%, var(--nxt1-section-max-width));
        margin: 0 auto;
      }

      .program-section-header {
        max-width: 46rem;
        margin: 0 auto var(--nxt1-spacing-8);
        text-align: center;
      }

      .program-section-header--wide {
        max-width: 58rem;
      }

      .program-section-header__eyebrow,
      .staff-card__eyebrow {
        margin: 0 0 var(--nxt1-spacing-2);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .program-section-header h2,
      .war-room__copy h2,
      .program-final h2 {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: clamp(var(--nxt1-fontSize-3xl), 5vw, var(--nxt1-fontSize-5xl));
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .program-section-header p:not(.program-section-header__eyebrow),
      .war-room__copy p:not(.program-section-header__eyebrow),
      .program-final p {
        margin: var(--nxt1-spacing-4) 0 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .staff-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--nxt1-spacing-3);
      }

      .staff-card,
      .persona-card,
      .playbook-panel {
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 88%, transparent);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .staff-card,
      .persona-card {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .staff-card h3,
      .persona-card h3 {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .staff-card__description,
      .persona-card__pressure,
      .persona-card__move {
        margin: var(--nxt1-spacing-4) 0 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .staff-card__outcome,
      .persona-card__move {
        margin-top: auto;
        padding-top: var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .program-workflows {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--nxt1-spacing-3);
        margin-top: var(--nxt1-spacing-8);
      }

      .program-workflow {
        display: grid;
        align-content: start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-alpha-primary40);
      }

      .program-workflow__title {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .program-workflow__description {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .war-room {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        align-items: center;
        gap: var(--nxt1-spacing-8);
      }

      .war-room__copy {
        max-width: 34rem;
      }

      .playbook-panel {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .playbook-panel__topline,
      .playbook-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
      }

      .playbook-panel__topline {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .playbook-panel__topline strong {
        color: var(--nxt1-color-primary);
      }

      .playbook-row {
        min-height: var(--nxt1-spacing-14);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-200);
      }

      .playbook-row__command {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .playbook-row__status {
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
      }

      .persona-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--nxt1-spacing-3);
      }

      .program-final {
        position: relative;
        z-index: 1;
        padding: var(--nxt1-spacing-16) var(--nxt1-section-padding-x) var(--nxt1-spacing-20);
        text-align: center;
      }

      .program-final__inner {
        max-width: 52rem;
        padding: var(--nxt1-spacing-8);
        border-block: 1px solid var(--nxt1-color-alpha-primary40);
      }

      .program-final__cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: var(--nxt1-spacing-6);
        min-height: var(--nxt1-spacing-12);
        padding: 0 var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-decoration: none;
        text-transform: uppercase;
        box-shadow: var(--nxt1-glow-md);
        transition:
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .program-final__cta:hover {
        transform: translateY(calc(var(--nxt1-spacing-px) * -1));
        box-shadow: var(--nxt1-glow-lg);
      }

      @media (max-width: 1024px) {
        .staff-grid,
        .persona-grid,
        .program-workflows {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .war-room {
          grid-template-columns: 1fr;
        }

        .war-room__copy {
          max-width: 44rem;
          text-align: center;
          margin: 0 auto;
        }
      }

      @media (max-width: 640px) {
        .program-band {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-4);
        }

        .staff-grid,
        .persona-grid,
        .program-workflows {
          grid-template-columns: 1fr;
        }

        .program-section-header h2,
        .war-room__copy h2,
        .program-final h2 {
          font-size: var(--nxt1-fontSize-3xl);
        }

        .program-section-header p:not(.program-section-header__eyebrow),
        .war-room__copy p:not(.program-section-header__eyebrow),
        .program-final p {
          font-size: var(--nxt1-fontSize-base);
        }

        .playbook-row {
          align-items: flex-start;
          flex-direction: column;
          gap: var(--nxt1-spacing-2);
        }

        .program-final__inner {
          padding: var(--nxt1-spacing-6) 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPlatformComponent implements OnInit {
  private readonly seo = inject(SeoService);

  protected readonly staffRoles = PROGRAM_STAFF_ROLES;
  protected readonly workflowOutputs = PROGRAM_WORKFLOW_OUTPUTS;
  protected readonly playbookItems = PLAYBOOK_ITEMS;
  protected readonly personas = PROGRAM_PERSONAS;

  ngOnInit(): void {
    const seoConfig: SeoConfig = {
      page: {
        title: PROGRAMS_PAGE_TITLE,
        description: PROGRAMS_PAGE_DESCRIPTION,
        canonicalUrl: PROGRAMS_PAGE_URL,
        image: PROGRAMS_PAGE_IMAGE,
        keywords: [...PROGRAMS_PAGE_KEYWORDS],
      },
      openGraph: {
        type: 'website',
        title: PROGRAMS_PAGE_TITLE,
        description: PROGRAMS_PAGE_DESCRIPTION,
        url: PROGRAMS_PAGE_URL,
        image: PROGRAMS_PAGE_IMAGE,
      },
      twitter: {
        card: 'summary_large_image',
        title: PROGRAMS_PAGE_TITLE,
        description: PROGRAMS_PAGE_DESCRIPTION,
        image: PROGRAMS_PAGE_IMAGE,
      },
      structuredData: PROGRAMS_STRUCTURED_DATA,
    };

    this.seo.applySeoConfig(seoConfig);
  }
}
