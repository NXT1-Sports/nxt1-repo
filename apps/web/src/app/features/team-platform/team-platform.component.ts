import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NxtContentFactoryLandingComponent } from '@nxt1/ui/components/content-factory';
import { NxtOldVsNewContrastSectionComponent } from '@nxt1/ui/components/old-vs-new-contrast-section';
import { NxtCoachAuthorityValidationComponent } from '@nxt1/ui/components/coach-authority-validation';
import { NxtIntegrationPipelineSectionComponent } from '@nxt1/ui/components/integration-pipeline-section';
import { NxtGenesisMomentComponent } from '@nxt1/ui/components/genesis-moment';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-team-platform',
  standalone: true,
  imports: [
    NxtContentFactoryLandingComponent,
    NxtOldVsNewContrastSectionComponent,
    NxtCoachAuthorityValidationComponent,
    NxtIntegrationPipelineSectionComponent,
    NxtGenesisMomentComponent,
  ],
  template: `
    <nxt1-genesis-moment
      headline="One Link. A Dynasty of Careers."
      subhead="We turn a single URL into a fully operational recruiting department. You paste the roster. Agent X builds the brands, contacts the colleges, and delivers the offers."
      primaryCtaLabel="Deploy Agent X"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Watch Demo"
    />
    <nxt1-content-factory-landing />
    <nxt1-integration-pipeline-section />

    @defer (on viewport) {
      <section aria-labelledby="coach-validation-heading">
        <h2 id="coach-validation-heading" class="sr-only">Coach Validation</h2>
        <nxt1-coach-authority-validation />
      </section>
    } @placeholder {
      <div class="defer-placeholder" aria-hidden="true"></div>
    }

    <nxt1-old-vs-new-contrast-section />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .defer-placeholder {
        min-height: var(--nxt1-spacing-96);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPlatformComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Content Factory — A D1 Creative Team in a Box | NXT1 Team Platform',
      description:
        'Turn raw game footage into elite, branded content for every player and the program itself. No designers needed. Agent X generates pro-grade assets for every win, every offer, and every milestone.',
      canonicalUrl: 'https://nxt1sports.com/team-platform',
      keywords: [
        'team platform',
        'content factory',
        'sports graphics generator',
        'agent x',
        'd1 creative team',
        'game day graphics',
        'mvp graphics',
        'commit graphics',
        'stat leader graphics',
        'program branding',
      ],
    });
  }
}
