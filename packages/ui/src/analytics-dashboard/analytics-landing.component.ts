/**
 * @fileoverview Analytics Landing Page — Shared UI Component
 * @module @nxt1/ui/analytics-dashboard
 * @version 2.0.0
 *
 * Public-facing marketing/landing page for the Analytics feature.
 * Shown to unauthenticated users at `/analytics`.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator that composes shared,
 * reusable section components — exactly like the root landing page.
 * Each section can be reused on other feature landing pages
 * (/xp, /profile, /scout-reports, etc.).
 *
 * Component architecture:
 * NxtAnalyticsLandingComponent (orchestrator)
 *   NxtHeroSectionComponent     (shared hero — badge, title, CTAs, media slot)
 *     NxtAnalyticsDashboardPreviewComponent (projected media)
 *   NxtStatsBarComponent        (reusable)
 *   NxtFeatureShowcaseComponent (reusable)
 *   NxtAudienceSectionComponent (reusable)
 *   NxtFaqSectionComponent      (reusable)
 *   NxtCtaBannerComponent       (reusable)
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
import { NxtAnalyticsDashboardPreviewComponent } from './analytics-dashboard-preview.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const ANALYTICS_STATS: StatsBarItem[] = [
  { value: '2.1M+', label: 'Data Points Tracked' },
  { value: '50K+', label: 'Athletes & Coaches' },
  { value: '8,400+', label: 'College Programs Connected' },
];

const ANALYTICS_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'profile-views',
    icon: 'eye-outline',
    title: 'Profile & Roster Views',
    description:
      'Athletes see which coaches are watching. Coaches see which recruits are engaging with their program.',
  },
  {
    id: 'engagement',
    icon: 'trending-up-outline',
    title: 'Engagement Tracking',
    description:
      'Track likes, comments, shares, and follower growth. Understand what content drives recruiting attention.',
  },
  {
    id: 'video-analytics',
    icon: 'videocam-outline',
    title: 'Video Performance',
    description:
      'Detailed view counts, watch time, and completion rates for every highlight reel and game film.',
  },
  {
    id: 'recruiting',
    icon: 'school-outline',
    title: 'Recruiting Pipeline',
    description:
      'Athletes track coach interest in real time. Coaches track prospect engagement and build target lists.',
  },
  {
    id: 'insights',
    icon: 'bulb-outline',
    title: 'AI-Powered Insights',
    description:
      'Personalized recommendations on when to post, what content performs best, and where to focus next.',
  },
  {
    id: 'export',
    icon: 'download-outline',
    title: 'Export & Share',
    description:
      'Download PDF reports to share with coaches, parents, recruiting coordinators, or your athletic department.',
  },
];

const ANALYTICS_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes',
    description:
      'See exactly who\u2019s watching your profile, track recruiting interest, and optimize your exposure.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches',
    title: 'Coaches & Programs',
    description:
      'Monitor prospect engagement, track roster visibility, and measure your program\u2019s recruiting reach.',
    icon: 'people-outline',
  },
  {
    id: 'parents',
    title: 'Parents & Families',
    description:
      'Stay informed about your athlete\u2019s recruiting progress, coach interest, and overall exposure.',
    icon: 'heart-outline',
  },
];

const ANALYTICS_FAQS: FaqItem[] = [
  {
    id: 'what-is-analytics',
    question: 'What does the Analytics dashboard track?',
    answer:
      'The Analytics dashboard tracks profile views, video performance, engagement metrics, follower growth, and recruiting pipeline activity \u2014 for both athletes and coaches. Every interaction is captured and presented in clear, actionable charts and insights.',
  },
  {
    id: 'who-viewed',
    question: 'Can I see who viewed my profile?',
    answer:
      'Yes. Athletes see verified college coaches and scouts who visit their profile, categorized by division, sport, and program. Coaches see which prospects and recruits are engaging with their program page.',
  },
  {
    id: 'ai-insights',
    question: 'How do AI-powered insights work?',
    answer:
      'Our AI analyzes your content performance, engagement patterns, and recruiting activity to deliver actionable recommendations \u2014 like the best time to post highlights, which prospects to engage, or which colleges to target.',
  },
  {
    id: 'free-analytics',
    question: 'Is analytics included in the free plan?',
    answer:
      'Core analytics including profile views and basic engagement stats are free for all users. Advanced features like recruiting pipeline tracking, AI insights, and PDF exports are available with premium plans.',
  },
  {
    id: 'data-freshness',
    question: 'How often is analytics data updated?',
    answer:
      'Analytics data refreshes in near real-time. Most metrics update within minutes, while aggregated reports and AI insights refresh every few hours for accuracy.',
  },
];

@Component({
  selector: 'nxt1-analytics-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtHeroSectionComponent,
    NxtAnalyticsDashboardPreviewComponent,
  ],
  template: `
    <!-- Hero Section — uses shared NxtHeroSectionComponent -->
    <nxt1-hero-section
      badgeIcon="analytics-outline"
      badgeLabel="Analytics Dashboard"
      title="Your Recruiting Edge,"
      accentText="Powered by Data"
      subtitle="Real-time analytics for athletes and coaches. Track profile views, video performance, and recruiting interest — all in one powerful dashboard."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Log In"
      secondaryCtaRoute="/auth"
      ariaId="analytics-hero-title"
    >
      <nxt1-analytics-dashboard-preview />
    </nxt1-hero-section>

    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Everything Athletes & Coaches Need"
      subtitle="From profile views to recruiting pipelines &mdash; data-driven tools for every side of the recruiting process."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for Every Role"
      subtitle="Whether you&rsquo;re an athlete, coach, or parent &mdash; analytics gives you the edge."
      [segments]="audiences"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Analytics FAQ"
      subtitle="Common questions about recruiting analytics for athletes and coaches."
      [items]="faqs"
      defaultOpenId="what-is-analytics"
    />

    <!-- Bottom CTA -->
    <nxt1-cta-banner
      title="Ready to Unlock Your Recruiting Analytics?"
      subtitle="Join thousands of athletes and coaches using NXT1 to gain a competitive edge."
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
export class NxtAnalyticsLandingComponent {
  protected readonly stats = ANALYTICS_STATS;
  protected readonly features = ANALYTICS_FEATURES;
  protected readonly audiences = ANALYTICS_AUDIENCES;
  protected readonly faqs = ANALYTICS_FAQS;
}
