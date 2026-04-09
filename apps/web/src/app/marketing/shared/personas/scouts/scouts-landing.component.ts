/**
 * @fileoverview Scouts Persona Landing Page
 * @module apps/web/featur../shared/personas/scouts
 * @version 1.0.0
 *
 * Orchestrator for the `/scouts` persona marketing page.
 * Composes shared NXT1 section components with scout-specific
 * content aimed at independent scouts, recruiting services, and
 * talent evaluators who discover, rate, and report on athletes.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtHeroSectionComponent } from '@nxt1/ui/components/hero-section';
import { NxtStatsBarComponent, type StatsBarItem } from '@nxt1/ui/components/stats-bar';
import {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from '@nxt1/ui/components/feature-showcase';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '@nxt1/ui/components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtScoutsPreviewComponent } from './scouts-preview.component';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const STATS: StatsBarItem[] = [
  { label: 'Athlete Profiles', value: '125K+' },
  { label: 'Scouting Reports Filed', value: '50K+' },
  { label: 'Verified Scouts', value: '1K+' },
  { label: 'Sports Evaluated', value: '25+' },
];

const FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'scouts-scouting-reports',
    icon: 'clipboard-outline',
    title: 'Scouting Reports',
    description:
      'Create professional scouting reports with custom grading scales, skill breakdowns, and prospect notes. Share reports with coaches and programs.',
  },
  {
    id: 'scouts-advanced-prospect-search',
    icon: 'funnel-outline',
    title: 'Advanced Prospect Search',
    description:
      'Filter the entire NXT1 database by sport, position, class year, measurables, academics, region, and dozens of other criteria to find hidden gems.',
  },
  {
    id: 'scouts-custom-prospect-lists',
    icon: 'list-outline',
    title: 'Custom Prospect Lists',
    description:
      'Build and manage ranked prospect lists for camps, showcases, and recruiting services. Organize by sport, region, class year, or any custom criteria.',
  },
  {
    id: 'scouts-evaluation-analytics',
    icon: 'bar-chart-outline',
    title: 'Evaluation Analytics',
    description:
      'Track how your evaluations perform over time. See which prospects you identified early, and measure your scouting accuracy with data-driven insights.',
  },
  {
    id: 'scouts-film-review-tools',
    icon: 'videocam-outline',
    title: 'Film Review Tools',
    description:
      'Watch athlete highlights with frame-by-frame tools. Add timestamps, notes, and grades directly on the video for comprehensive evaluations.',
  },
  {
    id: 'scouts-share-with-programs',
    icon: 'share-outline',
    title: 'Share with Programs',
    description:
      'Send prospect lists and scouting reports directly to college coaches through NXT1. Build your reputation as a trusted talent evaluator.',
  },
];

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'scouts-independent-scouts',
    icon: 'eye-outline',
    title: 'Independent Scouts',
    description:
      'Build your scouting brand on NXT1. Evaluate athletes, create reports, and connect your findings directly with college programs looking for talent.',
  },
  {
    id: 'scouts-recruiting-services',
    icon: 'business-outline',
    title: 'Recruiting Services',
    description:
      'Manage your entire recruiting service operation through NXT1. Organize clients, track evaluations, and deliver reports at scale.',
  },
  {
    id: 'scouts-camp-event-organizers',
    icon: 'trophy-outline',
    title: 'Camp & Event Organizers',
    description:
      "Run camps and showcases with NXT1's evaluation tools. Register athletes, grade performances, and publish results — all in one platform.",
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'scouts-create-reports',
    question: 'How do I create scouting reports on NXT1?',
    answer:
      'NXT1 provides customizable scouting report templates with grading scales, skill breakdowns, and notes fields. You can evaluate athletes directly from their profile and your reports are stored in your scouting workspace.',
  },
  {
    id: 'scouts-share',
    question: 'Can I share my evaluations with college coaches?',
    answer:
      'Yes! NXT1 lets you share individual reports or full prospect lists directly with verified college programs. Coaches can see your evaluation history and scouting track record.',
  },
  {
    id: 'scouts-cost',
    question: 'Is there a cost for scouts to use NXT1?',
    answer:
      'Scouts can create a free account to search athletes and view profiles. Premium scouting tools — including advanced reports, prospect lists, and film review features — are available with a Pro subscription.',
  },
  {
    id: 'scouts-verified',
    question: 'How are scout accounts verified?',
    answer:
      'NXT1 verifies scout accounts through a credentialing process that confirms your scouting experience and affiliations. Verified scouts earn a badge that builds trust with athletes and coaches.',
  },
  {
    id: 'scouts-team',
    question: 'Can I manage a scouting team on NXT1?',
    answer:
      'Absolutely. Recruiting services and scouting organizations can add team members, assign evaluations, collaborate on reports, and manage shared prospect lists from a unified workspace.',
  },
];

@Component({
  selector: 'nxt1-scouts-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtScoutsPreviewComponent,
  ],
  template: `
    <nxt1-hero-section
      badgeIcon="eye-outline"
      badgeLabel="For Scouts"
      title="Discover Talent"
      accentText="Before Anyone Else"
      subtitle="Evaluate athletes, build prospect lists, create professional scouting reports, and share your findings with college programs — all from the NXT1 scouting workspace."
      primaryCtaLabel="Start Scouting"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Browse Athletes"
      secondaryCtaRoute="/explore"
      ariaId="scouts-hero"
    >
      <nxt1-scouts-preview />
    </nxt1-hero-section>

    <nxt1-stats-bar [stats]="stats" />

    <nxt1-feature-showcase
      title="Professional Scouting Tools"
      subtitle="NXT1 gives scouts the workspace to discover, evaluate, and promote the next generation of talent."
      [features]="features"
    />

    <nxt1-audience-section
      title="Built for Talent Evaluators"
      subtitle="Independent scouts, recruiting services, and event organizers — NXT1 supports every scouting operation."
      [segments]="audiences"
    />

    <nxt1-faq-section
      title="Scout FAQs"
      subtitle="Common questions from scouts and evaluators getting started with NXT1."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Scout the Next Generation"
      subtitle="Join 1,000+ verified scouts discovering talent on NXT1. Free to search, powerful to evaluate."
      ctaLabel="Start Scouting"
      ctaRoute="/auth"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtScoutsLandingComponent {
  protected readonly stats = STATS;
  protected readonly features = FEATURES;
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
}
