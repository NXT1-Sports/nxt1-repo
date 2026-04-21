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
import { NxtAgentXIdentitySectionComponent } from '../components/agent-x-identity-section/agent-x-identity-section.component';
import { NxtAgentXMoneyballSectionComponent } from '../components/agent-x-moneyball-section/agent-x-moneyball-section.component';
import { NxtAgentXDemoComponent } from '../components/agent-x-demo/agent-x-demo.component';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '../components/audience-section/audience-section.component';

import { NxtTeamBrandArchitectureSectionComponent } from '../components/team-brand-architecture-section/team-brand-architecture-section.component';
import {
  NxtFaqSectionComponent,
  type FaqItem,
} from '../components/faq-section/faq-section.component';
import {
  NxtCtaBannerComponent,
  type CtaAvatarImage,
} from '../components/cta-banner/cta-banner.component';
import { NxtStatsBarComponent } from '../components/stats-bar/stats-bar.component';
import { NxtSiteFooterComponent } from '../components/site-footer/site-footer.component';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

// ============================================
// CONSTANTS — Agent X Landing Content
// ============================================

const AGENT_X_CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'High school athlete' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Club athlete' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Student athlete' },
  { src: `/${IMAGE_PATHS.athlete4}`, alt: 'Varsity athlete' },
  { src: `/${IMAGE_PATHS.athlete5}`, alt: 'Travel ball athlete' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'College coach' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Elite recruit' },
] as const;

const AGENT_X_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes',
    description:
      'Create highlight films, generate recruiting graphics, draft emails to coaches, and get AI-powered evaluations of your athletic profile.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches-admin',
    title: 'Coaches/Admin',
    description:
      "Build scouting reports, generate team graphics, create recruiting content, and streamline your program's digital presence.",
    icon: 'people-outline',
  },
  {
    id: 'colleges-scouts',
    title: 'Colleges/Scouts',
    description:
      'Evaluate athlete fit faster with AI-powered comparisons, organized recruiting intel, and streamlined outreach workflows.',
    icon: 'heart-outline',
  },
];

const AGENT_X_WINS_TICKER: readonly string[] = [
  'Generated 14,000 Graphic Edits',
  'Wrote 500 Recruiting Emails',
  'Analyzed 2,000 Hours of Film',
];

const AGENT_X_FAQS: FaqItem[] = [
  {
    id: 'what-is-agent-x',
    question: 'What is Agent X?',
    answer:
      "Agent X is NXT1's AI command center. It can create highlight films, design recruiting graphics, draft emails to college coaches, generate evaluations, and run high-value workflows through plain-language prompts.",
  },
  {
    id: 'how-it-works',
    question: 'How does Agent X work?',
    answer:
      'Just type what you need in plain English. Agent X understands context from your profile and delivers results in seconds. Choose from four specialized modes — Highlights, Graphics, Recruiting, and Evaluation — or let Agent X figure out the best approach.',
  },
  {
    id: 'is-it-free',
    question: 'Is Agent X included in my plan?',
    answer:
      'Every NXT1 account gets access to Agent X with a generous free tier. Premium plans unlock unlimited requests, priority processing, and advanced features like batch operations and custom templates.',
  },
  {
    id: 'what-modes',
    question: 'What are the four Agent X modes?',
    answer:
      'Highlights mode creates and edits video highlight reels. Graphics mode designs recruiting graphics, commitment posts, and social content. Recruiting mode helps with college search, coach outreach, and strategy. Evaluation mode provides AI-driven athletic assessments and benchmarks.',
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
    NxtAgentXMoneyballSectionComponent,
    NxtTeamBrandArchitectureSectionComponent,
    NxtAgentXDemoComponent,
    NxtAudienceSectionComponent,
    NxtStatsBarComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for Every Role"
      subtitle="Whether you&rsquo;re an athlete, coach, or recruiter &mdash; Agent X is your edge."
      [segments]="audiences"
    />

    <!-- Identity Differentiation -->
    <nxt1-agent-x-identity-section />

    <!-- Team Brand Architecture (Programs / ADs) -->
    <nxt1-team-brand-architecture-section />

    <!-- Interactive Demo -->
    <nxt1-agent-x-demo />

    <!-- Scouts/Recruiters: Moneyball Intelligence -->
    <nxt1-agent-x-moneyball-section />

    <!-- Live Wins Ticker (Social Proof) -->
    <nxt1-stats-bar
      ariaLabel="Agent X live wins ticker"
      [headline]="'What Agent X Did Today.'"
      [tickerItems]="winsTicker"
      [subtext]="'The most hardworking employee in sports.'"
      [fullWidth]="true"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Agent X FAQ"
      subtitle="Common questions about Agent X."
      [items]="faqs"
    />

    <!-- Final CTA Banner -->
    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Agent X"
      title="Activate Agent X."
      subtitle="Use Agent X to create highlight films, generate recruiting graphics, draft coach outreach, and get AI-powered evaluations in one conversation."
      ctaLabel="Start with Agent X"
      ctaRoute="/auth"
      titleId="agent-x-final-cta-title"
      [avatarImages]="ctaAvatars"
    />

    <!-- Site Footer (shared component is globally mobile-only) -->
    <nxt1-site-footer />
  `,
  styles: [
    `
      :host {
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
  protected readonly faqs = AGENT_X_FAQS;
  protected readonly ctaAvatars = AGENT_X_CTA_AVATARS;
}
