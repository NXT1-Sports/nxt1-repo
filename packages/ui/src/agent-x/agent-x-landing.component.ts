/**
 * @fileoverview Agent X Landing Sections — Shared UI Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Marketing sections for the Agent X feature landing page.
 * Displayed below the live Agent X shell for unauthenticated users.
 *
 * Unlike other landing pages that have a Hero+Preview at top, the Agent X
 * landing shows the REAL Agent X shell as the "preview" at the top of the page,
 * with a gradient fade overlay, and these marketing sections appear below.
 *
 * COMPOSITION PATTERN (2026 Best Practice)
 * This component is a thin orchestrator composing shared, reusable section
 * components — matching the pattern from analytics, xp, and persona landings.
 *
 * Component architecture:
 * NxtAgentXLandingComponent (orchestrator)
 *   NxtStatsBarComponent        (reusable)
 *   NxtFeatureShowcaseComponent (reusable)
 *   NxtAudienceSectionComponent (reusable)
 *   NxtFaqSectionComponent      (reusable)
 *   NxtCtaBannerComponent       (reusable)
 *   NxtSiteFooterComponent      (reusable)
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtStatsBarComponent, type StatsBarItem } from '../components/stats-bar';
import {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from '../components/feature-showcase';
import { NxtAudienceSectionComponent, type AudienceSegment } from '../components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '../components/faq-section';
import { NxtCtaBannerComponent } from '../components/cta-banner';
import { NxtSiteFooterComponent } from '../components/site-footer';

// ============================================
// CONSTANTS — Agent X Landing Content
// ============================================

const AGENT_X_STATS: StatsBarItem[] = [
  { value: '4', label: 'AI-Powered Modes' },
  { value: '50K+', label: 'Athletes & Coaches' },
  { value: '100+', label: 'Pre-Built Templates' },
];

const AGENT_X_FEATURES: FeatureShowcaseItem[] = [
  {
    id: 'highlights',
    icon: 'videocam-outline',
    title: 'Highlight Film AI',
    description:
      'Transform raw game footage into polished highlight reels. Agent X identifies your best plays, adds music, and creates shareable clips — in minutes, not hours.',
  },
  {
    id: 'graphics',
    icon: 'image-outline',
    title: 'Recruiting Graphics',
    description:
      'Generate pro-grade recruiting graphics, commitment announcements, and game-day posts. Just describe what you want — Agent X handles the design.',
  },
  {
    id: 'recruiting',
    icon: 'school-outline',
    title: 'Smart Recruiting',
    description:
      'Get AI-powered college match recommendations, draft outreach emails to coaches, and build a personalized recruiting strategy tailored to your goals.',
  },
  {
    id: 'evaluation',
    icon: 'clipboard-outline',
    title: 'Evaluation Engine',
    description:
      'Receive detailed AI evaluations of your athletic profile, identify strengths and areas for improvement, and benchmark against peers in your position.',
  },
  {
    id: 'templates',
    icon: 'grid-outline',
    title: 'Template Library',
    description:
      'Choose from 100+ pre-built templates for every need — recruiting emails, social posts, bios, commitment graphics, and more. Customize with one click.',
  },
  {
    id: 'natural-language',
    icon: 'chatbubble-outline',
    title: 'Natural Language',
    description:
      "No complicated menus or settings. Just describe what you need in plain English and Agent X delivers. It's like having a personal recruiting assistant on call 24/7.",
  },
];

const AGENT_X_AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes',
    title: 'Athletes',
    description:
      'Create highlight films, generate recruiting graphics, draft emails to coaches, and get AI-powered evaluations of your athletic profile.',
    icon: 'flash-outline',
  },
  {
    id: 'coaches',
    title: 'Coaches & Programs',
    description:
      "Build scouting reports, generate team graphics, create recruiting content, and streamline your program's digital presence.",
    icon: 'people-outline',
  },
  {
    id: 'parents',
    title: 'Parents & Families',
    description:
      'Help your athlete create compelling recruiting materials, draft coach outreach emails, and stay organized throughout the recruiting journey.',
    icon: 'heart-outline',
  },
];

const AGENT_X_FAQS: FaqItem[] = [
  {
    id: 'what-is-agent-x',
    question: 'What is Agent X?',
    answer:
      'Agent X is your AI-powered recruiting assistant built into NXT1. It can create highlight films, design recruiting graphics, draft emails to college coaches, generate evaluations, and more — all through a simple conversational interface.',
  },
  {
    id: 'how-it-works',
    question: 'How does Agent X work?',
    answer:
      'Just type what you need in plain English. Agent X understands context from your profile and delivers results in seconds. Choose from four specialized modes — Highlights, Graphics, Recruiting, and Evaluation — or let Agent X figure out the best approach.',
  },
  {
    id: 'is-it-free',
    question: 'Is Agent X included in my plan?',
    answer:
      'Every NXT1 account gets access to Agent X with a generous free tier. Premium plans unlock unlimited requests, priority processing, and advanced features like batch operations and custom templates.',
  },
  {
    id: 'what-modes',
    question: 'What are the four Agent X modes?',
    answer:
      'Highlights mode creates and edits video highlight reels. Graphics mode designs recruiting graphics, commitment posts, and social content. Recruiting mode helps with college search, coach outreach, and strategy. Evaluation mode provides AI-driven athletic assessments and benchmarks.',
  },
  {
    id: 'data-privacy',
    question: 'Is my data safe with Agent X?',
    answer:
      'Absolutely. Agent X processes all requests through our secure cloud infrastructure. Your data is never shared with third parties, and all conversations are encrypted end-to-end. You own everything Agent X creates for you.',
  },
];

@Component({
  selector: 'nxt1-agent-x-landing',
  standalone: true,
  imports: [
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <!-- Social Proof Stats -->
    <nxt1-stats-bar [stats]="stats" />

    <!-- Feature Showcase Grid -->
    <nxt1-feature-showcase
      title="Your AI-Powered Recruiting Toolkit"
      subtitle="Four specialized modes. Hundreds of templates. One simple conversation."
      [features]="features"
    />

    <!-- Audience Segments -->
    <nxt1-audience-section
      title="Built for Every Role"
      subtitle="Whether you&rsquo;re an athlete, coach, or parent &mdash; Agent X is your edge."
      [segments]="audiences"
    />

    <!-- FAQ -->
    <nxt1-faq-section
      title="Agent X FAQ"
      subtitle="Common questions about your AI recruiting assistant."
      [items]="faqs"
    />

    <!-- Final CTA Banner -->
    <nxt1-cta-banner
      title="Ready to Meet Your AI Assistant?"
      subtitle="Create a free account and start using Agent X in seconds."
      ctaLabel="Get Started Free"
      ctaRoute="/auth/register"
    />

    <!-- Site Footer (shared component is globally mobile-only) -->
    <nxt1-site-footer />
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
export class NxtAgentXLandingComponent {
  protected readonly stats = AGENT_X_STATS;
  protected readonly features = AGENT_X_FEATURES;
  protected readonly audiences = AGENT_X_AUDIENCES;
  protected readonly faqs = AGENT_X_FAQS;
}
