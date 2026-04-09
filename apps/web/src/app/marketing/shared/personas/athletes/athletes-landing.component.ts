/**
 * @fileoverview Athletes Persona Landing Page
 * @module apps/web/featur../shared/personas/athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/athletes` persona marketing page.
 * Composes shared NXT1 section components with athlete-specific
 * content aimed at high-school and club student-athletes looking
 * to harness AI coordinators, upload highlights, and get
 * exposure to college coaches.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtD1DreamHeroComponent } from '../../components/d1-dream-hero';
import { NxtStatsBarComponent, type StatsBarItem } from '@nxt1/ui/components/stats-bar';
import {
  NxtAudienceSectionComponent,
  type AudienceSegment,
} from '@nxt1/ui/components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtSiteFooterComponent } from '@nxt1/ui/components/site-footer';
import { NxtLockerRoomTalkMarqueeComponent } from '../../components/locker-room-talk-marquee';
import { NxtDraftClassTickerComponent } from '../../components/draft-class-ticker';
import { NxtCoachesNetworkAuthorityComponent } from '../../components/coaches-network-authority';
import { NxtXpLeaderboardSectionComponent } from '../../components/xp-leaderboard-section';
import { NxtAgentXHypeMachineSectionComponent } from '../../components/agent-x-hype-machine-section';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

// ============================================
// PAGE-SPECIFIC CONSTANTS
// ============================================

const STATS: StatsBarItem[] = [
  { label: 'Athletes on NXT1', value: '125K+' },
  { label: 'Profile Views Monthly', value: '2M+' },
  { label: 'College Connections', value: '5K+' },
  { label: 'Highlight Uploads', value: '500K+' },
];

const AUDIENCES: AudienceSegment[] = [
  {
    id: 'athletes-high-school',
    icon: 'football-outline',
    title: 'High School Athletes',
    description:
      'Start building your athlete profile as early as freshman year. Track your development through graduation and get noticed.',
  },
  {
    id: 'athletes-club-travel',
    icon: 'trophy-outline',
    title: 'Club & Travel Athletes',
    description:
      'Showcase your year-round performance across club, travel, and AAU seasons. One profile to rule every showcase and tournament.',
  },
  {
    id: 'athletes-transfer-portal',
    icon: 'school-outline',
    title: 'Transfer Portal Athletes',
    description:
      'Already in college? Use NXT1 to manage your transfer portal profile, connect with new programs, and find your next opportunity.',
  },
];

const FAQS: FaqItem[] = [
  {
    id: 'athletes-free',
    question: 'Is NXT1 free for athletes?',
    answer:
      'Yes! Every athlete gets a free profile with unlimited highlight uploads. Premium tiers offer additional analytics, priority visibility, and advanced video tools.',
  },
  {
    id: 'athletes-sports',
    question: 'What sports does NXT1 support?',
    answer:
      'NXT1 supports all major high school and college sports including football, basketball, baseball, softball, soccer, volleyball, lacrosse, track & field, swimming, and more.',
  },
  {
    id: 'athletes-coaches-find',
    question: 'How do college coaches find my profile?',
    answer:
      "College coaches use NXT1's search and filtering tools to discover athletes by sport, position, location, graduation year, and performance metrics. A complete profile dramatically increases your visibility.",
  },
  {
    id: 'athletes-highlights',
    question: 'Can I upload game film and highlights?',
    answer:
      'Absolutely. NXT1 includes a built-in video editor that lets you upload, trim, and compile highlights from game film. You can also embed links from YouTube or Hudl.',
  },
  {
    id: 'athletes-when-start',
    question: 'When should I start my athlete profile?',
    answer:
      'The earlier the better! Many athletes create their NXT1 profile as early as 8th grade or freshman year. Starting early lets you track development and build a history that impresses coaches.',
  },
];

const CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'High school athlete' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Club athlete' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Student athlete' },
  { src: `/${IMAGE_PATHS.athlete4}`, alt: 'Varsity athlete' },
  { src: `/${IMAGE_PATHS.athlete5}`, alt: 'Travel ball athlete' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'College coach' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Elite recruit' },
] as const;

@Component({
  selector: 'nxt1-athletes-landing',
  standalone: true,
  imports: [
    NxtD1DreamHeroComponent,
    NxtStatsBarComponent,
    NxtAudienceSectionComponent,
    NxtLockerRoomTalkMarqueeComponent,
    NxtDraftClassTickerComponent,
    NxtCoachesNetworkAuthorityComponent,
    NxtXpLeaderboardSectionComponent,
    NxtAgentXHypeMachineSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <nxt1-d1-dream-hero ariaTitleId="athletes-d1-dream-hero" />

    <nxt1-stats-bar [stats]="stats" />

    <nxt1-draft-class-ticker />

    <nxt1-audience-section
      title="Built for Every Athlete"
      subtitle="Whether you're a high school freshman or a college transfer, NXT1 adapts to your stage with AI-powered coordinators."
      [segments]="audiences"
    />

    <nxt1-agent-x-hype-machine-section />

    <nxt1-xp-leaderboard-section />

    <nxt1-coaches-network-authority />

    <nxt1-locker-room-talk-marquee />

    <nxt1-faq-section
      title="Athlete FAQs"
      subtitle="Everything you need to know about getting started on NXT1."
      [items]="faqs"
    />

    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Join The Revolution"
      title="Stop Competing. Start Dominating."
      subtitle="Join the NXT1 sports intelligence platform — powered by AI coordinators that build your profile, generate elite highlights, and surface you to college coaches automatically."
      ctaLabel="Create Your NXT1 Account"
      ctaRoute="/auth"
      titleId="landing-final-cta-title"
      [avatarImages]="ctaAvatars"
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
export class NxtAthletesLandingComponent {
  protected readonly stats = STATS;
  protected readonly audiences = AUDIENCES;
  protected readonly faqs = FAQS;
  protected readonly ctaAvatars = CTA_AVATARS;
}
