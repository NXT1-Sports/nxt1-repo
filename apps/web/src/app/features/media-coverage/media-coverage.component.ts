import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NxtBreakingNewsHeroComponent } from '@nxt1/ui/components/breaking-news-hero';
import { NxtCoverageGapPainPointComponent } from '@nxt1/ui/components/coverage-gap-pain-point';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtHighlightReelNetworkSectionComponent } from '@nxt1/ui/components/highlight-reel-network-section';
import { NxtNewsletterFeatureSectionComponent } from '@nxt1/ui/components/newsletter-feature-section';
import { NxtRankingsEngineSectionComponent } from '@nxt1/ui/components/rankings-engine-section';
import { NxtScoutReportJournalismSectionComponent } from '@nxt1/ui/components/scout-report-journalism-section';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-media-coverage',
  standalone: true,
  imports: [
    NxtBreakingNewsHeroComponent,
    NxtCoverageGapPainPointComponent,
    NxtCtaBannerComponent,
    NxtRankingsEngineSectionComponent,
    NxtScoutReportJournalismSectionComponent,
    NxtHighlightReelNetworkSectionComponent,
    NxtNewsletterFeatureSectionComponent,
  ],
  template: `
    <main class="media-coverage-page">
      <nxt1-breaking-news-hero />
      <nxt1-coverage-gap-pain-point />
      <nxt1-scout-report-journalism-section />
      <nxt1-rankings-engine-section [headingLevel]="2" />
      <nxt1-newsletter-feature-section [headingLevel]="2" />
      <nxt1-highlight-reel-network-section [headingLevel]="2" />
      <nxt1-cta-banner
        variant="conversion"
        badgeLabel="Media & Coverage"
        title="Get Covered. Get Discovered."
        subtitle="Create your athlete profile, publish your story, and reach college coaches through NXT1 media channels."
        ctaLabel="Start Your Free Profile"
        ctaRoute="/auth"
        titleId="media-coverage-final-cta-title"
      />
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .media-coverage-page {
        display: grid;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaCoverageComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.applySeoConfig({
      page: {
        title: 'Media & Coverage for Athletes | NXT1',
        description:
          'Professional media coverage for every athlete level. Build headline-ready sports stories with NXT1 and help coaches discover your recruiting impact faster.',
        canonicalUrl: 'https://nxt1sports.com/media-coverage',
        keywords: [
          'athlete media coverage',
          'sports intelligence media',
          'direct to coaches newsletter',
          'athlete newsletter feature',
          'college coach email digest',
          'weekly recruiting newsletter',
          'land in their inbox',
          'breaking news athlete profile',
          'ai scouting report',
          'ai supported journalism for athletes',
          'prospect watch report',
          'athlete highlights for coaches',
          'high school athlete publicity',
          'NXT1 sports report',
          'espn covers 0.01',
          'coverage gap athletes',
        ],
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      openGraph: {
        type: 'website',
        title: 'Media & Coverage for Athletes | NXT1',
        description:
          'ESPN covers 0.01%. NXT1 covers everyone with professional media coverage designed for recruiting visibility.',
        url: 'https://nxt1sports.com/media-coverage',
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'ESPN Covers 0.01%. We Cover You. | NXT1',
        description:
          'Media coverage should not be reserved for the elite. NXT1 gives every athlete a platform.',
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Media & Coverage for Athletes | NXT1',
        url: 'https://nxt1sports.com/media-coverage',
        description:
          'Professional media coverage for athletes with broadcast-grade storytelling and visibility tools.',
        isPartOf: {
          '@type': 'WebSite',
          name: 'NXT1 Sports',
          url: 'https://nxt1sports.com',
        },
        hasPart: [
          {
            '@type': 'CreativeWork',
            name: 'The Coverage Gap',
            headline: 'ESPN Covers 0.01%. We Cover You.',
            text: 'Media coverage should not be a privilege for the elite. It should be a right for anyone who competes.',
          },
          {
            '@type': 'NewsArticle',
            name: 'The Scout Report',
            headline: 'Your Scouting Report. AI-Supported. Coach-Ready.',
            alternativeHeadline: '2027 Prospect Watch: Jordan Thomas Shows D1 Upside.',
            description:
              'Agent X supports professional scouting report creation based on verified stats and film, highlighting strengths, development priorities, and recruiting context before publishing to athlete profiles and the NXT1 network.',
            articleBody:
              "The 6'3 guard from Dallas showcased elite court vision and a reliable pull-up jumper, while consistently creating high-value possessions in late-game situations. His pace, decision quality, and defensive effort point to strong D1 upside.",
            publisher: {
              '@type': 'Organization',
              name: 'NXT1 Sports',
              url: 'https://nxt1sports.com',
            },
          },
          {
            '@type': 'CreativeWork',
            name: 'Direct to Coaches Newsletter',
            headline: 'Land in Their Inbox.',
            description:
              'Our weekly digest is read by 5,000+ college coaches. Get featured and skip the cold DM. Weekly placement designed to put your profile in front of college programs already scouting your region.',
          },
          {
            '@type': 'CreativeWork',
            name: 'The Rankings Engine',
            headline: 'Climb the Charts.',
            description:
              'Our ranking algorithm uses verified stats, film quality, and engagement. Climb the list, get noticed by coaches and scouts nationwide.',
          },
        ],
      },
    });
  }
}
