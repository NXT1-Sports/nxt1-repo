/**
 * @fileoverview Help Center Category Page - Mobile
 * @version 2.0.0
 * @description Thin wrapper around shared HelpCategoryDetailComponent.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import type { HelpCategoryId } from '@nxt1/core';
import { HelpCategoryDetailComponent, HelpCenterService } from '@nxt1/ui';

@Component({
  selector: 'app-help-center-category',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, HelpCategoryDetailComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-help-category-detail
        [categoryId]="categoryId"
        (back)="onBack()"
        (articleSelect)="onArticleSelect($event)"
      />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterCategoryComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly nav = inject(NavController);
  private readonly helpService = inject(HelpCenterService);

  protected categoryId: HelpCategoryId =
    (this.route.snapshot.paramMap.get('categoryId') as HelpCategoryId) ?? 'getting-started';

  constructor() {
    this.helpService.loadCategory(this.categoryId);
  }

  ionViewWillEnter(): void {
    this.helpService.loadCategory(this.categoryId);
  }

  protected onArticleSelect(event: { id: string; slug: string }): void {
    this.nav.navigateForward(`/help-center/article/${event.slug}`);
  }

  protected onBack(): void {
    this.nav.back();
  }
}
