/**
 * @fileoverview Help Center Article Page - Web
 * @version 3.0.0
 * @description Web-optimized article detail using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HelpArticleDetailWebComponent } from '@nxt1/ui/help-center';
import { HelpCenterService } from '@nxt1/ui/help-center';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-help-center-article',
  standalone: true,
  imports: [HelpArticleDetailWebComponent],
  template: `
    <nxt1-help-article-detail-web
      [slug]="articleSlug"
      (back)="onBack()"
      (relatedClick)="onArticleSelect($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterArticleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly helpService = inject(HelpCenterService);
  private readonly seo = inject(SeoService);

  protected articleSlug = '';

  ngOnInit(): void {
    this.articleSlug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.articleSlug) {
      this.router.navigate(['/help-center']);
      return;
    }

    const articleTitle = this.articleSlug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    this.seo.updatePage({
      title: `${articleTitle} Help Article`,
      description: `Read NXT1 Help Center guidance for ${articleTitle.toLowerCase()}.`,
      canonicalUrl: `https://nxt1sports.com/help-center/article/${this.articleSlug}`,
      keywords: ['help article', 'nxt1 support', this.articleSlug.replace(/-/g, ' ')],
    });

    this.helpService.loadArticle(this.articleSlug);
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
