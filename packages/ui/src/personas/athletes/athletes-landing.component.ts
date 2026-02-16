/**
 * @fileoverview Athletes Persona Landing Page
 * @module @nxt1/ui/personas/athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/athletes` persona marketing page.
 * Composes shared NXT1 section components with athlete-specific
 * content aimed at high-school and club student-athletes looking
 * to build a recruiting profile, upload highlights, and get
 * exposure to college coaches.
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
import { NxtSiteFooterComponent } from '../../components/site-footer';
import { NxtAthletesPreviewComponent } from './athletes-preview.component';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const STATS: StatsBarItem[] = [
  { label: 'Athletes on NXT1', value: '125K+' },
  { label: 'Profile Views Monthly', value: '2M+' },
  { label: 'College Connections', value: '5K+' },
  { label: 'Highlight Uploads', value: '500K+' },
];

const FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'athletes-recruiting-profile',
    icon: 'person-outline',
    title: 'Recruiting Profile',
    description:
      'Build a verified profile with stats, academics, measurables, and contact info that college coaches search for every day.',
  },
  {
    id: 'athletes-highlight-reels',
    icon: 'videocam-outline',
    title: 'Highlight Reels',
    description:
      'Upload game film and training clips with our built-in video editor. Auto-generate highlight reels that showcase your best plays.',
  },
  {
    id: 'athletes-performance-analytics',
    icon: 'bar-chart-outline',
    title: 'Performance Analytics',
    description:
      'Track who viewed your profile, which coaches are interested, and how your recruiting stock is trending over time.',
  },
  {
    id: 'athletes-xp-rankings',
    icon: 'rocket-outline',
    title: 'XP & Rankings',
    description:
      'Earn XP by completing your profile, posting highlights, and engaging with the community. Climb the leaderboard to boost visibility.',
  },
  {
    id: 'athletes-college-discovery',
    icon: 'school-outline',
    title: 'College Discovery',
    description:
      'Search thousands of college programs by sport, division, location, and academic fit. Find the schools that match your goals.',
  },
  {
    id: 'athletes-verified-exposure',
    icon: 'shield-outline',
    title: 'Verified Exposure',
    description:
      'Get your profile in front of verified college coaches and scouts through our curated matchmaking and exposure events.',
  },
];

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes-high-school',
    icon: 'football-outline',
    title: 'High School Athletes',
    description:
      'Start building your recruiting profile as early as freshman year. Track your development through graduation and get noticed.',
  },
  {
    id: 'athletes-club-travel',
    icon: 'trophy-outline',
    title: 'Club & Travel Athletes',
    description:
      'Showcase your year-round performance across club, travel, and AAU seasons. One profile to rule every showcase and tournament.',
  },
  {
    id: 'athletes-transfer-portal',
    icon: 'school-outline',
    title: 'Transfer Portal Athletes',
    description:
      'Already in college? Use NXT1 to manage your transfer portal profile, connect with new programs, and find your next opportunity.',
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'athletes-free',
    question: 'Is NXT1 free for athletes?',
    answer:
      'Yes! Every athlete gets a free recruiting profile with unlimited highlight uploads. Premium tiers offer additional analytics, priority visibility, and advanced video tools.',
  },
  {
    id: 'athletes-sports',
    question: 'What sports does NXT1 support?',
    answer:
      'NXT1 supports all major high school and college sports including football, basketball, baseball, softball, soccer, volleyball, lacrosse, track & field, swimming, and more.',
  },
  {
    id: 'athletes-coaches-find',
    question: 'How do college coaches find my profile?',
    answer:
      "College coaches use NXT1's search and filtering tools to discover athletes by sport, position, location, graduation year, and performance metrics. A complete profile dramatically increases your visibility.",
  },
  {
    id: 'athletes-highlights',
    question: 'Can I upload game film and highlights?',
    answer:
      'Absolutely. NXT1 includes a built-in video editor that lets you upload, trim, and compile highlights from game film. You can also embed links from YouTube or Hudl.',
  },
  {
    id: 'athletes-when-start',
    question: 'When should I start my recruiting profile?',
    answer:
      'The earlier the better! Many athletes create their NXT1 profile as early as 8th grade or freshman year. Starting early lets you track development and build a history that impresses coaches.',
  },
];

@Component({
  selector: 'nxt1-athletes-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
    NxtAthletesPreviewComponent,
  ],
  template: `
    <nxt1-hero-section
      badgeIcon="person-outline"
      badgeLabel="For Athletes"
      title="Your Recruiting Journey"
      accentText="Starts Here"
      subtitle="Build a verified recruiting profile, upload highlights, track analytics, and connect with college coaches — all in one platform built for student-athletes."
      primaryCtaLabel="Create Free Profile"
      primaryCtaRoute="/auth/register"
      secondaryCtaLabel="Browse Athletes"
      secondaryCtaRoute="/explore"
      ariaId="athletes-hero"
    >
      <nxt1-athletes-preview />
    </nxt1-hero-section>

    <nxt1-stats-bar [stats]="stats" />

    <nxt1-feature-showcase
      title="Everything You Need to Get Recruited"
      subtitle="NXT1 gives you the tools college coaches actually look for — a professional profile, highlight reels, performance data, and direct connections."
      [features]="features"
    />

    <nxt1-audience-section
      title="Built for Every Athlete"
      subtitle="Whether you're a high school freshman or a college transfer, NXT1 adapts to your recruiting stage."
      [segments]="audiences"
    />

    <nxt1-faq-section
      title="Athlete FAQs"
      subtitle="Everything you need to know about getting started on NXT1."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Ready to Get Recruited?"
      subtitle="Join 125,000+ athletes already using NXT1 to build their recruiting profile and connect with college coaches."
      ctaLabel="Create Free Profile"
      ctaRoute="/auth/register"
    />

    <nxt1-site-footer />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAthletesLandingComponent {
  protected readonly stats = STATS;
  protected readonly features = FEATURES;
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
}
