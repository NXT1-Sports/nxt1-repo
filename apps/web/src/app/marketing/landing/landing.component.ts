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
 * { path: '', loadComponent: () => import('./landing.component').then((m) => m.LandingComponent) }
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NxtImmersiveHeroComponent } from '@nxt1/ui/components/immersive-hero';
import { NxtIntegrationMarqueeComponent } from '@nxt1/ui/components/integration-marquee';
import { NxtValuePropComparisonComponent } from '@nxt1/ui/components/value-prop-comparison';
import { NxtEcosystemMapComponent } from '@nxt1/ui/components/ecosystem-map';
import { NxtAgentXCapabilityNetworkSectionComponent } from '@nxt1/ui/components/agent-x-capability-network-section';
import { NxtDigitalSportsStaffSectionComponent } from '@nxt1/ui/components/digital-sports-staff-section';
import { NxtAgentXWorkflowShowcaseSectionComponent } from '@nxt1/ui/components/agent-x-workflow-showcase-section';

import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtSiteFooterCompactComponent } from '@nxt1/ui/components/site-footer-compact';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { SPORTS } from '@nxt1/core';
import { SeoService } from '../../core/services/web/seo.service';
import type { SeoConfig } from '@nxt1/core/seo';
import { FoundationFiftyBannerComponent } from './foundation-fifty-banner';

const formatSportNameForFaq = (sport: string): string =>
  sport.replace(' Mens', " Men's").replace(' Womens', " Women's");

const SUPPORTED_SPORTS_FAQ_ANSWER = `NXT1 supports ${SPORTS.length} sports across men's, women's, and coed programs: ${SPORTS.map(
  formatSportNameForFaq
).join(', ')}.`;

const LANDING_PAGE_TITLE = 'NXT1 Sports | The Sports Intelligence Platform';

const LANDING_FAQS: readonly FaqItem[] = [
  {
    id: 'icp',
    question: 'Who is NXT1 built for?',
    answer:
      'NXT1 is built for athletes, coaches, directors, and program leaders who need a smarter way to operate. It helps teams and sports organizations execute faster across performance, content, communications, planning, and day-to-day operations.',
  },
  {
    id: 'sports-supported',
    question: 'What sports does NXT1 support?',
    answer: SUPPORTED_SPORTS_FAQ_ANSWER,
  },
  {
    id: 'agentx',
    question: 'What does Agent X do?',
    answer:
      "Agent X is NXT1's primary AI coordinator. It turns plain-language requests into completed work across film analysis, highlight creation, graphics, communications, daily briefings, weekly playbooks, and background operations.",
  },
  {
    id: 'athletes',
    question: 'How do athletes use NXT1?',
    answer:
      'Athletes use NXT1 as a personal command center for performance insights, film breakdowns, highlight reels, graphics, communication support, and action plans that help them move faster without juggling multiple apps.',
  },
  {
    id: 'programs',
    question: 'How do coaches, directors, and programs use NXT1?',
    answer:
      'Coaches, directors, and program leaders use NXT1 to align player development, evaluations, content, communications, reporting, and operations in one command center powered by AI coordinators.',
  },
  {
    id: 'category',
    question: 'Is NXT1 a recruiting platform?',
    answer:
      'NXT1 is a Sports Intelligence Platform, not a passive recruiting database or social network. Recruiting workflows are supported, but the broader platform is built around autonomous execution, sports intelligence, creative production, communications, and operations.',
  },
  {
    id: 'pricing',
    question: 'Is NXT1 free to join?',
    answer:
      'Yes. You can join and use core features for free. Certain advanced tools follow usage-based pricing so you only pay when you use premium actions.',
  },
];

