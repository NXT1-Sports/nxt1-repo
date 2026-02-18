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
  NxtCoachRolodexComponent,
  NxtCtaBannerComponent,
  NxtEcosystemMapComponent,
  NxtFaqSectionComponent,
  NxtHeroHeaderComponent,
  NxtHeroSectionComponent,
  NxtImmersiveHeroComponent,
  NxtMovementSectionComponent,
  NxtPartnerMarqueeComponent,
  NxtRecruitmentEngineComponent,
  NxtSuccessStoriesComponent,
  NxtSuperProfileBreakdownComponent,
  NxtUniversalSportsDirectoryComponent,
  NxtValuePropComparisonComponent,
  type CtaAvatarImage,
  type FaqItem,
  type HeroAudienceCard,
  type MovementActivityItem,
} from '@nxt1/ui';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { SeoService } from '../../core/services/seo.service';
import type { SeoConfig } from '@nxt1/core/seo';

/** Default audience cards configuration */
const DEFAULT_AUDIENCE_CARDS: readonly HeroAudienceCard[] = [
  {
    id: 'athletes',
    title: 'For Athletes',
    description:
      'Build your recruiting profile, showcase highlights, and connect with college coaches.',
    icon: 'athlete',
    route: '/auth/register?role=athlete',
    cta: 'Start Your Journey',
    gradientClass: 'hero-card--athletes',
    ariaLabel: 'Learn about NXT1 for athletes and start your recruiting journey',
  },
  {
    id: 'teams',
    title: 'For HS & Clubs',
    description: 'Manage rosters, promote your program, and help athletes get discovered.',
    icon: 'users',
    route: '/auth/register?role=coach',
    cta: 'Elevate Your Program',
    gradientClass: 'hero-card--teams',
    ariaLabel: 'Learn about NXT1 for high schools and club teams',
  },
  {
    id: 'scouts',
    title: 'For Scouts',
    description: 'Discover top talent, build watch lists, and streamline your recruiting process.',
    icon: 'scout',
    route: '/auth/register?role=scout',
    cta: 'Find Elite Talent',
    gradientClass: 'hero-card--scouts',
    ariaLabel: 'Learn about NXT1 for college scouts and recruiters',
  },
  {
    id: 'fans',
    title: 'For Fans',
    description: 'Follow rising stars, get insider updates, and support athletes you believe in.',
    icon: 'fan',
    route: '/auth/register?role=fan',
    cta: 'Join the Community',
    gradientClass: 'hero-card--fans',
    ariaLabel: 'Learn about NXT1 for sports fans and supporters',
  },
] as const;

const MOVEMENT_ITEMS: readonly MovementActivityItem[] = [
  {
    id: 'movement-1',
    userName: 'John Doe',
    location: 'CA',
    update: 'just received an offer from Oregon',
    timeLabel: '9s ago',
  },
  {
    id: 'movement-2',
    userName: 'Ava Thompson',
    location: 'TX',
    update: 'was added to 7 college watch lists',
    timeLabel: '18s ago',
  },
  {
    id: 'movement-3',
    userName: 'Noah Williams',
    location: 'FL',
    update: 'generated a new commitment graphic',
    timeLabel: '31s ago',
  },
  {
    id: 'movement-4',
    userName: 'Mia Johnson',
    location: 'GA',
    update: 'booked an official recruiting call',
    timeLabel: '46s ago',
  },
  {
    id: 'movement-5',
    userName: 'Liam Carter',
    location: 'WA',
    update: 'profile views surged 240 % in one hour',
    timeLabel: '1m ago',
  },
  {
    id: 'movement-6',
    userName: 'Zoe Rivera',
    location: 'OH',
    update: 'started direct conversations with recruiters',
    timeLabel: '2m ago',
  },
];

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

