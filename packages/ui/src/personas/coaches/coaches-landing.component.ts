/**
 * @fileoverview Coaches Persona Landing Page
 * @module @nxt1/ui/personas/coaches
 * @version 1.0.0
 *
 * Orchestrator for the `/coaches` persona marketing page.
 * Composes shared NXT1 section components with coach-specific
 * content aimed at college coaches, high-school coaches, and
 * recruiting coordinators looking to discover, evaluate, and
 * manage athlete prospects through NXT1.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtHeroSectionComponent } from '../../components/hero-section';
import { NxtStatsBarComponent, type StatsBarItem } from '../../components/stats-bar';
import {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from '../../components/feature-showcase';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '../../components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '../../components/faq-section';
import { NxtCtaBannerComponent } from '../../components/cta-banner';
import { NxtCoachesPreviewComponent } from './coaches-preview.component';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const STATS: StatsBarItem[] = [
  { label: 'Searchable Athletes', value: '125K+' },
  { label: 'College Coaches on NXT1', value: '3K+' },
  { label: 'Verified Highlights', value: '500K+' },
  { label: 'Sports Covered', value: '25+' },
];

const FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'coaches-advanced-athlete-search',
    icon: 'search-outline',
    title: 'Advanced Athlete Search',
    description:
      "Filter by sport, position, class year, GPA, location, measurables, and more. Find the exact prospects that fit your program's needs.",
  },
  {
    id: 'coaches-verified-highlight-film',
    icon: 'videocam-outline',
    title: 'Verified Highlight Film',
    description:
      "Watch game film and highlight reels directly on each athlete's profile. No more hunting through dozens of external links.",
  },
  {
    id: 'coaches-evaluation-tools',
    icon: 'clipboard-outline',
    title: 'Evaluation Tools',
    description:
      'Track evaluations, add internal notes, and manage recruitment statuses for every prospect — all from one centralized dashboard.',
  },
  {
    id: 'coaches-team-management',
    icon: 'people-outline',
    title: 'Team Management',
    description:
      'Manage your coaching staff, organize recruiting boards, and collaborate with assistant coaches on prospect evaluations.',
  },
  {
    id: 'coaches-recruiting-analytics',
    icon: 'bar-chart-outline',
    title: 'Recruiting Analytics',
    description:
      'Track which athletes viewed your program, measure engagement with your messages, and monitor your pipeline conversion metrics.',
  },
  {
    id: 'coaches-direct-messaging',
    icon: 'mail-outline',
    title: 'Direct Messaging',
    description:
      'Message athletes and their families directly through NXT1. Keep all recruiting communication organized in one place.',
  },
];

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'coaches-college-coaches',
    icon: 'school-outline',
    title: 'College Coaches',
    description:
      "Search NXT1's database of 125,000+ verified athlete profiles, evaluate prospects, and build your recruiting pipeline with powerful tools.",
  },
  {
    id: 'coaches-high-school-coaches',
    icon: 'flag-outline',
    title: 'High School Coaches',
    description:
      'Help your players get recruited by managing their profiles, sharing highlight reels with college coaches, and tracking recruiting interest.',
  },
  {
    id: 'coaches-recruiting-coordinators',
    icon: 'trophy-outline',
    title: 'Recruiting Coordinators',
    description:
      'Manage the entire recruiting funnel from initial discovery to commitment. NXT1 gives your staff the data and tools to recruit efficiently.',
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'coaches-free',
    question: 'Is NXT1 free for coaches?',
    answer:
      'Yes! Coaches can create a free account to search athletes, view profiles, and watch highlights. Premium plans unlock advanced search filters, evaluation tools, and team collaboration features.',
  },
  {
    id: 'coaches-verified',
    question: 'How are athlete profiles verified?',
    answer:
      "Athletes earn verification through NXT1's XP system by completing profile sections, uploading film, and confirming academic records. Coach accounts can also see verification status at a glance.",
  },
  {
    id: 'coaches-share',
    question: 'Can I share prospect lists with my staff?',
    answer:
      'Absolutely. NXT1 includes shared recruiting boards where your coaching staff can collaborate on prospect evaluations, add notes, and track recruitment statuses in real time.',
  },
  {
    id: 'coaches-contact',
    question: 'How do I contact athletes on NXT1?',
    answer:
      "NXT1's direct messaging lets you reach athletes and their families through the platform. All communication is logged and organized by prospect for easy reference.",
  },
  {
    id: 'coaches-sports',
    question: 'What sports are covered on NXT1?',
    answer:
      'NXT1 covers 25+ sports including football, basketball, baseball, softball, soccer, volleyball, lacrosse, track & field, swimming, wrestling, and more. Every sport has sport-specific profile fields.',
  },
];

@Component({
  selector: 'nxt1-coaches-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtCoachesPreviewComponent,
  ],
  template: `
    <nxt1-hero-section
      badgeIcon="whistle-outline"
      badgeLabel="For Coaches"
      title="Recruit Smarter,"
      accentText="Not Harder"
      subtitle="Search 125,000+ verified athlete profiles, watch highlight reels, evaluate prospects, and manage your recruiting pipeline — all on one platform built for coaches."
      primaryCtaLabel="Start Recruiting"
      primaryCtaRoute="/auth/register"
      secondaryCtaLabel="Search Athletes"
      secondaryCtaRoute="/explore"
      ariaId="coaches-hero"
    >
      <nxt1-coaches-preview />
    </nxt1-hero-section>

    <nxt1-stats-bar [stats]="stats" />

    <nxt1-feature-showcase
      title="Your Recruiting Command Center"
      subtitle="NXT1 gives coaches the tools to find, evaluate, and connect with the right athletes — faster than ever."
      [features]="features"
    />

    <nxt1-audience-section
      title="Built for Every Coach"
      subtitle="College recruiters, high school coaches, and recruiting coordinators — NXT1 works at every level."
      [segments]="audiences"
    />

    <nxt1-faq-section
      title="Coach FAQs"
      subtitle="Common questions from coaches getting started with NXT1."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Find Your Next Recruit"
      subtitle="Join 3,000+ coaches already discovering talent on NXT1. Free to search, free to connect."
      ctaLabel="Start Recruiting"
      ctaRoute="/auth/register"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoachesLandingComponent {
  protected readonly stats = STATS;
  protected readonly features = FEATURES;
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
}
