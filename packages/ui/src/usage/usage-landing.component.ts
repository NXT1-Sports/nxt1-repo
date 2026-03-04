/**
 * @fileoverview Usage & Billing Landing Page — Shared UI Component
 * @module @nxt1/ui/usage
 * @version 1.0.0
 *
 * Public-facing marketing/landing page for the Usage & Billing feature.
 * Shown to unauthenticated users at `/usage`.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator that composes shared,
 * reusable section components — matching analytics, XP, and
 * manage-team landing pages.
 *
 * Component architecture:
 * NxtUsageLandingComponent (orchestrator)
 *   NxtHeroSectionComponent                   (shared hero — badge, title, CTAs, media slot)
 *     NxtUsageDashboardPreviewComponent        (projected media)
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
import { NxtUsageDashboardPreviewComponent } from './usage-dashboard-preview.component';

// ============================================
// CONSTANTS — Page-Specific Content
// ============================================

const USAGE_STATS: StatsBarItem[] = [
  { value: '$0', label: 'To Get Started' },
  { value: '6', label: 'Usage Categories' },
  { value: '100%', label: 'Transparent Pricing' },
];

const USAGE_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'overview',
    icon: 'pie-chart-outline',
    title: 'Billing Overview',
    description:
      'See your current metered usage, included free tier, and next payment date at a glance. Everything in one clean dashboard.',
  },
  {
    id: 'metered',
    icon: 'bar-chart-outline',
    title: 'Metered Usage Tracking',
    description:
      'Cumulative usage charts across media, recruiting, AI, communication, profile, and teams. Filter by timeframe and drill into daily breakdowns.',
  },
  {
    id: 'subscriptions',
    icon: 'card-outline',
    title: 'Subscription Management',
    description:
      'View and manage all your active subscriptions. See monthly costs, free vs. paid plans, and upgrade or downgrade anytime.',
  },
  {
    id: 'history',
    icon: 'receipt-outline',
    title: 'Payment History',
    description:
      'Full transaction history with invoice downloads, receipt links, and payment method details. Searchable and exportable.',
  },
  {
    id: 'budgets',
    icon: 'shield-checkmark-outline',
    title: 'Budgets & Alerts',
    description:
      'Set spending limits per product category. Get notified when you approach your budget and optionally stop usage at the limit.',
  },
  {
    id: 'payments',
    icon: 'wallet-outline',
    title: 'Payment & Billing Info',
    description:
      'Manage saved payment methods, billing address, and coupon codes. Add cards, set defaults, and keep your billing details current.',
  },
];

const USAGE_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes & Parents',
    description:
      'Understand exactly what you\u2019re paying for. Track free tier usage, manage subscriptions, and download receipts.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches',
    title: 'Coaches & Programs',
    description:
      'Manage team-level billing, set budgets per category, and keep spending transparent across your entire program.',
    icon: 'shield-outline',
  },
  {
    id: 'admins',
    title: 'Directors',
    description:
      'Oversee usage and billing across multiple teams. Export payment history for accounting and set organization-wide limits.',
    icon: 'briefcase-outline',
  },
];

const USAGE_FAQS: FaqItem[] = [
  {
    id: 'what-is-usage',
    question: 'What does the Usage & Billing dashboard show?',
    answer:
      'The dashboard gives you a complete view of your NXT1 account billing. You can see current metered usage, active subscriptions, cumulative usage charts by category, full payment history with receipts, spending budgets, and saved payment methods \u2014 all in one place.',
  },
  {
    id: 'metered-vs-subscription',
    question: 'What\u2019s the difference between metered usage and subscriptions?',
    answer:
      'Subscriptions are fixed monthly plans (like NXT1 Pro at $9.99/mo). Metered usage is pay-as-you-go for specific actions like AI credits, extra media storage, or premium recruiting features that exceed your included free tier.',
  },
  {
    id: 'budgets-work',
    question: 'How do budgets and alerts work?',
    answer:
      'You can set a spending limit for each product category (media, AI, recruiting, etc.). NXT1 will notify you at 80% and 100% of your budget. Optionally, enable \u201Cstop on limit\u201D to automatically pause usage when a budget is reached.',
  },
  {
    id: 'free-tier',
    question: 'What\u2019s included in the free tier?',
    answer:
      'Every NXT1 account includes a generous free tier with included usage across all categories. The billing overview shows exactly how much of your free tier you\u2019ve used and what\u2019s remaining. You only pay when you exceed the included amount.',
  },
  {
    id: 'payment-methods',
    question: 'What payment methods are accepted?',
    answer:
      'NXT1 accepts all major credit and debit cards (Visa, Mastercard, American Express, Discover) as well as PayPal. You can save multiple payment methods and set a default for automatic billing.',
  },
];

@Component({
  selector: 'nxt1-usage-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtHeroSectionComponent,
    NxtUsageDashboardPreviewComponent,
  ],
  template: `
    <!-- Hero Section — uses shared NxtHeroSectionComponent -->
    <nxt1-hero-section
      badgeIcon="wallet-outline"
      badgeLabel="Billing & Usage"
      title="Transparent Billing,"
      accentText="Zero Surprises"
      subtitle="Track every dollar, manage subscriptions, set budgets, and download receipts. Clear, honest billing for athletes, coaches, and programs."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Log In"
      secondaryCtaRoute="/auth"
      ariaId="usage-hero-title"
    >
      <nxt1-usage-dashboard-preview />
    </nxt1-hero-section>

    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Complete Billing at Your Fingertips"
      subtitle="From usage tracking to payment management &mdash; everything you need to stay in control of your account."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Clear Billing for Everyone"
      subtitle="Athletes, coaches, and administrators &mdash; everyone gets the transparency they deserve."
      [segments]="audiences"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Billing & Usage FAQ"
      subtitle="Common questions about pricing, payments, and account billing on NXT1."
      [items]="faqs"
      defaultOpenId="what-is-usage"
    />

    <!-- Bottom CTA -->
    <nxt1-cta-banner
      title="Ready to Take Control of Your Billing?"
      subtitle="Start with a generous free tier. Only pay for what you use."
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
export class NxtUsageLandingComponent {
  protected readonly stats = USAGE_STATS;
  protected readonly features = USAGE_FEATURES;
  protected readonly audiences = USAGE_AUDIENCES;
  protected readonly faqs = USAGE_FAQS;
}
