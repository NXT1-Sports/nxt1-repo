/**
 * @fileoverview Help Center Article Page - Web
 * @version 2.0.0
 * @description Thin wrapper around shared HelpArticleDetailComponent.
 *
 * ⭐ SAME UI AS MOBILE - 100% SHARED ⭐
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HelpArticleDetailComponent } from '@nxt1/ui';

@Component({
  selector: 'app-help-center-article',
  standalone: true,
  imports: [HelpArticleDetailComponent],
  template: `
    <nxt1-help-article-detail
      [articleId]="articleSlug"
      (back)="onBack()"
      (articleSelect)="onArticleSelect($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterArticleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected articleSlug = '';

  ngOnInit(): void {
    this.articleSlug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.articleSlug) {
      this.router.navigate(['/help-center']);
    }
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
