import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { getSportPlaybookConfig } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import {
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
  type AgentXSelectedContextMetadataValue,
} from '@nxt1/core/ai';
import type { TeamGamePlanDoc } from '@nxt1/core';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtStateViewComponent } from '../../../components/state-view';
import { NxtMediaViewerService } from '../../../components/media-viewer';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXService } from '../../services/agent-x.service';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { PlaybooksService } from '../../../playbook/services/playbooks.service';
import {
  EMPTY_EDIT_PLAYBOOK,
  EMPTY_NEW_PLAYBOOK,
  EMPTY_PLAY_FORM,
  parseTags,
  toTitleCase,
  type CallsheetAiResponse,
  type CallsheetDetail,
  type CallsheetDetailResponse,
  type CallsheetGroup,
  type CallsheetsResponse,
  type CallsheetSummary,
  type EditPlaybookForm,
  type GamePlan,
  type GamePlanDetailResponse,
  type GameplansResponse,
  type MutationResponse,
  type NewPlaybookForm,
  type PlaybookDetail,
  type PlaybookDetailResponse,
  type PlaybookPlay,
  type PlaybookSummary,
  type PlaybookPdfExportResponse,
  type PlayForm,
  type PracticeScriptAiResponse,
  type PracticeScriptDetail,
  type PracticeScriptDetailResponse,
  type PracticeScriptsResponse,
  type PracticeScriptSummary,
  type UploadAttachmentResponse,
} from './agent-x-playbooks-panel.types';
import {
  computePracticeScriptTotals,
  INSTALL_STAGES,
  buildCallsheetSituationText,
  buildFilteredCallsheetPlays,
  formatDateValue,
  getStageDisplayNameValue,
  hasActiveCallsheetFilters,
  isImageAssetUrl,
  mapGamePlanToUi,
  normalizePracticeScriptPeriods,
  resolveImageExtension,
} from './agent-x-playbooks-panel.utils';

