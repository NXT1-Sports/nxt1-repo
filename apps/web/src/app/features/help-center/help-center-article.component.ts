/**
 * @fileoverview Help Center Article Page - Web
 * @version 4.0.0
 * @description Web-optimized article detail using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, computed, effect } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HelpArticleDetailWebComponent } from '@nxt1/ui/help-center';
import { HelpCenterService } from '@nxt1/ui/help-center';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-help-center-article',
  standalone: true,
  imports: [HelpArticleDetailWebComponent],
  template: `
    <nxt1-help-article-detail-web
      [slug]="articleSlug()"
      (back)="onBack()"
      (relatedClick)="onArticleSelect($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterArticleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly helpService = inject(HelpCenterService);
  private readonly seo = inject(SeoService);

  /** Reactive slug signal derived from the route — updates on every navigation. */
  private readonly routeParams = toSignal(this.route.paramMap);
  protected readonly articleSlug = computed(() => this.routeParams()?.get('slug') ?? '');

  constructor() {
    // Fires whenever the slug changes — loads the article and writes placeholder SEO immediately.
    effect(() => {
      const slug = this.articleSlug();
      if (!slug) {
        this.router.navigate(['/help-center']);
        return;
      }

      const slugTitle = slug
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      this.seo.updatePage({
        title: `${slugTitle} | NXT1 Help Center`,
        description: `Get help with ${slugTitle.toLowerCase()} on the NXT1 Sports platform.`,
        canonicalUrl: `https://nxt1sports.com/help-center/article/${slug}`,
        keywords: ['nxt1 help', 'nxt1 sports support', slug.replace(/-/g, ' ')],
      });

      this.helpService.loadArticle(slug);
    });

    // effect() re-runs when selectedArticle() changes (i.e., after loadArticle resolves).
    // This ensures SSR captures real article metadata, not slug-derived placeholders.
    effect(() => {
      const article = this.helpService.selectedArticle();
      if (!article || article.slug !== this.articleSlug()) return;

      const canonicalUrl = `https://nxt1sports.com/help-center/article/${article.slug}`;
      const title = article.seo?.metaTitle || article.title;
      const description =
        article.seo?.metaDescription ||
        article.excerpt ||
        `Learn about ${article.title.toLowerCase()} in the NXT1 Sports Help Center.`;
      const keywords = [
        ...(article.seo?.keywords ?? []),
        ...article.tags,
        'nxt1 help',
        'nxt1 sports support',
      ];

      const categoryLabel = this.getCategoryLabel(article.category);

      this.seo.applySeoConfig({
        page: {
          title,
          description,
          canonicalUrl,
          keywords,
          image: article.heroImageUrl || article.thumbnailUrl,
        },
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Article',
              '@id': `${canonicalUrl}#article`,
              headline: article.title,
              description,
              url: canonicalUrl,
              datePublished: article.publishedAt,
              dateModified: article.updatedAt,
              author: {
                '@type': 'Organization',
                name: 'NXT1 Sports',
                url: 'https://nxt1sports.com',
              },
              publisher: {
                '@type': 'Organization',
                name: 'NXT1 Sports',
                url: 'https://nxt1sports.com',
                logo: {
                  '@type': 'ImageObject',
                  url: 'https://nxt1sports.com/assets/images/og-image.jpg',
                },
              },
              ...(article.heroImageUrl || article.thumbnailUrl
                ? {
                    image: {
                      '@type': 'ImageObject',
                      url: article.heroImageUrl || article.thumbnailUrl,
                    },
                  }
                : {}),
            },
            {
              '@type': 'BreadcrumbList',
              '@id': `${canonicalUrl}#breadcrumb`,
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
                  name: categoryLabel,
                  item: `https://nxt1sports.com/help-center/category/${article.category}`,
                },
                {
                  '@type': 'ListItem',
                  position: 4,
                  name: article.title,
                  item: canonicalUrl,
                },
              ],
            },
          ],
        },
      });
    });
  }

  private getCategoryLabel(categoryId: string): string {
    const labels: Record<string, string> = {
      'getting-started': 'Getting Started',
      'agent-x': 'Agent X & AI',
      teams: 'Teams & Programs',
      account: 'Account & Settings',
      troubleshooting: 'Troubleshooting',
    };
    return labels[categoryId] ?? 'Help Center';
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
