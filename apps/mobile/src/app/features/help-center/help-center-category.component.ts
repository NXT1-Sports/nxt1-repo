/**
 * @fileoverview Help Center Category Page - Mobile
 * @version 2.0.0
 * @description Thin wrapper around shared HelpCategoryDetailComponent.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
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
  private readonly nav = inject(NavController);

  protected categoryId: HelpCategoryId = 'getting-started';

  ngOnInit(): void {
    this.categoryId =
      (this.route.snapshot.paramMap.get('categoryId') as HelpCategoryId) ?? 'getting-started';
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.nav.navigateForward(`/tabs/help-center/article/${event.slug}`);
  }

  protected onBack(): void {
    this.nav.navigateBack('/tabs/help-center');
  }
}
