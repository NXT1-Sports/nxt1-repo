/**
 * @fileoverview Super Profiles Page Component
 * @module apps/web/features/super-profiles
 *
 * Web-specific wrapper for the `/super-profiles` marketing page.
 * Showcases the NXT1 Super Profile concept with an interactive breakdown,
 * athlete-specific features, and SEO metadata.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtMobileFirstDesignSectionComponent } from '@nxt1/ui/components/mobile-first-design-section';
import { NxtRecruitmentPillarsSectionComponent } from '@nxt1/ui/components/recruitment-pillars-section';
import { NxtSeoGoogleSearchSectionComponent } from '@nxt1/ui/components/seo-google-search-section';
import { NxtSuperProfileBreakdownComponent } from '@nxt1/ui/components/super-profile-breakdown';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { SeoService } from '../../core/services/seo.service';

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
  selector: 'app-super-profiles',
  standalone: true,
  imports: [
    NxtCtaBannerComponent,
    NxtMobileFirstDesignSectionComponent,
    NxtRecruitmentPillarsSectionComponent,
    NxtSeoGoogleSearchSectionComponent,
    NxtSuperProfileBreakdownComponent,
  ],
  template: `
    <nxt1-super-profile-breakdown />
    <nxt1-seo-google-search-section />
    <nxt1-mobile-first-design-section />
    <nxt1-recruitment-pillars-section />
    <nxt1-cta-banner
      variant="conversion"
      badgeLabel="Super Profile"
      title="Be Complete. Be Recruitable."
      subtitle="Build your NXT1 Super Profile with all four recruiting pillars coaches evaluate first: trust, proof, discipline, and personality."
      ctaLabel="Build Your Super Profile"
      ctaRoute="/auth"
      titleId="super-profiles-final-cta-title"
      [avatarImages]="ctaAvatars"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperProfilesComponent implements OnInit {
  private readonly seo = inject(SeoService);
  protected readonly ctaAvatars = CTA_AVATARS;

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Super Profiles — The Ultimate Recruiting Profile | NXT1',
      description:
        'Discover the NXT1 Super Profile — a verified, data-rich recruiting profile with highlight reels, analytics, academic records, and direct college coach connections. Stand out from every other recruit.',
    });
  }
}
