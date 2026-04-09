/**
 * @fileoverview AI for Athletes Landing Page
 * @module apps/web/featur../shared/personas/ai-athletes
 * @version 1.0.0
 *
 * Orchestrator for the `/ai-athletes` persona marketing page.
 * Composes shared NXT1 section components with AI-specific athlete
 * content, including communication training and future success
 * simulation visuals.
 *
 * 100% design-token driven, SSR-safe, fully accessible.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtUnfairAdvantageHeroComponent } from '../../components/unfair-advantage-hero/unfair-advantage-hero.component';
import { NxtRecruitingEmailAssistantSectionComponent } from '../../components/recruiting-email-assistant-section/recruiting-email-assistant-section.component';
import { NxtSuccessSimulationSectionComponent } from '../../components/success-simulation-section/success-simulation-section.component';
import { NxtGetItDoneWorkflowSectionComponent } from '../../components/get-it-done-workflow-section/get-it-done-workflow-section.component';
import { NxtOpportunityRadarSectionComponent } from '../../components/opportunity-radar-section';
import { NxtHighlightEngineActionSectionComponent } from '../../components/highlight-engine-action-section';
import { NxtLimitlessBoxSectionComponent } from '../../components/limitless-box-section/limitless-box-section.component';
import { NxtCtaBannerComponent, type CtaAvatarImage } from '@nxt1/ui/components/cta-banner';
import { NxtSiteFooterComponent } from '@nxt1/ui/components/site-footer';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

const AI_ATHLETES_CTA_AVATARS: readonly CtaAvatarImage[] = [
  { src: `/${IMAGE_PATHS.athlete1}`, alt: 'AI athlete user' },
  { src: `/${IMAGE_PATHS.athlete2}`, alt: 'Student athlete using AI tools' },
  { src: `/${IMAGE_PATHS.athlete3}`, alt: 'Recruiting athlete profile user' },
  { src: `/${IMAGE_PATHS.athlete4}`, alt: 'Athlete using communication training' },
  { src: `/${IMAGE_PATHS.athlete5}`, alt: 'High-performance athlete user' },
  { src: `/${IMAGE_PATHS.coach1}`, alt: 'Coach reviewing AI-assisted outreach' },
] as const;

@Component({
  selector: 'nxt1-ai-athletes-landing',
  standalone: true,
  imports: [
    NxtUnfairAdvantageHeroComponent,
    NxtRecruitingEmailAssistantSectionComponent,
    NxtSuccessSimulationSectionComponent,
    NxtGetItDoneWorkflowSectionComponent,
    NxtOpportunityRadarSectionComponent,
    NxtHighlightEngineActionSectionComponent,
    NxtLimitlessBoxSectionComponent,
    NxtCtaBannerComponent,
    NxtSiteFooterComponent,
  ],
  template: `
    <nxt1-unfair-advantage-hero />

    @defer (on viewport) {
      <nxt1-highlight-engine-action-section />
    } @placeholder {
      <div style="min-height: 60vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <!-- Workflow Automation: The 'Get It Done' Button -->
      <nxt1-get-it-done-workflow-section />
    } @placeholder {
      <div style="min-height: 60vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <!-- Recruiting Discovery: The Opportunity Radar -->
      <nxt1-opportunity-radar-section />
    } @placeholder {
      <div style="min-height: 60vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <!-- Success Simulation (Future): Offer Projection -->
      <nxt1-success-simulation-section />
    } @placeholder {
      <div style="min-height: 60vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <!-- Communication Training: Recruiting Email Assistant -->
      <nxt1-recruiting-email-assistant-section />
    } @placeholder {
      <div style="min-height: 60vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <nxt1-limitless-box-section />
    } @placeholder {
      <div style="min-height: 40vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <nxt1-cta-banner
        variant="conversion"
        badgeLabel="AI for Athletes"
        title="Turn Every Rep Into Recruiting Momentum."
        subtitle="Use NXT1 AI to analyze film faster, draft stronger coach outreach, and build a brand that stays active while you train."
        ctaLabel="Start Free with AI"
        ctaRoute="/auth"
        titleId="ai-athletes-final-cta-title"
        [avatarImages]="ctaAvatars"
      />
    } @placeholder {
      <div style="min-height: 30vh" aria-hidden="true"></div>
    }

    @defer (on viewport) {
      <nxt1-site-footer />
    } @placeholder {
      <div style="min-height: 20vh" aria-hidden="true"></div>
    }
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
export class NxtAiAthletesLandingComponent {
  protected readonly ctaAvatars = AI_ATHLETES_CTA_AVATARS;
}
