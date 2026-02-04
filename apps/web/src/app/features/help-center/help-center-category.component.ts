/**
 * @fileoverview Help Center Category Page - Web
 * @version 2.0.0
 * @description Thin wrapper around shared HelpCategoryDetailComponent.
 *
 * ⭐ SAME UI AS MOBILE - 100% SHARED ⭐
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import type { HelpCategoryId } from '@nxt1/core';
import { HelpCategoryDetailComponent } from '@nxt1/ui';

@Component({
  selector: 'app-help-center-category',
  standalone: true,
  imports: [HelpCategoryDetailComponent],
  template: `
    <nxt1-help-category-detail
      [categoryId]="categoryId"
      (back)="onBack()"
      (articleSelect)="onArticleSelect($event)"
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

  protected onBack(): void {
    this.router.navigate(['/help-center']);
  }
}
