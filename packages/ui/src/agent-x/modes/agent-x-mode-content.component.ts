/**
 * @fileoverview Agent X Mode Content Orchestrator
 * @module @nxt1/ui/agent-x/modes
 * @version 1.0.0
 *
 * Single component that renders the correct content for the
 * currently selected Agent X mode:
 *   - Highlights → Drafts + Template Grid + Bundles
 *   - Graphics  → Drafts + Template Grid + Bundles
 *   - Recruiting → Task List + Bundles
 *   - Evaluation → Task List + Bundles
 *
 * Replaces the old "welcome" screen when there are no messages.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  AgentXMode,
  AgentXDraft,
  AgentXTemplateCategory,
  AgentXTemplate,
  AgentXBundle,
  AgentXTaskItem,
} from '@nxt1/core';
import {
  HIGHLIGHT_CATEGORIES,
  GRAPHIC_CATEGORIES,
  HIGHLIGHT_TEMPLATES,
  GRAPHIC_TEMPLATES,
  AGENT_X_BUNDLES,
  RECRUITING_TASKS,
  EVALUATION_TASKS,
} from '@nxt1/core';
import { AgentXDraftsComponent } from './agent-x-drafts.component';
import { AgentXTemplateGridComponent } from './agent-x-template-grid.component';
import { AgentXBundlesComponent } from './agent-x-bundles.component';
import { AgentXTaskListComponent } from './agent-x-task-list.component';

@Component({
  selector: 'nxt1-agent-x-mode-content',
  standalone: true,
  imports: [
    CommonModule,
    AgentXDraftsComponent,
    AgentXTemplateGridComponent,
    AgentXBundlesComponent,
    AgentXTaskListComponent,
  ],
  template: `
    <div class="mode-content">
      @switch (mode()) {
        <!-- ==================== HIGHLIGHTS ==================== -->
        @case ('highlights') {
          @if (highlightDrafts().length > 0) {
            <nxt1-agent-x-drafts
              [drafts]="highlightDrafts()"
              (draftSelected)="draftSelected.emit($event)"
              (viewAll)="viewAllDrafts.emit('highlights')"
              (createNew)="createNewDraft.emit('highlights')"
            />
          }

          @if (highlightBundles().length > 0) {
            <nxt1-agent-x-bundles
              [bundles]="highlightBundles()"
              (bundleSelected)="bundleSelected.emit($event)"
            />
          }

          <nxt1-agent-x-template-grid
            sectionTitle="Highlight Templates"
            [categories]="highlightCategories"
            [templates]="highlightTemplates"
            (templateSelected)="templateSelected.emit($event)"
            (categorySelected)="categorySelected.emit($event)"
          />
        }

        <!-- ==================== GRAPHICS ==================== -->
        @case ('graphics') {
          @if (graphicDrafts().length > 0) {
            <nxt1-agent-x-drafts
              [drafts]="graphicDrafts()"
              (draftSelected)="draftSelected.emit($event)"
              (viewAll)="viewAllDrafts.emit('graphics')"
              (createNew)="createNewDraft.emit('graphics')"
            />
          }

          @if (graphicBundles().length > 0) {
            <nxt1-agent-x-bundles
              [bundles]="graphicBundles()"
              (bundleSelected)="bundleSelected.emit($event)"
            />
          }

          <nxt1-agent-x-template-grid
            sectionTitle="Graphic Templates"
            [categories]="graphicCategories"
            [templates]="graphicTemplates"
            (templateSelected)="templateSelected.emit($event)"
            (categorySelected)="categorySelected.emit($event)"
          />
        }

        <!-- ==================== RECRUITING ==================== -->
        @case ('recruiting') {
          <nxt1-agent-x-task-list
            sectionTitle="Recruiting Actions"
            sectionIcon="school-outline"
            [tasks]="recruitingTasks"
            (taskSelected)="taskSelected.emit($event)"
          />

          @if (recruitingBundles().length > 0) {
            <nxt1-agent-x-bundles
              [bundles]="recruitingBundles()"
              (bundleSelected)="bundleSelected.emit($event)"
            />
          }
        }

        <!-- ==================== EVALUATION ==================== -->
        @case ('evaluation') {
          <nxt1-agent-x-task-list
            sectionTitle="Evaluation Tools"
            sectionIcon="analytics-outline"
            [tasks]="evaluationTasks"
            (taskSelected)="taskSelected.emit($event)"
          />

          @if (evaluationBundles().length > 0) {
            <nxt1-agent-x-bundles
              [bundles]="evaluationBundles()"
              (bundleSelected)="bundleSelected.emit($event)"
            />
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .mode-content {
        padding-top: var(--nxt1-spacing-4);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXModeContentComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Current active mode. */
  readonly mode = input.required<AgentXMode>();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Draft card clicked. */
  readonly draftSelected = output<AgentXDraft>();
  /** "See all" drafts clicked. */
  readonly viewAllDrafts = output<AgentXMode>();
  /** "New" draft clicked. */
  readonly createNewDraft = output<AgentXMode>();
  /** Template category filter clicked. */
  readonly categorySelected = output<AgentXTemplateCategory>();
  /** Template card clicked (the actual Canva-style template). */
  readonly templateSelected = output<AgentXTemplate>();
  /** Bundle card clicked. */
  readonly bundleSelected = output<AgentXBundle>();
  /** Task row clicked. */
  readonly taskSelected = output<AgentXTaskItem>();

  // ============================================
  // STATIC DATA (from @nxt1/core constants)
  // ============================================

  protected readonly highlightCategories = HIGHLIGHT_CATEGORIES;
  protected readonly graphicCategories = GRAPHIC_CATEGORIES;
  protected readonly highlightTemplates = HIGHLIGHT_TEMPLATES;
  protected readonly graphicTemplates = GRAPHIC_TEMPLATES;
  protected readonly recruitingTasks = RECRUITING_TASKS;
  protected readonly evaluationTasks = EVALUATION_TASKS;

  // ============================================
  // INPUTS: Drafts (provided by parent from backend data)
  // ============================================

  protected readonly highlightDrafts = input<readonly AgentXDraft[]>([]);

  protected readonly graphicDrafts = input<readonly AgentXDraft[]>([]);

  // ============================================
  // COMPUTED: Bundles filtered by mode
  // ============================================

  protected readonly highlightBundles = computed(() =>
    AGENT_X_BUNDLES.filter((b) => b.modes.includes('highlights'))
  );

  protected readonly graphicBundles = computed(() =>
    AGENT_X_BUNDLES.filter((b) => b.modes.includes('graphics'))
  );

  protected readonly recruitingBundles = computed(() =>
    AGENT_X_BUNDLES.filter((b) => b.modes.includes('recruiting') || b.modes.includes('highlights'))
  );

  protected readonly evaluationBundles = computed(() =>
    AGENT_X_BUNDLES.filter((b) => b.modes.includes('evaluation') || b.modes.includes('highlights'))
  );
}
