/**
 * @fileoverview XP Landing Page — Shared UI Component
 * @module @nxt1/ui/xp
 * @version 1.0.0
 *
 * Public-facing marketing/landing page for the XP feature.
 * Shown to unauthenticated users at `/xp`.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator that composes shared,
 * reusable section components — exactly like the analytics landing page.
 * Each section can be reused on other feature landing pages.
 *
 * Component architecture:
 * NxtXpLandingComponent (orchestrator)
 *   NxtHeroSectionComponent            (shared hero — badge, title, CTAs, media slot)
 *     NxtXpDashboardPreviewComponent   (projected media)
 *   NxtStatsBarComponent               (reusable)
 *   NxtFeatureShowcaseComponent        (reusable)
 *   NxtAudienceSectionComponent        (reusable)
 *   NxtFaqSectionComponent             (reusable)
 *   NxtCtaBannerComponent              (reusable)
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
import { NxtXpDashboardPreviewComponent } from './xp-dashboard-preview.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const XP_STATS: StatsBarItem[] = [
  { value: '500K+', label: 'Missions Completed' },
  { value: '50K+', label: 'Athletes & Coaches' },
  { value: '19', label: 'Unique Badges to Earn' },
];

const XP_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'missions',
    icon: 'rocket-outline',
    title: 'Guided Missions',
    description:
      'Step-by-step tasks designed to build your profile, boost visibility, and accelerate your recruiting journey.',
  },
  {
    id: 'leveling',
    icon: 'trending-up-outline',
    title: 'Level Progression',
    description:
      'Advance from Rookie to Legend across 5 tiers. Earn XP with every completed mission and unlock new rewards.',
  },
  {
    id: 'badges',
    icon: 'ribbon-outline',
    title: 'Collectible Badges',
    description:
      '19 unique badges across 6 rarity tiers — from Common to Legendary. Showcase your achievements on your profile.',
  },
  {
    id: 'streaks',
    icon: 'flame-outline',
    title: 'Daily Streaks',
    description:
      'Stay consistent and build momentum. Maintain your streak for bonus XP multipliers and exclusive rewards.',
  },
  {
    id: 'role-based',
    icon: 'people-outline',
    title: 'Role-Specific Tasks',
    description:
      'Athletes get recruiting-focused missions. Coaches get team-building and scouting tasks. Every role has a path.',
  },
  {
    id: 'celebrations',
    icon: 'sparkles-outline',
    title: 'Achievement Celebrations',
    description:
      'Level up with confetti, earn badges with sparkles, and hit streaks with fireworks. Every win feels rewarding.',
  },
];

const XP_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes',
    description:
      'Complete recruiting missions, build your profile, and level up your exposure to college coaches.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches',
    title: 'Coaches & Programs',
    description:
      'Guided tasks for team setup, roster management, and recruiting outreach \u2014 all gamified.',
    icon: 'people-outline',
  },
  {
    id: 'parents',
    title: 'Parents & Families',
    description:
      'Track your athlete\u2019s mission progress, level, and engagement with the recruiting process.',
    icon: 'heart-outline',
  },
];

const XP_FAQS: FaqItem[] = [
  {
    id: 'what-is-xp',
    question: 'What is NXT1 XP?',
    answer:
      'NXT1 XP is a gamified mission system that guides athletes and coaches through meaningful tasks \u2014 like completing your profile, uploading highlights, and engaging with colleges. You earn XP (experience points) for every completed mission, level up through 5 tiers, and collect badges along the way.',
  },
  {
    id: 'levels',
    question: 'How does the leveling system work?',
    answer:
      'There are 5 levels: Rookie (0\u2013499 XP), Rising Star (500\u20131,499 XP), All-Star (1,500\u20133,499 XP), Elite (3,500\u20136,999 XP), and Legend (7,000+ XP). Each level unlocks new profile badges and recognition. Your level is displayed on your profile for coaches to see.',
  },
  {
    id: 'badges',
    question: 'What are badges and how do I earn them?',
    answer:
      'Badges are collectible achievements across 6 rarity tiers: Common, Uncommon, Rare, Epic, Legendary, and Mythic. You earn them by completing specific milestones \u2014 like finishing all profile missions (Profile Pro), uploading multiple videos (Media Master), or maintaining a 30-day streak (Streak Champion).',
  },
  {
    id: 'streaks',
    question: 'How do streaks work?',
    answer:
      'Complete at least one mission per day to build your streak. Streaks unlock bonus XP multipliers and exclusive badges. If you miss a day, your streak resets \u2014 but you\u2019ll get a gentle reminder before it\u2019s at risk. Your best streak is always saved.',
  },
  {
    id: 'free-xp',
    question: 'Is XP free to use?',
    answer:
      'Yes! The full XP system is available to all NXT1 users for free \u2014 including missions, leveling, badges, and streaks. Premium users get access to bonus missions and exclusive badge tiers.',
  },
];

@Component({
  selector: 'nxt1-xp-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtHeroSectionComponent,
    NxtXpDashboardPreviewComponent,
  ],
  template: `
    <!-- Hero Section — uses shared NxtHeroSectionComponent -->
    <nxt1-hero-section
      badgeIcon="rocket-outline"
      badgeLabel="XP &amp; Missions"
      title="Level Up Your"
      accentText="Recruiting Game"
      subtitle="Complete missions, earn XP, collect badges, and climb the ranks. A gamified path that turns recruiting goals into daily wins."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Log In"
      secondaryCtaRoute="/auth"
      ariaId="xp-hero-title"
    >
      <nxt1-xp-dashboard-preview />
    </nxt1-hero-section>

    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Everything You Need to Level Up"
      subtitle="Guided missions, achievement badges, and streak rewards &mdash; designed to keep you progressing every day."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for Every Role"
      subtitle="Whether you&rsquo;re an athlete building your profile or a coach managing a roster &mdash; XP keeps you on track."
      [segments]="audiences"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="XP &amp; Missions FAQ"
      subtitle="Common questions about the NXT1 gamified mission system."
      [items]="faqs"
      defaultOpenId="what-is-xp"
    />

    <!-- Bottom CTA -->
    <nxt1-cta-banner
      title="Ready to Start Earning XP?"
      subtitle="Join thousands of athletes and coaches leveling up their recruiting journey."
      ctaLabel="Sign Up Free"
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
export class NxtXpLandingComponent {
  protected readonly stats = XP_STATS;
  protected readonly features = XP_FEATURES;
  protected readonly audiences = XP_AUDIENCES;
  protected readonly faqs = XP_FAQS;
}
