/**
 * @fileoverview News Category Filter Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Category filter chips for quick filtering.
 * Uses NxtOptionScrollerComponent for horizontal scrolling.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-news-category-filter
 *   [categories]="categories()"
 *   [selectedId]="activeCategory()"
 *   (selectionChange)="onCategoryChange($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { type NewsCategory, type NewsCategoryId, NEWS_CATEGORIES } from '@nxt1/core';

@Component({
  selector: 'nxt1-news-category-filter',
  standalone: true,
  imports: [CommonModule, NxtOptionScrollerComponent],
  template: `
    <nxt1-option-scroller
      [options]="categoryOptions()"
      [selectedId]="selectedId()"
      [config]="{
        scrollable: true,
        stretchToFill: false,
        showDivider: true,
        variant: 'default',
      }"
      (selectionChange)="onSelectionChange($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsCategoryFilterComponent {
  /** Categories to display (defaults to NEWS_CATEGORIES) */
  readonly categories = input<NewsCategory[]>(NEWS_CATEGORIES as unknown as NewsCategory[]);

  /** Currently selected category ID */
  readonly selectedId = input<NewsCategoryId>(NEWS_CATEGORIES[0].id);

  /** Badge counts per category */
  readonly badges = input<Record<NewsCategoryId, number>>({} as Record<NewsCategoryId, number>);

  /** Emitted when selection changes */
  readonly selectionChange = output<NewsCategoryId>();

  /**
   * Transform categories to OptionScrollerItem format.
   */
  protected readonly categoryOptions = computed<OptionScrollerItem[]>(() => {
    const cats = this.categories();
    const badgeCounts = this.badges();

    return cats.map((cat) => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      badge: badgeCounts[cat.id] || cat.badge || 0,
      disabled: cat.disabled,
    }));
  });

  /**
   * Handle selection change from option scroller.
   */
  protected onSelectionChange(event: OptionScrollerChangeEvent): void {
    this.selectionChange.emit(event.option.id as NewsCategoryId);
  }
}
