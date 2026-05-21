import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { getSportPlaybookConfig } from '@nxt1/core';
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
  type PlayForm,
  type UploadAttachmentResponse,
} from './agent-x-playbooks-panel.types';
import {
  INSTALL_STAGES,
  buildCallsheetSituationText,
  buildFilteredCallsheetPlays,
  formatDateValue,
  getStageDisplayNameValue,
  hasActiveCallsheetFilters,
  isImageAssetUrl,
  mapGamePlanToUi,
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
        <div class="detail-header">
          <div
            class="detail-back-link"
            role="button"
            tabindex="0"
            (click)="clearSelection()"
            (keydown.enter)="clearSelection()"
            (keydown.space)="$event.preventDefault(); clearSelection()"
            aria-label="Back to playbooks"
          >
            <nxt1-icon name="chevronLeft" [size]="18"></nxt1-icon>
            <span>Playbooks</span>
          </div>
          @if (!editingMeta()) {
            <button type="button" class="icon-btn" title="Edit playbook" (click)="startEditMeta()">
              <nxt1-icon name="pencil" [size]="15"></nxt1-icon>
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
        }

        @if (!editingMeta() && (selectedPlaybook()!.source || selectedPlaybook()!.sourceUrl)) {
          <section class="detail-section">
            <h3 class="section-title">Source</h3>
            <p class="section-meta">
              {{ selectedPlaybook()!.source || 'Internal' }}
              @if (selectedPlaybook()!.sourceUrl) {
                &middot;
                <a
                  class="section-link"
                  [href]="selectedPlaybook()!.sourceUrl!"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Open Source</a
                >
              }
            </p>
          </section>
        }

        <!-- ──────────────── PLAYBOOK TABS: Index | Install | Callsheet | Opponent ──────────────── -->
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
              <span>AI Callsheet</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.tab-btn--active]="activePlaybookTab() === 'opponent'"
              (click)="activePlaybookTab.set('opponent')"
            >
              <span>Game Plans</span>
            </button>
          </div>

          <!-- ──── TAB 1: PLAYS ──── -->
          @if (activePlaybookTab() === 'plays') {
            <div class="tab-content">
              <!-- Filter Controls for Plays -->
              <div class="tab-plays-section">
                <div class="section-header">
                  <h3 class="section-title">Plays</h3>
                  <button type="button" class="btn-add-play" (click)="startAddPlay()">
                    Add Play
                  </button>
                </div>
                <!-- Filter Controls: Personnel, Side, Concept -->
                <div class="plays-filters">
                  <label>
                    Personnel:
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
                    Side:
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
                    Concept:
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
                            <input
                              class="form-input"
                              placeholder="Play name *"
                              [value]="editPlayForm().name"
                              (input)="patchEditPlayForm('name', $event)"
                            />
                            <div class="form-row">
                              <input
                                class="form-input"
                                placeholder="Series"
                                [value]="editPlayForm().series"
                                (input)="patchEditPlayForm('series', $event)"
                              />
                              <input
                                class="form-input"
                                placeholder="Category"
                                [value]="editPlayForm().category"
                                (input)="patchEditPlayForm('category', $event)"
                              />
                            </div>
                            <div class="form-row">
                              <input
                                class="form-input"
                                [placeholder]="sportConfig().formationLabel"
                                [value]="editPlayForm().formation"
                                (input)="patchEditPlayForm('formation', $event)"
                              />
                              <input
                                class="form-input"
                                [placeholder]="sportConfig().personnelLabel"
                                [value]="editPlayForm().personnel"
                                (input)="patchEditPlayForm('personnel', $event)"
                              />
                            </div>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Objective"
                              [value]="editPlayForm().objective"
                              (input)="patchEditPlayForm('objective', $event)"
                            ></textarea>
                            <input
                              class="form-input"
                              placeholder="Install notes"
                              [value]="editPlayForm().installNotes"
                              (input)="patchEditPlayForm('installNotes', $event)"
                            />
                            <input
                              class="form-input"
                              placeholder="Concept tags (comma-separated)"
                              [value]="editPlayForm().conceptTags"
                              (input)="patchEditPlayForm('conceptTags', $event)"
                            />
                            <select
                              class="form-input"
                              [value]="editPlayForm().installStage"
                              (change)="patchEditPlayForm('installStage', $event)"
                            >
                              <option value="">Install Stage (optional)</option>
                              <option value="install">Install</option>
                              <option value="rep">Rep</option>
                              <option value="game-ready">Game-Ready</option>
                            </select>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Coaching points (one per line)"
                              [value]="editPlayForm().coachingPoints"
                              (input)="patchEditPlayForm('coachingPoints', $event)"
                            ></textarea>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Common busts (one per line)"
                              [value]="editPlayForm().commonBusts"
                              (input)="patchEditPlayForm('commonBusts', $event)"
                            ></textarea>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Correction cues (one per line)"
                              [value]="editPlayForm().correctionCues"
                              (input)="patchEditPlayForm('correctionCues', $event)"
                            ></textarea>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Drill progression (one per line)"
                              [value]="editPlayForm().drillProgression"
                              (input)="patchEditPlayForm('drillProgression', $event)"
                            ></textarea>
                            <textarea
                              class="form-input form-textarea"
                              placeholder="Situations (comma-separated: 1st & 10, red zone, 2-minute, etc.)"
                              [value]="editPlayForm().situations"
                              (input)="patchEditPlayForm('situations', $event)"
                            ></textarea>
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
                              <span class="chip chip--soft">{{ play.series }}</span>
                            }
                          </div>
                          <div class="play-meta">
                            @if (play.category) {
                              <span>{{ play.category }}</span>
                            }
                            @if (play.formation) {
                              <span>{{ play.formation }}</span>
                            }
                            @if (play.personnel) {
                              <span>{{ play.personnel }}</span>
                            }
                            @if (play.downDistance) {
                              <span>{{ play.downDistance }}</span>
                            }
                          </div>
                          @if (play.objective) {
                            <p class="play-copy">{{ play.objective }}</p>
                          }
                          @if (play.installNotes) {
                            <p class="play-copy play-copy--muted">
                              Install: {{ play.installNotes }}
                            </p>
                          }
                          @if (play.tags?.length || play.conceptTags?.length) {
                            <div class="chip-list">
                              @for (tag of play.tags || []; track tag) {
                                <span class="chip chip--soft">{{ tag }}</span>
                              }
                              @for (tag of play.conceptTags || []; track tag) {
                                <span class="chip">{{ tag }}</span>
                              }
                            </div>
                          }
                          @if (play.diagramUrl) {
                            <button
                              class="diagram-preview-card"
                              type="button"
                              (click)="
                                openDiagramModal(play.diagramUrl, play.title || play.name || 'Play')
                              "
                              [attr.aria-label]="
                                'Open diagram for ' + (play.title || play.name || 'play')
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
                          <div class="play-links">
                            @if (play.videoUrl) {
                              <a
                                class="play-link"
                                [href]="play.videoUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                >Video</a
                              >
                            }
                            @if (play.installUrl) {
                              <a
                                class="play-link"
                                [href]="play.installUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                >Install</a
                              >
                            }
                          </div>
                        }
                      </article>
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
                <h3 class="section-title">Install Plans</h3>
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
                                  <h5>{{ play.name }}</h5>
                                  @if (play.diagramUrl) {
                                    <button
                                      type="button"
                                      class="install-play-view"
                                      (click)="
                                        openDiagramModal(
                                          play.diagramUrl,
                                          play.title || play.name || 'Play'
                                        )
                                      "
                                      [attr.aria-label]="
                                        'Open diagram for ' + (play.title || play.name || 'play')
                                      "
                                      title="Open diagram"
                                    >
                                      View Diagram
                                    </button>
                                  }
                                </div>
                                @if (getInstallReasoning(play.name)) {
                                  <div class="ai-reasoning-badge ai-reasoning-badge--install">
                                    <span>{{ getInstallReasoning(play.name) }}</span>
                                  </div>
                                }
                                @if (play.coachingPoints?.length) {
                                  <div class="install-section">
                                    <span class="install-label">Coaching Points</span>
                                    <ul class="install-list">
                                      @for (point of play.coachingPoints; track point) {
                                        <li>{{ point }}</li>
                                      }
                                    </ul>
                                  </div>
                                }
                                @if (play.commonBusts?.length) {
                                  <div class="install-section">
                                    <span class="install-label">Common Busts</span>
                                    <ul class="install-list">
                                      @for (bust of play.commonBusts; track bust) {
                                        <li>{{ bust }}</li>
                                      }
                                    </ul>
                                  </div>
                                }
                                @if (play.correctionCues?.length) {
                                  <div class="install-section">
                                    <span class="install-label">Correction Cues</span>
                                    <ul class="install-list">
                                      @for (cue of play.correctionCues; track cue) {
                                        <li>
                                          <code>{{ cue }}</code>
                                        </li>
                                      }
                                    </ul>
                                  </div>
                                }
                                @if (play.drillProgression?.length) {
                                  <div class="install-section">
                                    <span class="install-label">Drill Progression</span>
                                    <ul class="install-list">
                                      @for (drill of play.drillProgression; track drill) {
                                        <li>{{ drill }}</li>
                                      }
                                    </ul>
                                  </div>
                                }
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

          <!-- ──── TAB 3: AI CALLSHEET (Situation-Based Play Ranking) ──── -->
          @if (activePlaybookTab() === 'callsheet') {
            <div class="tab-content">
              <div class="tab-section">
                <h3 class="section-title">AI Callsheet: Situational Play Finder</h3>
                <p class="section-meta">
                  Select a game situation and Agent X will rank your best plays for that scenario by
                  success metrics.
                </p>

                <!-- Situation Query Builder -->
                <div class="callsheet-query">
                  @for (filter of sportConfig().situationFilters; track filter.key) {
                    <div class="query-row">
                      <label class="query-label">{{ filter.label }}</label>
                      @if (filter.options.length > 0) {
                        <select
                          class="query-input"
                          [value]="callsheetFilters()[filter.key] || ''"
                          (change)="onCallsheetFilterChange(filter.key, $event)"
                        >
                          <option value="">All</option>
                          @for (option of filter.options; track option) {
                            <option [value]="option">{{ option }}</option>
                          }
                        </select>
                      } @else {
                        <input
                          class="query-input"
                          type="text"
                          [placeholder]="'Search ' + filter.label.toLowerCase()"
                          [value]="callsheetFilters()[filter.key] || ''"
                          (input)="onCallsheetFilterChange(filter.key, $event)"
                        />
                      }
                    </div>
                  }
                </div>

                @if (hasActiveCallsheetFilters() && filteredCallsheetPlays().length > 0) {
                  <div class="callsheet-ai-actions">
                    <button
                      type="button"
                      class="btn-create-plan"
                      (click)="askAgentXForCallsheet()"
                      [disabled]="askingCallsheetAi()"
                    >
                      <nxt1-icon name="sparkles" />
                      {{ askingCallsheetAi() ? 'Analyzing…' : 'Ask Agent X' }}
                    </button>
                  </div>
                }

                <!-- Ranked Play Results -->
                <div class="callsheet-results">
                  @if (filteredCallsheetPlays().length === 0) {
                    <p class="empty-results">
                      No plays found for this situation. Try adjusting your filters or add plays
                      with situation tags.
                    </p>
                  } @else {
                    <div class="callsheet-plays">
                      @for (play of filteredCallsheetPlays(); track play.name) {
                        <div
                          class="callsheet-play-card"
                          [nxtAgentXContextDrag]="buildPlaybookPlayDragContext(play, $index)"
                        >
                          <div class="play-rank">
                            <span class="rank-label">{{ $index + 1 }}</span>
                            <span class="rank-score"
                              >{{
                                (play.successRate ? play.successRate * 100 : 0) | number: '1.0-0'
                              }}%</span
                            >
                          </div>
                          <div class="play-info">
                            <h4 class="play-name">{{ play.name }}</h4>
                            @if (play.formation) {
                              <p class="play-formation">
                                <strong>{{ play.formation }}</strong>
                              </p>
                            }
                            @if (callsheetAiRankingForPlay(play.name || '').reasoning) {
                              <div class="ai-reasoning-badge">
                                <span class="ai-reasoning-score"
                                  >AI
                                  {{ callsheetAiRankingForPlay(play.name || '').score }}/100</span
                                >
                                <span>{{
                                  callsheetAiRankingForPlay(play.name || '').reasoning
                                }}</span>
                              </div>
                            }
                            @if (play.strengths && play.strengths.length > 0) {
                              <div class="play-strengths">
                                <span class="strength-label">Effective vs:</span>
                                <div class="strength-tags">
                                  @for (strength of play.strengths.slice(0, 3); track strength) {
                                    <span class="strength-tag">{{ strength }}</span>
                                  }
                                </div>
                              </div>
                            }
                            @if (play.coachingPoints && play.coachingPoints.length > 0) {
                              <div class="play-coaching">
                                <span class="coaching-label">Key Point:</span>
                                <span class="coaching-text">{{ play.coachingPoints[0] }}</span>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- ──── TAB 4: OPPONENT PLAN (Game Plan Builder) ──── -->
          @if (activePlaybookTab() === 'opponent') {
            <div class="tab-content">
              <div class="tab-section">
                <h3 class="section-title">Game Plans</h3>
                <p class="section-meta">
                  Create opponent-specific game plans and assign plays for each matchup.
                </p>

                @if (gamePlansLoading()) {
                  <p class="empty-state-text">Loading game plans...</p>
                }

                <button
                  class="btn-create-plan"
                  (click)="startCreateGamePlan()"
                  [disabled]="gamePlansLoading() || gamePlanSaving()"
                >
                  Create Game Plan
                </button>

                <!-- Game Plans List -->
                @if (gamePlans().length === 0) {
                  <p class="empty-state-text">No game plans yet. Create one to get started.</p>
                } @else {
                  <div class="game-plans-list">
                    @for (plan of gamePlans(); track plan.id) {
                      <div
                        class="game-plan-item"
                        [nxtAgentXContextDrag]="buildPlaybookGamePlanDragContext(plan)"
                      >
                        <div class="plan-header">
                          <h4 class="plan-name">{{ plan.opponent }}</h4>
                          <span class="play-count">{{ plan.plays.length }} plays</span>
                        </div>
                        @if (plan.notes) {
                          <p class="plan-notes">{{ plan.notes }}</p>
                        }
                        <div class="plan-plays">
                          @if (plan.plays.length === 0) {
                            <p class="no-plays">No plays selected yet</p>
                          } @else {
                            <div class="play-chips">
                              @for (playId of plan.plays; track playId) {
                                <span class="play-chip">{{
                                  getPlayNameById(playId) || playId
                                }}</span>
                              }
                            </div>
                          }
                        </div>
                        <div class="plan-actions">
                          <button
                            class="btn-edit"
                            (click)="editGamePlan(plan.id)"
                            title="Edit plays for this plan"
                            [disabled]="gamePlanSaving()"
                          >
                            <nxt1-icon name="edit" />
                            Edit Plays
                          </button>
                          <button
                            class="btn-delete"
                            (click)="deleteGamePlan(plan.id)"
                            title="Delete this game plan"
                            [disabled]="gamePlanSaving()"
                          >
                            <nxt1-icon name="delete" />
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- Game Plan Play Selector (when editing) -->
                @if (editingGamePlanId()) {
                  <div class="plan-editor">
                    <h4 class="editor-title">Assign Plays to Game Plan</h4>
                    <div class="play-selector">
                      @for (play of selectedPlaybook()?.plays || []; track play.name) {
                        <label class="play-checkbox">
                          <input
                            type="checkbox"
                            [checked]="editingGamePlanPlays().includes(play.name!)"
                            (change)="togglePlayInGamePlan(play.name!)"
                          />
                          <span class="checkbox-label">
                            {{ play.name }}
                            <span class="formation-badge" *ngIf="play.formation">
                              {{ play.formation }}
                            </span>
                          </span>
                        </label>
                      }
                    </div>
                    <div class="editor-actions">
                      <button
                        class="btn-save"
                        (click)="saveGamePlanChanges()"
                        [disabled]="gamePlanSaving()"
                      >
                        {{ gamePlanSaving() ? 'Saving...' : 'Save Changes' }}
                      </button>
                      <button
                        class="btn-cancel"
                        (click)="cancelEditGamePlan()"
                        [disabled]="gamePlanSaving()"
                      >
                        Cancel
                      </button>
                    </div>
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
      @if (playbooks().length > 0 || showCreateForm()) {
        <div class="playbooks-list-header">
          <div>
            <h3>Playbooks</h3>
          </div>
          @if (!showCreateForm()) {
            <button type="button" class="btn-new" (click)="startCreate()">
              <nxt1-icon name="plus" [size]="14"></nxt1-icon>
              New
            </button>
          }
        </div>
      }

      @if (showCreateForm()) {
        <div class="inline-form">
          <h4 class="form-heading">New Playbook</h4>
          <input
            class="form-input"
            placeholder="Playbook name *"
            [value]="newPlaybook().name"
            (input)="patchNewPlaybook('name', $event)"
          />
          <div class="form-row">
            <input
              class="form-input"
              placeholder="Sport (e.g. basketball) *"
              [value]="newPlaybook().sport"
              (input)="patchNewPlaybook('sport', $event)"
            />
            <input
              class="form-input"
              placeholder="Season (e.g. 2025-26)"
              [value]="newPlaybook().season"
              (input)="patchNewPlaybook('season', $event)"
            />
          </div>
          <div class="form-actions">
            <button type="button" class="btn-cancel" (click)="cancelCreate()">Cancel</button>
            <button
              type="button"
              class="btn-save"
              [disabled]="saving() || !newPlaybook().name.trim() || !newPlaybook().sport.trim()"
              (click)="createPlaybook()"
            >
              {{ saving() ? 'Creating…' : 'Create Playbook' }}
            </button>
          </div>
        </div>
      }

      @if (playbooks().length === 0 && !showCreateForm()) {
        <nxt1-state-view
          variant="empty"
          icon="clipboard"
          title="No Playbooks"
          message="Generate team playbooks with Agent X or create one manually."
        />
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
      }

      .detail-header--actions-only {
        justify-content: flex-end;
      }

      .detail-back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.8rem;
        cursor: pointer;
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

      .section-title {
        margin: 0;
        font-size: 0.84rem;
      }
      .section-meta {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
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
        justify-content: flex-end;
      }

      .btn-cancel {
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

      .tab-empty {
        padding: 20px;
        text-align: center;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
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
        text-align: center;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        font-size: 0.8rem;
        background: rgba(0, 0, 0, 0.02);
        border-radius: var(--nxt1-radius-sm, 8px);
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

      .form-actions {
        display: flex;
        gap: 8px;
      }

      .btn-save,
      .btn-cancel {
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 120ms ease;
      }

      .btn-save {
        background: var(--agent-primary, #ccff00);
        color: #000;
      }
      .btn-save:hover {
        transform: translateY(-1px);
      }

      .btn-cancel {
        background: rgba(0, 0, 0, 0.1);
        color: var(--agent-text-primary, #1a1a1a);
      }
      .btn-cancel:hover {
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

  // ── Read state ──────────────────────────────────────────────────────────────
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);
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
  protected readonly activePlaybookTab = signal<'plays' | 'install' | 'callsheet' | 'opponent'>(
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
  protected readonly installPlanReasonings = signal<Map<string, string>>(new Map());

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
    this._playFilters.set({});
    this.detailLoading.set(false);
    this.callsheetFilters.set({});
    this.askingCallsheetAi.set(false);
    this.callsheetAiRankings.set(new Map());
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

  protected selectPlaybook(playbook: PlaybookSummary): void {
    this.detailLoading.set(true);
    this.selectedPlaybook.set(null);
    this._playFilters.set({});
    this.callsheetFilters.set({});
    this.callsheetAiRankings.set(new Map());
    this.installPlanReasonings.set(new Map());
    void this.loadPlaybookDetail(playbook.id);
  }

  // ── Playbook CRUD ────────────────────────────────────────────────────────────

  protected startCreate(): void {
    this.newPlaybook.set({ ...EMPTY_NEW_PLAYBOOK });
    this.showCreateForm.set(true);
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
    if (!form.name.trim() || !form.sport.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post<MutationResponse>(`${this.baseUrl}/playbooks`, {
          teamId: this._teamId(),
          name: toTitleCase(form.name),
          sport: form.sport.trim().toLowerCase(),
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
      'Ask me for the key details you need, then draft the play with formation, personnel, objective, coaching points, and install notes.';

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
            installNotes: form.installNotes.trim() || undefined,
            diagramUrl: nextDiagramUrl,
            conceptTags: parseTags(form.conceptTags),
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
      ...(play.objective ? { summary: play.objective } : {}),
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

  protected countPlaysByStage(stage: 'install' | 'rep' | 'game-ready'): number {
    return this.getPlaysByStage(stage).length;
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

  protected async openDiagramModal(diagramUrl: string, title: string): Promise<void> {
    if (!diagramUrl) return;
    try {
      await this.mediaViewer.open({
        items: [
          {
            url: diagramUrl,
            type: 'image',
            alt: `${title} diagram`,
            caption: title,
          },
        ],
        source: 'playbooks-diagram',
      });
    } catch (err) {
      this.logger.error('Failed to open diagram modal', err, { diagramUrl, title });
    }
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
    if (!teamId) {
      this.playbooks.set([]);
      this.loading.set(false);
      return;
    }
    try {
      await this.playbooksService.loadPlaybooks(teamId);
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
      await this.loadGamePlansForSelectedPlaybook();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbook detail.');
      this.selectedPlaybook.set(null);
      this.gamePlans.set([]);
    } finally {
      this.detailLoading.set(false);
    }
  }
}
