/**
 * @fileoverview AI for Athletes Landing Page
 * @module @nxt1/ui/personas/ai-athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/ai-athletes` persona marketing page.
 * Composes shared NXT1 section components with AI-specific athlete
 * content — currently featuring Communication Training (recruited
 * email assistant redline section).
 *
 * 100% design-token driven, SSR-safe, fully accessible.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtHeroSectionComponent } from '../../components/hero-section';
import { NxtRecruitingEmailAssistantSectionComponent } from '../../components/recruiting-email-assistant-section/recruiting-email-assistant-section.component';
import { NxtFaqSectionComponent, type FaqItem } from '../../components/faq-section';
import { NxtCtaBannerComponent } from '../../components/cta-banner';
import { NxtSiteFooterComponent } from '../../components/site-footer';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const FAQS: FaqItem[] = [
  {
    id: 'ai-athletes-what',
    question: 'What is AI for Athletes?',
    answer:
      'AI for Athletes is a suite of intelligent tools built into NXT1 that help student-athletes communicate professionally with college coaches, craft recruiting emails, generate highlight reels, and accelerate every step of the recruiting process.',
  },
  {
    id: 'ai-athletes-communication',
    question: 'How does Communication Training work?',
    answer:
      'Agent X reviews your draft emails and messages to college coaches, redlines weak language, and rewrites them into professional, recruiter-ready outreach that earns responses. Think of it as a personal recruiting communication coach available 24/7.',
  },
  {
    id: 'ai-athletes-free',
    question: 'Is AI for Athletes free?',
    answer:
      'Every NXT1 account includes access to AI features with a generous free tier. Premium plans unlock unlimited AI requests, priority processing, and advanced capabilities like batch outreach and custom templates.',
  },
  {
    id: 'ai-athletes-privacy',
    question: 'Is my data safe?',
    answer:
      'Absolutely. All AI processing happens through our secure cloud infrastructure. Your data is never shared with third parties, conversations are encrypted end-to-end, and you own everything the AI creates for you.',
  },
  {
    id: 'ai-athletes-sports',
    question: 'Does it work for all sports?',
    answer:
      'Yes. AI for Athletes supports every sport on the NXT1 platform — football, basketball, baseball, softball, soccer, volleyball, lacrosse, track & field, swimming, and more. The AI adapts its guidance to sport-specific recruiting norms.',
  },
];

@Component({
  selector: 'nxt1-ai-athletes-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtRecruitingEmailAssistantSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <nxt1-hero-section
      badgeIcon="sparkles"
      badgeLabel="AI for Athletes"
      title="Your AI-Powered"
      accentText="Recruiting Edge"
      subtitle="From communication coaching to email redlining — NXT1's AI tools help student-athletes sound professional, stand out, and earn responses from college coaches."
      primaryCtaLabel="Get Started Free"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Learn About Agent X"
      secondaryCtaRoute="/agent"
      ariaId="ai-athletes-hero"
    />

    <!-- Communication Training: Recruiting Email Assistant -->
    <nxt1-recruiting-email-assistant-section />

    <nxt1-faq-section
      title="AI for Athletes FAQ"
      subtitle="Common questions about AI-powered recruiting tools."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Ready to Sound Like a Pro?"
      subtitle="Join thousands of athletes using NXT1's AI tools to communicate professionally with college coaches and accelerate their recruiting journey."
      ctaLabel="Create Free Profile"
      ctaRoute="/auth"
    />

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
export class NxtAiAthletesLandingComponent {
  protected readonly faqs = FAQS;
}
