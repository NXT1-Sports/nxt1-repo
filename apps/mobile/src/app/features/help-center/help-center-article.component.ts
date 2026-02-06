/**
 * @fileoverview Help Center Article Page - Mobile
 * @version 2.0.0
 * @description Thin wrapper around shared HelpArticleDetailComponent.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
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
  private readonly nav = inject(NavController);

  protected articleSlug = '';

  ngOnInit(): void {
    this.articleSlug = this.route.snapshot.paramMap.get('slug') ?? '';
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.nav.navigateForward(`/help-center/article/${event.slug}`);
  }

  protected onBack(): void {
    this.nav.navigateBack('/help-center');
  }
}
