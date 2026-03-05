/**
 * @fileoverview Landing Page Component — A+ SEO & Performance (2026)
 * @module @nxt1/web/features/landing
 *
 * Public landing page for unauthenticated users.
 * Showcases NXT1 value proposition with hero header and audience cards.
 *
 * SEO & Performance Features:
 * - Full SSR with JSON-LD structured data (Organization, WebSite, FAQPage)
 * - Semantic HTML landmarks (<main>, <article>, <section>)
 * - @defer blocks for below-fold content (optimal LCP)
 * - Above-fold: ImmersiveHero + HeroHeader + PartnerMarquee (eagerly loaded)
 * - Below-fold: All other sections deferred until viewport intersection
 * - aria-labelledby on all sections for screen reader navigation
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
import { NxtHeroHeaderComponent, type HeroAudienceCard } from '@nxt1/ui/components/hero-header';
import { NxtImmersiveHeroComponent } from '@nxt1/ui/components/immersive-hero';
import { NxtPartnerMarqueeComponent } from '@nxt1/ui/components/partner-marquee';
import { NxtValuePropComparisonComponent } from '@nxt1/ui/components/value-prop-comparison';
import { NxtEcosystemMapComponent } from '@nxt1/ui/components/ecosystem-map';
import { NxtHeroSectionComponent } from '@nxt1/ui/components/hero-section';
import {
  NxtMovementSectionComponent,
  type MovementActivityItem,
} from '@nxt1/ui/components/movement-section';
import {
  NxtEducationalLibraryComponent,
  EDUCATIONAL_LIBRARY_DEFAULT_ITEMS,
  type EducationalLibraryItem,
} from '@nxt1/ui/components/educational-library';

import { NxtUniversalSportsDirectoryComponent } from '@nxt1/ui/components/universal-sports-directory';
import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
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
    route: '/auth?role=athlete',
    cta: 'Start Your Journey',
    gradientClass: 'hero-card--athletes',
    ariaLabel: 'Learn about NXT1 for athletes and start your recruiting journey',
  },
  {
    id: 'teams',
    title: 'For HS & Clubs',
    description: 'Manage rosters, promote your program, and help athletes get discovered.',
    icon: 'users',
    route: '/auth?role=coach',
    cta: 'Elevate Your Program',
    gradientClass: 'hero-card--teams',
    ariaLabel: 'Learn about NXT1 for high schools and club teams',
  },
  {
    id: 'scouts',
    title: 'For Recruiters',
    description: 'Discover top talent, build watch lists, and streamline your recruiting process.',
    icon: 'scout',
    route: '/auth?role=recruiter',
    cta: 'Find Elite Talent',
    gradientClass: 'hero-card--scouts',
    ariaLabel: 'Learn about NXT1 for college recruiters and scouts',
  },
  {
    id: 'fans',
    title: 'For Parents',
    description: "Support your athlete's journey, track progress, and stay connected with coaches.",
    icon: 'fan',
    route: '/auth?role=parent',
    cta: 'Support Your Athlete',
    gradientClass: 'hero-card--fans',
    ariaLabel: 'Learn about NXT1 for sports parents',
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
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Elite recruit' },
] as const;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    // Above-fold (eagerly loaded for LCP)
    NxtImmersiveHeroComponent,
    NxtHeroHeaderComponent,
    NxtPartnerMarqueeComponent,
    // Below-fold (Angular auto-defers these since they're only in @defer blocks)
    NxtValuePropComparisonComponent,
    NxtEcosystemMapComponent,
    NxtHeroSectionComponent,
    NxtMovementSectionComponent,
    NxtEducationalLibraryComponent,
    NxtUniversalSportsDirectoryComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
  ],
  template: `
    <!--
      Semantic HTML Structure (A+ SEO Pattern)
      <main> landmark wraps all page content
      <article> signals "this is a self-contained composition"
      Each <section> uses aria-labelledby for screen reader nav
    -->
    <main id="main-content" role="main">
      <article itemscope itemtype="https://schema.org/WebPage">
        <!-- ═══════════════════════════════════════════════════
             ABOVE THE FOLD — Eagerly loaded (LCP-critical)
             ═══════════════════════════════════════════════════ -->
        <section aria-label="Hero">
          <nxt1-immersive-hero headline="Welcome to 5.0" />
        </section>

        <section aria-labelledby="audience-heading">
          <h2 id="audience-heading" class="sr-only">Who NXT1 Is For</h2>
          <nxt1-hero-header
            variant="minimal"
            [seoHeadingLevel]="3"
            [cards]="audienceCards"
            [showAnimatedBg]="false"
            [showLogo]="false"
            [showPrimaryCta]="false"
            [showTrustBadges]="false"
            [showAppBadges]="false"
          />
        </section>

        <section aria-labelledby="partners-heading">
          <h2 id="partners-heading" class="sr-only">Our Partners</h2>
          <nxt1-partner-marquee
            title="Trusted By Leading Organizations"
            subtitle="Partnering with the best to power the future of sports recruiting"
            label="Our Partners"
            variant="minimal"
            [showLabel]="true"
            [gap]="24"
          />
        </section>

        <!-- ═══════════════════════════════════════════════════
             BELOW THE FOLD — Deferred until viewport (performance)
             @defer reduces initial bundle by ~60-80 KB
             ═══════════════════════════════════════════════════ -->

        <!-- Value Props + Ecosystem -->
        @defer (on viewport) {
          <section aria-labelledby="value-prop-heading">
            <h2 id="value-prop-heading" class="sr-only">Why Choose NXT1</h2>
            <nxt1-value-prop-comparison />
          </section>

          <section aria-labelledby="ecosystem-heading">
            <h2 id="ecosystem-heading" class="sr-only">The NXT1 Ecosystem</h2>
            <nxt1-ecosystem-map />
          </section>
        } @placeholder {
          <div class="landing-section-placeholder" aria-hidden="true"></div>
        }

        <!-- Live Movement Activity -->
        @defer (on viewport) {
          <section aria-labelledby="movement-section-title">
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
          </section>
        } @placeholder {
          <div class="landing-section-placeholder" aria-hidden="true"></div>
        }

        <!-- Educational Library -->
        @defer (on viewport) {
          <section aria-labelledby="educational-library-heading">
            <h2 id="educational-library-heading" class="sr-only">Educational Library</h2>
            <nxt1-educational-library [items]="educationalLibraryItems" />
          </section>
        } @placeholder {
          <div class="landing-section-placeholder" aria-hidden="true"></div>
        }

        <!-- Sports Directory -->
        @defer (on viewport) {
          <section aria-labelledby="sports-directory-heading">
            <h2 id="sports-directory-heading" class="sr-only">Sports Directory</h2>
            <nxt1-universal-sports-directory />
          </section>
        } @placeholder {
          <div class="landing-section-placeholder" aria-hidden="true"></div>
        }

        <!-- FAQ Section -->
        @defer (on viewport) {
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" class="sr-only">Frequently Asked Questions</h2>
            <nxt1-faq-section
              title="Frequently Asked Questions"
              subtitle="Everything you need to know before getting started on NXT1."
              [items]="faqs"
              defaultOpenId="open-platform"
            />
          </section>
        } @placeholder {
          <div class="landing-section-placeholder" aria-hidden="true"></div>
        }

        <!-- Final CTA -->
        @defer (on viewport) {
          <section aria-labelledby="landing-final-cta-title">
            <nxt1-cta-banner
              variant="conversion"
              badgeLabel="Join The Revolution"
              title="Stop Competing. Start Dominating."
              subtitle="Join the NXT1 sports recruiting platform to build a verified athlete profile, publish elite highlights, and get discovered by college coaches with real recruiting signals."
              ctaLabel="Create Your NXT1 Account"
              ctaRoute="/auth"
              titleId="landing-final-cta-title"
              [avatarImages]="ctaAvatars"
            />
          </section>
        } @placeholder {
          <div
            class="landing-section-placeholder landing-section-placeholder--short"
            aria-hidden="true"
          ></div>
        }
      </article>
    </main>
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

      /* Placeholder blocks for @defer — reserves vertical space to prevent CLS */
      .landing-section-placeholder {
        min-height: 400px;
      }

      .landing-section-placeholder--short {
        min-height: 200px;
      }

      /* Screen reader only utility (in case Tailwind sr-only is not available in this scope) */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private readonly seoService = inject(SeoService);
  protected readonly audienceCards: HeroAudienceCard[] = [...DEFAULT_AUDIENCE_CARDS];
  protected readonly educationalLibraryItems: readonly EducationalLibraryItem[] =
    EDUCATIONAL_LIBRARY_DEFAULT_ITEMS;
  protected readonly faqs = LANDING_FAQS;
  protected readonly movementItems = MOVEMENT_ITEMS;
  protected readonly ctaAvatars = CTA_AVATARS;

  ngOnInit(): void {
    const educationalLibraryItemList = this.educationalLibraryItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'BlogPosting',
        headline: item.title,
        description: item.excerpt,
        datePublished: item.publishedIsoDate,
        url: `https://nxt1sports.com${item.href}`,
        publisher: {
          '@type': 'Organization',
          name: 'NXT1 Sports',
          url: 'https://nxt1sports.com',
        },
      },
    }));

    // Build FAQ structured data from component items
    const faqQaEntities = this.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    }));

    const seoConfig: SeoConfig = {
      page: {
        title: 'NXT1 Sports - The Future of Sports Recruiting',
        description:
          'Build your verified recruiting profile, connect with college coaches, and get discovered. The all-in-one sports recruiting platform for athletes, coaches, scouts, and teams.',
        keywords: [
          'sports recruiting',
          'college recruiting',
          'high school athletes',
          'athletic profile',
          'college coaches',
          'NCAA recruiting',
          'NXT1',
          'recruiting platform',
          'NIL valuation',
          'athlete highlights',
          'sports scouting',
          'recruiting calendar 2026',
          'coach outreach',
          'athletic scholarship',
          'club sports recruiting',
          'D1 recruiting',
        ],
        canonicalUrl: 'https://nxt1sports.com/',
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@graph': [
          // Organization — tells Google who you are
          {
            '@type': 'Organization',
            '@id': 'https://nxt1sports.com/#organization',
            name: 'NXT1 Sports',
            url: 'https://nxt1sports.com',
            logo: {
              '@type': 'ImageObject',
              url: 'https://nxt1sports.com/assets/shared/logo/nxt1-logo-512.png',
              width: 512,
              height: 512,
            },
            sameAs: [
              'https://twitter.com/nxt1sports',
              'https://www.instagram.com/nxt1sports',
              'https://www.tiktok.com/@nxt1sports',
              'https://www.youtube.com/@nxt1sports',
            ],
            description:
              'The all-in-one sports recruiting platform connecting athletes, coaches, scouts, and teams.',
            foundingDate: '2023',
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              url: 'https://nxt1sports.com/help-center',
            },
          },

          // WebSite — enables sitelinks search box in SERP
          {
            '@type': 'WebSite',
            '@id': 'https://nxt1sports.com/#website',
            url: 'https://nxt1sports.com',
            name: 'NXT1 Sports',
            publisher: { '@id': 'https://nxt1sports.com/#organization' },
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://nxt1sports.com/explore?q={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          },

          // WebPage — describes this specific page
          {
            '@type': 'WebPage',
            '@id': 'https://nxt1sports.com/#webpage',
            url: 'https://nxt1sports.com/',
            name: 'NXT1 Sports - The Future of Sports Recruiting',
            isPartOf: { '@id': 'https://nxt1sports.com/#website' },
            about: { '@id': 'https://nxt1sports.com/#organization' },
            description:
              'Build your verified recruiting profile, connect with college coaches, and get discovered. The all-in-one sports recruiting platform for athletes, coaches, scouts, and teams.',
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: 'https://nxt1sports.com/assets/images/og-image.jpg',
            },
          },

          // FAQPage — FAQ rich results in Google
          {
            '@type': 'FAQPage',
            mainEntity: faqQaEntities,
          },

          // Success Stories
          {
            '@type': 'ItemList',
            name: 'NXT1 Success Stories',
            description:
              'Real Zero to Hero recruiting journeys from athletes and programs using NXT1.',
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
                  publisher: { '@id': 'https://nxt1sports.com/#organization' },
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
                  publisher: { '@id': 'https://nxt1sports.com/#organization' },
                },
              },
            ],
          },

          // Educational Library
          {
            '@type': 'ItemList',
            name: 'Educational Library - SEO Content Hub',
            description:
              'Long-form recruiting education covering calendars, coach communication templates, and NIL fundamentals.',
            numberOfItems: educationalLibraryItemList.length,
            itemListElement: educationalLibraryItemList,
          },
        ],
      },
    };

    this.seoService.applySeoConfig(seoConfig);
  }
}
