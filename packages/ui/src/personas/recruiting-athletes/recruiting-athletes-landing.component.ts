/**
 * @fileoverview Recruiting Athletes Persona Landing Page
 * @module @nxt1/ui/personas/recruiting-athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/recruiting-athletes` persona marketing page.
 * Stars the Recruiting Radar section as the centrepiece, surrounded by
 * a hero, audience segments, FAQ and conversion CTA.
 *
 * 100 % design-token driven, SSR-safe, fully accessible.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtRecruitingRadarSectionComponent } from '../../components/recruiting-radar-section';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '../../components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '../../components/faq-section';
import { NxtCtaBannerComponent } from '../../components/cta-banner';
import { NxtSiteFooterComponent } from '../../components/site-footer';
import { NxtCoachesNetworkAuthorityComponent } from '../../components/coaches-network-authority';
import { NxtLockerRoomTalkMarqueeComponent } from '../../components/locker-room-talk-marquee';
import { NxtInvisibleAthletePainPointComponent } from '../../components/invisible-athlete-pain-point';
import { NxtRecruitmentPillarsSectionComponent } from '../../components/recruitment-pillars-section';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'recruiting-high-school',
    icon: 'football-outline',
    title: 'High School Recruits',
    description:
      'Build your recruiting profile early and track which college programs are watching your highlights, viewing your transcript, and returning for a second look.',
  },
  {
    id: 'recruiting-transfer',
    icon: 'school-outline',
    title: 'Transfer Portal Athletes',
    description:
      'See real-time interest from new programs. Know which coaches are researching your stats so you can focus outreach on the schools that already want you.',
  },
  {
    id: 'recruiting-club-travel',
    icon: 'trophy-outline',
    title: 'Club & Travel Athletes',
    description:
      'Showcase performances across club, travel, and AAU seasons. Recruiting Radar captures every program interaction — even the ones you never knew about.',
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'recruiting-what-is-radar',
    question: 'What is Recruiting Radar?',
    answer:
      "Recruiting Radar is NXT1's real-time notification system that tells you exactly when college coaches view your profile, watch your highlights, download your transcript, or return for a second visit. Think of it as the read receipt for your recruiting career.",
  },
  {
    id: 'recruiting-how-tracked',
    question: 'How are recruiting signals tracked?',
    answer:
      "Every time a verified college program interacts with your NXT1 profile — whether it's a profile view, highlight play, or document download — Recruiting Radar logs the event and alerts you instantly. All data is anonymised where required by NCAA compliance.",
  },
  {
    id: 'recruiting-is-free',
    question: 'Is Recruiting Radar free?',
    answer:
      'Basic recruiting signals are included with every NXT1 account. Premium tiers unlock advanced analytics like program-level identification, return-visit patterns, and weekly recruiting interest reports.',
  },
  {
    id: 'recruiting-which-sports',
    question: 'Which sports are supported?',
    answer:
      'Recruiting Radar works for every sport on NXT1 — football, basketball, baseball, softball, soccer, volleyball, lacrosse, track & field, swimming, and many more.',
  },
  {
    id: 'recruiting-coaches-notified',
    question: 'Do coaches know I can see their activity?',
    answer:
      "No. Coach interactions are tracked passively. Coaches use NXT1's search and discovery tools normally — Recruiting Radar simply surfaces that engagement to you so you can make smarter outreach decisions.",
  },
];

@Component({
  selector: 'nxt1-recruiting-athletes-landing',
  standalone: true,
  imports: [
    NxtRecruitingRadarSectionComponent,
    NxtRecruitmentPillarsSectionComponent,
    NxtAudienceSectionComponent,
    NxtInvisibleAthletePainPointComponent,
    NxtCoachesNetworkAuthorityComponent,
    NxtLockerRoomTalkMarqueeComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <nxt1-invisible-athlete-pain-point />

    <nxt1-recruitment-pillars-section />

    <!-- ⭐ Centrepiece: Recruiting Radar live activity feed -->
    <nxt1-recruiting-radar-section />

    <nxt1-audience-section
      title="Built for Every Recruiting Stage"
      subtitle="Whether you're a freshman prospect or a transfer portal athlete, Recruiting Radar gives you the visibility edge."
      [segments]="audiences"
    />

    <nxt1-coaches-network-authority />

    <nxt1-locker-room-talk-marquee />

    <nxt1-faq-section
      title="Recruiting FAQ"
      subtitle="Everything you need to know about NXT1 Recruiting Radar."
      [items]="faqs"
    />

    <nxt1-cta-banner
      title="Start Seeing Who's Watching"
      subtitle="Join thousands of athletes using NXT1's Recruiting Radar to track real-time college coach interest and take control of their recruiting journey."
      ctaLabel="Create Your NXT1 Account"
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
export class NxtRecruitingAthletesLandingComponent {
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
}
