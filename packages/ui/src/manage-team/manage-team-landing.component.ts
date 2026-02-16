/**
 * @fileoverview Manage Team Landing Page — Shared UI Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Public-facing marketing/landing page for the Manage Team feature.
 * Shown to unauthenticated users at `/manage-team`.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator that composes shared,
 * reusable section components — matching analytics and XP landing pages.
 *
 * Component architecture:
 * NxtManageTeamLandingComponent (orchestrator)
 *   NxtHeroSectionComponent                    (shared hero — badge, title, CTAs, media slot)
 *     NxtManageTeamDashboardPreviewComponent   (projected media)
 *   NxtStatsBarComponent                       (reusable)
 *   NxtFeatureShowcaseComponent                (reusable)
 *   NxtAudienceSectionComponent                (reusable)
 *   NxtFaqSectionComponent                     (reusable)
 *   NxtCtaBannerComponent                      (reusable)
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
import { NxtManageTeamDashboardPreviewComponent } from './manage-team-dashboard-preview.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const TEAM_STATS: StatsBarItem[] = [
  { value: '12K+', label: 'Teams Managed' },
  { value: '180K+', label: 'Rostered Athletes' },
  { value: '8,400+', label: 'College Programs' },
];

const TEAM_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'roster',
    icon: 'people-outline',
    title: 'Roster Management',
    description:
      'Add, invite, and organize your players with positions, jersey numbers, class years, and status tracking — all in one place.',
  },
  {
    id: 'schedule',
    icon: 'calendar-outline',
    title: 'Schedule & Results',
    description:
      'Manage games, scrimmages, practices, and tournaments. Track scores and build your season record automatically.',
  },
  {
    id: 'stats',
    icon: 'stats-chart-outline',
    title: 'Stats & Record',
    description:
      'Display your team\u2019s win-loss record, conference standings, and rankings. Sync data from MaxPreps, Hudl, and more.',
  },
  {
    id: 'branding',
    icon: 'color-palette-outline',
    title: 'Team Branding',
    description:
      'Upload your logo, set team colors, and customize your program\u2019s identity. Your brand travels everywhere on NXT1.',
  },
  {
    id: 'staff',
    icon: 'briefcase-outline',
    title: 'Staff Directory',
    description:
      'List your coaching staff and support personnel with roles, titles, bios, and certifications \u2014 organized by position.',
  },
  {
    id: 'integrations',
    icon: 'link-outline',
    title: 'External Integrations',
    description:
      'Connect MaxPreps, Hudl, GameChanger, Scorebook Live, NCSA, and Perfect Game to sync stats and schedules automatically.',
  },
];

const TEAM_AUDIENCES: AudienceSegment[] = [
  {
    id: 'head-coaches',
    title: 'Head Coaches',
    description:
      'Full control over your program \u2014 roster, schedule, branding, staff, and integrations in one dashboard.',
    icon: 'shield-outline',
  },
  {
    id: 'assistants',
    title: 'Assistant Coaches & Staff',
    description:
      'Collaborate on roster updates, schedule management, and stat entry with role-based access.',
    icon: 'people-outline',
  },
  {
    id: 'athletes',
    title: 'Athletes & Parents',
    description:
      'See your team\u2019s schedule, roster, and record. Stay connected with your program and coaching staff.',
    icon: 'flash-outline',
  },
];

const TEAM_FAQS: FaqItem[] = [
  {
    id: 'what-is-manage-team',
    question: 'What can I do with Manage Team?',
    answer:
      'Manage Team is a complete team dashboard for coaches. You can manage your roster, schedule games and events, track your win-loss record, list coaching staff, manage sponsors, and connect external data sources like MaxPreps and Hudl \u2014 all from one place.',
  },
  {
    id: 'who-can-manage',
    question: 'Who can access the team management dashboard?',
    answer:
      'Head coaches and team administrators have full access. Assistant coaches can be granted specific permissions to manage roster, schedule, or stats. Athletes and parents can view the team page but cannot edit.',
  },
  {
    id: 'integrations',
    question: 'What integrations are supported?',
    answer:
      'NXT1 connects with MaxPreps, Hudl, GameChanger, Scorebook Live, NCSA, and Perfect Game. Sync your stats, schedules, and roster data automatically. More integrations are added regularly.',
  },
  {
    id: 'multiple-teams',
    question: 'Can I manage multiple teams?',
    answer:
      'Yes. Coaches who work with multiple teams across different sports or seasons can manage each one from their account. Switch between teams easily from the sidebar navigation.',
  },
  {
    id: 'free-team',
    question: 'Is team management free?',
    answer:
      'Core team management features \u2014 including roster, schedule, and record tracking \u2014 are free for all coaches. Advanced features like sponsor management, external integrations, and premium branding are available with a coaching plan.',
  },
];

@Component({
  selector: 'nxt1-manage-team-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtHeroSectionComponent,
    NxtManageTeamDashboardPreviewComponent,
  ],
  template: `
    <!-- Hero Section — uses shared NxtHeroSectionComponent -->
    <nxt1-hero-section
      badgeIcon="shield-outline"
      badgeLabel="Team Management"
      title="Your Program,"
      accentText="Fully Organized"
      subtitle="Manage your roster, schedule, stats, and staff from one powerful dashboard. Everything coaches need to run a winning program."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth/register"
      secondaryCtaLabel="Log In"
      secondaryCtaRoute="/auth/login"
      ariaId="manage-team-hero-title"
    >
      <nxt1-manage-team-dashboard-preview />
    </nxt1-hero-section>

    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Everything Coaches Need in One Place"
      subtitle="From roster management to stat integrations &mdash; tools built for the way coaches actually work."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for Your Entire Program"
      subtitle="Head coaches, assistants, athletes, and parents &mdash; everyone stays connected."
      [segments]="audiences"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Team Management FAQ"
      subtitle="Common questions about managing your program on NXT1."
      [items]="faqs"
      defaultOpenId="what-is-manage-team"
    />

    <!-- Bottom CTA -->
    <nxt1-cta-banner
      title="Ready to Organize Your Program?"
      subtitle="Join thousands of coaches managing their teams on NXT1."
      ctaLabel="Sign Up Free"
      ctaRoute="/auth/register"
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
export class NxtManageTeamLandingComponent {
  protected readonly stats = TEAM_STATS;
  protected readonly features = TEAM_FEATURES;
  protected readonly audiences = TEAM_AUDIENCES;
  protected readonly faqs = TEAM_FAQS;
}
