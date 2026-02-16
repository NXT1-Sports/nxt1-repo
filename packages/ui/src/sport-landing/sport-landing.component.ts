/**
 * @fileoverview Sport Landing Page Component
 * @module @nxt1/ui/sport-landing
 * @version 1.0.0
 *
 * A single, reusable landing page that renders sport-specific marketing
 * content. Receives a SportLandingConfig input and wires it into the
 * same shared section components used by the persona pages.
 *
 * This means unlimited sport verticals with ONE code implementation.
 *
 * @example
 * ```html
 * <nxt1-sport-landing [config]="footballConfig" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { NxtHeroSectionComponent } from '../components/hero-section';
import { NxtStatsBarComponent, type StatsBarItem } from '../components/stats-bar';
import {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from '../components/feature-showcase';
import { NxtAudienceSectionComponent, type AudienceSegment } from '../components/audience-section';
import { NxtFaqSectionComponent, type FaqItem } from '../components/faq-section';
import { NxtCtaBannerComponent } from '../components/cta-banner';
// Preview component is co-located
import { NxtSportLandingPreviewComponent } from './sport-landing-preview.component';
import type { SportLandingConfig } from '@nxt1/core';

@Component({
  selector: 'nxt1-sport-landing',
  standalone: true,
  imports: [
    NxtHeroSectionComponent,
    NxtStatsBarComponent,
    NxtFeatureShowcaseComponent,
    NxtAudienceSectionComponent,
    NxtFaqSectionComponent,
    NxtCtaBannerComponent,
    NxtSportLandingPreviewComponent,
  ],
  template: `
    @if (config(); as c) {
      <nxt1-hero-section
        [badgeIcon]="c.heroBadgeIcon"
        [badgeLabel]="c.heroBadgeLabel"
        [title]="c.heroTitle"
        [accentText]="c.heroAccent"
        [subtitle]="c.heroSubtitle"
        primaryCtaLabel="Create Free Profile"
        primaryCtaRoute="/auth/register"
        [secondaryCtaLabel]="'Browse ' + c.displayName + ' Athletes'"
        secondaryCtaRoute="/explore"
        [ariaId]="c.slug + '-hero'"
      >
        <nxt1-sport-landing-preview
          [sportLabel]="c.previewSportLabel"
          [highlights]="c.previewHighlights"
          [rankings]="c.previewRankings"
        />
      </nxt1-hero-section>

      <nxt1-stats-bar [stats]="stats()" />

      <nxt1-feature-showcase
        [title]="c.featuresTitle"
        [subtitle]="c.featuresSubtitle"
        [features]="features()"
      />

      <nxt1-audience-section
        [title]="c.audienceTitle"
        [subtitle]="c.audienceSubtitle"
        [segments]="audiences()"
      />

      <nxt1-faq-section [title]="c.faqTitle" [subtitle]="c.faqSubtitle" [items]="faqs()" />

      <nxt1-cta-banner
        [title]="c.ctaTitle"
        [subtitle]="c.ctaSubtitle"
        [ctaLabel]="c.ctaLabel"
        [ctaRoute]="c.ctaRoute"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSportLandingComponent {
  /** The full sport landing config — supplied by the parent wrapper. */
  readonly config = input.required<SportLandingConfig>();

  // Map SportLanding* types → shared section component types
  protected readonly stats = computed<StatsBarItem[]>(() =>
    this.config().stats.map((s) => ({ label: s.label, value: s.value }))
  );

  protected readonly features = computed<FeatureShowcaseItem[]>(() =>
    this.config().features.map((f) => ({
      id: f.id,
      icon: f.icon,
      title: f.title,
      description: f.description,
    }))
  );

  protected readonly audiences = computed<AudienceSegment[]>(() =>
    this.config().audiences.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.title,
      description: a.description,
    }))
  );

  protected readonly faqs = computed<FaqItem[]>(() =>
    this.config().faqs.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
    }))
  );
}