@Component({
  selector: 'nxt1-agent-x-playbooks-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtIconComponent,
    NxtStateViewComponent,
    AgentXContextDragDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="playbooks-panel">
    <!-- ──────────────── DETAIL VIEW ──────────────── -->
    @if (showingDetail() && selectedPlaybook()) {
      <div class="playbook-detail">
        <div class="detail-header detail-header--actions-only">
          <button
            type="button"
            class="detail-action-btn detail-action-btn--secondary"
            [attr.data-testid]="testIds.PLAYBOOK_EXPORT_FULL_BUTTON"
            [disabled]="exportingPdf()"
            (click)="exportPlaybookPdf('full')"
          >
            Full Packet
          </button>
          <button
            type="button"
            class="detail-action-btn detail-action-btn--ghost detail-action-btn--icon"
            [attr.data-testid]="testIds.PLAYBOOK_PRINT_PREVIEW_BUTTON"
            title="Print Preview"
            aria-label="Print Preview"
            [disabled]="exportingPdf()"
            (click)="openPrintPreview()"
          >
            <nxt1-icon name="printPreview" [size]="14"></nxt1-icon>
          </button>
          @if (!editingMeta()) {
            <button
              type="button"
              class="detail-action-btn detail-action-btn--ghost detail-action-btn--icon"
              title="Edit playbook"
              aria-label="Edit playbook"
              [disabled]="exportingPdf()"
              (click)="startEditMeta()"
            >
              <nxt1-icon name="pencil" [size]="14"></nxt1-icon>
            </button>
          }
        </div>

        @if (editingMeta()) {
          <div class="detail-form">
            <h4 class="form-heading">Edit</h4>
            <input
              class="form-input"
              placeholder="Name *"
              [value]="editPlaybookForm().name"
              (input)="patchEditPlaybook('name', $event)"
            />
            <input
              class="form-input"
              placeholder="Season"
              [value]="editPlaybookForm().season"
              (input)="patchEditPlaybook('season', $event)"
            />
            <input
              class="form-input"
              placeholder="Source"
              [value]="editPlaybookForm().source"
              (input)="patchEditPlaybook('source', $event)"
            />
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelEditMeta()">Cancel</button>
              <button
                type="button"
                class="btn-save"
                [disabled]="saving()"
                (click)="saveEditPlaybook(selectedPlaybook()!.id)"
              >
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        } @else {
          <h2 class="detail-title">
            {{ selectedPlaybook()!.title || selectedPlaybook()!.name }}
          </h2>
          <div class="detail-meta-grid">
            <div class="meta-item">
              <span class="meta-label">Sport</span>
              <span class="meta-value">{{ selectedPlaybook()!.sport | titlecase }}</span>
            </div>
            @if (selectedPlaybook()!.season) {
              <div class="meta-item">
                <span class="meta-label">Season</span>
                <span class="meta-value">{{ selectedPlaybook()!.season }}</span>
              </div>
            }
            <div class="meta-item">
              <span class="meta-label">Plays</span>
              <span class="meta-value">{{ totalPlays() }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Updated</span>
              <span class="meta-value">{{
                formatDate(selectedPlaybook()!.updatedAt || selectedPlaybook()!.createdAt)
              }}</span>
            </div>
          </div>
          @if (exportError()) {
            <p
              class="section-meta section-meta--error"
              [attr.data-testid]="testIds.PLAYBOOK_EXPORT_ERROR"
            >
              {{ exportError() }}
            </p>
          }
        }

        <!-- ──────────────── PLAYBOOK TABS: Plays | Install | Callsheets | Practice ──────────────── -->
        <section class="detail-section detail-section--tabs">
          <div class="tabs-header">
            <button
              type="button"
              class="tab-btn"
              [class.tab-btn--active]="activePlaybookTab() === 'plays'"
              (click)="activePlaybookTab.set('plays')"
            >
              <span>Plays</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.tab-btn--active]="activePlaybookTab() === 'install'"
              (click)="activePlaybookTab.set('install')"
            >
              <span>Install Plans</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.tab-btn--active]="activePlaybookTab() === 'callsheet'"
              (click)="activePlaybookTab.set('callsheet')"
            >
              <span>Callsheets</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.tab-btn--active]="activePlaybookTab() === 'play-script'"
              (click)="activePlaybookTab.set('play-script')"
            >
              <span>Practice Scripts</span>
            </button>
          </div>

          <!-- ──── TAB 1: PLAYS ──── -->
          @if (activePlaybookTab() === 'plays') {
            <div class="tab-content">
              <!-- Filter Controls for Plays -->
              <div class="tab-plays-section">
                <div class="section-header">
                  <h3 class="section-title">Plays</h3>
                  <div class="section-header-actions">
                    <button
                      type="button"
                      class="detail-action-btn"
                      [attr.data-testid]="testIds.PLAYBOOK_EXPORT_CURRENT_BUTTON"
                      [disabled]="exportingPdf()"
                      (click)="exportPlaybookPdf('current')"
                    >
                      {{ exportingPdf() ? 'Exporting…' : 'Export PDF' }}
                    </button>
                    <button type="button" class="btn-add-play" (click)="startAddPlay()">
                      Add Play
                    </button>
                  </div>
                </div>
                <!-- Filter Controls: sport-aware labels + data-driven values -->
                <div class="plays-filters">
                  <label>
                    {{ playFilterLabels().personnel }}:
                    <select
                      class="form-input"
                      [value]="playFilters().personnel || ''"
                      (change)="onPlayFilterChange('personnel', $event)"
                    >
                      <option value="">All</option>
                      @for (tag of selectedPlaybook()!.personnelIndex || []; track tag) {
                        <option [value]="tag">{{ tag }}</option>
                      }
                    </select>
                  </label>

                  <label>
                    {{ playFilterLabels().category }}:
                    <select
                      class="form-input"
                      [value]="playFilters().side || ''"
                      (change)="onPlayFilterChange('side', $event)"
                    >
                      <option value="">All</option>
                      @for (tag of selectedPlaybook()!.categoryIndex || []; track tag) {
                        <option [value]="tag">{{ tag }}</option>
                      }
                    </select>
                  </label>

                  <label>
                    {{ playFilterLabels().concept }}:
                    <select
                      class="form-input"
                      [value]="playFilters().concept || ''"
                      (change)="onPlayFilterChange('concept', $event)"
                    >
                      <option value="">All</option>
                      @for (tag of selectedPlaybook()!.conceptTagIndex || []; track tag) {
                        <option [value]="tag">{{ tag }}</option>
                      }
                    </select>
                  </label>

                  @if (hasActivePlayFilters()) {
                    <button
                      type="button"
                      class="btn-cancel btn-clear-filters"
                      (click)="clearPlayFilters()"
                    >
                      Clear Filters
                    </button>
                  }
                </div>

                @if (filteredPlays().length) {
                  <div class="plays-list">
                    @for (play of filteredPlays(); track play.id || play.name || $index) {
                      <article
                        class="play-item"
                        [nxtAgentXContextDrag]="buildPlaybookPlayDragContext(play, $index)"
                      >
                        @if (deletingPlayIndex() === $index) {
                          <div class="delete-overlay">
                            <p class="delete-msg">
                              Remove <strong>{{ play.title || play.name }}</strong>
                            </p>
                            <div class="form-actions">
                              <button type="button" class="btn-cancel" (click)="cancelDeletePlay()">
                                Keep
                              </button>
                              <button
                                type="button"
                                class="btn-delete-confirm"
                                [disabled]="savingPlay()"
                                (click)="deletePlay($index)"
                              >
                                {{ savingPlay() ? 'Removing…' : 'Remove' }}
                              </button>
                            </div>
                          </div>
                        } @else if (editingPlayIndex() === $index) {
                          <div class="play-edit-form">
                            <div class="form-field">
                              <label class="form-label">Play Name *</label>
                              <input
                                class="form-input"
                                placeholder="Enter play name"
                                [value]="editPlayForm().name"
                                (input)="patchEditPlayForm('name', $event)"
                              />
                            </div>
                            <div class="form-row">
                              <div class="form-field">
                                <label class="form-label">Series</label>
                                <input
                                  class="form-input"
                                  placeholder="Series"
                                  [value]="editPlayForm().series"
                                  (input)="patchEditPlayForm('series', $event)"
                                />
                              </div>
                              <div class="form-field">
                                <label class="form-label">Category</label>
                                <input
                                  class="form-input"
                                  placeholder="Category"
                                  [value]="editPlayForm().category"
                                  (input)="patchEditPlayForm('category', $event)"
                                />
                              </div>
                            </div>
                            <div class="form-row">
                              <div class="form-field">
                                <label class="form-label">{{ sportConfig().formationLabel }}</label>
                                <input
                                  class="form-input"
                                  [placeholder]="sportConfig().formationLabel"
                                  [value]="editPlayForm().formation"
                                  (input)="patchEditPlayForm('formation', $event)"
                                />
                              </div>
                              <div class="form-field">
                                <label class="form-label">{{ sportConfig().personnelLabel }}</label>
                                <input
                                  class="form-input"
                                  [placeholder]="sportConfig().personnelLabel"
                                  [value]="editPlayForm().personnel"
                                  (input)="patchEditPlayForm('personnel', $event)"
                                />
                              </div>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Objective</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="Objective"
                                [value]="editPlayForm().objective"
                                (input)="patchEditPlayForm('objective', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Play Breakdown</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="Detailed breakdown of assignments, reads, route concepts, and why the play works"
                                [value]="editPlayForm().playBreakdown"
                                (input)="patchEditPlayForm('playBreakdown', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Install Notes</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="Use clean lines or bullets"
                                [value]="editPlayForm().installNotes"
                                (input)="patchEditPlayForm('installNotes', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Concept Tags</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="Comma-separated"
                                [value]="editPlayForm().conceptTags"
                                (input)="patchEditPlayForm('conceptTags', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Install Stage</label>
                              <select
                                class="form-input"
                                [value]="editPlayForm().installStage"
                                (change)="patchEditPlayForm('installStage', $event)"
                              >
                                <option value="">Select stage (optional)</option>
                                <option value="install">Install</option>
                                <option value="rep">Rep</option>
                                <option value="game-ready">Game-Ready</option>
                              </select>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Upload Diagram</label>
                              <input
                                #editDiagramInput
                                type="file"
                                class="hidden-file-input"
                                accept="image/*"
                                (change)="onEditDiagramFileSelected($event)"
                              />
                              <div class="diagram-upload-row">
                                <button
                                  type="button"
                                  class="btn-upload-diagram"
                                  (click)="editDiagramInput.click()"
                                >
                                  Choose Image
                                </button>
                                @if (editPlayDiagramFileName()) {
                                  <span class="diagram-upload-status">
                                    Selected: {{ editPlayDiagramFileName() }}
                                  </span>
                                }
                              </div>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Coaching Points</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="One point per line"
                                [value]="editPlayForm().coachingPoints"
                                (input)="patchEditPlayForm('coachingPoints', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Common Busts</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="One bust per line"
                                [value]="editPlayForm().commonBusts"
                                (input)="patchEditPlayForm('commonBusts', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Correction Cues</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="One cue per line"
                                [value]="editPlayForm().correctionCues"
                                (input)="patchEditPlayForm('correctionCues', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Drill Progression</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="One drill step per line"
                                [value]="editPlayForm().drillProgression"
                                (input)="patchEditPlayForm('drillProgression', $event)"
                              ></textarea>
                            </div>
                            <div class="form-field">
                              <label class="form-label">Situations</label>
                              <textarea
                                class="form-input form-textarea"
                                placeholder="Comma-separated: 1st & 10, red zone, 2-minute"
                                [value]="editPlayForm().situations"
                                (input)="patchEditPlayForm('situations', $event)"
                              ></textarea>
                            </div>
                            <div class="form-actions">
                              <button type="button" class="btn-cancel" (click)="cancelEditPlay()">
                                Cancel
                              </button>
                              <button
                                type="button"
                                class="btn-save"
                                [disabled]="savingPlay()"
                                (click)="saveEditPlay($index)"
                              >
                                {{ savingPlay() ? 'Saving…' : 'Save' }}
                              </button>
                            </div>
                          </div>
                        } @else {
                          <div class="play-actions">
                            <button
                              type="button"
                              class="icon-btn icon-btn--sm"
                              title="Edit play"
                              (click)="startEditPlay($index, play)"
                            >
                              <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                            </button>
                            <button
                              type="button"
                              class="icon-btn icon-btn--sm icon-btn--danger"
                              title="Remove play"
                              (click)="confirmDeletePlay($index)"
                            >
                              <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                            </button>
                          </div>
                          <div class="play-head">
                            <h4>{{ play.title || play.name || 'Untitled Play' }}</h4>
                            @if (play.series) {
                              <span class="chip chip--soft">{{ play.series | titlecase }}</span>
                            }
                          </div>
                          <div class="play-meta">
                            @if (play.category) {
                              <span>{{ play.category | titlecase }}</span>
                            }
                            @if (play.formation) {
                              <span>{{ play.formation | titlecase }}</span>
                            }
                            @if (play.personnel) {
                              <span>{{ play.personnel | titlecase }}</span>
                            }
                          </div>
                          @if (play.diagramUrl) {
                            <button
                              class="diagram-preview-card"
                              type="button"
                              (click)="openDiagramModal(play)"
                              [attr.aria-label]="
                                'Open play details for ' + (play.title || play.name || 'play')
                              "
                            >
                              @if (isImageUrl(play.diagramUrl)) {
                                <img
                                  class="diagram-preview-image"
                                  [src]="play.diagramUrl"
                                  [alt]="(play.title || play.name || 'Play') + ' diagram'"
                                  loading="lazy"
                                />
                              } @else {
                                <div class="diagram-preview-fallback">
                                  <nxt1-icon name="image" [size]="18"></nxt1-icon>
                                  <span>Open Diagram</span>
                                </div>
                              }
                            </button>
                          } @else {
                            <div class="diagram-preview-fallback diagram-preview-fallback--empty">
                              <nxt1-icon name="image" [size]="16"></nxt1-icon>
                              <span>No diagram yet</span>
                            </div>
                          }
                        }
                      </article>
                    }
                  </div>
                } @else if (selectedPlaybook()!.plays?.length) {
                  <div class="play-filter-empty-state">
                    <p class="section-meta">No plays match your current filters.</p>
                    @if (hasActivePlayFilters()) {
                      <button
                        type="button"
                        class="btn-cancel btn-clear-filters"
                        (click)="clearPlayFilters()"
                      >
                        Clear Filters
                      </button>
                    }
                  </div>
                } @else {
                  <p class="section-meta">No plays yet &mdash; add the first one above.</p>
                }
              </div>
            </div>
          }

          <!-- ──── TAB 2: INSTALL PLANS ──── -->
          @if (activePlaybookTab() === 'install') {
            <div class="tab-content">
              <div class="tab-section">
                <div class="section-header">
                  <h3 class="section-title">Install Plans</h3>
                  <button
                    type="button"
                    class="detail-action-btn"
                    [attr.data-testid]="testIds.PLAYBOOK_EXPORT_CURRENT_BUTTON"
                    [disabled]="exportingPdf()"
                    (click)="exportPlaybookPdf('current')"
                  >
                    {{ exportingPdf() ? 'Exporting…' : 'Export PDF' }}
                  </button>
                </div>
                <p class="section-meta">
                  Track plays through install → rep → game-ready progression with coaching points
                  and drill sequences.
                </p>

                @if (selectedPlaybook()!.plays?.length) {
                  <div class="install-stages">
                    @for (stage of getInstallStages(); track stage) {
                      <div
                        class="install-stage-group"
                        [class.install-stage-group--drag-over]="installDragOverStage() === stage"
                        (dragover)="onInstallStageDragOver(stage, $event)"
                        (dragleave)="onInstallStageDragLeave(stage, $event)"
                        (drop)="onInstallStageDrop(stage, $event)"
                      >
                        <h4 class="install-stage-title">
                          {{ getInstallColumnTitle(stage) }} ({{ countPlaysByStage(stage) }})
                        </h4>
                        @if (countPlaysByStage(stage) > 0) {
                          <div class="install-plays">
                            @for (
                              play of getPlaysByStage(stage);
                              track play.id || play.name || $index
                            ) {
                              <article
                                class="install-play-card"
                                draggable="true"
                                [class.install-play-card--dragging]="
                                  draggingInstallPlayIndex() === getPlayIndex(play)
                                "
                                (dragstart)="onInstallPlayDragStart(play, $event)"
                                (dragend)="onInstallPlayDragEnd()"
                              >
                                <div class="install-play-head">
                                  <h5>{{ play.title || play.name || 'Untitled Play' }}</h5>
                                  @if (play.diagramUrl) {
                                    <button
                                      type="button"
                                      class="install-play-view"
                                      (click)="openDiagramModal(play)"
                                      [attr.aria-label]="
                                        'Open play details for ' +
                                        (play.title || play.name || 'play')
                                      "
                                      title="Open play details"
                                    >
                                      View Play
                                    </button>
                                  }
                                </div>
                              </article>
                            }
                          </div>
                        } @else {
                          <p class="section-meta">No plays in this stage yet.</p>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <div class="tab-empty">
                    <p class="section-meta">
                      No plays yet. Add plays with install stages to see them here.
                    </p>
                  </div>
                }
              </div>
            </div>
          }

          <!-- ──── TAB 3: CALLSHEETS WORKSPACE ──── -->
          @if (activePlaybookTab() === 'callsheet') {
            <div class="tab-content">
              <div class="tab-section">
                <div class="section-header">
                  <h3 class="section-title">Callsheets</h3>
                  <button
                    type="button"
                    class="detail-action-btn"
                    [attr.data-testid]="testIds.PLAYBOOK_EXPORT_CURRENT_BUTTON"
                    [disabled]="exportingPdf()"
                    (click)="exportPlaybookPdf('current')"
                  >
                    {{ exportingPdf() ? 'Exporting…' : 'Export PDF' }}
                  </button>
                </div>
                <p class="section-meta">
                  Build, save, and manage weekly callsheets. Use Create Callsheet or Situational
                  Finder to start an Agent X workflow.
                </p>

                <div class="callsheet-workspace-actions">
                  <button
                    type="button"
                    class="btn-create-plan"
                    [attr.data-testid]="testIds.CALLSHEET_CREATE_BUTTON"
                    (click)="startCreateCallsheetChat()"
                  >
                    <svg
                      class="callsheet-agentx-icon"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="8"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                    Create Callsheet
                  </button>
                  <button
                    type="button"
                    class="detail-action-btn detail-action-btn--secondary"
                    [attr.data-testid]="testIds.CALLSHEET_SITUATIONAL_FINDER_BUTTON"
                    (click)="startSituationalFinderChat()"
                  >
                    Situational Finder
                  </button>
                </div>

                <div
                  class="callsheet-saved-list"
                  [attr.data-testid]="testIds.CALLSHEET_LIST_CONTAINER"
                >
                  @if (callsheetsLoading()) {
                    <p class="section-meta">Loading callsheets...</p>
                  } @else if (callsheets().length === 0) {
                    <div
                      class="playbooks-empty-state"
                      [attr.data-testid]="testIds.CALLSHEET_EMPTY_STATE"
                    >
                      <p class="empty-title">No callsheets yet</p>
                      <p class="section-meta">
                        Start with Create Callsheet, or run Situational Finder and save the result.
                      </p>
                    </div>
                  } @else {
                    <div class="callsheet-saved-grid">
                      @for (sheet of callsheets(); track sheet.id) {
                        <article
                          class="callsheet-saved-card"
                          [class.callsheet-saved-card--active]="selectedCallsheetId() === sheet.id"
                          [attr.data-testid]="testIds.CALLSHEET_LIST_ITEM"
                          [nxtAgentXContextDrag]="buildCallsheetDragContext(sheet)"
                        >
                          <span class="callsheet-saved-card__title">{{ sheet.title }}</span>
                          <span class="callsheet-saved-card__meta">{{
                            sheet.situation || 'all situations'
                          }}</span>
                          <span class="callsheet-saved-card__meta"
                            >{{ sheet.playCount }} plays •
                            {{ formatDate(sheet.updatedAt || sheet.createdAt) }}</span
                          >
                          <div class="callsheet-saved-card__actions">
                            <button
                              type="button"
                              class="detail-action-btn detail-action-btn--secondary"
                              (click)="toggleCallsheet(sheet.id)"
                            >
                              {{ selectedCallsheetId() === sheet.id ? 'Close' : 'Open' }}
                            </button>
                            <button
                              type="button"
                              class="detail-action-btn"
                              [disabled]="exportingPdf()"
                              (click)="exportSavedCallsheet(sheet.id)"
                            >
                              {{ exportingPdf() ? 'Exporting…' : 'Export' }}
                            </button>
                          </div>
                        </article>
                      }
                    </div>
                  }
                </div>

                @if (selectedCallsheetDetailLoading()) {
                  <p class="section-meta">Loading callsheet details...</p>
                } @else if (selectedCallsheetDetail()) {
                  <div
                    class="callsheet-detail-card"
                    [nxtAgentXContextDrag]="buildCallsheetDragContext(selectedCallsheetDetail()!)"
                  >
                    <div class="callsheet-detail-card__header">
                      <div>
                        <h4 class="section-subtitle">{{ selectedCallsheetDetail()!.title }}</h4>
                        <p class="section-meta">
                          {{ selectedCallsheetDetail()!.situation || 'all situations' }}
                        </p>
                      </div>
                      <p class="section-meta">
                        {{ selectedCallsheetDetail()!.plays?.length || 0 }} saved calls •
                        {{
                          formatDate(
                            selectedCallsheetDetail()!.updatedAt ||
                              selectedCallsheetDetail()!.createdAt
                          )
                        }}
                      </p>
                    </div>

                    @if (selectedCallsheetDetail()!.notes) {
                      <div class="callsheet-detail-card__section">
                        <span class="callsheet-detail-card__label">Notes</span>
                        <p class="callsheet-detail-card__notes">
                          {{ selectedCallsheetDetail()!.notes }}
                        </p>
                      </div>
                    }

                    @if ((selectedCallsheetDetail()!.plays?.length || 0) > 0) {
                      <div class="callsheet-detail-card__section">
                        <div class="callsheet-detail-card__groups-header">
                          <span class="callsheet-detail-card__label">Call Groups</span>
                          <div class="callsheet-detail-card__groups-actions">
                            <button
                              type="button"
                              class="detail-action-btn detail-action-btn--secondary"
                              (click)="addCallsheetGroup()"
                            >
                              Add Group
                            </button>
                            <button
                              type="button"
                              class="detail-action-btn"
                              [disabled]="callsheetGroupsSaving()"
                              (click)="saveCallsheetGroups()"
                            >
                              {{ callsheetGroupsSaving() ? 'Saving…' : 'Save Groups' }}
                            </button>
                          </div>
                        </div>

                        <div class="callsheet-detail-card__groups">
                          @for (group of selectedCallsheetGroups(); track group.id) {
                            <section
                              class="callsheet-group-card"
                              [class.callsheet-group-card--menu-open]="
                                isCallsheetGroupMenuOpen(group.id)
                              "
                            >
                              <div class="callsheet-group-card__header">
                                <button
                                  type="button"
                                  class="callsheet-group-card__toggle"
                                  [attr.aria-expanded]="isCallsheetGroupExpanded(group.id)"
                                  (click)="toggleCallsheetGroupExpansion(group.id, $event)"
                                >
                                  <span class="callsheet-group-card__chevron" aria-hidden="true">
                                    @if (isCallsheetGroupExpanded(group.id)) {
                                      <nxt1-icon name="chevronDown" [size]="16"></nxt1-icon>
                                    } @else {
                                      <nxt1-icon name="chevronRight" [size]="16"></nxt1-icon>
                                    }
                                  </span>
                                  <nxt1-icon
                                    name="folder"
                                    [size]="14"
                                    class="callsheet-group-card__icon"
                                  ></nxt1-icon>
                                  <span class="callsheet-group-card__name">{{ group.name }}</span>
                                  <span class="callsheet-group-card__count"
                                    >{{ group.plays.length }} calls</span
                                  >
                                </button>

                                <div class="callsheet-group-card__menu-anchor">
                                  <button
                                    type="button"
                                    class="film-list-item__menu-btn callsheet-group-card__menu-btn"
                                    aria-label="Group options"
                                    [attr.aria-expanded]="isCallsheetGroupMenuOpen(group.id)"
                                    aria-haspopup="menu"
                                    (click)="onOpenCallsheetGroupMenu($event, group)"
                                  >
                                    <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                                  </button>

                                  @if (isCallsheetGroupMenuOpen(group.id)) {
                                    <div
                                      class="film-list-item__menu-backdrop"
                                      (click)="closeCallsheetGroupMenu()"
                                    ></div>
                                    <div
                                      class="film-list-item__menu callsheet-group-card__menu"
                                      role="menu"
                                      aria-label="Group options"
                                      (click)="$event.stopPropagation()"
                                    >
                                      @if (isEditingCallsheetGroup(group.id)) {
                                        <div class="film-list-item__menu-rename">
                                          <label
                                            class="film-list-item__menu-label"
                                            for="callsheet-group-rename-{{ group.id }}"
                                          >
                                            Rename group
                                          </label>
                                          <input
                                            id="callsheet-group-rename-{{ group.id }}"
                                            type="text"
                                            class="film-list-item__menu-input"
                                            maxlength="80"
                                            [value]="callsheetGroupMenuRenameDraft()"
                                            (input)="
                                              onCallsheetGroupRenameInput($any($event.target).value)
                                            "
                                            (keydown.enter)="
                                              onCallsheetGroupRenameConfirm(group, $event)
                                            "
                                            (keydown.escape)="onCallsheetGroupRenameCancel($event)"
                                          />
                                          <div class="film-list-item__menu-actions">
                                            <button
                                              type="button"
                                              class="film-list-item__menu-action film-list-item__menu-action--primary"
                                              (click)="onCallsheetGroupRenameConfirm(group, $event)"
                                            >
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              class="film-list-item__menu-action"
                                              (click)="onCallsheetGroupRenameCancel($event)"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      } @else if (isDeletingCallsheetGroup(group.id)) {
                                        <div class="film-list-item__menu-confirm">
                                          <p class="film-list-item__menu-confirm-text">
                                            @if (group.plays.length) {
                                              Delete this group? Calls will move to another group.
                                            } @else {
                                              Delete this empty group?
                                            }
                                          </p>
                                          <div class="film-list-item__menu-actions">
                                            <button
                                              type="button"
                                              class="film-list-item__menu-action film-list-item__menu-action--danger"
                                              (click)="onCallsheetGroupDeleteConfirm(group, $event)"
                                            >
                                              Delete
                                            </button>
                                            <button
                                              type="button"
                                              class="film-list-item__menu-action"
                                              (click)="onCallsheetGroupDeleteCancel($event)"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      } @else {
                                        <button
                                          type="button"
                                          class="film-list-item__menu-action"
                                          role="menuitem"
                                          (click)="onCallsheetGroupRenameStart(group, $event)"
                                        >
                                          Rename
                                        </button>
                                        @if (selectedCallsheetGroups().length > 1) {
                                          <button
                                            type="button"
                                            class="film-list-item__menu-action film-list-item__menu-action--danger"
                                            role="menuitem"
                                            (click)="onCallsheetGroupDeleteStart(group, $event)"
                                          >
                                            Delete group
                                          </button>
                                        }
                                      }
                                    </div>
                                  }
                                </div>
                              </div>

                              @if (isCallsheetGroupExpanded(group.id)) {
                                <div class="callsheet-detail-card__plays">
                                  @if (group.plays.length === 0) {
                                    <div class="callsheet-group-card__empty">
                                      <p class="callsheet-group-card__empty-text">
                                        No calls in this group yet.
                                      </p>
                                      <div class="callsheet-group-card__empty-actions">
                                        <select
                                          class="callsheet-detail-card__group-select"
                                          [value]="callsheetGroupAddPlayDraft(group.id)"
                                          (change)="setCallsheetGroupAddPlayDraft(group.id, $event)"
                                        >
                                          <option value="">Select play</option>
                                          @for (
                                            playName of getCallsheetGroupAvailablePlayNames(
                                              group.id
                                            );
                                            track playName
                                          ) {
                                            <option [value]="playName">{{ playName }}</option>
                                          }
                                        </select>
                                        <button
                                          type="button"
                                          class="detail-action-btn detail-action-btn--secondary"
                                          [disabled]="!callsheetGroupAddPlayDraft(group.id)"
                                          (click)="addPlayToCallsheetGroup(group.id)"
                                        >
                                          Add Play
                                        </button>
                                      </div>
                                    </div>
                                  } @else {
                                    @for (play of group.plays; track play.playName) {
                                      <div class="callsheet-detail-card__play-row">
                                        <div class="callsheet-detail-card__play-copy">
                                          <p class="callsheet-detail-card__play-title">
                                            {{ play.playName }}
                                          </p>
                                          <p class="callsheet-detail-card__play-reasoning">
                                            {{ play.reasoning }}
                                          </p>
                                        </div>
                                        <div
                                          class="callsheet-detail-card__play-controls"
                                          [class.callsheet-detail-card__play-controls--confirm]="
                                            callsheetPendingRemovalPlayName() === play.playName
                                          "
                                        >
                                          @if (
                                            callsheetPendingRemovalPlayName() === play.playName
                                          ) {
                                            <button
                                              type="button"
                                              class="callsheet-detail-card__remove-confirm-btn"
                                              [disabled]="callsheetGroupsSaving()"
                                              (click)="
                                                confirmRemovePlayFromCallsheet(play.playName)
                                              "
                                            >
                                              {{ callsheetGroupsSaving() ? 'Removing…' : 'Remove' }}
                                            </button>
                                            <button
                                              type="button"
                                              class="callsheet-detail-card__remove-cancel-btn"
                                              [disabled]="callsheetGroupsSaving()"
                                              (click)="cancelRemovePlayFromCallsheet()"
                                            >
                                              Keep
                                            </button>
                                          } @else {
                                            <select
                                              class="callsheet-detail-card__group-select"
                                              [value]="group.id"
                                              (change)="
                                                moveCallsheetPlayToGroup(play.playName, $event)
                                              "
                                            >
                                              @for (
                                                groupOption of callsheetGroupDraft();
                                                track groupOption.id
                                              ) {
                                                <option [value]="groupOption.id">
                                                  {{ groupOption.name }}
                                                </option>
                                              }
                                            </select>
                                            <button
                                              type="button"
                                              class="callsheet-detail-card__remove-play-btn"
                                              aria-label="Remove play from callsheet"
                                              title="Remove play"
                                              [disabled]="callsheetGroupsSaving()"
                                              (click)="
                                                requestRemovePlayFromCallsheet(play.playName)
                                              "
                                            >
                                              <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                                            </button>
                                          }
                                        </div>
                                      </div>
                                    }
                                  }
                                </div>
                              }
                            </section>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- ──── TAB 4: PRACTICE SCRIPTS ──── -->
          @if (activePlaybookTab() === 'play-script') {
            <div class="tab-content">
              <div class="tab-section">
                <div class="section-header">
                  <h3 class="section-title">Practice Scripts</h3>
                  <button
                    type="button"
                    class="detail-action-btn"
                    [attr.data-testid]="testIds.PLAYBOOK_EXPORT_CURRENT_BUTTON"
                    [disabled]="exportingPdf()"
                    (click)="exportPlaybookPdf('current')"
                  >
                    {{ exportingPdf() ? 'Exporting…' : 'Export PDF' }}
                  </button>
                </div>

                <p class="section-meta">
                  Build coach-ready period scripts with clock, call type, rep count, and coaching
                  emphasis for each period.
                </p>

                <div class="callsheet-workspace-actions">
                  <button
                    type="button"
                    class="btn-create-plan"
                    [attr.data-testid]="testIds.PRACTICE_SCRIPT_CREATE_BUTTON"
                    (click)="startCreatePracticeScriptChat()"
                  >
                    <svg
                      class="callsheet-agentx-icon"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="8"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                    Create In Chat
                  </button>
                  <button
                    type="button"
                    class="detail-action-btn detail-action-btn--secondary"
                    [attr.data-testid]="testIds.PRACTICE_SCRIPT_GENERATE_BUTTON"
                    [disabled]="generatingPracticeScript()"
                    (click)="generatePracticeScriptDraft()"
                  >
                    {{ generatingPracticeScript() ? 'Generating…' : 'Auto-Generate Script' }}
                  </button>
                </div>

                <div
                  class="callsheet-saved-list"
                  [attr.data-testid]="testIds.PRACTICE_SCRIPT_LIST_CONTAINER"
                >
                  @if (practiceScriptsLoading()) {
                    <p class="section-meta">Loading practice scripts...</p>
                  } @else if (practiceScripts().length === 0) {
                    <div
                      class="playbooks-empty-state"
                      [attr.data-testid]="testIds.PRACTICE_SCRIPT_EMPTY_STATE"
                    >
                      <p class="empty-title">No practice scripts yet</p>
                      <p class="section-meta">
                        Generate an AI draft or build one in chat, then save it for export.
                      </p>
                    </div>
                  } @else {
                    <div class="callsheet-saved-grid">
                      @for (script of practiceScripts(); track script.id) {
                        <article
                          class="callsheet-saved-card"
                          [class.callsheet-saved-card--active]="
                            selectedPracticeScriptId() === script.id
                          "
                          [attr.data-testid]="testIds.PRACTICE_SCRIPT_LIST_ITEM"
                        >
                          <span class="callsheet-saved-card__title">{{ script.title }}</span>
                          <span class="callsheet-saved-card__meta"
                            >{{ script.focus }} • {{ script.tempo }}</span
                          >
                          <span class="callsheet-saved-card__meta"
                            >{{ script.totalPeriods }} periods • {{ script.totalReps }} reps</span
                          >
                          <div class="callsheet-saved-card__actions">
                            <button
                              type="button"
                              class="detail-action-btn detail-action-btn--secondary"
                              (click)="togglePracticeScript(script.id)"
                            >
                              {{ selectedPracticeScriptId() === script.id ? 'Close' : 'Open' }}
                            </button>
                            <button
                              type="button"
                              class="detail-action-btn"
                              [disabled]="exportingPdf()"
                              (click)="exportSavedPracticeScript(script.id)"
                            >
                              {{ exportingPdf() ? 'Exporting…' : 'Export' }}
                            </button>
                            <button
                              type="button"
                              class="detail-action-btn detail-action-btn--ghost"
                              [disabled]="deletingPracticeScriptId() === script.id"
                              (click)="deletePracticeScript(script.id)"
                            >
                              {{
                                deletingPracticeScriptId() === script.id ? 'Deleting…' : 'Delete'
                              }}
                            </button>
                          </div>
                        </article>
                      }
                    </div>
                  }
                </div>

                @if (selectedPracticeScriptDetailLoading()) {
                  <p class="section-meta">Loading script details...</p>
                } @else if (selectedPracticeScriptDetail()) {
                  <div class="callsheet-detail-card">
                    <div class="callsheet-detail-card__header">
                      <div>
                        <h4 class="section-subtitle">
                          {{ selectedPracticeScriptDetail()!.title }}
                        </h4>
                        <p class="section-meta">
                          {{ selectedPracticeScriptDetail()!.focus }} •
                          {{ selectedPracticeScriptDetail()!.tempo }}
                        </p>
                      </div>
                      <p class="section-meta">
                        {{ practiceScriptTotals().periodCount }} periods •
                        {{ practiceScriptTotals().totalReps }} reps total
                      </p>
                    </div>

                    @if ((selectedPracticeScriptDetail()!.objectives?.length || 0) > 0) {
                      <div class="callsheet-detail-card__section">
                        <span class="callsheet-detail-card__label">Objectives</span>
                        <div class="chip-list">
                          @for (
                            objective of selectedPracticeScriptDetail()!.objectives || [];
                            track objective
                          ) {
                            <span class="chip chip--soft">{{ objective }}</span>
                          }
                        </div>
                      </div>
                    }

                    <div class="callsheet-detail-card__section">
                      <span class="callsheet-detail-card__label">Script Matrix</span>
                      <div class="practice-script-table-wrap">
                        <table class="practice-script-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Period</th>
                              <th>Clock</th>
                              <th>Reps</th>
                              <th>Call Type</th>
                              <th>Play Call</th>
                              <th>Coaching Point</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (
                              period of selectedPracticeScriptDetail()!.periods || [];
                              track period.id
                            ) {
                              <tr>
                                <td>{{ $index + 1 }}</td>
                                <td>{{ period.label }}</td>
                                <td>{{ period.clock }}</td>
                                <td>{{ period.reps }}</td>
                                <td>{{ period.callType }}</td>
                                <td>{{ period.playName }}</td>
                                <td>{{ period.coachingPoint || period.notes || '—' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>

                    @if (selectedPracticeScriptDetail()!.notes) {
                      <div class="callsheet-detail-card__section">
                        <span class="callsheet-detail-card__label">Coach Notes</span>
                        <p class="callsheet-detail-card__notes">
                          {{ selectedPracticeScriptDetail()!.notes }}
                        </p>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </section>

        <section class="detail-section detail-section--meta">
          <h3 class="section-title">Record</h3>
          <p class="section-meta">Created: {{ formatDate(selectedPlaybook()!.createdAt) }}</p>
          <p class="section-meta">Updated: {{ formatDate(selectedPlaybook()!.updatedAt) }}</p>
        </section>
      </div>
    } @else if (showingDetail() && detailLoading()) {
      <div class="playbooks-loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    } @else if (loading()) {
      <div class="playbooks-loading">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    } @else if (!hasTeamContext()) {
      <nxt1-state-view
        title="Team Context Required"
        message="Select a team to view that team's playbooks only"
        icon="users"
      />
    } @else if (error()) {
      <nxt1-state-view
        title="Unable to load playbooks"
        [message]="error()!"
        icon="alertCircle"
        actionLabel="Try Again"
        (action)="reload()"
      />
    } @else {
      <div class="playbooks-list-header" [attr.data-testid]="testIds.PLAYBOOK_LIST_CONTAINER">
        <div>
          <h3>Playbooks</h3>
          @if (playbooks().length === 0 && !showCreateForm()) {
            <p>No playbooks yet. Start from Agent X or create one manually.</p>
          }
        </div>
        @if (!showCreateForm()) {
          <div class="playbooks-list-header-actions">
            <button
              type="button"
              class="btn-new"
              [attr.data-testid]="testIds.PLAYBOOK_CREATE_BUTTON"
              (click)="startCreate()"
            >
              <nxt1-icon name="plus" [size]="14"></nxt1-icon>
              New
            </button>
          </div>
        }
      </div>

      @if (showCreateForm()) {
        <div class="inline-form">
          <h4 class="form-heading">New Playbook</h4>
          <input
            class="form-input"
            placeholder="Playbook name *"
            [value]="newPlaybook().name"
            (input)="patchNewPlaybook('name', $event)"
          />
          <input
            class="form-input"
            placeholder="Season (e.g. 2025-26)"
            [value]="newPlaybook().season"
            (input)="patchNewPlaybook('season', $event)"
          />
          <div class="form-actions">
            <button type="button" class="btn-cancel" (click)="cancelCreate()">Cancel</button>
            <button
              type="button"
              class="btn-save"
              [disabled]="saving() || !newPlaybook().name.trim() || !activeSport().trim()"
              (click)="createPlaybook()"
            >
              {{ saving() ? 'Creating…' : 'Create Playbook' }}
            </button>
          </div>
        </div>
      }

      @if (playbooks().length === 0 && !showCreateForm()) {
        <div class="playbooks-empty-state" [attr.data-testid]="testIds.PLAYBOOK_LIST_EMPTY_STATE">
          <nxt1-state-view
            variant="empty"
            icon="clipboard"
            title="No Playbooks"
            message="Import your playbook files or have Agent X build a complete playbook draft from scratch."
          />

          <input
            #playbookImportInput
            type="file"
            class="hidden-file-input"
            accept=".pdf,.doc,.docx,.txt,.rtf,.md,.csv,.xls,.xlsx,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            (change)="onImportPlaybookFilesSelected($event)"
          />

          <div class="playbooks-empty-actions">
            <button
              type="button"
              class="btn-empty-action"
              [attr.data-testid]="testIds.AI_ADD_PLAY_TRIGGER"
              (click)="openPlaybookImportPicker(playbookImportInput)"
            >
              <svg
                class="btn-empty-action__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                <path d="M14 2v5h5" />
                <path d="M12 11v7" />
                <path d="m9 15 3 3 3-3" />
              </svg>
              <span>Import Playbook</span>
            </button>

            <button
              type="button"
              class="btn-empty-action btn-empty-action--primary"
              [attr.data-testid]="testIds.AI_CREATE_GAMEPLAN_TRIGGER"
              (click)="startCreatePlaybookChat()"
            >
              <svg
                class="btn-empty-action__icon btn-empty-action__icon--agent"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <span>Create Playbook</span>
            </button>
          </div>
        </div>
      }

      @if (playbooks().length > 0) {
        <div class="playbooks-grid" role="list" aria-label="Team playbooks">
          @for (playbook of playbooks(); track playbook.id) {
            @if (deletingPlaybookId() === playbook.id) {
              <div class="playbook-card-static playbook-card--confirm">
                <p class="delete-msg">
                  Delete <strong>{{ playbook.name }}</strong
                  >? This cannot be undone.
                </p>
                <div class="form-actions">
                  <button type="button" class="btn-cancel" (click)="cancelDeletePlaybook()">
                    Keep
                  </button>
                  <button
                    type="button"
                    class="btn-delete-confirm"
                    [disabled]="saving()"
                    (click)="deletePlaybook(playbook.id)"
                  >
                    {{ saving() ? 'Deleting…' : 'Delete' }}
                  </button>
                </div>
              </div>
            } @else if (editingPlaybookId() === playbook.id) {
              <div class="playbook-card-static playbook-card--editing">
                <h4 class="form-heading">Edit</h4>
                <input
                  class="form-input"
                  placeholder="Name *"
                  [value]="editPlaybookForm().name"
                  (input)="patchEditPlaybook('name', $event)"
                />
                <input
                  class="form-input"
                  placeholder="Season"
                  [value]="editPlaybookForm().season"
                  (input)="patchEditPlaybook('season', $event)"
                />
                <div class="form-actions">
                  <button type="button" class="btn-cancel" (click)="cancelEditPlaybook()">
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-save"
                    [disabled]="saving()"
                    (click)="saveEditPlaybook(playbook.id)"
                  >
                    {{ saving() ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </div>
            } @else {
              <button
                type="button"
                class="playbook-card"
                role="listitem"
                [nxtAgentXContextDrag]="buildPlaybookDragContext(playbook)"
                (click)="selectPlaybook(playbook)"
                [attr.aria-label]="'Open playbook ' + (playbook.title || playbook.name)"
              >
                <span class="card-title">{{ playbook.title || playbook.name }}</span>
                <div class="card-meta-row">
                  <span>{{ playbook.sport | titlecase }}</span>
                  @if (playbook.season) {
                    <span>{{ playbook.season }}</span>
                  }
                </div>
                <div class="card-metrics">
                  <span>{{ playbook.playCount ?? 0 }} plays</span>
                  <span>{{ formatDate(playbook.updatedAt || playbook.createdAt) }}</span>
                </div>
                <div class="card-crud-row">
                  <button
                    type="button"
                    class="icon-btn icon-btn--sm"
                    title="Edit"
                    (click)="startEditPlaybook(playbook, $event)"
                  >
                    <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--sm icon-btn--danger"
                    title="Delete"
                    (click)="confirmDeletePlaybook(playbook, $event)"
                  >
                    <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                  </button>
                </div>
              </button>
            }
          }
        </div>
      }
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .playbooks-panel {
        height: 100%;
        overflow: auto;
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, #1a1a1a);
        scrollbar-color: var(--agent-border, rgba(0, 0, 0, 0.08)) transparent;
      }

      .agent-x-context-drag-source:not(.agent-x-context-drag-source--disabled) {
        cursor: grab;
      }

      .agent-x-context-drag-source--dragging {
        cursor: grabbing;
        opacity: 0.62;
      }

      /* ── List Header ── */
      .playbooks-list-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }
      .playbooks-list-header h3 {
        margin: 0;
        font-size: 0.95rem;
        letter-spacing: 0.01em;
      }
      .playbooks-list-header p {
        margin: 4px 0 0;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.76rem;
      }

      .btn-new {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.12));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .btn-new:hover {
        background: rgba(204, 255, 0, 0.22);
      }

      .playbooks-list-header-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn-new--secondary {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.12));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.78));
      }
      .btn-new--secondary:hover {
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }

      .playbooks-empty-state {
        display: grid;
        justify-items: center;
        gap: 14px;
      }

      .playbooks-empty-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .btn-empty-action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 0 14px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.14));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.78));
        font-size: 0.79rem;
        font-weight: 700;
        cursor: pointer;
        transition:
          border-color 120ms ease,
          background-color 120ms ease,
          color 120ms ease,
          transform 120ms ease;
      }

      .btn-empty-action:hover {
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-primary, #1a1a1a);
        transform: translateY(-1px);
      }

      .btn-empty-action--primary {
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.12));
        color: var(--agent-text-primary, #1a1a1a);
      }

      .btn-empty-action__icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }

      .btn-empty-action__icon--agent {
        width: 24px;
        height: 24px;
      }

      /* ── Grid ── */
      .playbooks-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .playbook-card {
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        min-height: 110px;
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, #1a1a1a);
        cursor: pointer;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background 120ms ease;
        width: 100%;
        padding-bottom: 40px;
      }
      .playbook-card:hover {
        transform: translateY(-1px);
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      .card-crud-row {
        display: flex;
        align-items: center;
        gap: 4px;
        position: absolute;
        left: 8px;
        bottom: 8px;
      }

      .playbook-card-static {
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .card-title {
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.3;
        display: block;
      }

      .card-meta-row,
      .card-metrics {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }
      .card-meta-row span + span::before {
        content: '·';
        margin-right: 6px;
        opacity: 0.4;
      }

      /* ── Detail ── */
      .playbook-detail {
        display: grid;
        gap: 14px;
      }

      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .detail-header--actions-only {
        justify-content: flex-end;
      }

      .detail-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 10px;
        min-height: 30px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.14));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background-color 120ms ease,
          color 120ms ease,
          box-shadow 120ms ease;
      }

      .detail-action-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.2));
      }

      .detail-action-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .detail-action-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.28);
      }

      .detail-action-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .detail-action-btn--secondary {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.14));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.74));
      }

      .detail-action-btn--secondary:hover:not(:disabled) {
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-primary, #1a1a1a);
      }

      .detail-action-btn--ghost {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.14));
        background: transparent;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.56));
      }

      .detail-action-btn--ghost:hover:not(:disabled) {
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-primary, #1a1a1a);
      }

      .detail-action-btn--icon {
        width: 30px;
        height: 30px;
        min-width: 30px;
        padding: 0;
      }

      .detail-form {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: grid;
        gap: 10px;
      }

      .detail-form .form-heading {
        margin: 0;
      }

      .detail-form .form-actions {
        margin-top: 2px;
      }

      .detail-title {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.3;
      }

      .detail-meta-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .meta-item {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 8px;
      }
      .meta-label {
        display: block;
        font-size: 0.66rem;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }
      .meta-value {
        display: block;
        margin-top: 2px;
        font-size: 0.78rem;
        font-weight: 600;
      }

      /* ── Sections ── */
      .detail-section {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .detail-section--meta {
        opacity: 0.7;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .section-header-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .section-title {
        margin: 0;
        font-size: 0.84rem;
      }
      .section-meta {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }
      .section-meta--error {
        color: rgb(220, 38, 38);
        font-weight: 600;
      }
      .section-link {
        color: var(--agent-primary, #ccff00);
      }

      .index-group {
        display: grid;
        gap: 6px;
      }
      .index-label {
        font-size: 0.72rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Chips ── */
      .chip-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        border-radius: 999px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        padding: 3px 9px;
        font-size: 0.69rem;
        font-weight: 600;
      }
      .chip--soft {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Plays ── */
      .btn-add-play {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-add-play:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }

      .plays-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }

      .play-item {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 10px;
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 100%;
      }

      .play-actions {
        display: flex;
        justify-content: flex-start;
        gap: 4px;
        order: 99;
        margin-top: auto;
      }

      .play-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .play-head h4 {
        margin: 0;
        font-size: 0.8rem;
      }

      .play-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .play-copy {
        margin: 0;
        font-size: 0.74rem;
      }
      .play-copy--muted {
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Diagram ── */
      .diagram-preview-card {
        display: block;
        width: 100%;
        min-height: 120px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        overflow: hidden;
        text-decoration: none;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }
      .diagram-preview-card:hover {
        border-color: var(--agent-primary, #ccff00);
      }
      .diagram-preview-image {
        display: block;
        width: 100%;
        height: 160px;
        object-fit: cover;
      }
      .diagram-preview-fallback {
        min-height: 120px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px dashed var(--agent-border, rgba(0, 0, 0, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 12px;
        font-weight: 600;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }
      .diagram-preview-fallback--empty {
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .play-links {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.72rem;
      }
      .play-link {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 3px 9px;
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        font-size: 11px;
        font-weight: 600;
        text-decoration: none;
      }

      .play-edit-form {
        display: grid;
        gap: 7px;
      }

      .form-field {
        display: grid;
        gap: 4px;
      }

      .form-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        letter-spacing: 0.01em;
      }

      .diagram-upload-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn-upload-diagram {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
      }
      .btn-upload-diagram:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }

      .diagram-upload-status {
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .hidden-file-input {
        display: none;
      }

      /* ── Icon Buttons ── */
      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        cursor: pointer;
      }
      .icon-btn:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }
      .icon-btn--sm {
        width: 24px;
        height: 24px;
      }
      .icon-btn--danger:hover {
        border-color: rgb(239, 68, 68);
        color: rgb(239, 68, 68);
        background: rgba(239, 68, 68, 0.06);
      }

      /* ── Forms ── */
      .inline-form {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        padding: 14px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
      }
      .inline-form--plays {
        margin-bottom: 0;
      }
      .form-heading {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .form-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .form-input {
        width: 100%;
        padding: 7px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.78rem;
        outline: none;
        box-sizing: border-box;
      }
      .form-input:focus {
        border-color: var(--agent-primary, #ccff00);
      }
      .form-input::placeholder {
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.4));
      }
      .form-textarea {
        resize: vertical;
        min-height: 60px;
      }
      .form-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
      }

      .btn-cancel {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.74rem;
        font-weight: 500;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-save {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.15));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-delete-confirm {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid rgb(239, 68, 68);
        background: rgba(239, 68, 68, 0.1);
        color: rgb(239, 68, 68);
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-delete-confirm:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .delete-overlay {
        display: grid;
        gap: 10px;
      }
      .delete-msg {
        margin: 0;
        font-size: 0.78rem;
      }

      /* ── Skeleton ── */
      .playbooks-loading {
        display: grid;
        gap: 10px;
      }
      .skeleton-card {
        border-radius: var(--nxt1-radius-md, 12px);
        min-height: 88px;
        background: linear-gradient(
          100deg,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 20%,
          var(--agent-surface-hover, rgba(0, 0, 0, 0.05)) 45%,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 70%
        );
        background-size: 200% 100%;
        animation: pulse 1.1s ease-in-out infinite;
      }

      /* ── Responsive ── */
      @media (max-width: 1450px) {
        .playbooks-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 1180px) {
        .playbooks-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .detail-meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .install-stages {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 760px) {
        .playbooks-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .plays-list {
          grid-template-columns: minmax(0, 1fr);
        }
        .detail-meta-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .install-stages {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      /* ── Tab System ── */
      .detail-section--tabs {
        padding: 0;
        border: none;
        background: transparent;
      }

      .tabs-header {
        display: flex;
        gap: 0;
        border-bottom: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        border-radius: var(--nxt1-radius-md, 12px) var(--nxt1-radius-md, 12px) 0 0;
      }

      .tab-btn {
        flex: 1;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 120ms ease;
        text-align: center;
        white-space: nowrap;
      }
      .tab-btn:hover {
        color: var(--agent-text-primary, #1a1a1a);
        background: rgba(0, 0, 0, 0.02);
      }
      .tab-btn--active {
        color: var(--agent-primary, #ccff00);
        border-bottom-color: var(--agent-primary, #ccff00);
      }

      .tab-content {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-top: none;
        border-radius: 0 0 var(--nxt1-radius-md, 12px) var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 14px;
        display: grid;
        gap: 12px;
      }

      .tab-section {
        display: grid;
        gap: 10px;
      }

      .tab-divider {
        height: 1px;
        background: var(--agent-border, rgba(0, 0, 0, 0.08));
        margin: 8px 0;
      }

      .tab-plays-section {
        display: grid;
        gap: 10px;
      }

      .plays-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: flex-end;
      }

      .plays-filters label {
        display: grid;
        gap: 4px;
        min-width: 160px;
        font-size: 0.74rem;
        font-weight: 600;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .btn-clear-filters {
        height: 30px;
      }

      .play-filter-empty-state {
        border: 1px dashed var(--agent-border, rgba(0, 0, 0, 0.14));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 12px;
        display: grid;
        justify-items: start;
        gap: 8px;
      }

      .tab-empty {
        padding: 20px;
        text-align: center;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .practice-script-table-wrap {
        overflow: auto;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
      }

      .practice-script-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 780px;
      }

      .practice-script-table th,
      .practice-script-table td {
        border-bottom: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        padding: 8px;
        text-align: left;
        vertical-align: top;
        font-size: 0.73rem;
      }

      .practice-script-table th {
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Install Plans Tab ── */
      .install-stages {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: start;
      }

      .install-stage-group {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 12px;
        display: grid;
        gap: 10px;
        min-height: 180px;
        transition:
          border-color 120ms ease,
          background 120ms ease;
      }

      .install-stage-group--drag-over {
        border-color: var(--agent-primary, #ccff00);
        background: rgba(204, 255, 0, 0.06);
      }

      .install-stage-title {
        margin: 0;
        font-size: 0.84rem;
        font-weight: 700;
        color: var(--agent-primary, #ccff00);
      }

      .install-plays {
        display: grid;
        gap: 8px;
      }

      .install-play-card {
        appearance: none;
        width: 100%;
        text-align: left;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        padding: 10px;
        display: grid;
        gap: 8px;
      }
      .install-play-card--dragging {
        opacity: 0.45;
      }
      .install-play-card:disabled {
        cursor: default;
        opacity: 0.92;
      }

      .install-play-head {
        margin: 0;
      }
      .install-play-head h5 {
        margin: 0;
        font-size: 0.8rem;
        font-weight: 700;
      }

      .install-play-view {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
        justify-self: end;
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--agent-primary, #ccff00);
        text-decoration: underline;
      }
      .install-play-view:hover {
        opacity: 0.85;
      }

      .install-section {
        display: grid;
        gap: 6px;
      }

      .install-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.01em;
      }

      .install-list {
        margin: 0;
        padding-left: 16px;
        font-size: 0.74rem;
        color: var(--agent-text-primary, #1a1a1a);
        line-height: 1.4;
      }
      .install-list li + li {
        margin-top: 4px;
      }
      .install-list code {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 3px;
        padding: 2px 4px;
        font-family: monospace;
        font-size: 0.7rem;
      }

      .install-ai-actions {
        margin-bottom: 12px;
      }

      /* ── Placeholder Cards ── */
      .placeholder-card {
        border: 2px dashed var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 20px;
        text-align: center;
        background: rgba(204, 255, 0, 0.03);
      }

      .placeholder-icon {
        font-size: 2rem;
        margin-bottom: 10px;
      }

      .placeholder-card h4 {
        margin: 10px 0 8px;
        font-size: 0.85rem;
        font-weight: 700;
      }

      .placeholder-card p {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        line-height: 1.4;
      }

      .callsheet-workspace-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 12px;
      }

      .callsheet-agentx-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }

      .callsheet-saved-list {
        display: grid;
        gap: 10px;
        margin-bottom: 12px;
      }

      .callsheet-saved-grid {
        display: grid;
        gap: 8px;
      }

      .callsheet-saved-card {
        text-align: left;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03)) 92%,
          transparent
        );
        padding: 10px;
        display: grid;
        gap: 8px;
        transition:
          border-color 140ms ease,
          background 140ms ease;
      }

      .callsheet-saved-card:hover {
        border-color: var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.45));
      }

      .callsheet-saved-card--active {
        border-color: var(--nxt1-color-border-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .callsheet-saved-card__title {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .callsheet-saved-card__meta {
        font-size: 0.72rem;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
      }

      .callsheet-saved-card__actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .callsheet-detail-card {
        display: grid;
        gap: 12px;
        margin-bottom: 12px;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03)) 92%,
          transparent
        );
      }

      .callsheet-detail-card__header {
        display: flex;
        gap: 12px;
        justify-content: space-between;
        align-items: flex-start;
      }

      .callsheet-detail-card__section {
        display: grid;
        gap: 8px;
      }

      .callsheet-detail-card__groups-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .callsheet-detail-card__groups-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .callsheet-detail-card__label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
      }

      .callsheet-detail-card__notes {
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.55;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .callsheet-detail-card__plays {
        display: grid;
        gap: 8px;
      }

      .callsheet-detail-card__groups {
        display: grid;
        gap: 10px;
      }

      .callsheet-group-card {
        display: grid;
        gap: 6px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03)) 88%,
          transparent
        );
        overflow: visible;
        position: relative;
        transition:
          border-color 0.18s ease,
          background 0.18s ease;
      }

      .callsheet-group-card--menu-open {
        z-index: 80;
      }

      .callsheet-group-card__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 32px;
        align-items: center;
        gap: 4px;
        width: 100%;
        min-height: 38px;
        padding: 0 6px 0 0;
        position: relative;
        z-index: 6;
        overflow: visible;
      }

      .callsheet-group-card__toggle {
        display: grid;
        grid-template-columns: 18px 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
        min-height: 38px;
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: left;
        padding: 7px 8px 7px 10px;
        cursor: pointer;
      }

      .callsheet-group-card__toggle:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .callsheet-group-card__chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .callsheet-group-card__icon {
        color: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 80%,
          var(--nxt1-color-text-primary, #fff)
        );
      }

      .callsheet-group-card__name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .callsheet-group-card__count {
        flex: 0 0 auto;
        min-width: 24px;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 0.68rem;
        font-weight: 700;
        text-align: center;
      }

      .callsheet-group-card__menu-anchor {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        min-height: 38px;
      }

      .film-list-item__menu-btn.callsheet-group-card__menu-btn {
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        position: static;
        top: auto;
        right: auto;
        transform: none;
      }

      .callsheet-group-card .callsheet-group-card__menu-btn {
        z-index: 6;
      }

      .callsheet-group-card .film-list-item__menu.callsheet-group-card__menu {
        top: calc(100% + 2px);
        right: 0;
        z-index: 140;
      }

      .callsheet-detail-card__play-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.03));
      }

      .callsheet-detail-card__play-copy {
        min-width: 0;
      }

      .callsheet-detail-card__play-title {
        margin: 0 0 4px;
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .callsheet-detail-card__play-reasoning {
        margin: 0;
        font-size: 0.76rem;
        line-height: 1.45;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.72));
      }

      .callsheet-detail-card__play-controls {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
        max-width: 100%;
      }

      .callsheet-detail-card__play-controls--confirm {
        justify-content: flex-end;
      }

      .callsheet-detail-card__group-select {
        min-width: 104px;
        height: 30px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.16));
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 0.72rem;
        background: var(--nxt1-color-bg-primary, rgba(0, 0, 0, 0.22));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .callsheet-detail-card__remove-play-btn {
        width: 30px;
        height: 30px;
        min-width: 30px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.16));
        border-radius: 8px;
        background: transparent;
        color: #ff8a8a;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .callsheet-detail-card__remove-play-btn:hover:not(:disabled) {
        border-color: rgba(255, 138, 138, 0.55);
        background: rgba(255, 138, 138, 0.08);
      }

      .callsheet-detail-card__remove-play-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .callsheet-detail-card__remove-confirm-btn,
      .callsheet-detail-card__remove-cancel-btn {
        height: 30px;
        border-radius: 8px;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 0 8px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.16));
        background: transparent;
        color: var(--nxt1-color-text-primary, #fff);
        cursor: pointer;
      }

      .callsheet-detail-card__remove-confirm-btn {
        border-color: rgba(255, 138, 138, 0.45);
        color: #ff8a8a;
      }

      .callsheet-detail-card__remove-confirm-btn:hover:not(:disabled) {
        background: rgba(255, 138, 138, 0.08);
      }

      .callsheet-detail-card__remove-cancel-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.45));
      }

      .callsheet-detail-card__remove-confirm-btn:disabled,
      .callsheet-detail-card__remove-cancel-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .callsheet-group-card__empty {
        display: grid;
        gap: 10px;
        padding: 10px;
        border: 1px dashed var(--nxt1-color-border-default, rgba(255, 255, 255, 0.2));
        border-radius: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .callsheet-group-card__empty-text {
        margin: 0;
        font-size: 0.74rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .callsheet-group-card__empty-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .callsheet-divider {
        border-top: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        margin: 10px 0;
      }

      .section-subtitle {
        margin: 0 0 6px;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--agent-text-primary, #1a1a1a);
      }

      /* ── AI Callsheet ── */
      .callsheet-query {
        display: grid;
        gap: 10px;
        margin-bottom: 14px;
        background: rgba(204, 255, 0, 0.03);
        padding: 12px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
      }

      .query-row {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 8px;
        align-items: center;
      }

      .callsheet-ai-actions {
        margin-bottom: 12px;
      }

      .query-label {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        text-transform: uppercase;
      }

      .query-input {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 8px 10px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.8rem;
        cursor: pointer;
      }
      .query-input:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      .query-input:focus {
        outline: none;
        border-color: var(--agent-primary, #ccff00);
        box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.1);
      }

      .callsheet-results {
        display: grid;
        gap: 10px;
      }

      .empty-results {
        padding: 16px;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        font-size: 0.8rem;
        background: rgba(0, 0, 0, 0.02);
        border-radius: var(--nxt1-radius-sm, 8px);
        display: grid;
        gap: 10px;
        justify-items: center;
        text-align: center;
      }

      .empty-results p {
        margin: 0;
      }

      .callsheet-plays {
        display: grid;
        gap: 8px;
      }

      .callsheet-play-card {
        display: grid;
        grid-template-columns: 60px 1fr;
        gap: 12px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 10px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }

      .play-rank {
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: center;
        justify-content: center;
        background: rgba(204, 255, 0, 0.1);
        border-radius: 6px;
        padding: 6px;
      }

      .rank-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        text-transform: uppercase;
      }

      .rank-score {
        font-size: 1rem;
        font-weight: 700;
        color: var(--agent-primary, #ccff00);
      }

      .play-info {
        display: grid;
        gap: 6px;
      }

      .ai-reasoning-badge {
        display: grid;
        gap: 4px;
        background: rgba(204, 255, 0, 0.12);
        border: 1px solid rgba(204, 255, 0, 0.45);
        border-radius: 8px;
        padding: 6px 8px;
        font-size: 0.72rem;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .ai-reasoning-badge--install {
        margin-bottom: 8px;
      }

      .ai-reasoning-score {
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
      }

      .play-name {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 700;
      }

      .play-formation {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .play-strengths {
        display: grid;
        gap: 4px;
      }

      .strength-label {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .strength-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .strength-tag {
        display: inline-block;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 0.7rem;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .play-coaching {
        display: grid;
        gap: 2px;
        font-size: 0.75rem;
      }

      .coaching-label {
        font-weight: 700;
        text-transform: uppercase;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .coaching-text {
        color: var(--agent-text-primary, #1a1a1a);
      }

      /* ── Game Plans ── */
      .btn-create-plan {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: none;
        background: var(--agent-primary, #ccff00);
        color: #000;
        border-radius: var(--nxt1-radius-sm, 8px);
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 120ms ease;
      }
      .btn-create-plan:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(204, 255, 0, 0.2);
      }

      .game-plan-form {
        display: grid;
        gap: 10px;
        padding: 12px;
        background: rgba(204, 255, 0, 0.03);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        margin-bottom: 12px;
      }

      .form-input,
      .form-textarea {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 8px 10px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.8rem;
        font-family: inherit;
      }
      .form-input:focus,
      .form-textarea:focus {
        outline: none;
        border-color: var(--agent-primary, #ccff00);
        box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.1);
      }

      .game-plan-form .form-actions {
        display: flex;
        gap: 8px;
      }

      .game-plan-form .btn-save,
      .game-plan-form .btn-cancel {
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 120ms ease;
      }

      .game-plan-form .btn-save {
        background: var(--agent-primary, #ccff00);
        color: #000;
      }
      .game-plan-form .btn-save:hover {
        transform: translateY(-1px);
      }

      .game-plan-form .btn-cancel {
        background: rgba(0, 0, 0, 0.1);
        color: var(--agent-text-primary, #1a1a1a);
      }
      .game-plan-form .btn-cancel:hover {
        background: rgba(0, 0, 0, 0.15);
      }

      .game-plans-list {
        display: grid;
        gap: 10px;
      }

      .empty-state-text {
        padding: 16px;
        text-align: center;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        font-size: 0.8rem;
      }

      .game-plan-item {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 12px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        display: grid;
        gap: 10px;
      }

      .plan-header {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }

      .plan-name {
        margin: 0;
        font-size: 0.85rem;
        font-weight: 700;
      }

      .play-count {
        display: inline-block;
        background: rgba(204, 255, 0, 0.15);
        color: var(--agent-primary, #ccff00);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
      }

      .plan-notes {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        line-height: 1.4;
      }

      .plan-plays {
        display: grid;
        gap: 6px;
      }

      .no-plays {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .play-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .play-chip {
        display: inline-block;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .plan-actions {
        display: flex;
        gap: 6px;
      }

      .btn-edit,
      .btn-delete {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border: none;
        background: transparent;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 120ms ease;
      }

      .btn-edit {
        color: var(--agent-primary, #ccff00);
      }
      .btn-edit:hover {
        background: rgba(204, 255, 0, 0.1);
      }

      .btn-delete {
        color: #ff4444;
      }
      .btn-delete:hover {
        background: rgba(255, 68, 68, 0.1);
      }

      .plan-editor {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 12px;
        background: rgba(204, 255, 0, 0.03);
        display: grid;
        gap: 12px;
        margin-top: 12px;
      }

      .editor-title {
        margin: 0;
        font-size: 0.8rem;
        font-weight: 700;
      }

      .play-selector {
        display: grid;
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
      }

      .play-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 6px;
        transition: all 120ms ease;
      }
      .play-checkbox:hover {
        background: rgba(0, 0, 0, 0.04);
      }

      .play-checkbox input {
        cursor: pointer;
      }

      .checkbox-label {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 0.8rem;
      }

      .formation-badge {
        display: inline-block;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 3px;
        padding: 1px 4px;
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .editor-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      @keyframes pulse {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }
    `,
  ],
})
export class AgentXPlaybooksPanelComponent {
  // --- Play Filters State ---
  private readonly _playFilters = signal<{ personnel?: string; side?: string; concept?: string }>(
    {}
  );
  protected readonly playFilters = this._playFilters.asReadonly();
  protected readonly installDragOverStage = signal<'install' | 'rep' | 'game-ready' | null>(null);
  protected readonly draggingInstallPlayIndex = signal<number | null>(null);

  protected onPlayFilterChange(key: 'personnel' | 'side' | 'concept', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this._playFilters.update((prev) => ({ ...prev, [key]: value || undefined }));
  }

  protected clearPlayFilters(): void {
    this._playFilters.set({});
  }

  protected readonly hasActivePlayFilters = computed(() => {
    const { personnel, side, concept } = this._playFilters();
    return [personnel, side, concept].some((value) => (value ?? '').trim().length > 0);
  });

  protected readonly filteredPlays = computed(() => {
    const plays = this.selectedPlaybook()?.plays || [];
    const { personnel, side, concept } = this._playFilters();
    return plays.filter((play) => {
      if (personnel && play.personnel !== personnel) return false;
      if (side && (play.category ?? '').toLowerCase() !== side.toLowerCase()) return false;
      if (concept && !(play.conceptTags || []).includes(concept)) return false;
      return true;
    });
  });

  private readonly http = inject(HttpClient);
  private readonly agentX = inject(AgentXService);
  private readonly logger = inject(NxtLoggingService).child('AgentXPlaybooksPanel');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly playbooksService = inject(PlaybooksService);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;
  protected readonly testIds = TEST_IDS.PLAYBOOK;
  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  // ── Read state ──────────────────────────────────────────────────────────────
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exportingPdf = signal(false);
  protected readonly exportError = signal<string | null>(null);
  protected readonly _teamId = signal<string | null>(null);
  protected readonly _inputSport = signal<string | null>(null);
  protected readonly playbooks = signal<readonly PlaybookSummary[]>([]);
  protected readonly selectedPlaybook = signal<PlaybookDetail | null>(null);

  // ── CRUD: Playbook ───────────────────────────────────────────────────────────
  protected readonly showCreateForm = signal(false);
  protected readonly newPlaybook = signal<NewPlaybookForm>({ ...EMPTY_NEW_PLAYBOOK });
  protected readonly editingPlaybookId = signal<string | null>(null);
  protected readonly editPlaybookForm = signal<EditPlaybookForm>({ ...EMPTY_EDIT_PLAYBOOK });
  protected readonly deletingPlaybookId = signal<string | null>(null);
  protected readonly editingMeta = signal(false);
  protected readonly saving = signal(false);

  // ── CRUD: Play ───────────────────────────────────────────────────────────────
  protected readonly activePlaybookTab = signal<'plays' | 'install' | 'callsheet' | 'play-script'>(
    'plays'
  );
  protected readonly editingPlayIndex = signal<number | null>(null);
  protected readonly editPlayForm = signal<PlayForm>({ ...EMPTY_PLAY_FORM });
  protected readonly editPlayDiagramFile = signal<File | null>(null);
  protected readonly deletingPlayIndex = signal<number | null>(null);
  protected readonly savingPlay = signal(false);
  protected readonly editPlayDiagramFileName = computed(
    () => this.editPlayDiagramFile()?.name ?? ''
  );

  // ── AI Callsheet: Situation-based play finding ─────────────────────────────────
  protected readonly callsheetFilters = signal<Record<string, string>>({});
  protected readonly askingCallsheetAi = signal(false);
  protected readonly callsheetAiRankings = signal<
    Map<string, { score: number; reasoning: string }>
  >(new Map());
  protected readonly filteredCallsheetPlays = computed(() =>
    buildFilteredCallsheetPlays(
      this.selectedPlaybook(),
      this.callsheetFilters(),
      this.callsheetAiRankings()
    )
  );
  protected readonly hasActiveCallsheetFilters = computed(() =>
    hasActiveCallsheetFilters(this.callsheetFilters())
  );
  protected readonly callsheets = signal<readonly CallsheetSummary[]>([]);
  protected readonly callsheetsLoading = signal(false);
  protected readonly selectedCallsheetId = signal<string | null>(null);
  protected readonly selectedCallsheetDetail = signal<CallsheetDetail | null>(null);
  protected readonly selectedCallsheetDetailLoading = signal(false);
  protected readonly callsheetGroupDraft = signal<readonly CallsheetGroup[]>([]);
  protected readonly callsheetGroupAddPlayDrafts = signal<Readonly<Record<string, string>>>({});
  protected readonly callsheetGroupsSaving = signal(false);
  protected readonly callsheetPendingRemovalPlayName = signal<string | null>(null);
  protected readonly collapsedCallsheetGroupIds = signal<ReadonlySet<string>>(new Set());
  protected readonly activeCallsheetGroupMenuId = signal<string | null>(null);
  protected readonly editingCallsheetGroupId = signal<string | null>(null);
  protected readonly deletingCallsheetGroupId = signal<string | null>(null);
  protected readonly callsheetGroupMenuRenameDraft = signal('');
  protected readonly selectedCallsheetGroups = computed(() => {
    const detail = this.selectedCallsheetDetail();
    const plays = detail?.plays ?? [];
    const playMap = new Map(plays.map((play) => [play.playName, play] as const));
    const groups = this.normalizeCallsheetGroupsForUi(this.callsheetGroupDraft(), plays);

    return groups.map((group) => ({
      ...group,
      plays: group.playNames
        .map((playName) => playMap.get(playName) ?? null)
        .filter((play): play is (typeof plays)[number] => play !== null),
    }));
  });
  protected readonly installPlanReasonings = signal<Map<string, string>>(new Map());
  private readonly installNotesFormatCache = new Map<string, readonly string[]>();

  // ── Practice Scripts: Script matrix workspace ───────────────────────────────
  protected readonly practiceScripts = signal<readonly PracticeScriptSummary[]>([]);
  protected readonly practiceScriptsLoading = signal(false);
  protected readonly selectedPracticeScriptId = signal<string | null>(null);
  protected readonly selectedPracticeScriptDetail = signal<PracticeScriptDetail | null>(null);
  protected readonly selectedPracticeScriptDetailLoading = signal(false);
  protected readonly generatingPracticeScript = signal(false);
  protected readonly deletingPracticeScriptId = signal<string | null>(null);
  protected readonly practiceScriptTotals = computed(() =>
    computePracticeScriptTotals(this.selectedPracticeScriptDetail())
  );

  // ── Game Plans: Opponent-specific play lists ───────────────────────────────────
  protected readonly gamePlans = signal<GamePlan[]>([]);
  protected readonly gamePlansLoading = signal(false);
  protected readonly gamePlanSaving = signal(false);
  protected readonly editingGamePlanId = signal<string | null>(null);
  protected readonly editingGamePlanPlays = signal<string[]>([]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  protected readonly showingDetail = computed(
    () => this.detailLoading() || this.selectedPlaybook() !== null
  );
  protected readonly hasTeamContext = computed(() => {
    const id = this._teamId();
    return typeof id === 'string' && id.trim().length > 0;
  });
  protected readonly activeSport = computed(
    () => this._inputSport() ?? this.selectedPlaybook()?.sport ?? ''
  );
  protected readonly sportConfig = computed(() => getSportPlaybookConfig(this.activeSport()));
  protected readonly playFilterLabels = computed(() => {
    const sport = this.activeSport().trim().toLowerCase();
    const config = this.sportConfig();
    const isFootball = sport.includes('football');

    return {
      personnel: config.personnelLabel || 'Personnel',
      category: isFootball ? 'Side' : config.defaultCategory || 'Category',
      concept: isFootball ? 'Concept' : 'Concept Tag',
    } as const;
  });
  protected readonly totalPlays = computed(() => this.selectedPlaybook()?.plays?.length ?? 0);

  @Input()
  set teamId(value: string | null | undefined) {
    const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    if (normalized === this._teamId()) return;
    this._teamId.set(normalized);
    this.clearSelection();
    void this.loadPlaybooks();
  }

  @Input()
  set sport(value: string | null | undefined) {
    const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    this._inputSport.set(normalized);
  }

  constructor() {
    void this.loadPlaybooks();
  }

  protected clearSelection(): void {
    this.selectedPlaybook.set(null);
    this.exportError.set(null);
    this._playFilters.set({});
    this.detailLoading.set(false);
    this.callsheetFilters.set({});
    this.askingCallsheetAi.set(false);
    this.callsheetAiRankings.set(new Map());
    this.callsheets.set([]);
    this.callsheetsLoading.set(false);
    this.selectedCallsheetId.set(null);
    this.selectedCallsheetDetail.set(null);
    this.selectedCallsheetDetailLoading.set(false);
    this.callsheetGroupDraft.set([]);
    this.callsheetGroupAddPlayDrafts.set({});
    this.callsheetGroupsSaving.set(false);
    this.callsheetPendingRemovalPlayName.set(null);
    this.collapsedCallsheetGroupIds.set(new Set());
    this.activeCallsheetGroupMenuId.set(null);
    this.practiceScripts.set([]);
    this.practiceScriptsLoading.set(false);
    this.selectedPracticeScriptId.set(null);
    this.selectedPracticeScriptDetail.set(null);
    this.selectedPracticeScriptDetailLoading.set(false);
    this.generatingPracticeScript.set(false);
    this.deletingPracticeScriptId.set(null);
    this.installPlanReasonings.set(new Map());
    this.gamePlans.set([]);
    this.gamePlansLoading.set(false);
    this.gamePlanSaving.set(false);
    this.editingGamePlanId.set(null);
    this.editingGamePlanPlays.set([]);
    this.editingMeta.set(false);
    this.cancelEditPlay();
    this.deletingPlayIndex.set(null);
  }

  public isDetailView(): boolean {
    return this.showingDetail();
  }

  public getHeaderTitle(): string {
    const playbook = this.selectedPlaybook();
    return (playbook?.title || playbook?.name || 'Playbooks').trim();
  }

  public backToList(): void {
    this.clearSelection();
  }

  protected reload(): void {
    this.clearSelection();
    void this.loadPlaybooks();
  }

  protected async exportPlaybookPdf(mode: 'current' | 'full'): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.exportingPdf()) return;

    this.exportingPdf.set(true);
    this.exportError.set(null);

    this.logger.info('Starting playbook PDF export', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      mode,
      activeTab: this.activePlaybookTab(),
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:export', {
      status: 'pending',
      mode,
      activeTab: this.activePlaybookTab(),
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_EXPORT_REQUESTED, {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
      mode,
      activeTab: this.activePlaybookTab(),
    });

    try {
      const response = await firstValueFrom(
        this.http.post<PlaybookPdfExportResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/export-pdf`,
          {
            teamId: playbook.teamId,
            sport: this.activeSport() || playbook.sport,
            mode,
            activeTab: this.activePlaybookTab(),
            callsheetFilters: this.callsheetFilters(),
            practiceScriptId: this.selectedPracticeScriptId() ?? undefined,
          }
        )
      );

      if (!response.success || !response.data?.downloadUrl) {
        throw new Error(response.error ?? 'Unable to export playbook PDF');
      }

      if (typeof window !== 'undefined') {
        window.open(response.data.downloadUrl, '_blank', 'noopener');
      }

      this.breadcrumb.trackStateChange('agent-x:playbooks:export', {
        status: 'success',
        mode,
        activeTab: this.activePlaybookTab(),
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_EXPORT_SUCCEEDED, {
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        mode,
        activeTab: this.activePlaybookTab(),
        sizeBytes: response.data.sizeBytes ?? 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to export playbook PDF';
      this.exportError.set(message);
      this.logger.error('Playbook PDF export failed', err, {
        playbookId: playbook.id,
        teamId: playbook.teamId,
        mode,
        activeTab: this.activePlaybookTab(),
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:export', {
        status: 'failed',
        mode,
        activeTab: this.activePlaybookTab(),
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_EXPORT_FAILED, {
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        mode,
        activeTab: this.activePlaybookTab(),
      });
    } finally {
      this.exportingPdf.set(false);
    }
  }

  protected openPrintPreview(): void {
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'playbook_print_preview_opened',
      playbookId: this.selectedPlaybook()?.id,
      teamId: this.selectedPlaybook()?.teamId,
      sport: this.selectedPlaybook()?.sport,
      activeTab: this.activePlaybookTab(),
    });

    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  protected selectPlaybook(playbook: PlaybookSummary): void {
    this.detailLoading.set(true);
    this.selectedPlaybook.set(null);
    this._playFilters.set({});
    this.callsheetFilters.set({});
    this.callsheetAiRankings.set(new Map());
    this.callsheets.set([]);
    this.callsheetsLoading.set(false);
    this.selectedCallsheetId.set(null);
    this.selectedCallsheetDetail.set(null);
    this.selectedCallsheetDetailLoading.set(false);
    this.practiceScripts.set([]);
    this.practiceScriptsLoading.set(false);
    this.selectedPracticeScriptId.set(null);
    this.selectedPracticeScriptDetail.set(null);
    this.selectedPracticeScriptDetailLoading.set(false);
    this.generatingPracticeScript.set(false);
    this.deletingPracticeScriptId.set(null);
    this.installPlanReasonings.set(new Map());
    void this.loadPlaybookDetail(playbook.id);
  }

  // ── Playbook CRUD ────────────────────────────────────────────────────────────

  protected startCreate(): void {
    this.newPlaybook.set({ ...EMPTY_NEW_PLAYBOOK });
    this.showCreateForm.set(true);
  }

  protected startCreatePlaybookChat(): void {
    const sport = this.activeSport().trim().toLowerCase();
    const prompt =
      `Create a complete ${sport || 'team'} playbook for my team. ` +
      'Start by asking for our core identity, personnel strengths, and install timeline, then draft formations, plays, coaching points, and install sequencing.';

    this.logger.info('Starting create-playbook chat from playbooks panel', {
      teamId: this._teamId(),
      sport: sport || undefined,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:create-chat', {
      status: 'chat-started',
      sport: sport || undefined,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'create_playbook_chat_started',
      teamId: this._teamId(),
      sport: sport || undefined,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected startCreateCallsheetChat(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const prompt =
      `Build a complete weekly game callsheet for ${playbook.name} (${playbook.sport}). ` +
      'Start by asking for the opponent, game-plan priorities, base personnel grouping, opener/script expectations, must-have situations, constraint alerts, and any plays we want featured or avoided. Then organize a clean coach-ready callsheet with opening script, core menu, shot/change-up section, pressure answers, backed-up, coming-out, red-zone, goal-line, short-yardage, third-down, two-minute, four-minute, and end-of-game adjustment sections as appropriate for the sport. Rank the best calls within each section, include why each call belongs there, and save the finished callsheet.';

    this.logger.info('Starting create-callsheet chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:callsheet-create', {
      status: 'chat-started',
      playbookId: playbook.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'callsheet_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected startSituationalFinderChat(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const prompt =
      `Run a situational finder workflow for ${playbook.name} (${playbook.sport}). ` +
      'Ask for down/distance, field position, game clock, personnel package, and opponent look, then rank our best plays with reasoning and offer to save as a callsheet.';

    this.logger.info('Starting situational-finder chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:situational-finder', {
      status: 'chat-started',
      playbookId: playbook.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'situational_finder_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected startSituationCallsChat(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const situation = this.getCallsheetSituationText();
    const prompt =
      `Generate calls for this game situation from ${playbook.name} (${playbook.sport}): ${situation}. ` +
      'Treat this like a coach building an in-game menu. Ask one or two follow-up questions only if critical context is missing, then produce the best available calls, explain the sequencing, identify what to call first versus fallback answers, and offer to save the result as a callsheet section.';

    this.logger.info('Starting situation-calls chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
      situation,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:situation-calls', {
      status: 'chat-started',
      playbookId: playbook.id,
      situation,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'situation_calls_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
      situation,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected startCreatePracticeScriptChat(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const prompt =
      `Build a professional practice script matrix for ${playbook.name} (${playbook.sport}). ` +
      'Start by asking for practice focus, period count, tempo, and staff constraints. Then output a coach-ready script with each period including clock, reps, call type, call, coaching point, and notes.';

    this.logger.info('Starting practice-script chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:practice-script-create', {
      status: 'chat-started',
      playbookId: playbook.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'practice_script_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected async generatePracticeScriptDraft(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.generatingPracticeScript()) return;

    this.generatingPracticeScript.set(true);
    this.error.set(null);

    try {
      const generated = await firstValueFrom(
        this.http.post<PracticeScriptAiResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-script-ai`,
          {
            teamId: playbook.teamId,
            sport: this.activeSport() || playbook.sport,
            focus: 'Weekly install and situational execution',
          }
        )
      );

      if (!generated.success || !generated.data) {
        throw new Error(generated.error ?? 'Unable to generate practice script');
      }

      const saved = await firstValueFrom(
        this.http.post<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts`,
          {
            teamId: playbook.teamId,
            title: generated.data.title,
            focus: generated.data.focus,
            tempo: generated.data.tempo,
            objectives: generated.data.objectives,
            periods: normalizePracticeScriptPeriods(generated.data.periods),
            notes: generated.data.notes ?? '',
            source: 'agent_x_ai',
          }
        )
      );

      if (!saved.success) {
        throw new Error(saved.error ?? 'Unable to save generated practice script');
      }

      await this.loadPracticeScriptsForSelectedPlaybook();
      const latest = this.practiceScripts()[0];
      if (latest?.id) {
        this.selectedPracticeScriptId.set(latest.id);
        await this.loadSelectedPracticeScriptDetail(latest.id);
      }

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'practice_script_generated_and_saved',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to generate practice script');
    } finally {
      this.generatingPracticeScript.set(false);
    }
  }

  protected togglePracticeScript(scriptId: string): void {
    if (this.selectedPracticeScriptId() === scriptId) {
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      return;
    }

    this.selectedPracticeScriptId.set(scriptId);
    void this.loadSelectedPracticeScriptDetail(scriptId);
  }

  protected async exportSavedPracticeScript(scriptId: string): Promise<void> {
    if (this.exportingPdf()) return;

    this.selectedPracticeScriptId.set(scriptId);
    await this.loadSelectedPracticeScriptDetail(scriptId);
    await this.exportPlaybookPdf('current');
  }

  protected async deletePracticeScript(scriptId: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.deletingPracticeScriptId()) return;

    this.deletingPracticeScriptId.set(scriptId);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts/${scriptId}`,
          { params: { teamId: playbook.teamId } }
        )
      );

      if (this.selectedPracticeScriptId() === scriptId) {
        this.selectedPracticeScriptId.set(null);
        this.selectedPracticeScriptDetail.set(null);
        this.selectedPracticeScriptDetailLoading.set(false);
      }

      await this.loadPracticeScriptsForSelectedPlaybook();
    } catch {
      this.error.set('Unable to delete practice script right now. Please try again.');
    } finally {
      this.deletingPracticeScriptId.set(null);
    }
  }

  protected selectCallsheet(callsheetId: string): void {
    this.selectedCallsheetId.set(callsheetId);
    void this.loadSelectedCallsheetDetail(callsheetId);
  }

  protected toggleCallsheet(callsheetId: string): void {
    if (this.selectedCallsheetId() === callsheetId) {
      this.selectedCallsheetId.set(null);
      this.selectedCallsheetDetail.set(null);
      this.selectedCallsheetDetailLoading.set(false);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      return;
    }

    this.selectCallsheet(callsheetId);
  }

  protected async exportSavedCallsheet(callsheetId: string): Promise<void> {
    if (this.exportingPdf()) return;

    this.selectedCallsheetId.set(callsheetId);
    await this.loadSelectedCallsheetDetail(callsheetId);
    await this.exportPlaybookPdf('current');
  }

  protected addCallsheetGroup(): void {
    const detail = this.selectedCallsheetDetail();
    if (!detail) return;

    const plays = detail.plays ?? [];
    const groups = this.normalizeCallsheetGroupsForUi(this.callsheetGroupDraft(), plays);
    const nextIndex = groups.length + 1;
    const nextGroup: CallsheetGroup = {
      id: this.createCallsheetGroupId(nextIndex),
      name: `Group ${nextIndex}`,
      playNames: [],
    };
    this.callsheetGroupDraft.set([...groups, nextGroup]);
    this.collapsedCallsheetGroupIds.update((collapsed) => {
      const next = new Set(collapsed);
      next.delete(nextGroup.id);
      return next;
    });
    this.callsheetGroupAddPlayDrafts.update((drafts) => ({
      ...drafts,
      [nextGroup.id]: '',
    }));
  }

  protected callsheetGroupAddPlayDraft(groupId: string): string {
    return this.callsheetGroupAddPlayDrafts()[groupId] ?? '';
  }

  protected setCallsheetGroupAddPlayDraft(groupId: string, event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.callsheetGroupAddPlayDrafts.update((drafts) => ({
      ...drafts,
      [groupId]: target?.value ?? '',
    }));
  }

  protected getCallsheetGroupAvailablePlayNames(groupId: string): string[] {
    const detail = this.selectedCallsheetDetail();
    const plays = detail?.plays ?? [];
    const allPlayNames = Array.from(
      new Set(plays.map((play) => play.playName).filter((playName) => playName.trim()))
    );
    const groups = this.normalizeCallsheetGroupsForUi(this.callsheetGroupDraft(), plays);
    const target = groups.find((group) => group.id === groupId);
    if (!target) return allPlayNames;

    const inTarget = new Set(target.playNames);
    return allPlayNames.filter((playName) => !inTarget.has(playName));
  }

  protected addPlayToCallsheetGroup(groupId: string): void {
    const playName = this.callsheetGroupAddPlayDraft(groupId).trim();
    if (!playName) return;

    this.callsheetGroupDraft.update((groups) => {
      const withoutPlay = groups.map((group) => ({
        ...group,
        playNames: group.playNames.filter((candidate) => candidate !== playName),
      }));

      return withoutPlay.map((group) =>
        group.id === groupId
          ? {
              ...group,
              playNames: Array.from(new Set([...group.playNames, playName])),
            }
          : group
      );
    });

    this.callsheetGroupAddPlayDrafts.update((drafts) => ({
      ...drafts,
      [groupId]: '',
    }));
  }

  protected isCallsheetGroupExpanded(groupId: string): boolean {
    return !this.collapsedCallsheetGroupIds().has(groupId);
  }

  protected toggleCallsheetGroupExpansion(groupId: string, event: Event): void {
    event.stopPropagation();
    this.collapsedCallsheetGroupIds.update((collapsed) => {
      const next = new Set(collapsed);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  protected isCallsheetGroupMenuOpen(groupId: string): boolean {
    return this.activeCallsheetGroupMenuId() === groupId;
  }

  protected isEditingCallsheetGroup(groupId: string): boolean {
    return this.editingCallsheetGroupId() === groupId;
  }

  protected isDeletingCallsheetGroup(groupId: string): boolean {
    return this.deletingCallsheetGroupId() === groupId;
  }

  protected onOpenCallsheetGroupMenu(
    event: Event,
    group: ReturnType<typeof this.selectedCallsheetGroups>[number]
  ): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.activeCallsheetGroupMenuId() === group.id) {
      this.closeCallsheetGroupMenu();
      return;
    }

    this.activeCallsheetGroupMenuId.set(group.id);
    this.editingCallsheetGroupId.set(null);
    this.deletingCallsheetGroupId.set(null);
    this.callsheetGroupMenuRenameDraft.set(group.name);
  }

  protected closeCallsheetGroupMenu(): void {
    this.activeCallsheetGroupMenuId.set(null);
    this.editingCallsheetGroupId.set(null);
    this.deletingCallsheetGroupId.set(null);
  }

  protected onCallsheetGroupRenameStart(
    group: ReturnType<typeof this.selectedCallsheetGroups>[number],
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();
    this.editingCallsheetGroupId.set(group.id);
    this.deletingCallsheetGroupId.set(null);
    this.callsheetGroupMenuRenameDraft.set(group.name);
  }

  protected onCallsheetGroupRenameInput(value: string): void {
    this.callsheetGroupMenuRenameDraft.set(value);
  }

  protected onCallsheetGroupRenameConfirm(
    group: ReturnType<typeof this.selectedCallsheetGroups>[number],
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();
    this.renameCallsheetGroup(group.id, this.callsheetGroupMenuRenameDraft());
    this.closeCallsheetGroupMenu();
  }

  protected onCallsheetGroupRenameCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.editingCallsheetGroupId.set(null);
    this.deletingCallsheetGroupId.set(null);
  }

  protected onCallsheetGroupDeleteStart(
    group: ReturnType<typeof this.selectedCallsheetGroups>[number],
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();
    this.deletingCallsheetGroupId.set(group.id);
    this.editingCallsheetGroupId.set(null);
  }

  protected onCallsheetGroupDeleteConfirm(
    group: ReturnType<typeof this.selectedCallsheetGroups>[number],
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();
    this.removeCallsheetGroup(group.id);
    this.closeCallsheetGroupMenu();
  }

  protected onCallsheetGroupDeleteCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.deletingCallsheetGroupId.set(null);
    this.editingCallsheetGroupId.set(null);
  }

  protected renameCallsheetGroup(groupId: string, rawName: string): void {
    const name = rawName;
    this.callsheetGroupDraft.update((groups) =>
      groups.map((group) => (group.id === groupId ? { ...group, name } : group))
    );
  }

  protected removeCallsheetGroup(groupId: string): void {
    const detail = this.selectedCallsheetDetail();
    if (!detail) return;

    const plays = detail.plays ?? [];
    const groups = this.normalizeCallsheetGroupsForUi(this.callsheetGroupDraft(), plays);
    const targetIndex = groups.findIndex((group) => group.id === groupId);
    if (targetIndex < 0 || groups.length <= 1) return;

    const target = groups[targetIndex];
    const fallbackIndex = targetIndex === 0 ? 1 : 0;
    const fallback = groups[fallbackIndex];
    const mergedFallback: CallsheetGroup = {
      ...fallback,
      playNames: Array.from(new Set([...fallback.playNames, ...target.playNames])),
    };

    const next = groups
      .filter((group) => group.id !== groupId)
      .map((group) => (group.id === mergedFallback.id ? mergedFallback : group));

    this.callsheetGroupDraft.set(next);
    this.collapsedCallsheetGroupIds.update((collapsed) => {
      const collapsedNext = new Set(collapsed);
      collapsedNext.delete(groupId);
      return collapsedNext;
    });
    this.callsheetGroupAddPlayDrafts.update((drafts) => {
      const nextDrafts = { ...drafts };
      delete nextDrafts[groupId];
      return nextDrafts;
    });
  }

  protected moveCallsheetPlayToGroup(playName: string, event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const destinationGroupId = target?.value ?? '';
    if (!destinationGroupId) return;

    this.callsheetGroupDraft.update((groups) => {
      const withoutPlay = groups.map((group) => ({
        ...group,
        playNames: group.playNames.filter((name) => name !== playName),
      }));

      return withoutPlay.map((group) =>
        group.id === destinationGroupId
          ? {
              ...group,
              playNames: Array.from(new Set([...group.playNames, playName])),
            }
          : group
      );
    });
  }

  protected requestRemovePlayFromCallsheet(playName: string): void {
    this.callsheetPendingRemovalPlayName.set(playName);
  }

  protected cancelRemovePlayFromCallsheet(): void {
    this.callsheetPendingRemovalPlayName.set(null);
  }

  protected async confirmRemovePlayFromCallsheet(playName: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    const detail = this.selectedCallsheetDetail();
    if (!playbook?.id || !playbook.teamId || !detail?.id || this.callsheetGroupsSaving()) return;

    const nextPlays = (detail.plays ?? []).filter((play) => play.playName !== playName);
    const nextGroupsDraft = this.callsheetGroupDraft().map((group) => ({
      ...group,
      playNames: group.playNames.filter((candidate) => candidate !== playName),
    }));
    const nextGroups = this.normalizeCallsheetGroupsForUi(nextGroupsDraft, nextPlays);

    this.callsheetGroupsSaving.set(true);
    try {
      await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/callsheets/${detail.id}`,
          {
            teamId: playbook.teamId,
            plays: nextPlays,
            groups: nextGroups,
          }
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'callsheet_play_removed',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });

      await this.loadSelectedCallsheetDetail(detail.id);
      await this.loadCallsheetsForSelectedPlaybook();
      this.selectedCallsheetId.set(detail.id);
      this.callsheetPendingRemovalPlayName.set(null);
    } catch {
      this.error.set('Unable to remove play from callsheet right now. Please try again.');
    } finally {
      this.callsheetGroupsSaving.set(false);
    }
  }

  protected async saveCallsheetGroups(): Promise<void> {
    const playbook = this.selectedPlaybook();
    const detail = this.selectedCallsheetDetail();
    if (!playbook?.id || !playbook.teamId || !detail?.id || this.callsheetGroupsSaving()) return;

    const groups = this.normalizeCallsheetGroupsForUi(this.callsheetGroupDraft(), detail.plays);
    this.callsheetGroupsSaving.set(true);

    try {
      await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/callsheets/${detail.id}`,
          {
            teamId: playbook.teamId,
            groups,
          }
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'callsheet_groups_saved',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });

      await this.loadSelectedCallsheetDetail(detail.id);
      await this.loadCallsheetsForSelectedPlaybook();
      this.selectedCallsheetId.set(detail.id);
    } catch {
      this.error.set('Unable to save callsheet groups right now. Please try again.');
    } finally {
      this.callsheetGroupsSaving.set(false);
    }
  }

  protected openPlaybookImportPicker(input: HTMLInputElement): void {
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'import_playbook_picker_opened',
      teamId: this._teamId(),
      sport: this.activeSport() || undefined,
    });
    input.click();
  }

  protected onImportPlaybookFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const files = target?.files ? Array.from(target.files) : [];
    if (!files.length) return;

    this.agentX.addFiles(files);

    const sport = this.activeSport().trim().toLowerCase();
    const prompt =
      `Import the attached files and build a clean ${sport || 'team'} playbook draft. ` +
      'Extract formations, plays, install notes, and coaching points, then ask me to confirm before saving anything. Format install notes as clean line items (one instruction per line), and avoid markdown emphasis.';

    this.logger.info('Queued playbook import files for Agent X', {
      teamId: this._teamId(),
      sport: sport || undefined,
      fileCount: files.length,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:import', {
      status: 'files-staged',
      fileCount: files.length,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'import_playbook_files_staged',
      teamId: this._teamId(),
      sport: sport || undefined,
      fileCount: files.length,
    });

    this.agentX.queueStartupMessage(prompt);

    if (target) target.value = '';
  }
  protected cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newPlaybook.set({ ...EMPTY_NEW_PLAYBOOK });
  }
  protected patchNewPlaybook(field: keyof NewPlaybookForm, event: Event): void {
    this.newPlaybook.update((p) => ({ ...p, [field]: (event.target as HTMLInputElement).value }));
  }
  protected async createPlaybook(): Promise<void> {
    const form = this.newPlaybook();
    const sport = this.activeSport().trim().toLowerCase();
    if (!form.name.trim() || !sport) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post<MutationResponse>(`${this.baseUrl}/playbooks`, {
          teamId: this._teamId(),
          name: toTitleCase(form.name),
          sport,
          season: form.season.trim() || undefined,
        })
      );
      this.cancelCreate();
      await this.loadPlaybooks();
    } catch {
      /* surface via next error state */
    } finally {
      this.saving.set(false);
    }
  }

  protected startEditPlaybook(playbook: PlaybookSummary, event: Event): void {
    event.stopPropagation();
    this.editingPlaybookId.set(playbook.id);
    this.editPlaybookForm.set({
      name: playbook.name,
      season: playbook.season ?? '',
      source: playbook.source ?? '',
    });
  }
  protected cancelEditPlaybook(): void {
    this.editingPlaybookId.set(null);
    this.editPlaybookForm.set({ ...EMPTY_EDIT_PLAYBOOK });
  }
  protected patchEditPlaybook(field: keyof EditPlaybookForm, event: Event): void {
    this.editPlaybookForm.update((p) => ({
      ...p,
      [field]: (event.target as HTMLInputElement).value,
    }));
  }
  protected async saveEditPlaybook(playbookId: string): Promise<void> {
    const form = this.editPlaybookForm();
    if (!form.name.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.patch<MutationResponse>(`${this.baseUrl}/playbooks/${playbookId}`, {
          name: toTitleCase(form.name),
          season: form.season.trim() || null,
          source: form.source.trim() || null,
        })
      );
      this.cancelEditPlaybook();
      this.editingMeta.set(false);
      if (this.selectedPlaybook()?.id === playbookId) {
        await this.loadPlaybookDetail(playbookId);
      } else {
        await this.loadPlaybooks();
      }
    } catch {
      /* noop */
    } finally {
      this.saving.set(false);
    }
  }

  protected startEditMeta(): void {
    const pb = this.selectedPlaybook();
    if (!pb) return;
    this.editPlaybookForm.set({ name: pb.name, season: pb.season ?? '', source: pb.source ?? '' });
    this.editingMeta.set(true);
  }
  protected cancelEditMeta(): void {
    this.editingMeta.set(false);
    this.editPlaybookForm.set({ ...EMPTY_EDIT_PLAYBOOK });
  }

  protected confirmDeletePlaybook(playbook: PlaybookSummary, event: Event): void {
    event.stopPropagation();
    this.deletingPlaybookId.set(playbook.id);
  }
  protected cancelDeletePlaybook(): void {
    this.deletingPlaybookId.set(null);
  }
  protected async deletePlaybook(playbookId: string): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(`${this.baseUrl}/playbooks/${playbookId}`)
      );
      this.deletingPlaybookId.set(null);
      await this.loadPlaybooks();
    } catch {
      /* noop */
    } finally {
      this.saving.set(false);
    }
  }

  // ── Play CRUD ────────────────────────────────────────────────────────────────

  protected startAddPlay(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const prompt =
      `Create a new play for my ${playbook.sport} playbook "${playbook.title || playbook.name}". ` +
      'Ask me for the key details you need, then draft the play with formation, personnel, objective, coaching points, and install notes as clean line items (no markdown formatting). Make play breakdown one clean paragraph only (5-8 sentences, no bullets), with practical tactical detail on assignments, read progression, and why it works vs common defensive looks.';

    this.logger.info('Starting add-play chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:add-play-chat', {
      status: 'chat-started',
      playbookId: playbook.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'add_play_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected async startEditPlay(index: number, play: PlaybookPlay): Promise<void> {
    this.editingPlayIndex.set(index);
    this.editPlayDiagramFile.set(null);
    this.editPlayForm.set({
      name: play.name ?? play.title ?? '',
      series: play.series ?? '',
      category: play.category ?? '',
      formation: play.formation ?? '',
      personnel: play.personnel ?? '',
      objective: play.objective ?? '',
      playBreakdown: play.playBreakdown ?? '',
      installNotes: play.installNotes ?? '',
      conceptTags: (play.conceptTags ?? []).join(', '),
      diagramUrl: play.diagramUrl ?? '',
      installStage: (play.installStage ?? '') as 'install' | 'rep' | 'game-ready' | '',
      coachingPoints: (play.coachingPoints ?? []).join('\n'),
      commonBusts: (play.commonBusts ?? []).join('\n'),
      correctionCues: (play.correctionCues ?? []).join('\n'),
      drillProgression: (play.drillProgression ?? []).join('\n'),
      situations: (play.situations ?? []).join(', '),
    });

    if (play.diagramUrl) {
      await this.seedDiagramEditInAgentChat(play);
    }
  }
  protected cancelEditPlay(): void {
    this.editingPlayIndex.set(null);
    this.editPlayForm.set({ ...EMPTY_PLAY_FORM });
    this.editPlayDiagramFile.set(null);
  }
  protected patchEditPlayForm(field: keyof PlayForm, event: Event): void {
    this.editPlayForm.update((p) => ({
      ...p,
      [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value,
    }));
  }
  protected async saveEditPlay(index: number): Promise<void> {
    const form = this.editPlayForm();
    const playbook = this.selectedPlaybook();
    if (!form.name.trim() || !playbook) return;
    this.savingPlay.set(true);
    try {
      const uploadedDiagramUrl = await this.uploadEditPlayDiagramIfNeeded();
      const nextDiagramUrl =
        uploadedDiagramUrl ?? (form.diagramUrl.trim().length ? form.diagramUrl.trim() : undefined);

      await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/plays/${index}`,
          {
            name: toTitleCase(form.name),
            series: form.series.trim() || undefined,
            category: form.category.trim() || undefined,
            formation: form.formation.trim() || undefined,
            personnel: form.personnel.trim() || undefined,
            objective: form.objective.trim() || undefined,
            playBreakdown: form.playBreakdown.trim() || undefined,
            installNotes: form.installNotes.trim() || undefined,
            diagramUrl: nextDiagramUrl,
            conceptTags: parseTags(form.conceptTags),
            installStage: form.installStage || undefined,
            coachingPoints: this.parseLineList(form.coachingPoints),
            commonBusts: this.parseLineList(form.commonBusts),
            correctionCues: this.parseLineList(form.correctionCues),
            drillProgression: this.parseLineList(form.drillProgression),
            situations: this.parseCommaList(form.situations),
          }
        )
      );
      this.cancelEditPlay();
      await this.loadPlaybookDetail(playbook.id);
    } catch {
      /* noop */
    } finally {
      this.savingPlay.set(false);
    }
  }

  protected onEditDiagramFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (target) target.value = '';
      return;
    }
    this.editPlayDiagramFile.set(file);
    if (target) target.value = '';
  }

  protected confirmDeletePlay(index: number): void {
    this.deletingPlayIndex.set(index);
  }
  protected cancelDeletePlay(): void {
    this.deletingPlayIndex.set(null);
  }
  protected async deletePlay(index: number): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook) return;
    this.savingPlay.set(true);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/plays/${index}`
        )
      );
      this.deletingPlayIndex.set(null);
      await this.loadPlaybookDetail(playbook.id);
    } catch {
      /* noop */
    } finally {
      this.savingPlay.set(false);
    }
  }

  // ── Formatters ───────────────────────────────────────────────────────────────

  protected formatDate(value?: string): string {
    return formatDateValue(value);
  }

  private parseLineList(value: string): string[] {
    return value
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private parseCommaList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  // ── AI Callsheet Methods ─────────────────────────────────────────────────────
  protected onCallsheetFilterChange(key: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    const value = target?.value ?? '';
    this.callsheetFilters.update((current) => ({
      ...current,
      [key]: value,
    }));
    this.callsheetAiRankings.set(new Map());
    this.onCallsheetQueryChange();
  }

  protected callsheetAiRankingForPlay(playName: string): { score: number; reasoning: string } {
    if (!playName) return { score: 0, reasoning: '' };
    return this.callsheetAiRankings().get(playName) ?? { score: 0, reasoning: '' };
  }

  protected getInstallReasoning(playName?: string): string {
    if (!playName) return '';
    return this.installPlanReasonings().get(playName) ?? '';
  }

  protected onCallsheetQueryChange(): void {
    const playbook = this.selectedPlaybook();
    const filters = this.callsheetFilters();
    const activeFilters = Object.fromEntries(
      Object.entries(filters)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0)
    );

    this.logger.info('AI callsheet query changed', {
      playbookId: playbook?.id,
      filters: activeFilters,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:callsheet-filter', {
      filters: activeFilters,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'callsheet_filter_changed',
      playbookId: playbook?.id,
      teamId: playbook?.teamId,
      sport: playbook?.sport,
      activeFilterCount: Object.keys(activeFilters).length,
      resultCount: this.filteredCallsheetPlays().length,
    });
  }

  protected async askAgentXForCallsheet(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.askingCallsheetAi()) return;

    this.askingCallsheetAi.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<CallsheetAiResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/callsheet-ai`,
          {
            teamId: playbook.teamId,
            sport: this.activeSport() || playbook.sport,
            situation: this.getCallsheetSituationText(),
          }
        )
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Unable to analyze callsheet');
      }

      const rankingMap = new Map<string, { score: number; reasoning: string }>();
      for (const entry of response.data?.plays ?? []) {
        const key = entry.playName.trim();
        if (!key) continue;
        rankingMap.set(key, {
          score: Math.max(0, Math.min(100, Math.round(entry.score))),
          reasoning: entry.reasoning,
        });
      }

      this.callsheetAiRankings.set(rankingMap);
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'callsheet_ai_ranked',
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        rankingCount: rankingMap.size,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to analyze callsheet');
    } finally {
      this.askingCallsheetAi.set(false);
    }
  }

  protected getInstallColumnTitle(stage: 'install' | 'rep' | 'game-ready'): string {
    if (stage === 'install') return 'Teaching';
    if (stage === 'rep') return 'Repetition';
    return 'Game Ready';
  }

  protected getPlayIndex(play: PlaybookPlay): number {
    const plays = this.selectedPlaybook()?.plays ?? [];
    const byRef = plays.indexOf(play);
    if (byRef >= 0) return byRef;

    if (play.id) {
      const byId = plays.findIndex((p) => p.id === play.id);
      if (byId >= 0) return byId;
    }

    return plays.findIndex((p) => p.name === play.name);
  }

  protected buildPlaybookDragContext(playbook: PlaybookSummary): AgentXSelectedContext {
    const title = playbook.title || playbook.name;

    return {
      id: `playbook:${playbook.id}`,
      kind: 'playbook_item',
      title,
      summary: `${playbook.sport} playbook${playbook.season ? ` for ${playbook.season}` : ''}`,
      source: {
        type: 'playbook',
        id: playbook.id,
        label: title,
      },
      entityRefs: [{ type: 'playbook', id: playbook.id, label: title }],
      metadata: this.compactContextMetadata({
        itemType: 'playbook',
        teamId: playbook.teamId,
        sport: playbook.sport,
        season: playbook.season,
        playCount: playbook.playCount ?? null,
        updatedAt: playbook.updatedAt,
        createdAt: playbook.createdAt,
      }),
    };
  }

  protected buildPlaybookPlayDragContext(
    play: PlaybookPlay,
    fallbackIndex: number
  ): AgentXSelectedContext {
    const playbook = this.selectedPlaybook();
    const playLabel = play.title || play.name || `Play ${fallbackIndex + 1}`;
    const playId = play.id || play.name || String(fallbackIndex);
    const entityRefs = [
      ...(playbook?.id
        ? [
            {
              type: 'playbook',
              id: playbook.id,
              label: playbook.title || playbook.name,
            },
          ]
        : []),
      { type: 'playbook_play', id: playId, label: playLabel },
    ];

    return {
      id: `playbook-play:${playbook?.id ?? 'active'}:${playId}`,
      kind: 'playbook_item',
      title: playLabel,
      ...(play.playBreakdown
        ? { summary: play.playBreakdown }
        : play.objective
          ? { summary: play.objective }
          : {}),
      source: {
        type: 'playbook',
        ...(playbook?.id ? { id: playbook.id } : {}),
        label: playbook?.title || playbook?.name || 'Playbook',
      },
      entityRefs,
      media: {
        ...(play.videoUrl ? { videoUrl: play.videoUrl } : {}),
        ...(play.diagramUrl ? { imageUrl: play.diagramUrl } : {}),
      },
      metadata: this.compactContextMetadata({
        itemType: 'playbook_play',
        playbookId: playbook?.id,
        teamId: playbook?.teamId,
        sport: playbook?.sport,
        series: play.series,
        category: play.category,
        formation: play.formation,
        personnel: play.personnel,
        downDistance: play.downDistance,
        installStage: play.installStage,
        playBreakdown: play.playBreakdown,
        installNotes: play.installNotes,
        conceptTags: play.conceptTags?.join(', '),
        tags: play.tags?.join(', '),
        situations: play.situations?.join(', '),
        successRate: play.successRate ?? null,
        typicalGain: play.typicalGain ?? null,
      }),
    };
  }

  protected buildPlaybookGamePlanDragContext(plan: GamePlan): AgentXSelectedContext {
    const playbook = this.selectedPlaybook();
    const title = plan.title || `${plan.opponent} Game Plan`;

    return {
      id: `playbook-game-plan:${plan.id}`,
      kind: 'game_plan_item',
      title,
      ...(plan.notes ? { summary: plan.notes } : {}),
      source: {
        type: 'game_plan',
        id: plan.id,
        label: title,
      },
      entityRefs: [
        { type: 'game_plan', id: plan.id, label: title },
        ...(playbook?.id
          ? [{ type: 'playbook', id: playbook.id, label: playbook.title || playbook.name }]
          : []),
      ],
      metadata: this.compactContextMetadata({
        itemType: 'playbook_game_plan',
        teamId: plan.teamId,
        sport: plan.sport,
        opponent: plan.opponent,
        playCount: plan.plays.length,
        plays: plan.plays.join(', '),
        updatedAt: plan.updatedAt,
        createdAt: plan.createdAt,
      }),
    };
  }

  protected buildCallsheetDragContext(
    callsheet: CallsheetSummary | CallsheetDetail
  ): AgentXSelectedContext {
    const playbook = this.selectedPlaybook();
    const title = callsheet.title.trim();
    const summaryParts = [
      callsheet.situation?.trim() || undefined,
      `${callsheet.playCount ?? 0} calls`,
      callsheet.archived ? 'archived' : undefined,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

    return {
      id: `callsheet:${callsheet.id}`,
      kind: 'playbook_item',
      title,
      ...(summaryParts.length > 0 ? { summary: summaryParts.join(' • ') } : {}),
      source: {
        type: 'playbook',
        ...(playbook?.id ? { id: playbook.id } : {}),
        label: playbook?.title || playbook?.name || 'Playbook',
      },
      entityRefs: [
        ...(playbook?.id
          ? [{ type: 'playbook', id: playbook.id, label: playbook.title || playbook.name }]
          : []),
        { type: 'callsheet', id: callsheet.id, label: title },
      ],
      metadata: this.compactContextMetadata({
        itemType: 'callsheet',
        teamId: callsheet.teamId,
        playbookId: callsheet.playbookId,
        sport: callsheet.sport,
        situation: callsheet.situation,
        playCount: callsheet.playCount,
        groupCount:
          'groupCount' in callsheet && typeof callsheet.groupCount === 'number'
            ? callsheet.groupCount
            : undefined,
        topPlayName: callsheet.topPlayName ?? null,
        archived: callsheet.archived ?? false,
        updatedAt: callsheet.updatedAt,
        createdAt: callsheet.createdAt,
      }),
    };
  }

  private compactContextMetadata(
    metadata: Record<string, AgentXSelectedContextMetadataValue | undefined>
  ): Readonly<Record<string, AgentXSelectedContextMetadataValue>> {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        return typeof value !== 'string' || value.trim().length > 0;
      })
    ) as Readonly<Record<string, AgentXSelectedContextMetadataValue>>;
  }

  protected onInstallPlayDragStart(play: PlaybookPlay, event: DragEvent): void {
    const index = this.getPlayIndex(play);
    if (index < 0) return;

    this.draggingInstallPlayIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.setData(
        AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
        serializeAgentXSelectedContextForDrag(this.buildPlaybookPlayDragContext(play, index))
      );
    }
  }

  protected onInstallPlayDragEnd(): void {
    this.draggingInstallPlayIndex.set(null);
    this.installDragOverStage.set(null);
  }

  protected onInstallStageDragOver(
    stage: 'install' | 'rep' | 'game-ready',
    event: DragEvent
  ): void {
    if (this.draggingInstallPlayIndex() === null) return;
    event.preventDefault();
    this.installDragOverStage.set(stage);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected onInstallStageDragLeave(
    stage: 'install' | 'rep' | 'game-ready',
    event: DragEvent
  ): void {
    const target = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (target && related && target.contains(related)) return;
    if (this.installDragOverStage() === stage) {
      this.installDragOverStage.set(null);
    }
  }

  protected onInstallStageDrop(stage: 'install' | 'rep' | 'game-ready', event: DragEvent): void {
    event.preventDefault();
    this.installDragOverStage.set(null);

    const dataIndex = Number.parseInt(event.dataTransfer?.getData('text/plain') ?? '', 10);
    const dragIndex = Number.isInteger(dataIndex) ? dataIndex : this.draggingInstallPlayIndex();

    this.draggingInstallPlayIndex.set(null);
    if (dragIndex === null || dragIndex < 0) return;

    void this.movePlayToInstallStage(dragIndex, stage);
  }

  private async movePlayToInstallStage(
    playIndex: number,
    installStage: 'install' | 'rep' | 'game-ready'
  ): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id) return;

    const plays = [...(playbook.plays ?? [])];
    const targetPlay = plays[playIndex];
    if (!targetPlay) return;

    const currentStage = targetPlay.installStage ?? 'install';
    if (currentStage === installStage) return;

    this.savingPlay.set(true);

    const optimisticPlays = plays.map((play, index) =>
      index === playIndex ? { ...play, installStage } : play
    );
    this.selectedPlaybook.set({ ...playbook, plays: optimisticPlays });

    try {
      await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/plays/${playIndex}`,
          {
            installStage,
          }
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'play_install_stage_moved',
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        installStage,
      });
    } catch {
      this.selectedPlaybook.set(playbook);
      this.error.set('Unable to move play right now. Please try again.');
    } finally {
      this.savingPlay.set(false);
    }
  }

  private getCallsheetSituationText(): string {
    return buildCallsheetSituationText(
      this.callsheetFilters(),
      this.sportConfig().situationFilters
    );
  }

  private createCallsheetGroupId(index: number): string {
    const nonce = Math.random().toString(36).slice(2, 8);
    return `group_${Date.now().toString(36)}_${index}_${nonce}`;
  }

  private normalizeCallsheetGroupsForUi(
    groupsValue: readonly CallsheetGroup[] | undefined,
    playsValue: readonly { playName: string; score: number; reasoning: string }[] | undefined
  ): CallsheetGroup[] {
    const plays = playsValue ?? [];
    const playNames = plays
      .map((play) => play.playName.trim())
      .filter((playName) => playName.length > 0);
    const validNames = new Set(playNames);
    const groups = (groupsValue ?? [])
      .map((group, index) => ({
        id: group.id?.trim() || `group_${index + 1}`,
        name: group.name?.trim() || `Group ${index + 1}`,
        playNames: Array.from(
          new Set(group.playNames.map((name) => name.trim()).filter((name) => validNames.has(name)))
        ),
      }))
      .filter((group) => group.name.length > 0);

    if (groups.length === 0) {
      if (playNames.length === 0) return [];
      return [
        {
          id: 'group_1',
          name: 'Starter',
          playNames,
        },
      ];
    }

    const assignedNames = new Set<string>();
    for (const group of groups) {
      for (const playName of group.playNames) assignedNames.add(playName);
    }

    const unassigned = playNames.filter((playName) => !assignedNames.has(playName));
    if (unassigned.length > 0) {
      groups.push({
        id: this.createCallsheetGroupId(groups.length + 1),
        name: 'Other Calls',
        playNames: unassigned,
      });
    }

    return groups;
  }

  // ── Game Plan Methods ────────────────────────────────────────────────────────
  protected startCreateGamePlan(): void {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    const prompt =
      'Create a game plan for our upcoming game. Start by asking me the opponent, matchup priorities, and any constraints, then draft a complete plan with phases, key plays, and coaching points.';

    this.logger.info('Starting game plan chat from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-create', {
      status: 'chat-started',
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: 'gameplan_chat_started',
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
  }

  protected editGamePlan(planId: string): void {
    const plan = this.gamePlans().find((p) => p.id === planId);
    if (!plan) return;

    this.editingGamePlanId.set(planId);
    this.editingGamePlanPlays.set([...plan.plays]);
  }

  protected cancelEditGamePlan(): void {
    this.editingGamePlanId.set(null);
    this.editingGamePlanPlays.set([]);
  }

  protected togglePlayInGamePlan(playName: string): void {
    const plays = this.editingGamePlanPlays();
    const idx = plays.indexOf(playName);
    if (idx >= 0) {
      this.editingGamePlanPlays.set(plays.filter((_, i) => i !== idx));
    } else {
      this.editingGamePlanPlays.set([...plays, playName]);
    }
  }

  protected async saveGamePlanChanges(): Promise<void> {
    const planId = this.editingGamePlanId();
    const playbook = this.selectedPlaybook();
    if (!planId || !playbook?.id || !playbook.teamId) return;

    this.gamePlanSaving.set(true);
    this.logger.info('Updating opponent game plan plays', {
      planId,
      playbookId: playbook.id,
      teamId: playbook.teamId,
      playCount: this.editingGamePlanPlays().length,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-update', {
      status: 'pending',
    });

    try {
      const linkedPlays = this.editingGamePlanPlays().map((playName) => ({
        playbookId: playbook.id,
        playName,
      }));

      const response = await firstValueFrom(
        this.http.put<GamePlanDetailResponse>(`${this.baseUrl}/gameplans/${planId}`, {
          linkedPlays,
          linkedPlaybookIds: [playbook.id],
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update game plan');
      }

      this.analytics?.trackEvent(APP_EVENTS.GAMEPLAN_UPDATED, {
        teamId: playbook.teamId,
        playbookId: playbook.id,
        gamePlanId: planId,
        playCount: linkedPlays.length,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-update', {
        status: 'success',
      });
      this.cancelEditGamePlan();
      await this.loadGamePlansForSelectedPlaybook();
    } catch (err) {
      this.logger.error('Failed to update opponent game plan', err, {
        planId,
        playbookId: playbook.id,
        teamId: playbook.teamId,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-update', {
        status: 'failed',
      });
      this.error.set(err instanceof Error ? err.message : 'Failed to update game plan');
    } finally {
      this.gamePlanSaving.set(false);
    }
  }

  protected async deleteGamePlan(planId: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) return;

    this.gamePlanSaving.set(true);
    this.logger.info('Deleting opponent game plan', {
      planId,
      playbookId: playbook.id,
      teamId: playbook.teamId,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-delete', {
      status: 'pending',
    });

    try {
      const response = await firstValueFrom(
        this.http.delete<MutationResponse>(`${this.baseUrl}/gameplans/${planId}`)
      );
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete game plan');
      }
      this.analytics?.trackEvent(APP_EVENTS.GAMEPLAN_DELETED, {
        teamId: playbook.teamId,
        playbookId: playbook.id,
        gamePlanId: planId,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-delete', {
        status: 'success',
      });
      await this.loadGamePlansForSelectedPlaybook();
    } catch (err) {
      this.logger.error('Failed to delete opponent game plan', err, {
        planId,
        playbookId: playbook.id,
        teamId: playbook.teamId,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplan-delete', {
        status: 'failed',
      });
      this.error.set(err instanceof Error ? err.message : 'Failed to delete game plan');
    } finally {
      this.gamePlanSaving.set(false);
    }
  }

  protected getPlayNameById(playId: string): string | undefined {
    const playbook = this.selectedPlaybook();
    if (!playbook?.plays) return undefined;
    return playbook.plays.find((p) => p.name === playId)?.name;
  }

  protected getInstallStages(): readonly ('install' | 'rep' | 'game-ready')[] {
    return INSTALL_STAGES;
  }

  protected getStageDisplayName(stage: 'install' | 'rep' | 'game-ready'): string {
    return getStageDisplayNameValue(stage);
  }

  protected getPlaysByStage(stage: 'install' | 'rep' | 'game-ready'): readonly PlaybookPlay[] {
    const playbook = this.selectedPlaybook();
    if (!playbook?.plays) return [];
    return playbook.plays.filter((p) => (p.installStage ?? 'install') === stage);
  }

  protected getInstallNoteLines(play: PlaybookPlay): readonly string[] {
    return this.normalizeInstallNotes(play.installNotes);
  }

  protected countPlaysByStage(stage: 'install' | 'rep' | 'game-ready'): number {
    return this.getPlaysByStage(stage).length;
  }

  private normalizeInstallNotes(notes?: string): readonly string[] {
    const normalized = notes?.trim();
    if (!normalized) return [];

    const cached = this.installNotesFormatCache.get(normalized);
    if (cached) return cached;

    const cleaned = normalized
      .replace(/\r\n?/g, '\n')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .trim();

    let lines = cleaned
      .split(/\n+/)
      .flatMap((line) => line.split(/\s*[•|]\s*/))
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter((line) => line.length > 0);

    if (lines.length <= 1 && cleaned.length > 180) {
      lines = cleaned
        .split(/\s*;\s*|\.\s+(?=[A-Z0-9])/)
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter((line) => line.length > 0);
    }

    const compacted = lines.slice(0, 8);
    this.installNotesFormatCache.set(normalized, compacted);
    return compacted;
  }

  private async loadGamePlansForSelectedPlaybook(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.teamId || !playbook.sport) {
      this.gamePlans.set([]);
      return;
    }

    this.gamePlansLoading.set(true);
    this.logger.info('Loading opponent game plans', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:gameplans-load', {
      status: 'pending',
    });

    try {
      const listResponse = await firstValueFrom(
        this.http.get<GameplansResponse>(`${this.baseUrl}/gameplans`, {
          params: {
            teamId: playbook.teamId,
            sport: playbook.sport,
            limit: '24',
          },
        })
      );

      if (!listResponse.success) {
        throw new Error(listResponse.error ?? 'Unable to load game plans');
      }

      const summaries = listResponse.data?.gamePlans ?? [];
      const detailedPlans = await Promise.all(
        summaries.map(async (summary) => {
          const detailResponse = await firstValueFrom(
            this.http.get<GamePlanDetailResponse>(`${this.baseUrl}/gameplans/${summary.id}`)
          );
          return detailResponse.success ? (detailResponse.data?.gamePlan ?? null) : null;
        })
      );

      const plans = detailedPlans
        .filter((plan): plan is TeamGamePlanDoc => !!plan)
        .filter((plan) => plan.status !== 'archived')
        .sort((a, b) => {
          const aTime = typeof a.updatedAt === 'string' ? Date.parse(a.updatedAt) : 0;
          const bTime = typeof b.updatedAt === 'string' ? Date.parse(b.updatedAt) : 0;
          return bTime - aTime;
        })
        .map((plan) => mapGamePlanToUi(plan));

      this.gamePlans.set(plans);
      this.analytics?.trackEvent(APP_EVENTS.GAMEPLAN_LIST_LOADED, {
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
        count: plans.length,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplans-load', {
        status: 'success',
      });
    } catch (err) {
      this.logger.error('Failed to load opponent game plans', err, {
        playbookId: playbook.id,
        teamId: playbook.teamId,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:gameplans-load', {
        status: 'failed',
      });
      this.gamePlans.set([]);
      this.error.set(err instanceof Error ? err.message : 'Unable to load game plans');
    } finally {
      this.gamePlansLoading.set(false);
    }
  }

  protected isImageUrl(url?: string): boolean {
    return isImageAssetUrl(url);
  }

  protected async openDiagramModal(play: PlaybookPlay): Promise<void> {
    const diagramUrl = play.diagramUrl?.trim();
    if (!diagramUrl) return;

    const title = (play.title || play.name || 'Play').trim();

    try {
      await this.mediaViewer.open({
        items: [
          {
            url: diagramUrl,
            type: 'image',
            alt: `${title} diagram`,
            caption: title,
            breakdown: this.buildPlayBreakdown(play),
          },
        ],
        source: 'playbooks-diagram',
        showShare: false,
        variant: 'playbook-breakdown',
      });
    } catch (err) {
      this.logger.error('Failed to open diagram modal', err, { diagramUrl, title });
    }
  }

  private buildPlayBreakdown(play: PlaybookPlay): {
    subtitle?: string;
    metaChips: string[];
    sections: Array<{ title: string; paragraphs?: string[]; bullets?: string[]; chips?: string[] }>;
  } {
    const subtitle = [play.series, play.category, play.formation]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' • ');

    const metaChips: string[] = [];
    if (play.formation?.trim()) metaChips.push(play.formation.trim());
    if (play.personnel?.trim()) metaChips.push(play.personnel.trim());
    if (play.downDistance?.trim()) metaChips.push(play.downDistance.trim());
    if (play.installStage) metaChips.push(this.getStageDisplayName(play.installStage));
    if (play.successRate !== undefined) {
      metaChips.push(`${Math.round((play.successRate || 0) * 100)}% success`);
    }
    if (play.typicalGain !== undefined) {
      metaChips.push(`${play.typicalGain} avg gain`);
    }

    const sections: Array<{
      title: string;
      paragraphs?: string[];
      bullets?: string[];
      chips?: string[];
    }> = [];

    if (play.objective?.trim()) {
      sections.push({ title: 'Objective', paragraphs: [play.objective.trim()] });
    }
    if (play.playBreakdown?.trim()) {
      sections.push({ title: 'Play Breakdown', paragraphs: [play.playBreakdown.trim()] });
    }
    const installNoteBullets = [...this.normalizeInstallNotes(play.installNotes)];

    if (installNoteBullets.length > 0) {
      sections.push({ title: 'Install Notes', bullets: installNoteBullets });
    }
    if (play.coachingPoints?.length) {
      sections.push({ title: 'Coaching Points', bullets: [...play.coachingPoints] });
    }
    if (play.commonBusts?.length) {
      sections.push({ title: 'Common Busts', bullets: [...play.commonBusts] });
    }
    if (play.correctionCues?.length) {
      sections.push({ title: 'Correction Cues', bullets: [...play.correctionCues] });
    }
    if (play.drillProgression?.length) {
      sections.push({ title: 'Drill Progression', bullets: [...play.drillProgression] });
    }
    if (play.situations?.length) {
      sections.push({ title: 'Situations', chips: [...play.situations] });
    }
    if (play.strengths?.length) {
      sections.push({ title: 'Strengths', chips: [...play.strengths] });
    }
    if (play.videoUrl?.trim() || play.installUrl?.trim()) {
      const links: string[] = [];
      if (play.videoUrl?.trim()) links.push(`Video: ${play.videoUrl.trim()}`);
      if (play.installUrl?.trim()) links.push(`Install: ${play.installUrl.trim()}`);
      sections.push({ title: 'Resources', bullets: links });
    }

    return {
      ...(subtitle ? { subtitle } : {}),
      metaChips,
      sections,
    };
  }

  private async uploadEditPlayDiagramIfNeeded(): Promise<string | null> {
    const file = this.editPlayDiagramFile();
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);

    const response = await firstValueFrom(
      this.http.post<UploadAttachmentResponse>(`${this.baseUrl}/upload`, formData)
    );

    if (!response.success || !response.data?.url) {
      throw new Error(response.error ?? 'Failed to upload diagram');
    }

    return response.data.url;
  }

  private async seedDiagramEditInAgentChat(play: PlaybookPlay): Promise<void> {
    const diagramUrl = play.diagramUrl?.trim();
    if (!diagramUrl) return;

    const playName = (play.title || play.name || 'this play').trim();
    const prompt = `Edit this play diagram for "${playName}". Keep the concept intact, improve spacing and labels, and return an updated diagram.`;

    const fetchedFile = await this.fetchDiagramAsFile(diagramUrl, playName);
    if (fetchedFile) {
      this.agentX.addFiles([fetchedFile]);
      this.agentX.setUserMessage(prompt);
      return;
    }

    this.agentX.setUserMessage(`${prompt}\n\nSource diagram: ${diagramUrl}`);
  }

  private async fetchDiagramAsFile(diagramUrl: string, playName: string): Promise<File | null> {
    try {
      const response = await fetch(diagramUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;

      const safeBaseName =
        playName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'play-diagram';
      const extension = resolveImageExtension(blob.type, diagramUrl);
      return new File([blob], `${safeBaseName}.${extension}`, { type: blob.type });
    } catch {
      return null;
    }
  }

  // ── Loaders ──────────────────────────────────────────────────────────────────

  private async loadPlaybooks(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const teamId = this._teamId();
    const normalizedSport = this.activeSport().trim().toLowerCase() || undefined;
    if (!teamId) {
      this.playbooks.set([]);
      this.loading.set(false);
      return;
    }
    try {
      await this.playbooksService.loadPlaybooks(teamId, normalizedSport);
      this.playbooks.set(this.playbooksService.playbooks());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbooks.');
      this.playbooks.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPlaybookDetail(playbookId: string): Promise<void> {
    const teamId = this._teamId();
    if (!teamId) {
      this.selectedPlaybook.set(null);
      this.detailLoading.set(false);
      return;
    }
    try {
      const response = await firstValueFrom(
        this.http.get<PlaybookDetailResponse>(`${this.baseUrl}/playbooks/${playbookId}`, {
          params: { teamId },
        })
      );
      if (
        !response.success ||
        !response.data?.playbook ||
        response.data.playbook.teamId !== teamId
      ) {
        throw new Error(response.error ?? 'Unable to load playbook detail.');
      }
      this.selectedPlaybook.set(response.data.playbook);
      await this.loadCallsheetsForSelectedPlaybook();
      await this.loadPracticeScriptsForSelectedPlaybook();
      await this.loadGamePlansForSelectedPlaybook();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbook detail.');
      this.selectedPlaybook.set(null);
      this.callsheets.set([]);
      this.selectedCallsheetId.set(null);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.practiceScripts.set([]);
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      this.gamePlans.set([]);
    } finally {
      this.detailLoading.set(false);
    }
  }

  private async loadCallsheetsForSelectedPlaybook(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) {
      this.callsheets.set([]);
      this.callsheetsLoading.set(false);
      this.selectedCallsheetId.set(null);
      this.selectedCallsheetDetail.set(null);
      this.selectedCallsheetDetailLoading.set(false);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      return;
    }

    this.callsheetsLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<CallsheetsResponse>(`${this.baseUrl}/playbooks/${playbook.id}/callsheets`, {
          params: {
            teamId: playbook.teamId,
            limit: 30,
          },
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Unable to load callsheets.');
      }

      const callsheets = [...(response.data?.callsheets ?? [])];
      this.callsheets.set(callsheets);
      this.selectedCallsheetId.set(null);
      this.selectedCallsheetDetail.set(null);
      this.selectedCallsheetDetailLoading.set(false);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
    } catch (err) {
      this.callsheets.set([]);
      this.selectedCallsheetId.set(null);
      this.selectedCallsheetDetail.set(null);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load callsheets.');
    } finally {
      this.callsheetsLoading.set(false);
    }
  }

  private async loadSelectedCallsheetDetail(callsheetId: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) {
      this.selectedCallsheetDetail.set(null);
      this.selectedCallsheetDetailLoading.set(false);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      return;
    }

    this.selectedCallsheetDetailLoading.set(true);

    try {
      const response = await firstValueFrom(
        this.http.get<CallsheetDetailResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/callsheets/${callsheetId}`,
          {
            params: {
              teamId: playbook.teamId,
            },
          }
        )
      );

      if (!response.success || !response.data?.callsheet) {
        throw new Error(response.error ?? 'Unable to load callsheet detail.');
      }

      const detail = response.data.callsheet;
      const rankingMap = new Map<string, { score: number; reasoning: string }>();
      for (const play of detail.plays ?? []) {
        const playName = play.playName.trim();
        if (!playName) continue;
        rankingMap.set(playName, {
          score: Math.max(0, Math.min(100, Math.round(play.score))),
          reasoning: play.reasoning,
        });
      }

      this.selectedCallsheetDetail.set(detail);
      this.callsheetGroupDraft.set(
        this.normalizeCallsheetGroupsForUi(detail.groups, detail.plays ?? [])
      );
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      this.callsheetFilters.set({ ...(detail.filters ?? {}) });
      this.callsheetAiRankings.set(rankingMap);
    } catch (err) {
      this.selectedCallsheetDetail.set(null);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load callsheet detail.');
    } finally {
      this.selectedCallsheetDetailLoading.set(false);
    }
  }

  private async loadPracticeScriptsForSelectedPlaybook(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) {
      this.practiceScripts.set([]);
      this.practiceScriptsLoading.set(false);
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      return;
    }

    this.practiceScriptsLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<PracticeScriptsResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts`,
          {
            params: {
              teamId: playbook.teamId,
              limit: 30,
            },
          }
        )
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Unable to load practice scripts.');
      }

      this.practiceScripts.set([...(response.data?.scripts ?? [])]);
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
    } catch (err) {
      this.practiceScripts.set([]);
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      this.error.set(err instanceof Error ? err.message : 'Unable to load practice scripts.');
    } finally {
      this.practiceScriptsLoading.set(false);
    }
  }

  private async loadSelectedPracticeScriptDetail(scriptId: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) {
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      return;
    }

    this.selectedPracticeScriptDetailLoading.set(true);

    try {
      const response = await firstValueFrom(
        this.http.get<PracticeScriptDetailResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts/${scriptId}`,
          {
            params: {
              teamId: playbook.teamId,
            },
          }
        )
      );

      if (!response.success || !response.data?.script) {
        throw new Error(response.error ?? 'Unable to load practice script detail.');
      }

      const script = response.data.script;
      this.selectedPracticeScriptDetail.set({
        ...script,
        periods: normalizePracticeScriptPeriods(script.periods),
      });
    } catch (err) {
      this.selectedPracticeScriptDetail.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load practice script detail.');
    } finally {
      this.selectedPracticeScriptDetailLoading.set(false);
    }
  }
}
