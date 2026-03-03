/**
 * @fileoverview Parents Persona Landing Page
 * @module @nxt1/ui/personas/parents
 * @version 1.0.0
 *
 * Orchestrator for the `/parents` persona marketing page.
 * Composes shared NXT1 section components with parent-specific
 * content giving parents transparency into their child's
 * recruiting journey, profile progress, and coach interest.
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
import { NxtKillerComparisonComponent } from '@nxt1/ui/components/nxt1-killer-comparison';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtParentsPreviewComponent } from './parents-preview.component';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const STATS: StatsBarItem[] = [
  { label: 'Families on NXT1', value: '85K+' },
  { label: 'Coach Connections Made', value: '5K+' },
  { label: 'Profile Views Monthly', value: '2M+' },
  { label: 'Scholarship Opportunities', value: '10K+' },
];

const FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'parents-recruiting-transparency',
    icon: 'eye-outline',
    title: 'Recruiting Transparency',
    description:
      "See exactly who's viewing your child's profile, which coaches sent messages, and what watchlists they've been added to — in real time.",
  },
  {
    id: 'parents-profile-checklist',
    icon: 'checkmark-circle',
    title: 'Profile Checklist',
    description:
      "Know exactly what sections need to be completed to maximize your child's exposure. Our guided checklist ensures nothing gets missed.",
  },
  {
    id: 'parents-privacy-safety',
    icon: 'shield-outline',
    title: 'Privacy & Safety',
    description:
      "NXT1 verifies coach accounts and protects athlete data. You control what's visible and who can contact your student-athlete.",
  },
  {
    id: 'parents-college-research-tools',
    icon: 'school-outline',
    title: 'College Research Tools',
    description:
      'Explore college programs together. Filter by academics, athletics, location, and tuition to find the right fit for your family.',
  },
  {
    id: 'parents-progress-tracking',
    icon: 'bar-chart-outline',
    title: 'Progress Tracking',
    description:
      "Monitor your child's recruiting development over time. See XP growth, profile engagement trends, and coach interaction history.",
  },
  {
    id: 'parents-activity-alerts',
    icon: 'notifications-outline',
    title: 'Activity Alerts',
    description:
      "Get notified when a coach views your child's profile, sends a message, or adds them to a watchlist. Never miss an opportunity.",
  },
];

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'parents-freshman-sophomore',
    icon: 'person-outline',
    title: 'Freshman & Sophomore Parents',
    description:
      "It's never too early to start the recruiting process. Build your child's profile now and track their growth through graduation.",
  },
  {
    id: 'parents-junior-senior',
    icon: 'trending-up-outline',
    title: 'Junior & Senior Parents',
    description:
      "The recruiting clock is ticking. Make sure your child's profile is complete, highlights are uploaded, and coaches can find them.",
  },
  {
    id: 'parents-multi-sport-families',
    icon: 'people-outline',
    title: 'Multi-Sport Families',
    description:
      "Managing multiple athletes? NXT1 lets you oversee all your children's recruiting profiles from a single family dashboard.",
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'parents-help',
    question: "How can I help with my child's recruiting profile?",
    answer:
      "Parents can help by ensuring profile sections are complete, uploading highlight videos, confirming academic information, and monitoring coach interest through the family dashboard. NXT1's checklist tool guides you through every step.",
  },
  {
    id: 'parents-safety',
    question: "Is my child's information safe on NXT1?",
    answer:
      'Absolutely. NXT1 verifies all coach accounts, encrypts personal data, and gives families full control over privacy settings. You choose what information is public and who can message your student-athlete.',
  },
  {
    id: 'parents-when-start',
    question: 'When should my child create a recruiting profile?',
    answer:
      'The earlier the better! College coaches are evaluating talent as early as 8th grade in many sports. Creating a profile early lets you track development and build a recruiting history that coaches value.',
  },
  {
    id: 'parents-free-plan',
    question: 'What does the free plan include?',
    answer:
      'Every family gets a free recruiting profile with unlimited highlight uploads, profile analytics, and college search tools. Premium tiers add priority visibility, advanced notifications, and detailed recruiting reports.',
  },
  {
    id: 'parents-multi-child',
    question: "Can I manage multiple children's profiles?",
    answer:
      "Yes! NXT1's family dashboard lets you manage recruiting profiles for all your student-athletes from a single account. Switch between profiles and track each child's recruiting progress independently.",
  },
];

@Component({
  selector: 'nxt1-parents-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtKillerComparisonComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtParentsPreviewComponent,
  ],
  template: `
    <nxt1-hero-section
      badgeIcon="people-outline"
      badgeLabel="For Parents"
      title="Stay Connected to"
      accentText="Their Journey"
      subtitle="Track your child's recruiting progress, see who's watching, and know exactly what to do next — NXT1 gives parents full visibility into the recruiting process."
      primaryCtaLabel="Create Free Account"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Learn More"
      secondaryCtaRoute="/explore"
      ariaId="parents-hero"
    >
      <nxt1-parents-preview />
    </nxt1-hero-section>

    <nxt1-stats-bar [stats]="stats" />

    <nxt1-feature-showcase
      title="Everything Parents Need to Know"
      subtitle="NXT1 takes the guesswork out of recruiting. Get real-time insights, guided checklists, and peace of mind."
      [features]="features"
    />

    <nxt1-audience-section
      title="Supporting Families at Every Stage"
      subtitle="Whether your child is just starting out or deep in the recruiting process, NXT1 has tools for your family."
      [segments]="audiences"
    />

    <nxt1-killer-comparison />

    <nxt1-faq-section
      title="Parent FAQs"
      subtitle="Answers to the questions parents ask most about the recruiting process."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Support Your Child's Dream"
      subtitle="Join 85,000+ families using NXT1 to navigate the recruiting process with confidence."
      ctaLabel="Get Started Free"
      ctaRoute="/auth"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtParentsLandingComponent {
  protected readonly stats = STATS;
  protected readonly features = FEATURES;
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
}
