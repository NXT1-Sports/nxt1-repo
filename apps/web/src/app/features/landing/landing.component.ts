/**
 * @fileoverview Landing Page Component
 * @module @nxt1/web/features/landing
 *
 * Public landing page for unauthenticated users.
 * Showcases NXT1 value proposition with hero header and audience cards.
 *
 * Features:
 * - SEO-optimized with proper meta tags
 * - Full-page hero with animated background
 * - 4 audience-specific CTAs
 * - Responsive design (mobile-first)
 * - 100% theme-aware styling
 *
 * @example
 * // In routes:
 * { path: 'welcome', loadComponent: () => import('./landing.component') }
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  NxtAgentXWelcomeHeaderComponent,
  NxtFaqSectionComponent,
  NxtHeroHeaderComponent,
  NxtPartnerMarqueeComponent,
  type FaqItem,
  type HeroAudienceCardClickEvent,
} from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

const LANDING_FAQS: readonly FaqItem[] = [
  {
    id: 'open-platform',
    question: 'Who can use NXT1?',
    answer:
      'NXT1 is an open platform. Athletes, coaches, parents, scouts, teams, and clubs can all create an account and use the core experience.',
  },
  {
    id: 'pricing',
    question: 'Is NXT1 free to join?',
    answer:
      'Yes. You can join and use core features for free. Certain advanced tools follow usage-based pricing so you only pay when you use premium actions.',
  },
  {
    id: 'discoverability',
    question: 'How do athletes get discovered?',
    answer:
      'Athletes improve visibility by completing profiles, uploading highlights, and engaging in recruiting workflows that make them easier to evaluate and contact.',
  },
  {
    id: 'coach-tools',
    question: 'Can coaches and teams use NXT1 for recruiting operations?',
    answer:
      'Yes. Coaches and team staff can search talent, organize watch lists, and manage recruiting workflows directly in the platform.',
  },
  {
    id: 'agentx',
    question: 'What does Agent X do?',
    answer:
      'Agent X helps users move faster by assisting with discovery, guidance, and workflow actions across the NXT1 experience.',
  },
];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtAgentXWelcomeHeaderComponent,
    NxtFaqSectionComponent,
    NxtHeroHeaderComponent,
    NxtPartnerMarqueeComponent,
  ],
  template: `
    <nxt1-agent-x-welcome-header />

    <!-- Hero Section with Audience Cards -->
    <nxt1-hero-header
      headline=""
      subheadline="The ultimate platform for high school and club athletes to get recruited."
      [showLogo]="false"
      [showPrimaryCta]="false"
      [showAnimatedBg]="true"
      [showTrustBadges]="true"
      [showAppBadges]="false"
      (cardClick)="onAudienceCardClick($event)"
    />

    <!-- Partners Section -->
    <nxt1-partner-marquee
      title="Trusted By Leading Organizations"
      subtitle="Partnering with the best to power the future of sports recruiting"
      label="Our Partners"
      variant="minimal"
      [showLabel]="true"
    />

    <nxt1-faq-section
      title="Frequently Asked Questions"
      subtitle="Everything you need to know before getting started on NXT1."
      [items]="faqs"
      defaultOpenId="open-platform"
    />
  `,
  styles: [
    `
      :host {
        --nxt1-root-shell-max-width: 88rem;
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  protected readonly faqs = LANDING_FAQS;

  ngOnInit(): void {
    this.seoService.updatePage({
      title: 'NXT1 Sports - The Future of Sports Recruiting',
      description:
        'Build your recruiting profile, connect with college coaches, and showcase your athletic talent. NXT1 is the ultimate platform for high school and club athletes to get discovered.',
      keywords: [
        'sports recruiting',
        'college recruiting',
        'high school athletes',
        'athletic profile',
        'college coaches',
        'NCAA recruiting',
      ],
    });
  }

  onAudienceCardClick(event: HeroAudienceCardClickEvent): void {
    console.log('Audience card clicked:', event.card.id);
    // Analytics tracking could be added here
  }
}
