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
import type { HelpArticle } from '@nxt1/core';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-help-center-article',
  standalone: true,
  imports: [HelpArticleDetailWebComponent],
  template: `
    <nxt1-help-article-detail-web
      [slug]="articleSlug()"
      [articleData]="currentArticle()"
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
  private readonly routeData = toSignal(this.route.data);
  protected readonly articleSlug = computed(() => this.routeParams()?.get('slug') ?? '');
  protected readonly currentArticle = computed(() => {
    const resolvedArticle = this.getResolvedArticle();
    return resolvedArticle !== undefined ? resolvedArticle : this.helpService.selectedArticle();
  });

  constructor() {
    effect(() => {
      const slug = this.articleSlug();
      const article = this.getResolvedArticle();

      if (!slug || !article || article.slug !== slug) {
        return;
      }

      this.helpService.hydrateArticle(article);
      this.applyArticleSeo(article);
    });

    // Fires whenever the slug changes. The resolver handles direct-entry SSR,
    // but client-side navigations can still fall back to an on-demand fetch.
    effect(() => {
      const slug = this.articleSlug();
      if (!slug) {
        this.router.navigate(['/help-center']);
        return;
      }

      const resolvedArticle = this.getResolvedArticle();
      if (resolvedArticle && resolvedArticle.slug === slug) {
        return;
      }

      if (resolvedArticle === null) {
        this.helpService.clearSelectedArticle();
        this.applyMissingArticleSeo(slug);
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
      this.applyArticleSeo(article);
    });
  }

  private getResolvedArticle(): HelpArticle | null | undefined {
    const snapshotValue = this.route.snapshot.data['articleData'] as HelpArticle | null | undefined;
    return snapshotValue !== undefined
      ? snapshotValue
      : (this.routeData()?.['articleData'] as HelpArticle | null | undefined);
  }

  private applyArticleSeo(article: HelpArticle): void {
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
                url: 'https://nxt1sports.com/assets/shared/images/og-image.jpg',
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
  }

  private applyMissingArticleSeo(slug: string): void {
    this.seo.updatePage({
      title: 'Help Article Not Found | NXT1 Sports',
      description: 'The requested NXT1 help article could not be found.',
      canonicalUrl: `https://nxt1sports.com/help-center/article/${slug}`,
      keywords: ['nxt1 help', 'nxt1 sports support'],
      noIndex: true,
    });
  }

  private getCategoryLabel(categoryId: string): string {
    const labels: Record<string, string> = {
      'getting-started': 'Getting Started',
      athletes: 'Athlete Profiles',
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
