/**
 * @fileoverview Athlete Profiles Landing Page — Shared UI Component
 * @module @nxt1/ui/athlete-profiles
 * @version 1.0.0
 *
 * Public-facing marketing/directory landing page for athlete profiles.
 * Shown at `/athlete-profiles`. Primarily targets unauthenticated
 * users searching for athlete recruiting profiles.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator that composes shared,
 * reusable section components — matching analytics, XP,
 * manage-team, and usage landing pages.
 *
 * Component architecture:
 * NxtAthleteProfilesLandingComponent (orchestrator)
 *   NxtHeroSectionComponent                     (shared hero — badge, title, CTAs, media slot)
 *     NxtAthleteProfilesPreviewComponent         (projected media)
 *   NxtStatsBarComponent                         (reusable)
 *   NxtFeatureShowcaseComponent                  (reusable)
 *   NxtAudienceSectionComponent                  (reusable)
 *   NxtFaqSectionComponent                       (reusable)
 *   NxtCtaBannerComponent                        (reusable)
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtFaqSectionComponent, type FaqItem } from '../components/faq-section';
import { NxtStatsBarComponent, type StatsBarItem } from '../components/stats-bar';
import {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from '../components/feature-showcase';
import { NxtAudienceSectionComponent, type AudienceSegment } from '../components/audience-section';
import { NxtCtaBannerComponent } from '../components/cta-banner';
import { NxtHeroSectionComponent } from '../components/hero-section';
import { NxtRecruitmentEngineComponent } from '../components/recruitment-engine';
import { NxtAthleteProfilesPreviewComponent } from './athlete-profiles-preview.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const PROFILES_STATS: StatsBarItem[] = [
  { value: '42K+', label: 'Athlete Profiles' },
  { value: '19', label: 'Sports Covered' },
  { value: '8,400+', label: 'College Programs' },
];

const PROFILES_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'profiles',
    icon: 'person-circle-outline',
    title: 'Rich Athlete Profiles',
    description:
      'Every profile showcases sport, position, physical measurables, academics, highlights, and contact info \u2014 everything a college coach needs.',
  },
  {
    id: 'search',
    icon: 'search-outline',
    title: 'Powerful Search & Filters',
    description:
      'Search by name, sport, position, class year, location, GPA, or measurables. Find the exact talent you\u2019re looking for in seconds.',
  },
  {
    id: 'highlights',
    icon: 'videocam-outline',
    title: 'Highlight Videos',
    description:
      'Athletes pin their best highlight reels directly to their profile. Watch clips, full games, and skills videos without leaving the page.',
  },
  {
    id: 'verified',
    icon: 'shield-checkmark-outline',
    title: 'Verified Athletes',
    description:
      'Verified badges confirm identity and credentials. Coaches can recruit with confidence knowing profiles are authentic and up-to-date.',
  },
  {
    id: 'academics',
    icon: 'school-outline',
    title: 'Academic Credentials',
    description:
      'GPA, SAT, ACT, and class rank are displayed prominently. Academic eligibility is visible at a glance for every prospect.',
  },
  {
    id: 'contact',
    icon: 'mail-outline',
    title: 'Direct Contact & Offers',
    description:
      'Message athletes directly, send interest indicators, and track offer status. The recruiting pipeline starts right from the profile.',
  },
];

const PROFILES_AUDIENCES: AudienceSegment[] = [
  {
    id: 'coaches',
    title: 'College Coaches & Scouts',
    description:
      'Search, filter, and evaluate thousands of prospects. Watch highlights, check academics, and reach out \u2014 all from one platform.',
    icon: 'trophy-outline',
  },
  {
    id: 'athletes',
    title: 'High School Athletes',
    description:
      'Build your recruiting profile, showcase your highlight reel, and get discovered by college programs across the country.',
    icon: 'flash-outline',
  },
  {
    id: 'parents',
    title: 'Parents & Families',
    description:
      'Help your student-athlete get exposure. See what coaches see, track recruiting interest, and stay informed every step of the way.',
    icon: 'people-outline',
  },
];

const PROFILES_FAQS: FaqItem[] = [
  {
    id: 'what-is-profiles',
    question: 'What is the NXT1 athlete profile directory?',
    answer:
      'The NXT1 athlete profiles directory is a searchable database of high school and club athletes across 19 sports. Each profile includes the athlete\u2019s sport, position, measurables, academics, highlights, school info, and contact details \u2014 designed for college coaches to evaluate and recruit.',
  },
  {
    id: 'how-to-create',
    question: 'How do I create an athlete profile?',
    answer:
      'Sign up for a free NXT1 account, select your role as an athlete, and follow the guided onboarding. You\u2019ll add your sport, position, physical stats, academics, highlight videos, and school. Your profile is searchable immediately once published.',
  },
  {
    id: 'who-can-see',
    question: 'Who can see my profile?',
    answer:
      'Published profiles are publicly visible and SEO-indexed, meaning college coaches can find you through NXT1 search or even Google. You control what information is displayed and can set your contact preferences.',
  },
  {
    id: 'coaches-search',
    question: 'How do coaches find athletes?',
    answer:
      'Coaches can search by sport, position, class year, location, GPA, height, weight, and more. They can also filter by verified status, highlight availability, and recruiting interest. Results can be sorted by relevance, class year, or proximity.',
  },
  {
    id: 'is-free',
    question: 'Is creating a profile free?',
    answer:
      'Yes. Creating and maintaining an NXT1 athlete profile is completely free. Athletes can add unlimited highlight videos, update their stats anytime, and receive messages from coaches at no cost. Premium features like advanced analytics and AI scouting are available with optional plans.',
  },
];

@Component({
  selector: 'nxt1-athlete-profiles-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtHeroSectionComponent,
    NxtRecruitmentEngineComponent,
    NxtAthleteProfilesPreviewComponent,
  ],
  template: `
    <!-- Hero Section — uses shared NxtHeroSectionComponent -->
    <nxt1-hero-section
      badgeIcon="people-outline"
      badgeLabel="Athlete Directory"
      title="Discover Top"
      accentText="Athletic Talent"
      subtitle="Browse thousands of verified athlete profiles across 19 sports. Search by position, class year, location, and academics — find your next recruit in seconds."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Log In"
      secondaryCtaRoute="/auth"
      ariaId="athlete-profiles-hero-title"
    >
      <nxt1-athlete-profiles-preview />
    </nxt1-hero-section>

    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Everything Coaches &amp; Athletes Need"
      subtitle="Comprehensive profiles built for serious recruiting &mdash; from highlight videos to academic credentials."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for the Entire Recruiting Ecosystem"
      subtitle="Coaches discover talent. Athletes get exposure. Parents stay informed."
      [segments]="audiences"
    />

    <!-- Recruitment Engine: USA Map + Live Recruiting Pulse -->
    @defer (on viewport) {
      <section aria-labelledby="recruitment-engine-title">
        <nxt1-hero-section
          [headingLevel]="2"
          badgeLabel="Recruiting Engine"
          title="The Pulse of"
          accentText="Recruiting."
          subtitle="See where the offers are flying right now."
          support="Recruitment Engine (Live Data): Verified biometrics, embedded transcripts, NIL valuation, and a live highlight feed built for real recruiting decisions."
          ariaId="recruitment-engine-title"
        >
          <nxt1-recruitment-engine />
        </nxt1-hero-section>
      </section>
    } @placeholder {
      <div style="min-height: 400px" aria-hidden="true"></div>
    }

    <!-- FAQ -->
    <nxt1-faq-section
      title="Athlete Profiles FAQ"
      subtitle="Common questions about creating, managing, and discovering athlete profiles on NXT1."
      [items]="faqs"
      defaultOpenId="what-is-profiles"
    />

    <!-- Bottom CTA -->
    <nxt1-cta-banner
      title="Ready to Get Discovered?"
      subtitle="Create your free athlete profile and start your recruiting journey today."
      ctaLabel="Create Your Profile"
      ctaRoute="/auth"
    />
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAthleteProfilesLandingComponent {
  protected readonly stats = PROFILES_STATS;
  protected readonly features = PROFILES_FEATURES;
  protected readonly audiences = PROFILES_AUDIENCES;
  protected readonly faqs = PROFILES_FAQS;
}
