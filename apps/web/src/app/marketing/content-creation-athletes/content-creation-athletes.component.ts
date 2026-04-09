import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NxtBrandKitIntegrationSectionComponent } from '@nxt1/ui/components/brand-kit-integration-section';
import { NxtCoSignCollaborationSectionComponent } from '@nxt1/ui/components/co-sign-collaboration-section';
import { NxtCtaBannerComponent } from '@nxt1/ui/components/cta-banner';
import { NxtGraphicFactoryHeroComponent } from '@nxt1/ui/components/graphic-factory-hero';
import { NxtInfiniteContentEngineSectionComponent } from '@nxt1/ui/components/infinite-content-engine-section';
import { NxtMediaEmpireHeroComponent } from '@nxt1/ui/components/media-empire-hero';
import { NxtSuccessStoriesComponent } from '@nxt1/ui/components/success-stories';
import { NxtVideoHighlightsHeroComponent } from '@nxt1/ui/components/video-highlights-hero';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-content-creation-athletes',
  standalone: true,
  imports: [
    NxtMediaEmpireHeroComponent,
    NxtBrandKitIntegrationSectionComponent,
    NxtInfiniteContentEngineSectionComponent,
    NxtSuccessStoriesComponent,
    NxtCoSignCollaborationSectionComponent,
    NxtCtaBannerComponent,
    NxtGraphicFactoryHeroComponent,
    NxtVideoHighlightsHeroComponent,
  ],
  template: `
    <nxt1-media-empire-hero />
    <nxt1-co-sign-collaboration-section [headingLevel]="2" />
    <nxt1-brand-kit-integration-section [headingLevel]="2" />
    <nxt1-infinite-content-engine-section [headingLevel]="2" />
    <nxt1-graphic-factory-hero [headingLevel]="2" titleId="graphic-factory-title" />
    <nxt1-video-highlights-hero [headingLevel]="2" titleId="video-highlights-title" />
    <nxt1-success-stories [headingLevel]="2" />
    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Build Your Media Empire"
      title="Create Content That Gets You Recruited."
      subtitle="Turn raw footage into personalized, daily-ready posts with NXT1, grow your audience, and generate real recruiting momentum."
      ctaLabel="Start Creating With NXT1"
      ctaRoute="/auth"
      titleId="content-creation-athletes-final-cta-title"
    />
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
export class ContentCreationAthletesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Media Empire for Athletes | NXT1 Content Creation',
      description:
        'Be your own ESPN with NXT1. Turn raw footage into personalized, daily-ready posts with The Infinite Content Engine, then publish branded recruiting content that drives offers.',
      canonicalUrl: 'https://nxt1sports.com/content-creation-athletes',
      keywords: [
        'athlete content creation',
        'infinite content engine',
        'personalized athlete content',
        "generate today's post",
        'athlete brand kit',
        'brand consistency for athletes',
        'sports highlights editor',
        'recruiting content platform',
        'athlete viral content proof',
        'recruiting offers from social media',
        'nxt1 media empire',
        'tiktok reels shorts automation',
      ],
      image: 'https://nxt1sports.com/assets/images/og-image.jpg',
    });
  }
}
