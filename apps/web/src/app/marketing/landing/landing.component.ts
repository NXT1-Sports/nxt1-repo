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
import { NxtImmersiveHeroComponent } from '@nxt1/ui/components/immersive-hero';
import { NxtPartnerMarqueeComponent } from '@nxt1/ui/components/partner-marquee';
import { NxtValuePropComparisonComponent } from '@nxt1/ui/components/value-prop-comparison';
import { NxtEcosystemMapComponent } from '@nxt1/ui/components/ecosystem-map';

import { NxtFaqSectionComponent, type FaqItem } from '@nxt1/ui/components/faq-section';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtSiteFooterCompactComponent } from '@nxt1/ui/components/site-footer-compact';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { SeoService } from '../../core/services';
import type { SeoConfig } from '@nxt1/core/seo';

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
      'Athletes improve visibility by completing profiles, uploading highlights, and using AI-powered workflows that surface them to evaluators automatically.',
  },
  {
    id: 'coach-tools',
    question: 'Can coaches and teams use NXT1 for talent operations?',
    answer:
      'Yes. Coaches and team staff can search talent, organize watch lists, and delegate workflows to AI coordinators directly in the platform.',
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
    NxtPartnerMarqueeComponent,
    // Below-fold (Angular auto-defers these since they're only in @defer blocks)
    NxtValuePropComparisonComponent,
    NxtEcosystemMapComponent,
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
          <nxt1-immersive-hero
            variant="sleek"
            headline="The World's First Autonomous Sports Platform"
          />
        </section>

        <section aria-labelledby="partners-heading">
          <h2 id="partners-heading" class="sr-only">Our Partners</h2>
          <nxt1-partner-marquee
            title="Trusted By Leading Organizations"
            subtitle="Partnering with the best to power the future of sports intelligence"
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
          <section aria-labelledby="ecosystem-heading">
            <h2 id="ecosystem-heading" class="sr-only">The NXT1 Ecosystem</h2>
            <nxt1-ecosystem-map />
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
              subtitle="Join the NXT1 sports intelligence platform — powered by AI coordinators that build your profile, generate elite highlights, and surface you to college coaches automatically."
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
        title: 'NXT1 Sports - The Sports Intelligence Platform',
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
              'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
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
            name: 'NXT1 Sports - The Sports Intelligence Platform',
            isPartOf: { '@id': 'https://nxt1sports.com/#website' },
            about: { '@id': 'https://nxt1sports.com/#organization' },
            description:
              'NXT1 is the first AI command center for sports organizations to run their entire program from one system.',
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
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
        ],
      },
    };

    this.seoService.applySeoConfig(seoConfig);
  }
}
