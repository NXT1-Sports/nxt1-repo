/**
 * @fileoverview Agent X Landing Sections — Shared UI Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Marketing sections for the Agent X feature landing page.
 * Displayed below the live Agent X shell for unauthenticated users.
 *
 * Unlike other landing pages that have a Hero+Preview at top, the Agent X
 * landing shows the REAL Agent X shell as the "preview" at the top of the page,
 * with a gradient fade overlay, and these marketing sections appear below.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator composing shared, reusable section
 * components — matching the pattern from analytics, xp, and persona landings.
 *
 * Component architecture:
 * NxtAgentXLandingComponent (orchestrator)
 *   NxtAgentXIdentitySectionComponent (agent-x specific)
 *   NxtFaqSectionComponent            (reusable)
 *   NxtCtaBannerComponent             (reusable)
 *   NxtSiteFooterComponent            (reusable)
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtAgentXIdentitySectionComponent } from '../../../components/agent-x-identity-section/agent-x-identity-section.component';
import {
  NxtAgentXDemoComponent,
  type AgentXDemoWorkflowStep,
} from '../../../components/agent-x-demo/agent-x-demo.component';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '../../../components/audience-section/audience-section.component';
import {
  NxtFaqSectionComponent,
  type FaqItem,
} from '../../../components/faq-section/faq-section.component';
import {
  NxtCtaBannerComponent,
  type CtaAvatarImage,
} from '../../../components/cta-banner/cta-banner.component';
import { NxtStatsBarComponent } from '../../../components/stats-bar/stats-bar.component';
import { NxtSiteFooterCompactComponent } from '../../../components/site-footer-compact/site-footer-compact.component';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

// ============================================
// CONSTANTS — Agent X Landing Content
// ============================================

const AGENT_X_CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'Athlete portrait 1' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Athlete portrait 2' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Athlete portrait 3' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'Coach portrait 1' },
  { src: `/${IMAGE_PATHS.coach2}`, alt: 'Coach portrait 2' },
  { src: `/${IMAGE_PATHS.coach3}`, alt: 'Coach portrait 3' },
  { src: `/${IMAGE_PATHS.coach4}`, alt: 'Coach portrait 4' },
] as const;

const AGENT_X_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes',
    description:
      'Turn film, stats, and goals into daily execution with highlight packages, performance briefs, branded creative, and the next actions that matter.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches-staff',
    title: 'Coaches & Staff',
    description:
      'Automate opponent research, game-week creative, communications, and operating briefs from one command center instead of five disconnected tools.',
    icon: 'people-outline',
  },
  {
    id: 'directors-programs',
    title: 'Directors & Programs',
    description:
      'Run fit analysis, compare prospects, monitor movement, and generate decision-grade intelligence without chasing data across the market.',
    icon: 'heart-outline',
  },
];

const AGENT_X_WINS_TICKER: readonly string[] = [
  'Generated 14,000 Creative Assets',
  'Queued 500 Communications Workflows',
  'Analyzed 2,000 Hours of Film & Intel',
  'Ranked 1,200 Program Fits',
  'Built 340 Roster Outreach Queues',
  'Sent 2,800 Recruiting Follow-Ups',
  'Flagged 190 Priority Coach Replies',
  'Delivered 620 Staff Briefings',
  'Prepared 410 Film Sends for Coaches',
  'Updated 275 Prospect Priority Boards',
  'Generated 860 Recruiting Action Plans',
];

const AGENT_X_DEMO_WORKFLOW: readonly AgentXDemoWorkflowStep[] = [
  {
    id: 'highlight-reel',
    title: 'Package the film',
    prompt:
      "Turn Friday's film and stat sheet into a 60-second recap package the staff and players can use tonight.",
    result:
      'Agent X cuts the clips, sequences the story, and packages the share-ready film assets automatically.',
    outputType: 'highlight-reel',
  },
  {
    id: 'contact-coaches',
    title: 'Run the communications queue',
    prompt:
      "Draft the updates I need for staff, parents, recruits, and sponsors after tonight's result.",
    result:
      'Agent X builds the message set, personalizes each version, and queues the follow-ups automatically.',
    outputType: 'contact-coaches',
  },
  {
    id: 'recruiting-strategy',
    title: 'Build the weekly operating plan',
    prompt:
      'Review what happened this week and generate the next seven days of priorities for film, creative, outreach, and staff actions.',
    result: 'Agent X returns a structured weekly playbook with milestones, owners, and timing.',
    outputType: 'recruiting-strategy',
  },
  {
    id: 'college-match',
    title: 'Prioritize roster outreach',
    prompt:
      'Rank the college programs our roster should contact first and map the next recruiting touchpoint for each one.',
    result:
      'Agent X returns a priority outreach board with fit, urgency, and the next action for every target program.',
    outputType: 'college-match',
  },
] as const;

const AGENT_X_FAQS: FaqItem[] = [
  {
    id: 'what-is-agent-x',
    question: 'What is Agent X?',
    answer:
      "Agent X is NXT1's AI command center. It executes film work, creative production, communications, director-level intelligence, and operating workflows from plain-language commands.",
  },
  {
    id: 'who-is-it-for',
    question: 'Who is Agent X built for?',
    answer:
      'Agent X is built for athletes, coaches, directors, and program leaders. Parents and content creators can use the same command center to support athlete and department outcomes.',
  },
  {
    id: 'how-it-works',
    question: 'How does Agent X work?',
    answer:
      'You give Agent X the objective in plain language. It pulls the right context, builds the workflow, and returns finished output or background operations you can monitor inside the command center.',
  },
  {
    id: 'what-can-it-execute',
    question: 'What can Agent X execute?',
    answer:
      'Agent X can package film, generate branded creative, draft communications, build director and fit briefs, organize weekly plans, and keep multi-step operations moving in the background.',
  },
  {
    id: 'is-it-free',
    question: 'Is Agent X included in my plan?',
    answer:
      'Every NXT1 account gets access to Agent X with a generous free tier. Premium plans unlock more usage, priority processing, and deeper autonomous workflows.',
  },
  {
    id: 'data-privacy',
    question: 'Is my data safe with Agent X?',
    answer:
      'Absolutely. Agent X processes all requests through our secure cloud infrastructure. Your data is never shared with third parties, and all conversations are encrypted end-to-end. You own everything Agent X creates for you.',
  },
];

@Component({
  selector: 'nxt1-agent-x-landing',
  standalone: true,
  imports: [
    NxtAgentXIdentitySectionComponent,
    NxtAgentXDemoComponent,
    NxtAudienceSectionComponent,
    NxtStatsBarComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterCompactComponent,
  ],
  template: `
    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for the People Running the Work"
      subtitle="Athletes, coaches, directors, and programs use Agent X as an execution layer. Parents and creators use it to keep outcomes moving."
      [segments]="audiences"
    />

    <!-- Identity Differentiation -->
    <nxt1-agent-x-identity-section />

    <!-- Interactive Demo -->
    <nxt1-agent-x-demo
      headline="See the Command Center Work."
      subtitle="From film and creative to communications and intelligence, Agent X turns one prompt into finished operations."
      [workflowSteps]="demoWorkflowSteps"
      primaryCtaLabel="Start with Agent X"
      primaryCtaRoute="/auth"
      [secondaryCtaLabel]="''"
    />

    <!-- Live Wins Ticker (Social Proof) -->
    <nxt1-stats-bar
      ariaLabel="Agent X live wins ticker"
      [headline]="'What Agent X Executed Today.'"
      [tickerItems]="winsTicker"
      [tickerDurationSeconds]="60"
      [subtext]="'Creative, intelligence, communications, and operations handled from one command center.'"
      [fullWidth]="true"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Agent X FAQ"
      subtitle="The essentials for athletes, staffs, directors, and programs using Agent X as their execution layer."
      [items]="faqs"
    />

    <!-- Final CTA Banner -->
    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Agent X"
      title="Put Agent X On The Clock."
      subtitle="Deploy Agent X across film, creative, communications, and intelligence so your athletes, staff, directors, and programs move faster from one command center."
      ctaLabel="Start with Agent X"
      ctaRoute="/auth"
      titleId="agent-x-final-cta-title"
      [avatarImages]="ctaAvatars"
    />

    <nxt1-site-footer-compact />
  `,
  styles: [
    `
      :host {
        --nxt1-root-shell-max-width: 88rem;
        display: block;
      }

      nxt1-stats-bar {
        display: block;
        margin-bottom: var(--nxt1-spacing-10);
      }

      @media (max-width: 767px) {
        nxt1-stats-bar {
          margin-bottom: var(--nxt1-spacing-8);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXLandingComponent {
  protected readonly audiences = AGENT_X_AUDIENCES;
  protected readonly winsTicker = AGENT_X_WINS_TICKER;
  protected readonly demoWorkflowSteps = AGENT_X_DEMO_WORKFLOW;
  protected readonly faqs = AGENT_X_FAQS;
  protected readonly ctaAvatars = AGENT_X_CTA_AVATARS;
}
