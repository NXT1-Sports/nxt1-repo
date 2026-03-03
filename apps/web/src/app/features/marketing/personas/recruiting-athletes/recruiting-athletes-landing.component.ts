/**
 * @fileoverview Recruiting Athletes Persona Landing Page
 * @module @nxt1/ui/personas/recruiting-athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/recruiting-athletes` persona marketing page.
 * Stars the Recruiting Radar section as the centrepiece, surrounded by
 * a hero, audience segments, FAQ and conversion CTA.
 *
 * 100% design-token driven, SSR-safe, fully accessible.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtOpenDoorsHeroComponent } from '@nxt1/ui/components/open-doors-hero';
import { NxtRecruitingRadarSectionComponent } from '@nxt1/ui/components/recruiting-radar-section';
import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtSiteFooterComponent } from '@nxt1/ui/components/site-footer';
import { NxtCoachRolodexComponent } from '@nxt1/ui/components/coach-rolodex';
import { NxtInvisibleAthletePainPointComponent } from '@nxt1/ui/components/invisible-athlete-pain-point';
import { NxtCommunicationCenterSectionComponent } from '@nxt1/ui/components/communication-center-section';
import { NxtRecruitingCommandCenterSectionComponent } from '@nxt1/ui/components/recruiting-command-center-section';
import { NxtLockerRoomTalkMarqueeComponent } from '@nxt1/ui/components/locker-room-talk-marquee';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

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
    NxtOpenDoorsHeroComponent,
    NxtRecruitingRadarSectionComponent,
    NxtRecruitingCommandCenterSectionComponent,
    NxtInvisibleAthletePainPointComponent,
    NxtCommunicationCenterSectionComponent,
    NxtCoachRolodexComponent,
    NxtLockerRoomTalkMarqueeComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <nxt1-open-doors-hero />

    <nxt1-locker-room-talk-marquee />

    <nxt1-invisible-athlete-pain-point />

    <!-- ⭐ Centrepiece: Recruiting Radar live activity feed -->
    <nxt1-recruiting-radar-section />

    @defer (on viewport) {
      <nxt1-recruiting-command-center-section />
    } @placeholder {
      <div style="min-height: 40rem"></div>
    }

    @defer (on viewport) {
      <nxt1-communication-center-section />
    } @placeholder {
      <div style="min-height: 40rem"></div>
    }

    @defer (on viewport) {
      <nxt1-coach-rolodex />
    } @placeholder {
      <div style="min-height: 24rem"></div>
    }

    <nxt1-faq-section
      title="Recruiting FAQ"
      subtitle="Everything you need to know about NXT1 Recruiting Radar."
      [items]="faqs"
    />

    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Open Every Door"
      title="The Entire NCAA In Your Pocket."
      subtitle="Direct access to 85,000+ college coaches, real-time Recruiting Radar signals, and one platform that makes you impossible to ignore."
      ctaLabel="Create Your Free Account"
      ctaRoute="/auth"
      titleId="recruiting-athletes-final-cta"
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
  protected readonly faqs = FAQS;
}
