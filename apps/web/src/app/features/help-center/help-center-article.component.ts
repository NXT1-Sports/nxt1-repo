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

  protected articleSlug = '';

  ngOnInit(): void {
    this.articleSlug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.articleSlug) {
      this.router.navigate(['/help-center']);
      return;
    }
    this.helpService.loadArticle(this.articleSlug);
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
