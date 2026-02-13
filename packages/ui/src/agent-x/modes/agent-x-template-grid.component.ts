/**
 * @fileoverview Agent X Template Grid — Canva-Style Template Browser
 * @module @nxt1/ui/agent-x/modes
 * @version 2.0.0
 *
 * Browsable template grid with category filter chips at top
 * and visual template thumbnail cards below (Canva-style).
 * Categories act as filters, templates are the actual content.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXTemplateCategory, AgentXTemplate } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtChipComponent } from '../../components/chip';

@Component({
  selector: 'nxt1-agent-x-template-grid',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtChipComponent],
  template: `
    <section class="template-browser" aria-label="Templates">
      <!-- Section Header -->
      <div class="section-header">
        <div class="section-label">
          <nxt1-icon name="grid-outline" [size]="18" class="section-icon" />
          <h3 class="section-title">{{ sectionTitle() }}</h3>
        </div>
        <span class="template-count">{{ filteredTemplates().length }} templates</span>
      </div>

      <!-- Category Filter Chips -->
      <div class="category-chips" role="radiogroup" aria-label="Filter by category">
        <nxt1-chip
          ariaRole="radio"
          size="sm"
          [selected]="!activeCategory()"
          (chipClick)="selectCategory(null)"
        >
          All
        </nxt1-chip>
        @for (cat of categories(); track cat.id) {
          <nxt1-chip
            ariaRole="radio"
            size="sm"
            [selected]="activeCategory() === cat.id"
            (chipClick)="selectCategory(cat.id)"
          >
            {{ cat.label }}
          </nxt1-chip>
        }
      </div>

      <div class="template-stage">
        <!-- Template Grid (Canva-style thumbnails) -->
        <div class="template-grid" role="list">
          @for (tpl of filteredTemplates(); track tpl.id) {
            <button class="template-card" role="listitem" (click)="templateSelected.emit(tpl)">
              <!-- Thumbnail Placeholder -->
              <div class="card-thumbnail" [style.background]="tpl.placeholderGradient">
                <nxt1-icon [name]="tpl.placeholderIcon" [size]="32" class="thumb-icon" />

                <!-- Badges -->
                <div class="card-badges">
                  @if (tpl.popular) {
                    <span class="badge badge--popular">
                      <nxt1-icon name="trending-up" [size]="10" />
                      Popular
                    </span>
                  }
                  @if (tpl.pro) {
                    <span class="badge badge--pro">PRO</span>
                  }
                </div>
              </div>

              <!-- Card Info -->
              <div class="card-info">
                <span class="card-title">{{ tpl.title }}</span>
                <div class="card-meta">
                  <span class="card-uses">{{ formatCount(tpl.usageCount) }} uses</span>
                  <span class="card-xp">+{{ tpl.xpReward }} XP</span>
                </div>
              </div>
            </button>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .template-browser {
        margin-bottom: var(--nxt1-spacing-6);
      }

      /* ==============================
         Section Header
         ============================== */

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .section-icon {
        color: var(--nxt1-color-text-secondary);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .template-count {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ==============================
         Category Filter Chips
         ============================== */

      .category-chips {
        display: flex;
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-4);
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .category-chips::-webkit-scrollbar {
        display: none;
      }

      .template-stage {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-xl, 16px);
        padding: var(--nxt1-spacing-4);
      }

      /* ==============================
         Template Grid (Masonry-inspired)
         ============================== */

      .template-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      @media (min-width: 600px) {
        .template-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (min-width: 900px) {
        .template-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      /* ==============================
         Template Card
         ============================== */

      .template-card {
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-2);
        cursor: pointer;
        text-align: left;
        border-radius: var(--nxt1-radius-lg, 12px);
        transition:
          transform var(--nxt1-duration-fast) var(--nxt1-easing-out),
          box-shadow var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .template-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      }

      .template-card:active {
        transform: translateY(0) scale(0.97);
      }

      /* ==============================
         Thumbnail
         ============================== */

      .card-thumbnail {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        aspect-ratio: 4 / 5;
      }

      .thumb-icon {
        color: rgba(255, 255, 255, 0.3);
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
      }

      /* Badges container */
      .card-badges {
        position: absolute;
        top: var(--nxt1-spacing-2);
        left: var(--nxt1-spacing-2);
        display: flex;
        gap: var(--nxt1-spacing-1);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        font-size: 0.6rem;
        font-weight: var(--nxt1-fontWeight-bold);
        border-radius: var(--nxt1-radius-sm, 4px);
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .badge--popular {
        background: rgba(204, 255, 0, 0.9);
        color: #0a0a0a;
      }

      .badge--pro {
        background: rgba(255, 215, 0, 0.9);
        color: #0a0a0a;
      }

      /* ==============================
         Card Info
         ============================== */

      .card-info {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-1);
      }

      .card-title {
        display: block;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .card-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: var(--nxt1-spacing-1);
      }

      .card-uses {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        color: var(--nxt1-color-text-tertiary);
      }

      .card-xp {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      /* ==============================
         Reduced Motion
         ============================== */

      @media (prefers-reduced-motion: reduce) {
        .template-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXTemplateGridComponent {
  /** Section heading. */
  readonly sectionTitle = input<string>('Templates');

  /** Template categories used as filter chips. */
  readonly categories = input.required<readonly AgentXTemplateCategory[]>();

  /** All templates to display (filtered by active category). */
  readonly templates = input.required<readonly AgentXTemplate[]>();

  /** Emitted when a template card is clicked. */
  readonly templateSelected = output<AgentXTemplate>();

  /** Emitted when a category chip is clicked (for analytics). */
  readonly categorySelected = output<AgentXTemplateCategory>();

  /** Currently selected category filter (null = All). */
  protected readonly activeCategory = signal<string | null>(null);

  /** Templates filtered by the active category. */
  protected readonly filteredTemplates = computed(() => {
    const catId = this.activeCategory();
    const all = this.templates();
    if (!catId) return all;
    return all.filter((t) => t.categoryId === catId);
  });

  /** Select a category filter (null = show all). */
  protected selectCategory(categoryId: string | null): void {
    this.activeCategory.set(categoryId);
    if (!categoryId) {
      return;
    }
    const category = this.categories().find((item) => item.id === categoryId);
    if (category) {
      this.categorySelected.emit(category);
    }
  }

  /** Format large numbers (e.g. 4820 → "4.8K"). */
  protected formatCount(count: number): string {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    }
    return count.toString();
  }
}