/** Floating avatar images for final CTA social proof. */
const CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'High school athlete' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Club athlete' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Student athlete' },
  { src: `/${IMAGE_PATHS.athlete4}`, alt: 'Varsity athlete' },
  { src: `/${IMAGE_PATHS.athlete5}`, alt: 'Travel ball athlete' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'College coach' },
] as const;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtCoachRolodexComponent,
    NxtCtaBannerComponent,
    NxtEcosystemMapComponent,
    NxtFaqSectionComponent,
    NxtHeroHeaderComponent,
    NxtHeroSectionComponent,
    NxtImmersiveHeroComponent,
    NxtMovementSectionComponent,
    NxtPartnerMarqueeComponent,
    NxtRecruitmentEngineComponent,
    NxtSuccessStoriesComponent,
    NxtSuperProfileBreakdownComponent,
    NxtUniversalSportsDirectoryComponent,
    NxtValuePropComparisonComponent,
  ],
  template: `
    <nxt1-immersive-hero headline="Welcome to 5.0" />

    <nxt1-hero-header
      variant="minimal"
      [cards]="audienceCards"
      [showAnimatedBg]="false"
      [showLogo]="false"
      [showPrimaryCta]="false"
      [showTrustBadges]="false"
      [showAppBadges]="false"
    />

    <!-- Partners Section -->
    <nxt1-partner-marquee
      title="Trusted By Leading Organizations"
      subtitle="Partnering with the best to power the future of sports recruiting"
      label="Our Partners"
      variant="minimal"
      [showLabel]="true"
      [gap]="24"
    />

    <nxt1-value-prop-comparison />

    <nxt1-ecosystem-map />

    <nxt1-hero-section
      [headingLevel]="2"
      badgeLabel="Live Activity"
      title="The Movement Is"
      accentText="Happening Now"
      subtitle="Real-time recruiting signals from athletes and coaches across the country — offers, graphics, and visibility moving every minute."
      ariaId="movement-section-title"
    >
      <nxt1-movement-section [items]="movementItems" />
    </nxt1-hero-section>

    <nxt1-super-profile-breakdown />

    @defer (on viewport) {
      <nxt1-success-stories />
    } @placeholder {
      <div class="defer-placeholder" aria-hidden="true"></div>
    }

    <!-- Recruitment Engine: USA Map + Live Recruiting Pulse -->
    <nxt1-hero-section
      [headingLevel]="2"
      badgeLabel="Recruiting Engine"
      title="The Pulse of"
      accentText="Recruiting."
      subtitle="See where the offers are flying right now."
      support="Recruitment Engine (Live Data): Verified biometrics, embedded transcripts, NIL valuation, and a live highlight feed built for real recruiting decisions."
      ariaId="recruitment-engine-title"
    >
      <nxt1-recruitment-engine />
    </nxt1-hero-section>

    <!-- Coach's Rolodex: College Network Stats + Logo Marquee -->
    <nxt1-coach-rolodex />

    <nxt1-universal-sports-directory />

    <nxt1-faq-section
      title="Frequently Asked Questions"
      subtitle="Everything you need to know before getting started on NXT1."
      [items]="faqs"
      defaultOpenId="open-platform"
    />

    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Final Step"
      title="Stop Competing. Start Dominating."
      subtitle="Join the NXT1 sports recruiting platform to build a verified athlete profile, publish elite highlights, and get discovered by college coaches with real recruiting signals."
      ctaLabel="Create Your NXT1 Account"
      ctaRoute="/auth/register"
      titleId="landing-final-cta-title"
      [avatarImages]="ctaAvatars"
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

      /* Tighten gap between audience cards and partner marquee */
      nxt1-partner-marquee {
        margin-top: -3rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  protected readonly audienceCards: HeroAudienceCard[] = [...DEFAULT_AUDIENCE_CARDS];
  protected readonly faqs = LANDING_FAQS;
  protected readonly movementItems = MOVEMENT_ITEMS;
  protected readonly ctaAvatars = CTA_AVATARS;

  ngOnInit(): void {
    const seoConfig: SeoConfig = {
      page: {
        title: 'NXT1 Sports - The Future of Sports Recruiting',
        description:
          'Build your recruiting profile, connect with college coaches, and showcase your athletic talent. Explore real NXT1 success stories with short vertical interview case studies that prove what is possible.',
        keywords: [
          'sports recruiting',
          'college recruiting',
          'high school athletes',
          'athletic profile',
          'college coaches',
          'NCAA recruiting',
          'NXT1',
          'recruiting platform',
          'success stories',
          'zero to hero recruiting',
          'vertical video interviews',
          'emotional verification',
        ],
        canonicalUrl: 'https://nxt1sports.com/',
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'NXT1 Success Stories',
        description: 'Real Zero to Hero recruiting journeys from athletes and programs using NXT1.',
        numberOfItems: 2,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            item: {
              '@type': 'Article',
              headline: 'The Underrated 2-Star Who Earned a D1 Offer',
              description:
                'From overlooked prospect to nationally visible recruit by publishing a complete NXT1 profile, consistent vertical highlights, and verified progress updates.',
              url: 'https://nxt1sports.com/stories/underrated-2-star-d1-offer',
              publisher: {
                '@type': 'Organization',
                name: 'NXT1 Sports',
                url: 'https://nxt1sports.com',
              },
            },
          },
          {
            '@type': 'ListItem',
            position: 2,
            item: {
              '@type': 'Article',
              headline: 'The Small School That Built a National Brand',
              description:
                'A local program transformed visibility by standardizing athlete storytelling, posting short interview reels, and showcasing recruiting momentum in one destination.',
              url: 'https://nxt1sports.com/stories/small-school-national-brand',
              publisher: {
                '@type': 'Organization',
                name: 'NXT1 Sports',
                url: 'https://nxt1sports.com',
              },
            },
          },
        ],
      },
    };

    this.seoService.applySeoConfig(seoConfig);
  }
}