/** Floating avatar images for final CTA social proof. */
const CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.coach1}`, alt: '' },
  { src: `/${IMAGE_PATHS.coach2}`, alt: '' },
  { src: `/${IMAGE_PATHS.coach3}`, alt: '' },
  { src: `/${IMAGE_PATHS.coach4}`, alt: '' },
  { src: `/${IMAGE_PATHS.athlete1}`, alt: '' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: '' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: '' },
] as const;

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    // Above-fold (eagerly loaded for LCP)
    NxtImmersiveHeroComponent,
    NxtIntegrationMarqueeComponent,
    FoundationFiftyBannerComponent,
    // Below-fold (Angular auto-defers these since they're only in @defer blocks)
    NxtValuePropComparisonComponent,
    NxtEcosystemMapComponent,
    NxtAgentXCapabilityNetworkSectionComponent,
    NxtDigitalSportsStaffSectionComponent,
    NxtAgentXWorkflowShowcaseSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterCompactComponent,
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
          <nxt1-immersive-hero variant="sleek" headline="AI Coordinators That Work For You" />
        </section>

        <!-- Foundation 50 — Coaches Early Access (above-fold, eagerly loaded) -->
        <app-foundation-fifty-banner />

        @defer (on timer(2s); on interaction) {
          <section aria-labelledby="digital-staff-heading">
            <h2 id="digital-staff-heading" class="sr-only">Digital Sports Staff</h2>
            <nxt1-digital-sports-staff-section />
          </section>

          <section aria-labelledby="capability-graph-heading">
            <h2 id="capability-graph-heading" class="sr-only">Agent X Capability Network</h2>
            <nxt1-agent-x-capability-network-section />
          </section>

          <section aria-labelledby="integrations-heading">
            <h2 id="integrations-heading" class="sr-only">Seamless Integrations</h2>
            <nxt1-integration-marquee
              title="Connect The Apps You Already Use"
              subtitle="Agent X syncs seamlessly with Hudl, MaxPreps, and your existing tools so you never enter data twice."
              label="Seamless Integrations"
              variant="minimal"
              [showLabel]="true"
              [gap]="24"
            />
          </section>
        } @placeholder {
          <div
            class="landing-section-placeholder landing-section-placeholder--hero-stack"
            aria-hidden="true"
          ></div>
        }

        <!-- ═══════════════════════════════════════════════════
             BELOW THE FOLD — Deferred until viewport (performance)
             @defer reduces initial bundle by ~60-80 KB
             ═══════════════════════════════════════════════════ -->

        <!-- Value Props + Ecosystem -->
        @defer (on viewport) {
          <section aria-labelledby="ecosystem-heading">
            <h2 id="ecosystem-heading" class="sr-only">The NXT1 Ecosystem</h2>
            <nxt1-ecosystem-map />
          </section>

          <section aria-labelledby="workflow-showcase-heading">
            <h2 id="workflow-showcase-heading" class="sr-only">How You Can Use NXT1</h2>
            <nxt1-agent-x-workflow-showcase-section />
          </section>

          <section aria-labelledby="value-prop-heading">
            <h2 id="value-prop-heading" class="sr-only">Why Choose NXT1</h2>
            <nxt1-value-prop-comparison />
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
              subtitle="How NXT1 works for athletes, coaches, directors, and program leaders."
              [items]="faqs"
              defaultOpenId="icp"
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
              subtitle="Join the NXT1 sports intelligence platform built for coaches, directors, and program leaders who need one command center for planning, recruiting, player development, content, communications, and day-to-day operations."
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

        <nxt1-site-footer-compact />
      </article>
    </main>
  `,
  styles: [
    `
      :host {
        --nxt1-root-shell-max-width: 88rem;
        display: block;
        width: calc(100% + (var(--shell-content-padding-x, 0px) * 2));
        max-width: none;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
        margin-top: calc(-1 * var(--shell-content-padding-top, 0px));
        margin-inline: calc(-1 * var(--shell-content-padding-x, 0px));
      }

      /* Tighten gap between audience cards and integration marquee */
      nxt1-integration-marquee {
        margin-top: -3rem;
      }

      /* Placeholder blocks for @defer — reserves vertical space to prevent CLS */
      .landing-section-placeholder {
        min-height: 96px;
      }

      .landing-section-placeholder--hero-stack {
        min-height: 160px;
      }

      .landing-section-placeholder--short {
        min-height: 64px;
      }

      @media (max-width: 767px) {
        .landing-section-placeholder--hero-stack {
          min-height: 96px;
        }
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
  protected readonly faqs = LANDING_FAQS;
  protected readonly ctaAvatars = CTA_AVATARS;

  ngOnInit(): void {
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
        title: LANDING_PAGE_TITLE,
        description:
          'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
        keywords: [
          'sports intelligence',
          'AI sports platform',
          'high school athletes',
          'athletic profile',
          'college coaches',
          'AI coordinators',
          'NXT1',
          'sports intelligence platform',
          'NIL valuation',
          'athlete highlights',
          'AI scout reports',
          'autonomous sports workflows',
          'coach outreach',
          'athletic scholarship',
          'sports AI',
          'D1 athletics',
        ],
        canonicalUrl: 'https://nxt1sports.com/',
        image: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
        imageAlt: 'NXT1 Sports intelligence platform preview',
      },
      openGraph: {
        type: 'website',
        title: LANDING_PAGE_TITLE,
        description:
          'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
        url: 'https://nxt1sports.com/',
        image: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
        imageAlt: 'NXT1 Sports intelligence platform preview',
        imageWidth: 1200,
        imageHeight: 630,
      },
      twitter: {
        card: 'summary_large_image',
        title: LANDING_PAGE_TITLE,
        description:
          'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
        image: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
        imageAlt: 'NXT1 Sports intelligence platform preview',
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
              url: 'https://nxt1sports.com/assets/icons/icon-512x512.png',
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
              'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
            foundingDate: '2023',
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              url: 'https://nxt1sports.com/help-center',
            },
          },

          // WebSite — identifies the canonical NXT1 web property
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
                urlTemplate: 'https://nxt1sports.com/help-center?q={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          },

          // WebPage — describes this specific page
          {
            '@type': 'WebPage',
            '@id': 'https://nxt1sports.com/#webpage',
            url: 'https://nxt1sports.com/',
            name: LANDING_PAGE_TITLE,
            isPartOf: { '@id': 'https://nxt1sports.com/#website' },
            about: { '@id': 'https://nxt1sports.com/#organization' },
            description:
              'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
              width: 1200,
              height: 630,
            },
          },

          // FAQPage — FAQ rich results in Google
          {
            '@type': 'FAQPage',
            mainEntity: faqQaEntities,
          },
        ],
      },
    };

    this.seoService.applySeoConfig(seoConfig);
  }
}
