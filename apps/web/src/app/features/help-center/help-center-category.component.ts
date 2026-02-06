/**
 * @fileoverview Help Center Category Page - Web
 * @version 3.0.0
 * @description Web-optimized category detail using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import type { HelpCategoryId } from '@nxt1/core';
import { HelpCategoryDetailWebComponent } from '@nxt1/ui';

@Component({
  selector: 'app-help-center-category',
  standalone: true,
  imports: [HelpCategoryDetailWebComponent],
  template: `
    <nxt1-help-category-detail-web
      [categoryId]="categoryId"
      (back)="onBack()"
      (articleClick)="onArticleSelect($event)"
      (faqClick)="onFaqClick($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterCategoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected categoryId: HelpCategoryId = 'getting-started';

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('categoryId') as HelpCategoryId | null;
    if (!id) {
      this.router.navigate(['/help-center']);
      return;
    }
    this.categoryId = id;
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.router.navigate(['/help-center', 'article', event.slug]);
  }

  protected onFaqClick(faqId: string): void {
    this.router.navigate(['/help-center'], { queryParams: { faq: faqId } });
  }

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
