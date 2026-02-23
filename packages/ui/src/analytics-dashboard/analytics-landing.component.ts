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
import { NxtCtaBannerComponent } from '../components/cta-banner';
import { NxtFaqSectionComponent, type FaqItem } from '../components/faq-section';
import { NxtStatsBarComponent, type StatsBarItem } from '../components/stats-bar';
import { NxtHeroSectionComponent } from '../components/hero-section';
import { NxtAnalyticsDashboardPreviewComponent } from './analytics-dashboard-preview.component';
import { RecruitingCrmWatchPanelComponent } from './web/recruiting-crm-watch-panel.component';
import { ReportCardSectionComponent } from './web/report-card-section.component';
import { TimeMachineSectionComponent } from './web/time-machine-section.component';
import { AiInterpretationSectionComponent } from './web/ai-interpretation-section.component';
import { WeeklyPulseSectionComponent } from './web/weekly-pulse-section.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const ANALYTICS_STATS: StatsBarItem[] = [
  { value: '2.1M+', label: 'Data Points Tracked' },
  { value: '50K+', label: 'Athletes & Coaches' },
  { value: '8,400+', label: 'College Programs Connected' },
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
    NxtCtaBannerComponent,
    NxtStatsBarComponent,
    NxtFaqSectionComponent,
    NxtHeroSectionComponent,
    NxtAnalyticsDashboardPreviewComponent,
    RecruitingCrmWatchPanelComponent,
    ReportCardSectionComponent,
    TimeMachineSectionComponent,
    AiInterpretationSectionComponent,
    WeeklyPulseSectionComponent,
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

    <!-- Weekly Pulse — Trajectory Tracking -->
    <nxt1-weekly-pulse-section />

    <!-- Time Machine — Granular Date Control -->
    <nxt1-time-machine-section />

    <!-- AI Interpretation — The Stat vs. The Insight -->
    <nxt1-ai-interpretation-section />

    <!-- Recruiting CRM — "Who is Watching?" -->
    <div class="crm-landing-section">
      <nxt1-recruiting-crm-watch-panel />
    </div>

    <!-- The Report Card — Weekly Scouting Report -->
    <nxt1-report-card-section />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Analytics FAQ"
      subtitle="Common questions about recruiting analytics for athletes and coaches."
      [items]="faqs"
      defaultOpenId="what-is-analytics"
    />

    <!-- Final CTA -->
    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Analytics"
      title="Your Data. Your Edge."
      subtitle="Track profile views, video performance, and recruiting interest — all in one powerful dashboard. Start free today."
      ctaLabel="Get Started Free"
      ctaRoute="/auth"
      titleId="analytics-landing-final-cta-title"
    />
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .crm-landing-section {
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAnalyticsLandingComponent {
  protected readonly stats = ANALYTICS_STATS;
  protected readonly faqs = ANALYTICS_FAQS;
}
