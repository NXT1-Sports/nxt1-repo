/**
 * @fileoverview Help Center Home Page - Web
 * @version 4.0.0
 * @description Web-optimized Help Center using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { HelpCenterShellWebComponent, type HelpNavigateEvent } from '@nxt1/ui/help-center';
import { HelpCenterService } from '@nxt1/ui/help-center';
import { NxtBrowserService } from '@nxt1/ui/services/browser';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [HelpCenterShellWebComponent],
  template: `
    <nxt1-help-center-shell-web
      [showBack]="true"
      (back)="onBack()"
      (navigate)="onNavigate($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterComponent {
  private readonly router = inject(Router);
  private readonly helpService = inject(HelpCenterService);
  private readonly browser = inject(NxtBrowserService);
  private readonly seo = inject(SeoService);

  constructor() {
    // Base page meta — present on SSR before FAQs load
    this.seo.updatePage({
      title: 'Help Center',
      description:
        'Find answers to common questions, troubleshooting guides, and support resources for NXT1 Sports — the AI-powered sports intelligence platform for athletes, coaches, and programs.',
      canonicalUrl: 'https://nxt1sports.com/help-center',
      keywords: [
        'nxt1 help center',
        'nxt1 sports support',
        'sports platform help',
        'athlete platform support',
        'AI sports platform guide',
        'coach platform help',
        'recruiting platform support',
      ],
    });

    // Inject WebSite + FAQPage JSON-LD once popular FAQs are available.
    // effect() re-runs whenever popularFaqs() changes, so SSR captures it
    // on first render and the client keeps it in sync.
    effect(() => {
      const faqs = this.helpService.popularFaqs();

      const structuredData: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': 'https://nxt1sports.com/#website',
            url: 'https://nxt1sports.com',
            name: 'NXT1 Sports',
            description: 'The AI-powered sports intelligence platform',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://nxt1sports.com/help-center?q={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'WebPage',
            '@id': 'https://nxt1sports.com/help-center#webpage',
            url: 'https://nxt1sports.com/help-center',
            name: 'Help Center | NXT1 Sports',
            description:
              'Find answers, troubleshooting guides, and support resources for the NXT1 Sports platform.',
            isPartOf: { '@id': 'https://nxt1sports.com/#website' },
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'Home',
                  item: 'https://nxt1sports.com',
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'Help Center',
                  item: 'https://nxt1sports.com/help-center',
                },
              ],
            },
          },
          ...(faqs.length > 0
            ? [
                {
                  '@type': 'FAQPage',
                  '@id': 'https://nxt1sports.com/help-center#faqpage',
                  mainEntity: faqs.map((faq) => ({
                    '@type': 'Question',
                    name: faq.question,
                    acceptedAnswer: {
                      '@type': 'Answer',
                      // Strip HTML tags from answer for structured data
                      text: faq.answer
                        .replace(/<[^>]*>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim(),
                    },
                  })),
                },
              ]
            : []),
        ],
      };

      this.seo.applySeoConfig({ page: { title: 'Help Center', description: '' }, structuredData });
    });

    // Load home data from backend API
    this.helpService.loadHome();
  }

  protected onBack(): void {
    this.router.navigate(['/settings']);
  }

  protected onNavigate(event: HelpNavigateEvent): void {
    switch (event.type) {
      case 'article':
        if (event.slug) {
          this.router.navigate(['/help-center', 'article', event.slug]);
        }
        break;
      case 'category':
        if (event.id) {
          this.router.navigate(['/help-center', 'category', event.id]);
        }
        break;
      case 'faq':
        break;
      case 'contact':
        this.contactSupport();
        break;
    }
  }

  private async contactSupport(): Promise<void> {
    await this.browser.openMailto({
      to: 'support@nxt1sports.com',
      subject: 'Support Request - NXT1 Sports',
      body: ['Hi NXT1 Support Team,', '', 'I need help with:', '', 'My account email:'].join('\n'),
    });
  }
}
