/**
 * @fileoverview Help Center Category Page - Web
 * @version 4.0.0
 * @description Web-optimized category detail using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, effect } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HELP_CATEGORIES, type HelpCategoryId } from '@nxt1/core';
import { HelpCategoryDetailWebComponent } from '@nxt1/ui/help-center';
import { HelpCenterService } from '@nxt1/ui/help-center';
import { SeoService } from '../../core/services';

/** Keyword sets per category for long-tail SEO targeting */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'getting-started': [
    'how to use nxt1 sports',
    'nxt1 sports setup guide',
    'sports platform getting started',
    'athlete profile setup',
    'nxt1 onboarding',
  ],
  'agent-x': [
    'nxt1 Agent X help',
    'AI sports assistant guide',
    'AI athlete commands',
    'sports AI workflow',
    'Agent X tutorial',
  ],
  teams: [
    'nxt1 team management help',
    'sports team platform support',
    'coach team management guide',
    'team roster management',
  ],
  account: [
    'nxt1 account settings',
    'nxt1 subscription help',
    'sports platform account support',
    'nxt1 billing help',
  ],
  troubleshooting: [
    'nxt1 troubleshooting',
    'sports platform not working',
    'nxt1 fix issues',
    'nxt1 sports bug help',
  ],
};

@Component({
  selector: 'app-help-center-category',
  standalone: true,
  imports: [HelpCategoryDetailWebComponent],
  template: `
    <nxt1-help-category-detail-web
      [categoryId]="categoryId"
      (back)="onBack()"
      (articleClick)="onArticleSelect($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterCategoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly helpService = inject(HelpCenterService);
  private readonly seo = inject(SeoService);

  protected categoryId: HelpCategoryId = 'getting-started';

  constructor() {
    // Re-inject Article list + ItemList schema once the category detail loads
    effect(() => {
      const detail = this.helpService.categoryDetail();
      if (!detail || detail.category.id !== this.categoryId) return;

      const canonicalUrl = `https://nxt1sports.com/help-center/category/${this.categoryId}`;

      this.seo.applySeoConfig({
        page: {
          title: `${detail.category.label} Help`,
          description:
            detail.category.description ??
            `Browse ${detail.category.label.toLowerCase()} support articles in the NXT1 Sports Help Center.`,
          canonicalUrl,
          keywords: [
            ...(CATEGORY_KEYWORDS[this.categoryId] ?? []),
            'nxt1 help center',
            'nxt1 sports support',
          ],
        },
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              '@id': `${canonicalUrl}#webpage`,
              url: canonicalUrl,
              name: `${detail.category.label} Help | NXT1 Sports`,
              description:
                detail.category.description ??
                `Browse ${detail.category.label.toLowerCase()} support articles.`,
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
                  {
                    '@type': 'ListItem',
                    position: 3,
                    name: detail.category.label,
                    item: canonicalUrl,
                  },
                ],
              },
              ...(detail.articles.length > 0
                ? {
                    mainEntity: {
                      '@type': 'ItemList',
                      itemListElement: detail.articles.slice(0, 10).map((article, idx) => ({
                        '@type': 'ListItem',
                        position: idx + 1,
                        url: `https://nxt1sports.com/help-center/article/${article.slug}`,
                        name: article.title,
                      })),
                    },
                  }
                : {}),
            },
          ],
        },
      });
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('categoryId') as HelpCategoryId | null;
    if (!id) {
      this.router.navigate(['/help-center']);
      return;
    }
    this.categoryId = id;

    const category = HELP_CATEGORIES.find((c) => c.id === id);
    const categoryTitle =
      category?.label ??
      id
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

    // Placeholder meta while category detail loads (overridden by effect once resolved)
    this.seo.updatePage({
      title: `${categoryTitle} Help | NXT1 Sports`,
      description:
        category?.description ??
        `Browse ${categoryTitle.toLowerCase()} support articles in the NXT1 Sports Help Center.`,
      canonicalUrl: `https://nxt1sports.com/help-center/category/${id}`,
      keywords: [...(CATEGORY_KEYWORDS[id] ?? []), 'nxt1 help center', 'nxt1 sports support'],
    });

    this.helpService.loadCategory(id);
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
