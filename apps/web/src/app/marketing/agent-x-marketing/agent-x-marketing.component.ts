import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { NxtAgentXLandingComponent } from '@nxt1/ui/agent-x/landing';
import { NxtAgentXExecutionLayerSectionComponent } from '@nxt1/ui/components/agent-x-execution-layer-section';
import { NxtAgentXWelcomeHeaderComponent } from '@nxt1/ui/components/agent-x-welcome-header';
import type { SeoConfig } from '@nxt1/core/seo';
import { SeoService } from '../../core/services/web/seo.service';

const AGENT_X_MARKETING_TITLE = 'NXT1 Agent X | AI Command Center for Sports';
const AGENT_X_MARKETING_DESCRIPTION =
  'Agent X is the NXT1 AI command center for sports that executes film, creative, communications, and operations for athletes, coaches, directors, and programs.';
const AGENT_X_MARKETING_URL = 'https://nxt1sports.com/agent-x';
const AGENT_X_MARKETING_IMAGE = 'https://nxt1sports.com/assets/shared/images/og-image.jpg';
const AGENT_X_MARKETING_IMAGE_ALT = 'Agent X AI command center for sports preview';
const AGENT_X_MARKETING_IMAGE_WIDTH = 1200;
const AGENT_X_MARKETING_IMAGE_HEIGHT = 630;
const AGENT_X_MARKETING_KEYWORDS = [
  'agent x',
  'sports intelligence command center',
  'ai sports platform',
  'sports intelligence ai',
  'ai workflow automation for sports',
  'ai for coaches and athletic programs',
  'sports operations software',
  'film analysis ai',
  'sports creative automation',
  'nxt1',
] as const;
const AGENT_X_MARKETING_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://nxt1sports.com/agent-x#webpage',
      url: AGENT_X_MARKETING_URL,
      name: AGENT_X_MARKETING_TITLE,
      description: AGENT_X_MARKETING_DESCRIPTION,
      isPartOf: {
        '@type': 'WebSite',
        '@id': 'https://nxt1sports.com/#website',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      about: { '@id': 'https://nxt1sports.com/agent-x#software' },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: AGENT_X_MARKETING_IMAGE,
        width: AGENT_X_MARKETING_IMAGE_WIDTH,
        height: AGENT_X_MARKETING_IMAGE_HEIGHT,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://nxt1sports.com/agent-x#software',
      name: 'Agent X',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: AGENT_X_MARKETING_URL,
      description: AGENT_X_MARKETING_DESCRIPTION,
      image: AGENT_X_MARKETING_IMAGE,
      publisher: {
        '@type': 'Organization',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      featureList: [
        'Film analysis and recap packaging',
        'Creative production and branded asset generation',
        'Communications workflows and follow-up drafting',
        'Weekly operating plans and background operations',
        'Decision-grade sports intelligence for athletes, coaches, directors, and programs',
      ],
    },
  ],
} as const;

@Component({
  selector: 'app-agent-x-marketing',
  standalone: true,
  imports: [
    NxtAgentXWelcomeHeaderComponent,
    NxtAgentXExecutionLayerSectionComponent,
    NxtAgentXLandingComponent,
  ],
  template: `
    <main class="agent-x-marketing" role="main">
      <section class="agent-x-marketing__hero" aria-label="Agent X hero">
        <nxt1-agent-x-welcome-header [animateOnLoad]="false" />
      </section>

      <nxt1-agent-x-execution-layer-section />

      @defer (on viewport) {
        <nxt1-agent-x-landing />
      } @placeholder {
        <div class="agent-x-marketing__placeholder" aria-hidden="true"></div>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-x-marketing {
        position: relative;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-x-marketing__hero {
        min-height: calc(100vh - var(--nxt1-nav-height, 56px));
      }

      .agent-x-marketing__hero > nxt1-agent-x-welcome-header {
        display: block;
      }

      .agent-x-marketing__placeholder {
        min-height: 1800px;
      }

      @media (max-width: 768px) {
        .agent-x-marketing__hero {
          min-height: auto;
        }

        .agent-x-marketing__placeholder {
          min-height: 1200px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXMarketingComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    const seoConfig: SeoConfig = {
      page: {
        title: AGENT_X_MARKETING_TITLE,
        description: AGENT_X_MARKETING_DESCRIPTION,
        canonicalUrl: AGENT_X_MARKETING_URL,
        image: AGENT_X_MARKETING_IMAGE,
        imageAlt: AGENT_X_MARKETING_IMAGE_ALT,
        keywords: [...AGENT_X_MARKETING_KEYWORDS],
      },
      openGraph: {
        type: 'website',
        title: AGENT_X_MARKETING_TITLE,
        description: AGENT_X_MARKETING_DESCRIPTION,
        url: AGENT_X_MARKETING_URL,
        image: AGENT_X_MARKETING_IMAGE,
        imageAlt: AGENT_X_MARKETING_IMAGE_ALT,
        imageWidth: AGENT_X_MARKETING_IMAGE_WIDTH,
        imageHeight: AGENT_X_MARKETING_IMAGE_HEIGHT,
      },
      twitter: {
        card: 'summary_large_image',
        title: AGENT_X_MARKETING_TITLE,
        description: AGENT_X_MARKETING_DESCRIPTION,
        image: AGENT_X_MARKETING_IMAGE,
        imageAlt: AGENT_X_MARKETING_IMAGE_ALT,
      },
      structuredData: AGENT_X_MARKETING_STRUCTURED_DATA,
    };

    this.seo.applySeoConfig(seoConfig);
  }
}
