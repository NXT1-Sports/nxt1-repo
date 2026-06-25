import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
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
import { NxtOverlayService } from '../../../components/overlay';
import { NxtStateViewComponent } from '../../../components/state-view';
import {
  NxtMediaViewerService,
  type MediaViewerBreakdownEditorConfig,
  type MediaViewerDiagramToolsConfig,
} from '../../../components/media-viewer';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXDiagramsPanelComponent } from './agent-x-diagrams-panel.component';
import { AgentXService } from '../../services/agent-x.service';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { PlaybooksService } from '../../../playbook/services/playbooks.service';
import {
  EMPTY_EDIT_PLAYBOOK,
  EMPTY_NEW_PLAYBOOK,
  EMPTY_PLAY_FORM,
  EMPTY_PRACTICE_SCRIPT_EDIT_FORM,
  parseTags,
  toTitleCase,
  type CallsheetAiResponse,
  type CallsheetAiPlayRanking,
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
  type PlayForm,
  type PracticeScriptDetail,
  type PracticeScriptDetailResponse,
  type PracticeScriptEditForm,
  type PracticeScriptPeriod,
  type PracticeScriptsResponse,
  type PracticeScriptSummary,
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
  normalizePracticeScriptPeriods,
} from './agent-x-playbooks-panel.utils';
import { getAgentXReleaseLabel } from '../../utils/agent-x-release-stage.utils';
import {
  AgentXPlaybookPrintOptionsModalComponent,
  type AgentXPlaybookPrintSelection,
  type AgentXPlaybookPrintTargetTab,
} from './agent-x-playbook-print-options-modal.component';

interface PlaybookPrintDocumentRequest {
  readonly scope: 'current' | 'full';
  readonly targetTab: AgentXPlaybookPrintTargetTab;
  readonly plays: readonly PlaybookPlay[];
  readonly callsheet: CallsheetDetail | null;
  readonly practiceScript: PracticeScriptDetail | null;
  readonly generatedCallsheetRows: readonly CallsheetAiPlayRanking[];
  readonly useFilteredPlays: boolean;
  readonly includeInstallBoard: boolean;
  readonly includeCallsheet: boolean;
  readonly includePracticeScript: boolean;
  readonly includePlays: boolean;
}

interface PreparedPlayDiagramEditor {
  readonly assetId: string;
  readonly tools: MediaViewerDiagramToolsConfig;
}

type PlaybookAskAgentPromptId =
  | 'gameday-playbook'
  | 'suggest-new-plays'
  | 'install-plan'
  | 'coaching-points'
  | 'create-scout-team-playbook'
  | 'practice-scripts'
  | 'variations'
  | 'opening-script'
  | 'tempo-packages'
  | 'trick-play-ideas';

type PlaybookAskAgentPromptOption = {
  readonly id: PlaybookAskAgentPromptId;
  readonly label: string;
  readonly hint: string;
};

const PLAYBOOK_ASK_AGENT_PROMPTS: readonly PlaybookAskAgentPromptOption[] = [
  {
    id: 'gameday-playbook',
    label: 'Gameday Playbook',
    hint: 'Build a game-ready call package and sequencing plan.',
  },
  {
    id: 'suggest-new-plays',
    label: 'Suggest New Plays',
    hint: 'Identify scheme gaps and recommend additions.',
  },
  {
    id: 'install-plan',
    label: 'Install Plan',
    hint: 'Create install-to-rep-to-game-ready progression.',
  },
  {
    id: 'coaching-points',
    label: 'Coaching Points',
    hint: 'Generate coaching points, busts, and correction cues.',
  },
  {
    id: 'create-scout-team-playbook',
    label: 'Create Scout Team Playbook',
    hint: 'Build scout-team script from opponent tendencies.',
  },
  {
    id: 'practice-scripts',
    label: 'Practice Scripts',
    hint: 'Turn selected concepts into period-by-period script.',
  },
  {
    id: 'variations',
    label: 'Variations',
    hint: 'Generate formation, motion, and personnel variants.',
  },
  {
    id: 'opening-script',
    label: 'Opening Script',
    hint: 'Build first 10-15 calls with setup logic.',
  },
  {
    id: 'tempo-packages',
    label: 'Tempo Packages',
    hint: 'Create normal, fast, and emergency tempo menus.',
  },
  {
    id: 'trick-play-ideas',
    label: 'Trick Play Ideas',
    hint: 'Suggest high-leverage wrinkles that fit this system.',
  },
] as const;

@Component({
  selector: 'nxt1-agent-x-playbooks-panel',
  standalone: true,
  inputs: ['teamId', 'sport', 'practiceScriptsOnly'],
  imports: [
    CommonModule,
    FormsModule,
    NxtIconComponent,
    NxtStateViewComponent,
    AgentXContextDragDirective,
    AgentXDiagramsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="playbooks-panel">
    <div class="playbooks-diagram-editor-host" aria-hidden="true">
      <nxt1-agent-x-diagrams-panel [teamId]="_teamId()" [sport]="activeSport()" />
    </div>

    <!-- ──────────────── DETAIL VIEW ──────────────── -->
    @if (showingDetail() && selectedPlaybook()) {
      <div
        class="playbook-detail"
        [class.playbook-detail--practice-scripts]="practiceScriptsOnlyMode()"
      >
        @if (practiceScriptsOnlyMode()) {
          <div class="practice-scripts-workspace-header">
            <div class="practice-scripts-workspace-copy">
              <h2 class="detail-title">Practice Scripts</h2>
            </div>

            <div class="practice-scripts-workspace-actions">
              <button
                type="button"
                class="detail-action-btn detail-action-btn--secondary"
                [attr.data-testid]="testIds.PLAYBOOK_PRINT_PREVIEW_BUTTON"
                [disabled]="printing()"
                (click)="openPrintOptions()"
              >
                {{ printing() ? 'Preparing…' : 'Print' }}
              </button>
            </div>
          </div>

          @if (printError()) {
            <p
              class="section-meta section-meta--error"
              [attr.data-testid]="testIds.PLAYBOOK_EXPORT_ERROR"
            >
              {{ printError() }}
            </p>
          }
        } @else {
          <div class="detail-header detail-header--actions-only">
            @if (!editingMeta()) {
              <h2 class="detail-title detail-title--inline">
                {{ selectedPlaybook()!.title || selectedPlaybook()!.name }}
              </h2>
            }

            <div class="detail-header-actions">
              <button
                type="button"
                class="detail-action-btn detail-action-btn--secondary"
                [attr.data-testid]="testIds.PLAYBOOK_PRINT_PREVIEW_BUTTON"
                [disabled]="printing()"
                (click)="openPrintOptions()"
              >
                {{ printing() ? 'Preparing…' : 'Print' }}
              </button>
              @if (!editingMeta()) {
                <button
                  type="button"
                  class="icon-btn icon-btn--sm detail-header__edit"
                  title="Edit playbook"
                  aria-label="Edit playbook"
                  (click)="startEditMeta()"
                >
                  <nxt1-icon name="pencil" [size]="14"></nxt1-icon>
                </button>
              }
            </div>
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
            @if (printError()) {
              <p
                class="section-meta section-meta--error"
                [attr.data-testid]="testIds.PLAYBOOK_EXPORT_ERROR"
              >
                {{ printError() }}
              </p>
            }
          }
        }

        <!-- ──────────────── PLAYBOOK TABS: Plays | Install | Callsheets | Practice ──────────────── -->
        <section class="detail-section detail-section--tabs">
          @if (!practiceScriptsOnlyMode()) {
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
            </div>
          }

          <!-- ──── TAB 1: PLAYS ──── -->
          @if (activePlaybookTab() === 'plays') {
            <div class="tab-content">
              <!-- Filter Controls for Plays -->
              <div class="tab-plays-section">
                <div class="section-header">
                  <div class="section-title-row">
                    <h3 class="section-title">Plays</h3>
                    @if (isFootballSport()) {
                      <div
                        class="football-side-toggle"
                        role="group"
                        aria-label="Football side filter"
                      >
                        <button
                          type="button"
                          class="football-side-btn"
                          [class.football-side-btn--active]="playFilters().side === 'offense'"
                          (click)="setFootballSide('offense')"
                        >
                          Offense
                        </button>
                        <button
                          type="button"
                          class="football-side-btn"
                          [class.football-side-btn--active]="playFilters().side === 'defense'"
                          (click)="setFootballSide('defense')"
                        >
                          Defense
                        </button>
                        <button
                          type="button"
                          class="football-side-btn"
                          [class.football-side-btn--active]="playFilters().side === 'special-teams'"
                          (click)="setFootballSide('special-teams')"
                        >
                          Special Teams
                        </button>
                      </div>
                    }
                  </div>
                  <div class="section-header-actions">
                    <input
                      #playbookPlaysImportInput
                      type="file"
                      class="hidden-file-input"
                      accept=".pdf,.doc,.docx,.txt,.rtf,.md,.csv,.xls,.xlsx,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      multiple
                      (change)="onImportPlaybookFilesSelected($event)"
                    />
                    <button
                      type="button"
                      class="btn-add-play"
                      data-testid="playbook-plays-import-button"
                      (click)="openPlaybookImportPicker(playbookPlaysImportInput)"
                    >
                      <svg
                        class="btn-new__icon"
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
                      Upload
                    </button>
                    <div class="callsheet-saved-card__menu-anchor">
                      <button
                        type="button"
                        class="btn-add-play"
                        aria-label="Ask Agent X about this playbook"
                        [attr.aria-expanded]="isPlaybookAskAgentMenuOpen()"
                        aria-haspopup="menu"
                        (click)="onTogglePlaybookAskAgentMenu($event)"
                      >
                        Ask Agent
                      </button>

                      @if (isPlaybookAskAgentMenuOpen()) {
                        <div
                          class="film-list-item__menu-backdrop"
                          (click)="closePlaybookAskAgentMenu()"
                        ></div>
                        <div
                          class="film-list-item__menu callsheet-saved-card__menu"
                          role="menu"
                          aria-label="Playbook ask agent actions"
                          (click)="$event.stopPropagation()"
                        >
                          @for (option of playbookAskAgentPromptOptions; track option.id) {
                            <button
                              type="button"
                              class="film-list-item__menu-action"
                              role="menuitem"
                              (click)="onPlaybookAskAgentPromptSelect(option.id, $event)"
                            >
                              <span>{{ option.label }}</span>
                            </button>
                          }
                        </div>
                      }
                    </div>
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
                        <option [value]="tag">{{ tag | titlecase }}</option>
                      }
                    </select>
                  </label>

                  @if (isFootballSport()) {
                    <label>
                      Formation:
                      <select
                        class="form-input"
                        [value]="playFilters().formation || ''"
                        (change)="onPlayFilterChange('formation', $event)"
                      >
                        <option value="">All</option>
                        @for (tag of selectedPlaybook()!.formationIndex || []; track tag) {
                          <option [value]="tag">{{ tag | titlecase }}</option>
                        }
                      </select>
                    </label>

                    @if (playFilters().side) {
                      <label>
                        {{ footballPlayTypeLabel() }}:
                        <select
                          class="form-input"
                          [value]="playFilters().playType || ''"
                          (change)="onPlayFilterChange('playType', $event)"
                        >
                          <option value="">All</option>
                          @for (option of footballPlayTypeOptions(); track option.value) {
                            <option [value]="option.value">{{ option.label }}</option>
                          }
                        </select>
                      </label>
                    }
                  } @else {
                    <label>
                      {{ playFilterLabels().category }}:
                      <select
                        class="form-input"
                        [value]="playFilters().side || ''"
                        (change)="onPlayFilterChange('side', $event)"
                      >
                        <option value="">All</option>
                        @for (tag of selectedPlaybook()!.categoryIndex || []; track tag) {
                          <option [value]="tag">{{ tag | titlecase }}</option>
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
                          <option [value]="tag">{{ tag | titlecase }}</option>
                        }
                      </select>
                    </label>
                  }

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
                        role="button"
                        tabindex="0"
                        [attr.data-testid]="testIds.PLAY_ITEM"
                        [nxtAgentXContextDrag]="buildPlaybookPlayDragContext(play, $index)"
                        (click)="openDiagramModal(play, $index)"
                        (keydown.enter)="openDiagramModal(play, $index)"
                        (keydown.space)="openDiagramModal(play, $index); $event.preventDefault()"
                      >
                        @if (deletingPlayIndex() === $index) {
                          <div class="delete-overlay" (click)="$event.stopPropagation()">
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
                        } @else {
                          <div class="play-actions">
                            <button
                              type="button"
                              class="icon-btn icon-btn--sm"
                              title="Edit play"
                              [attr.data-testid]="testIds.PLAY_EDIT_BUTTON"
                              (click)="
                                openDiagramModal(play, $index, true); $event.stopPropagation()
                              "
                            >
                              <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                            </button>
                            <button
                              type="button"
                              class="icon-btn icon-btn--sm icon-btn--danger"
                              title="Remove play"
                              [attr.data-testid]="testIds.PLAY_DELETE_BUTTON"
                              (click)="confirmDeletePlay($index); $event.stopPropagation()"
                            >
                              <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                            </button>
                          </div>
                          <div class="play-head">
                            <h4 [attr.data-testid]="testIds.PLAY_ITEM_NAME">
                              {{ play.title || play.name || 'Untitled Play' }}
                            </h4>
                            @if (generatedPlaysReleaseLabel) {
                              <span class="release-badge release-badge--inline">
                                {{ generatedPlaysReleaseLabel }}
                              </span>
                            }
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
                              (click)="openDiagramModal(play, $index); $event.stopPropagation()"
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
                                      (click)="openDiagramModal(play, getPlayIndex(play))"
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
                          [class.callsheet-saved-card--menu-open]="isCallsheetMenuOpen(sheet.id)"
                          [attr.data-testid]="testIds.CALLSHEET_LIST_ITEM"
                          [nxtAgentXContextDrag]="buildCallsheetDragContext(sheet)"
                        >
                          <div class="callsheet-saved-card__top">
                            <div class="callsheet-saved-card__copy">
                              <span class="callsheet-saved-card__title">{{ sheet.title }}</span>
                              <span class="callsheet-saved-card__meta">
                                {{ sheet.situation || 'all situations' }}
                              </span>
                            </div>
                            <div class="callsheet-saved-card__actions">
                              <div class="callsheet-saved-card__menu-anchor">
                                <button
                                  type="button"
                                  class="film-list-item__menu-btn callsheet-saved-card__menu-btn"
                                  aria-label="Callsheet actions"
                                  [attr.aria-expanded]="isCallsheetMenuOpen(sheet.id)"
                                  aria-haspopup="menu"
                                  (click)="onOpenCallsheetMenu($event, sheet.id)"
                                >
                                  <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                                </button>

                                @if (isCallsheetMenuOpen(sheet.id)) {
                                  <div
                                    class="film-list-item__menu-backdrop"
                                    (click)="closeCallsheetMenu()"
                                  ></div>
                                  <div
                                    class="film-list-item__menu callsheet-saved-card__menu"
                                    role="menu"
                                    aria-label="Callsheet actions"
                                    (click)="$event.stopPropagation()"
                                  >
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      role="menuitem"
                                      (click)="toggleCallsheetFromMenu(sheet.id, $event)"
                                    >
                                      <nxt1-icon name="eye" [size]="16"></nxt1-icon>
                                      {{ selectedCallsheetId() === sheet.id ? 'Close' : 'Open' }}
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      role="menuitem"
                                      [disabled]="printing()"
                                      (click)="printCallsheetFromMenu(sheet.id, $event)"
                                    >
                                      <nxt1-icon name="printPreview" [size]="16"></nxt1-icon>
                                      {{ printing() ? 'Preparing…' : 'Print' }}
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action film-list-item__menu-action--danger"
                                      role="menuitem"
                                      [disabled]="deletingCallsheetId() === sheet.id"
                                      (click)="deleteSavedCallsheet(sheet.id, $event)"
                                    >
                                      <nxt1-icon name="trash" [size]="16"></nxt1-icon>
                                      {{
                                        deletingCallsheetId() === sheet.id ? 'Deleting…' : 'Delete'
                                      }}
                                    </button>
                                  </div>
                                }
                              </div>
                            </div>
                          </div>
                          <span class="callsheet-saved-card__meta"
                            >{{ sheet.playCount }} plays •
                            {{ formatDate(sheet.updatedAt || sheet.createdAt) }}</span
                          >

                          @if (selectedCallsheetId() === sheet.id) {
                            <div class="callsheet-saved-card__detail">
                              @if (selectedCallsheetDetailLoading()) {
                                <p class="section-meta">Loading callsheet details...</p>
                              } @else if (
                                selectedCallsheetDetail() &&
                                selectedCallsheetDetail()!.id === sheet.id
                              ) {
                                <div class="callsheet-coach-sheet">
                                  <div class="callsheet-coach-sheet__header">
                                    <div class="callsheet-coach-sheet__title-block">
                                      <span class="callsheet-coach-sheet__eyebrow">
                                        Game Week Call Sheet
                                      </span>
                                      <strong>{{ selectedCallsheetDetail()!.title }}</strong>
                                    </div>
                                    <div class="callsheet-coach-sheet__meta-grid">
                                      <span>
                                        <b>Situation</b>
                                        {{ selectedCallsheetDetail()!.situation || 'All calls' }}
                                      </span>
                                      <span>
                                        <b>Calls</b>
                                        {{ selectedCallsheetDetail()!.playCount }}
                                      </span>
                                      <span>
                                        <b>Groups</b>
                                        {{ selectedCallsheetGroups().length }}
                                      </span>
                                    </div>
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
                                        <span class="callsheet-coach-sheet__label">Call Board</span>
                                        <div class="callsheet-detail-card__groups-actions">
                                          <button
                                            type="button"
                                            class="detail-action-btn detail-action-btn--secondary"
                                            (click)="addCallsheetGroup()"
                                          >
                                            Add Group
                                          </button>
                                          @if (hasUnsavedCallsheetGroupChanges()) {
                                            <button
                                              type="button"
                                              class="detail-action-btn"
                                              [disabled]="callsheetGroupsSaving()"
                                              (click)="saveCallsheetGroups()"
                                            >
                                              {{ callsheetGroupsSaving() ? 'Saving…' : 'Save' }}
                                            </button>
                                          }
                                        </div>
                                      </div>

                                      <div class="callsheet-detail-card__groups">
                                        @for (group of selectedCallsheetGroups(); track group.id) {
                                          <section
                                            class="callsheet-group-card"
                                            [class.callsheet-group-card--dragging]="
                                              draggingCallsheetGroupId() === group.id
                                            "
                                            [class.callsheet-group-card--drop-before]="
                                              callsheetGroupDropIndicator()?.groupId === group.id &&
                                              callsheetGroupDropIndicator()?.placement === 'before'
                                            "
                                            [class.callsheet-group-card--drop-after]="
                                              callsheetGroupDropIndicator()?.groupId === group.id &&
                                              callsheetGroupDropIndicator()?.placement === 'after'
                                            "
                                            [class.callsheet-group-card--menu-open]="
                                              isCallsheetGroupMenuOpen(group.id)
                                            "
                                            (dragover)="onCallsheetGroupDragOver(group.id, $event)"
                                            (dragleave)="
                                              onCallsheetGroupDragLeave(group.id, $event)
                                            "
                                            (drop)="onCallsheetGroupDrop(group.id, $event)"
                                          >
                                            <div
                                              class="callsheet-group-card__header"
                                              draggable="true"
                                              (dragstart)="
                                                onCallsheetGroupDragStart(group.id, $event)
                                              "
                                              (dragend)="onCallsheetGroupDragEnd()"
                                            >
                                              <button
                                                type="button"
                                                class="callsheet-group-card__toggle"
                                                [attr.aria-expanded]="
                                                  isCallsheetGroupExpanded(group.id)
                                                "
                                                (click)="
                                                  toggleCallsheetGroupExpansion(group.id, $event)
                                                "
                                              >
                                                <span
                                                  class="callsheet-group-card__chevron"
                                                  aria-hidden="true"
                                                >
                                                  @if (isCallsheetGroupExpanded(group.id)) {
                                                    <nxt1-icon
                                                      name="chevronDown"
                                                      [size]="16"
                                                    ></nxt1-icon>
                                                  } @else {
                                                    <nxt1-icon
                                                      name="chevronRight"
                                                      [size]="16"
                                                    ></nxt1-icon>
                                                  }
                                                </span>
                                                <nxt1-icon
                                                  name="folder"
                                                  [size]="14"
                                                  class="callsheet-group-card__icon"
                                                ></nxt1-icon>
                                                <span class="callsheet-group-card__name">{{
                                                  group.name
                                                }}</span>
                                                <span class="callsheet-group-card__count"
                                                  >{{ group.plays.length }} calls</span
                                                >
                                              </button>

                                              <div class="callsheet-group-card__menu-anchor">
                                                <button
                                                  type="button"
                                                  class="film-list-item__menu-btn callsheet-group-card__menu-btn"
                                                  aria-label="Group options"
                                                  draggable="false"
                                                  [attr.aria-expanded]="
                                                    isCallsheetGroupMenuOpen(group.id)
                                                  "
                                                  aria-haspopup="menu"
                                                  (dragstart)="$event.preventDefault()"
                                                  (click)="onOpenCallsheetGroupMenu($event, group)"
                                                >
                                                  <nxt1-icon
                                                    name="moreHorizontal"
                                                    [size]="18"
                                                  ></nxt1-icon>
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
                                                          for="callsheet-group-rename-{{
                                                            group.id
                                                          }}"
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
                                                            onCallsheetGroupRenameInput(
                                                              $any($event.target).value
                                                            )
                                                          "
                                                          (keydown.enter)="
                                                            onCallsheetGroupRenameConfirm(
                                                              group,
                                                              $event
                                                            )
                                                          "
                                                          (keydown.escape)="
                                                            onCallsheetGroupRenameCancel($event)
                                                          "
                                                        />
                                                        <div class="film-list-item__menu-actions">
                                                          <button
                                                            type="button"
                                                            class="film-list-item__menu-action film-list-item__menu-action--primary"
                                                            (click)="
                                                              onCallsheetGroupRenameConfirm(
                                                                group,
                                                                $event
                                                              )
                                                            "
                                                          >
                                                            Save
                                                          </button>
                                                          <button
                                                            type="button"
                                                            class="film-list-item__menu-action"
                                                            (click)="
                                                              onCallsheetGroupRenameCancel($event)
                                                            "
                                                          >
                                                            Cancel
                                                          </button>
                                                        </div>
                                                      </div>
                                                    } @else if (
                                                      isDeletingCallsheetGroup(group.id)
                                                    ) {
                                                      <div class="film-list-item__menu-confirm">
                                                        <p
                                                          class="film-list-item__menu-confirm-text"
                                                        >
                                                          @if (group.plays.length) {
                                                            Delete this group? Calls will move to
                                                            another group.
                                                          } @else {
                                                            Delete this empty group?
                                                          }
                                                        </p>
                                                        <div class="film-list-item__menu-actions">
                                                          <button
                                                            type="button"
                                                            class="film-list-item__menu-action film-list-item__menu-action--danger"
                                                            (click)="
                                                              onCallsheetGroupDeleteConfirm(
                                                                group,
                                                                $event
                                                              )
                                                            "
                                                          >
                                                            Delete
                                                          </button>
                                                          <button
                                                            type="button"
                                                            class="film-list-item__menu-action"
                                                            (click)="
                                                              onCallsheetGroupDeleteCancel($event)
                                                            "
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
                                                        (click)="
                                                          onCallsheetGroupRenameStart(group, $event)
                                                        "
                                                      >
                                                        <nxt1-icon
                                                          name="pencil"
                                                          [size]="16"
                                                        ></nxt1-icon>
                                                        Rename
                                                      </button>
                                                      @if (selectedCallsheetGroups().length > 1) {
                                                        <button
                                                          type="button"
                                                          class="film-list-item__menu-action film-list-item__menu-action--danger"
                                                          role="menuitem"
                                                          (click)="
                                                            onCallsheetGroupDeleteStart(
                                                              group,
                                                              $event
                                                            )
                                                          "
                                                        >
                                                          <nxt1-icon
                                                            name="trash"
                                                            [size]="16"
                                                          ></nxt1-icon>
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
                                                    <div
                                                      class="callsheet-group-card__empty-actions"
                                                    >
                                                      <select
                                                        class="callsheet-detail-card__group-select"
                                                        [value]="
                                                          callsheetGroupAddPlayDraft(group.id)
                                                        "
                                                        (change)="
                                                          setCallsheetGroupAddPlayDraft(
                                                            group.id,
                                                            $event
                                                          )
                                                        "
                                                      >
                                                        <option value="">Select play</option>
                                                        @for (
                                                          playName of getCallsheetGroupAvailablePlayNames(
                                                            group.id
                                                          );
                                                          track playName
                                                        ) {
                                                          <option [value]="playName">
                                                            {{ playName }}
                                                          </option>
                                                        }
                                                      </select>
                                                      <button
                                                        type="button"
                                                        class="detail-action-btn detail-action-btn--secondary"
                                                        [disabled]="
                                                          !callsheetGroupAddPlayDraft(group.id)
                                                        "
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
                                                        <p
                                                          class="callsheet-detail-card__play-title"
                                                        >
                                                          {{ play.playName }}
                                                        </p>
                                                        <p
                                                          class="callsheet-detail-card__play-reasoning"
                                                        >
                                                          {{ play.reasoning }}
                                                        </p>
                                                      </div>
                                                      <div
                                                        class="callsheet-detail-card__play-controls"
                                                        [class.callsheet-detail-card__play-controls--confirm]="
                                                          callsheetPendingRemovalPlayName() ===
                                                          play.playName
                                                        "
                                                      >
                                                        @if (
                                                          callsheetPendingRemovalPlayName() ===
                                                          play.playName
                                                        ) {
                                                          <button
                                                            type="button"
                                                            class="callsheet-detail-card__remove-confirm-btn"
                                                            [disabled]="callsheetGroupsSaving()"
                                                            (click)="
                                                              confirmRemovePlayFromCallsheet(
                                                                play.playName
                                                              )
                                                            "
                                                          >
                                                            {{
                                                              callsheetGroupsSaving()
                                                                ? 'Removing…'
                                                                : 'Remove'
                                                            }}
                                                          </button>
                                                          <button
                                                            type="button"
                                                            class="callsheet-detail-card__remove-cancel-btn"
                                                            [disabled]="callsheetGroupsSaving()"
                                                            (click)="
                                                              cancelRemovePlayFromCallsheet()
                                                            "
                                                          >
                                                            Keep
                                                          </button>
                                                        } @else {
                                                          <select
                                                            class="callsheet-detail-card__group-select"
                                                            [value]="group.id"
                                                            (change)="
                                                              moveCallsheetPlayToGroup(
                                                                play.playName,
                                                                $event
                                                              )
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
                                                              requestRemovePlayFromCallsheet(
                                                                play.playName
                                                              )
                                                            "
                                                          >
                                                            <nxt1-icon
                                                              name="trash"
                                                              [size]="12"
                                                            ></nxt1-icon>
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
                          }
                        </article>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- ──── TAB 4: PRACTICE SCRIPTS ──── -->
          @if (activePlaybookTab() === 'play-script') {
            <div class="tab-content">
              <div class="tab-section">
                <div class="section-header">
                  <h3 class="section-title">Practice Scripts</h3>
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
                    Create Script
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
                      <p class="section-meta">Build one in chat, then save it for export.</p>
                    </div>
                  } @else {
                    <div class="callsheet-saved-grid">
                      @for (script of practiceScripts(); track script.id) {
                        <article
                          class="callsheet-saved-card"
                          [class.callsheet-saved-card--active]="
                            selectedPracticeScriptId() === script.id
                          "
                          [class.callsheet-saved-card--menu-open]="
                            isPracticeScriptMenuOpen(script.id)
                          "
                          [attr.data-testid]="testIds.PRACTICE_SCRIPT_LIST_ITEM"
                          [nxtAgentXContextDrag]="buildPracticeScriptDragContext(script)"
                          [nxtAgentXContextDragDisabled]="editingPracticeScriptId() === script.id"
                        >
                          <div class="callsheet-saved-card__top">
                            <div class="callsheet-saved-card__copy">
                              <span class="callsheet-saved-card__title">{{ script.title }}</span>
                              <span class="callsheet-saved-card__meta"
                                >{{ script.focus }} • {{ script.tempo }}</span
                              >
                            </div>
                            <div class="callsheet-saved-card__actions">
                              <button
                                type="button"
                                class="icon-btn icon-btn--sm"
                                title="Edit practice script"
                                aria-label="Edit practice script"
                                [disabled]="savingPracticeScript()"
                                (click)="startEditPracticeScript(script.id, $event)"
                              >
                                <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                              </button>
                              <button
                                type="button"
                                class="icon-btn icon-btn--sm"
                                title="Move practice script up"
                                aria-label="Move practice script up"
                                [disabled]="
                                  isPracticeScriptFirst(script.id) || savingPracticeScriptOrder()
                                "
                                (click)="movePracticeScriptInList(script.id, -1, $event)"
                              >
                                <nxt1-icon name="arrowUp" [size]="12"></nxt1-icon>
                              </button>
                              <button
                                type="button"
                                class="icon-btn icon-btn--sm"
                                title="Move practice script down"
                                aria-label="Move practice script down"
                                [disabled]="
                                  isPracticeScriptLast(script.id) || savingPracticeScriptOrder()
                                "
                                (click)="movePracticeScriptInList(script.id, 1, $event)"
                              >
                                <nxt1-icon name="arrowDown" [size]="12"></nxt1-icon>
                              </button>
                              <div class="callsheet-saved-card__menu-anchor">
                                <button
                                  type="button"
                                  class="film-list-item__menu-btn callsheet-saved-card__menu-btn"
                                  aria-label="Practice script actions"
                                  [attr.aria-expanded]="isPracticeScriptMenuOpen(script.id)"
                                  aria-haspopup="menu"
                                  (click)="onOpenPracticeScriptMenu($event, script.id)"
                                >
                                  <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                                </button>

                                @if (isPracticeScriptMenuOpen(script.id)) {
                                  <div
                                    class="film-list-item__menu-backdrop"
                                    (click)="closePracticeScriptMenu()"
                                  ></div>
                                  <div
                                    class="film-list-item__menu callsheet-saved-card__menu"
                                    role="menu"
                                    aria-label="Practice script actions"
                                    (click)="$event.stopPropagation()"
                                  >
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      role="menuitem"
                                      (click)="togglePracticeScriptFromMenu(script.id, $event)"
                                    >
                                      <nxt1-icon name="eye" [size]="16"></nxt1-icon>
                                      {{
                                        selectedPracticeScriptId() === script.id ? 'Close' : 'Open'
                                      }}
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      role="menuitem"
                                      [disabled]="savingPracticeScript()"
                                      (click)="startEditPracticeScriptFromMenu(script.id, $event)"
                                    >
                                      <nxt1-icon name="pencil" [size]="16"></nxt1-icon>
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      role="menuitem"
                                      [disabled]="printing()"
                                      (click)="printPracticeScriptFromMenu(script.id, $event)"
                                    >
                                      <nxt1-icon name="printPreview" [size]="16"></nxt1-icon>
                                      {{ printing() ? 'Preparing…' : 'Print' }}
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action film-list-item__menu-action--danger"
                                      role="menuitem"
                                      [disabled]="deletingPracticeScriptId() === script.id"
                                      (click)="deletePracticeScriptFromMenu(script.id, $event)"
                                    >
                                      <nxt1-icon name="trash" [size]="16"></nxt1-icon>
                                      {{
                                        deletingPracticeScriptId() === script.id
                                          ? 'Deleting…'
                                          : 'Delete'
                                      }}
                                    </button>
                                  </div>
                                }
                              </div>
                            </div>
                          </div>
                          <span class="callsheet-saved-card__meta"
                            >{{ script.totalPeriods }} periods • {{ script.totalReps }} reps</span
                          >

                          @if (selectedPracticeScriptId() === script.id) {
                            <div class="callsheet-saved-card__detail">
                              @if (selectedPracticeScriptDetailLoading()) {
                                <p class="section-meta">Loading script details...</p>
                              } @else if (
                                selectedPracticeScriptDetail() &&
                                selectedPracticeScriptDetail()!.id === script.id
                              ) {
                                @if (editingPracticeScriptId() === script.id) {
                                  <div class="play-edit-form practice-script-edit-form">
                                    <div class="form-row">
                                      <div class="form-field">
                                        <label class="form-label">Title *</label>
                                        <input
                                          class="form-input"
                                          [value]="practiceScriptEditForm().title"
                                          (input)="patchPracticeScriptEditForm('title', $event)"
                                        />
                                      </div>
                                      <div class="form-field">
                                        <label class="form-label">Focus</label>
                                        <input
                                          class="form-input"
                                          [value]="practiceScriptEditForm().focus"
                                          (input)="patchPracticeScriptEditForm('focus', $event)"
                                        />
                                      </div>
                                    </div>

                                    <div class="form-row">
                                      <div class="form-field">
                                        <label class="form-label">Tempo</label>
                                        <input
                                          class="form-input"
                                          [value]="practiceScriptEditForm().tempo"
                                          (input)="patchPracticeScriptEditForm('tempo', $event)"
                                        />
                                      </div>
                                      <div class="form-field">
                                        <label class="form-label">Date</label>
                                        <input
                                          class="form-input"
                                          type="date"
                                          [value]="practiceScriptEditForm().scriptDate"
                                          (input)="
                                            patchPracticeScriptEditForm('scriptDate', $event)
                                          "
                                        />
                                      </div>
                                      <div class="form-field">
                                        <label class="form-label">Opponent</label>
                                        <input
                                          class="form-input"
                                          [value]="practiceScriptEditForm().opponent"
                                          (input)="patchPracticeScriptEditForm('opponent', $event)"
                                        />
                                      </div>
                                    </div>

                                    <div class="form-field">
                                      <label class="form-label">Objectives</label>
                                      <textarea
                                        class="form-input"
                                        rows="3"
                                        placeholder="One objective per line"
                                        [value]="practiceScriptEditForm().objectives"
                                        (input)="patchPracticeScriptEditForm('objectives', $event)"
                                      ></textarea>
                                    </div>

                                    <div class="callsheet-detail-card__section">
                                      <div class="callsheet-detail-card__groups-header">
                                        <span class="callsheet-detail-card__label"
                                          >Script Matrix</span
                                        >
                                        <button
                                          type="button"
                                          class="detail-action-btn detail-action-btn--secondary"
                                          (click)="addPracticeScriptPeriodToForm()"
                                        >
                                          Add Period
                                        </button>
                                      </div>
                                      <div class="practice-script-table-wrap">
                                        <table
                                          class="practice-script-table practice-script-table--editing"
                                        >
                                          <thead>
                                            <tr>
                                              <th>#</th>
                                              <th>Period</th>
                                              <th>Clock</th>
                                              <th>Reps</th>
                                              <th>Call Type</th>
                                              <th>Play Call</th>
                                              <th>Coaching Point</th>
                                              <th>Notes</th>
                                              <th>Order</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            @for (
                                              period of practiceScriptEditForm().periods;
                                              track period.id;
                                              let periodIndex = $index
                                            ) {
                                              <tr>
                                                <td>{{ periodIndex + 1 }}</td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Period label"
                                                    [value]="period.label"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'label',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Period clock"
                                                    [value]="period.clock"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'clock',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input practice-script-cell-input--number"
                                                    type="number"
                                                    min="0"
                                                    aria-label="Period reps"
                                                    [value]="period.reps"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'reps',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Call type"
                                                    [value]="period.callType"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'callType',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Play call"
                                                    [value]="period.playName"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'playName',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Coaching point"
                                                    [value]="period.coachingPoint || ''"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'coachingPoint',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <input
                                                    class="form-input practice-script-cell-input"
                                                    aria-label="Period notes"
                                                    [value]="period.notes || ''"
                                                    (input)="
                                                      patchPracticeScriptPeriod(
                                                        periodIndex,
                                                        'notes',
                                                        $event
                                                      )
                                                    "
                                                  />
                                                </td>
                                                <td>
                                                  <div class="practice-script-period-actions">
                                                    <button
                                                      type="button"
                                                      class="icon-btn icon-btn--sm"
                                                      aria-label="Move period up"
                                                      [disabled]="periodIndex === 0"
                                                      (click)="
                                                        movePracticeScriptPeriodInForm(
                                                          periodIndex,
                                                          -1,
                                                          $event
                                                        )
                                                      "
                                                    >
                                                      <nxt1-icon
                                                        name="arrowUp"
                                                        [size]="12"
                                                      ></nxt1-icon>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      class="icon-btn icon-btn--sm"
                                                      aria-label="Move period down"
                                                      [disabled]="
                                                        periodIndex ===
                                                        practiceScriptEditForm().periods.length - 1
                                                      "
                                                      (click)="
                                                        movePracticeScriptPeriodInForm(
                                                          periodIndex,
                                                          1,
                                                          $event
                                                        )
                                                      "
                                                    >
                                                      <nxt1-icon
                                                        name="arrowDown"
                                                        [size]="12"
                                                      ></nxt1-icon>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      class="icon-btn icon-btn--sm icon-btn--danger"
                                                      aria-label="Remove period"
                                                      [disabled]="
                                                        practiceScriptEditForm().periods.length <= 1
                                                      "
                                                      (click)="
                                                        removePracticeScriptPeriodFromForm(
                                                          periodIndex,
                                                          $event
                                                        )
                                                      "
                                                    >
                                                      <nxt1-icon
                                                        name="trash"
                                                        [size]="12"
                                                      ></nxt1-icon>
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            }
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    <div class="form-field">
                                      <label class="form-label">Coach Notes</label>
                                      <textarea
                                        class="form-input"
                                        rows="3"
                                        [value]="practiceScriptEditForm().notes"
                                        (input)="patchPracticeScriptEditForm('notes', $event)"
                                      ></textarea>
                                    </div>

                                    <div class="form-actions">
                                      <button
                                        type="button"
                                        class="btn-cancel"
                                        [disabled]="savingPracticeScript()"
                                        (click)="cancelEditPracticeScript()"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        class="btn-save"
                                        [disabled]="!canSavePracticeScriptEdit()"
                                        (click)="savePracticeScriptEdit(script.id)"
                                      >
                                        {{ savingPracticeScript() ? 'Saving…' : 'Save Script' }}
                                      </button>
                                    </div>
                                  </div>
                                } @else {
                                  @if (
                                    (selectedPracticeScriptDetail()!.objectives?.length || 0) > 0
                                  ) {
                                    <div class="callsheet-detail-card__section">
                                      <span class="callsheet-detail-card__label">Objectives</span>
                                      <div class="chip-list">
                                        @for (
                                          objective of selectedPracticeScriptDetail()!.objectives ||
                                            [];
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
                                              <td>
                                                {{ period.coachingPoint || period.notes || '—' }}
                                              </td>
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
                                }
                              }
                            </div>
                          }
                        </article>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </section>

        @if (!practiceScriptsOnlyMode()) {
          <section class="detail-section detail-section--meta">
            <h3 class="section-title">Record</h3>
            <p class="section-meta">Created: {{ formatDate(selectedPlaybook()!.createdAt) }}</p>
            <p class="section-meta">Updated: {{ formatDate(selectedPlaybook()!.updatedAt) }}</p>
          </section>
        }
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
          <h3>
            {{ practiceScriptsOnlyMode() ? 'Practice Scripts' : 'Playbooks' }}
            @if (!practiceScriptsOnlyMode() && playbooksReleaseLabel) {
              <span class="release-badge">{{ playbooksReleaseLabel }}</span>
            }
          </h3>
          @if (playbooks().length === 0 && !showCreateForm()) {
            <p>
              {{
                practiceScriptsOnlyMode()
                  ? 'Create or import a playbook first. Practice scripts are organized inside a playbook.'
                  : 'No playbooks yet. Start from Agent X or create one manually.'
              }}
            </p>
          }
        </div>
        @if (!showCreateForm() && !practiceScriptsOnlyMode()) {
          <div class="playbooks-list-header-actions">
            <input
              #playbookHeaderImportInput
              type="file"
              class="hidden-file-input"
              accept=".pdf,.doc,.docx,.txt,.rtf,.md,.csv,.xls,.xlsx,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              (change)="onImportPlaybookFilesSelected($event)"
            />
            <button
              type="button"
              class="btn-new btn-new--secondary"
              data-testid="playbook-import-button"
              (click)="openPlaybookImportPicker(playbookHeaderImportInput)"
            >
              <svg
                class="btn-new__icon"
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
              Import
            </button>
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
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, #1a1a1a);
        scrollbar-color: var(--agent-border, rgba(0, 0, 0, 0.08)) transparent;
        container-type: inline-size;
        container-name: playbooks-panel;
      }

      .playbooks-diagram-editor-host {
        display: none;
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
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .release-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--agent-primary, #ccff00);
        background: color-mix(in srgb, var(--agent-primary, #ccff00) 14%, transparent);
        color: var(--agent-primary, #ccff00);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
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

      .btn-new__icon {
        width: 14px;
        height: 14px;
        flex: 0 0 auto;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
        flex-wrap: nowrap;
      }

      .detail-header--actions-only {
        justify-content: space-between;
      }

      .detail-header-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        margin-left: auto;
        flex: 0 0 auto;
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
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .detail-title--inline {
        flex: 1 1 auto;
        min-width: 200px;
      }

      .playbook-detail--practice-scripts {
        gap: 12px;
      }

      .practice-scripts-workspace-header {
        display: grid;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }

      .practice-scripts-workspace-copy {
        display: grid;
        gap: 4px;
      }

      .practice-scripts-workspace-actions {
        display: grid;
        gap: 10px;
        align-items: end;
      }

      .practice-scripts-playbook-select-group {
        display: grid;
        gap: 6px;
      }

      .practice-scripts-playbook-select-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      @media (min-width: 720px) {
        .practice-scripts-workspace-header {
          grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
          align-items: end;
        }

        .practice-scripts-workspace-actions {
          grid-template-columns: minmax(0, 1fr) auto;
        }
      }

      .detail-meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
        gap: 10px;
        flex-wrap: wrap;
      }

      .section-title-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        min-width: 0;
      }

      .football-side-toggle {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: center;
        gap: 2px;
        width: min(100%, 300px);
        padding: 2px;
        border-radius: 999px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      .football-side-btn {
        border: none;
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.7rem;
        font-weight: 700;
        min-width: 0;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        transition: all 120ms ease;
      }

      .football-side-btn:hover {
        color: var(--agent-text-primary, #1a1a1a);
      }

      .football-side-btn--active {
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.15));
        color: var(--agent-text-primary, #1a1a1a);
        border: 1px solid var(--agent-primary, #ccff00);
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

      .release-badge--inline {
        margin-left: auto;
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
      .icon-btn:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
      .icon-btn:disabled:hover {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.08));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
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
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s) infinite
          ease-in-out;
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-card {
          animation: none;
        }
      }

      /* ── Container Responsive Layout ── */
      @container playbooks-panel (max-width: 480px) {
        .detail-header,
        .section-header {
          align-items: stretch;
          flex-wrap: wrap;
        }

        .detail-title--inline {
          min-width: 0;
        }

        .detail-header-actions,
        .section-header-actions,
        .callsheet-workspace-actions {
          width: 100%;
          justify-content: flex-start;
        }

        .detail-meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .football-side-toggle {
          width: 100%;
          border-radius: 12px;
        }
      }

      @container playbooks-panel (min-width: 1080px) {
        .playbooks-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .detail-meta-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @container playbooks-panel (min-width: 1440px) {
        .playbooks-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .plays-list {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @container playbooks-panel (max-width: 760px) {
        .tabs-header {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .tab-btn {
          white-space: normal;
          line-height: 1.25;
          padding: 10px 12px;
        }

        .playbooks-grid,
        .plays-list,
        .plays-filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .form-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .football-side-btn {
          padding-inline: 8px;
        }
      }

      /* ── Tab System ── */
      .detail-section--tabs {
        padding: 0;
        border: none;
        background: transparent;
      }

      .tabs-header {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
        gap: 0;
        border-bottom: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        border-radius: var(--nxt1-radius-md, 12px) var(--nxt1-radius-md, 12px) 0 0;
      }

      .tab-btn {
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
        min-width: 0;
        min-height: 44px;
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
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
        gap: 10px;
        align-items: flex-end;
      }

      .plays-filters label {
        display: grid;
        gap: 4px;
        min-width: 0;
        font-size: 0.74rem;
        font-weight: 600;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .btn-clear-filters {
        height: 30px;
        justify-self: start;
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

      .practice-script-edit-form {
        gap: 10px;
      }

      .practice-script-table--editing {
        min-width: 1080px;
      }

      .practice-script-cell-input {
        min-height: 30px;
        padding: 5px 7px;
        font-size: 0.72rem;
      }

      .practice-script-cell-input--number {
        width: 72px;
      }

      .practice-script-period-actions {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      /* ── Install Plans Tab ── */
      .install-stages {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        align-items: start;
      }

      .install-stage-group {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 12px;
        display: grid;
        gap: 10px;
        align-content: start;
        min-height: 0;
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
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .install-play-head h5 {
        margin: 0;
        flex: 1;
        font-size: 0.8rem;
        font-weight: 700;
      }

      .install-play-view {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
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
        grid-template-columns: minmax(0, 1fr);
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
        overflow: visible;
        position: relative;
        transition:
          border-color 140ms ease,
          background 140ms ease;
      }

      .callsheet-saved-card--menu-open {
        z-index: 90;
      }

      .callsheet-saved-card__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .callsheet-saved-card__copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .callsheet-saved-card__top .callsheet-saved-card__actions {
        margin-left: auto;
        flex-shrink: 0;
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

      .callsheet-saved-card__menu-anchor {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        min-height: 32px;
      }

      .film-list-item__menu-btn.callsheet-saved-card__menu-btn {
        width: 32px;
        height: 32px;
        min-width: 32px;
        min-height: 32px;
        position: static;
        top: auto;
        right: auto;
        transform: none;
      }

      .callsheet-saved-card .film-list-item__menu.callsheet-saved-card__menu {
        top: calc(100% + 6px);
        right: 0;
        z-index: 140;
      }

      .callsheet-saved-card__detail {
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        display: grid;
        gap: 12px;
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

      .callsheet-coach-sheet {
        display: grid;
        gap: 12px;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03)) 92%,
          transparent
        );
      }

      .callsheet-coach-sheet__header {
        display: grid;
        gap: 10px;
      }

      .callsheet-coach-sheet__title-block {
        display: grid;
        gap: 4px;
      }

      .callsheet-coach-sheet__title-block strong {
        font-size: 0.95rem;
        line-height: 1.3;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .callsheet-coach-sheet__eyebrow,
      .callsheet-coach-sheet__label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
      }

      .callsheet-coach-sheet__meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 8px;
      }

      .callsheet-coach-sheet__meta-grid span {
        display: grid;
        gap: 2px;
        padding: 10px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.03));
        font-size: 0.75rem;
      }

      .callsheet-coach-sheet__meta-grid b {
        font-size: 0.68rem;
        text-transform: uppercase;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.55));
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

      .callsheet-group-card--dragging {
        opacity: 0.64;
      }

      .callsheet-group-card--drop-before {
        box-shadow: inset 0 2px 0 var(--nxt1-color-primary, #ccff00);
      }

      .callsheet-group-card--drop-after {
        box-shadow: inset 0 -2px 0 var(--nxt1-color-primary, #ccff00);
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
        cursor: grab;
      }

      .callsheet-group-card__header:active {
        cursor: grabbing;
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

      .film-list-item__menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: transparent;
        padding: 0;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .film-list-item__menu-btn:active {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 10%,
          transparent
        );
      }

      .film-list-item__menu-btn[aria-expanded='true'] {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
      }

      .film-list-item__menu-btn:hover,
      .film-list-item__menu-btn:focus-visible {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
        outline: none;
      }

      .film-list-item__menu-backdrop {
        position: fixed;
        inset: 0;
        background: transparent;
        border: 0;
        margin: 0;
        padding: 0;
        z-index: 2;
      }

      .film-list-item__menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: var(--nxt1-spacing-52, 13rem);
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
        z-index: 100;
        overflow: hidden;
      }

      .film-list-item__menu-action {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--nxt1-nav-text);
        text-align: left;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.25;
        cursor: pointer;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
      }

      .film-list-item__menu-action:hover,
      .film-list-item__menu-action:focus-visible,
      .film-list-item__menu-action:active {
        background: var(--nxt1-nav-hover-bg);
        outline: none;
      }

      .film-list-item__menu-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .film-list-item__menu-action--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }

      .film-list-item__menu-action--primary {
        color: var(--log-primary, var(--nxt1-color-primary));
      }

      .film-list-item__menu-rename,
      .film-list-item__menu-confirm {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .film-list-item__menu-label {
        display: block;
        padding: 2px 4px 0;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .film-list-item__menu-input {
        width: 100%;
        border-radius: var(--nxt1-radius-md, 10px);
        border: 1px solid var(--log-border, var(--nxt1-color-border-default));
        background: var(--log-surface, var(--nxt1-color-surface-100));
        color: var(--log-text-primary, var(--nxt1-color-text-primary));
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        outline: none;
      }

      .film-list-item__menu-input:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }

      .film-list-item__menu-actions {
        display: flex;
        gap: 4px;
      }

      .film-list-item__menu-actions .film-list-item__menu-action {
        justify-content: center;
      }

      .film-list-item__menu-confirm-text {
        margin: 0;
        padding: 2px 4px;
        color: var(--nxt1-nav-text);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
      }

      .film-list-item__menu-btn.callsheet-group-card__menu-btn {
        width: 32px;
        height: 32px;
        min-width: 32px;
        min-height: 32px;
        position: static;
        top: auto;
        right: auto;
        transform: none;
      }

      .callsheet-group-card .callsheet-group-card__menu-btn {
        z-index: 6;
      }

      .callsheet-group-card .film-list-item__menu.callsheet-group-card__menu {
        top: calc(100% + 6px);
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

      /* Final panel-width bands: keep playbook workspaces dense as the panel expands. */
      .playbooks-grid,
      .plays-list,
      .callsheet-saved-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .install-stages {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      @container playbooks-panel (min-width: 900px) {
        .playbooks-grid,
        .plays-list,
        .callsheet-saved-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @container playbooks-panel (min-width: 1100px) {
        .playbooks-grid,
        .plays-list,
        .callsheet-saved-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @container playbooks-panel (max-width: 620px) {
        .tabs-header,
        .playbooks-grid,
        .plays-list,
        .callsheet-saved-grid,
        .plays-filters,
        .form-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .install-stages {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AgentXPlaybooksPanelComponent {
  // --- Play Filters State ---
  private readonly _playFilters = signal<{
    personnel?: string;
    side?: 'offense' | 'defense' | 'special-teams';
    concept?: string;
    formation?: string;
    playType?: string;
  }>({});
  protected readonly playFilters = this._playFilters.asReadonly();
  protected readonly installDragOverStage = signal<'install' | 'rep' | 'game-ready' | null>(null);
  protected readonly draggingInstallPlayIndex = signal<number | null>(null);

  protected onPlayFilterChange(
    key: 'personnel' | 'side' | 'concept' | 'formation' | 'playType',
    event: Event
  ): void {
    const value = (event.target as HTMLSelectElement).value;
    if (key === 'side' && this.isFootballSport()) {
      this.setFootballSide(value === 'offense' || value === 'defense' ? value : undefined);
      return;
    }

    this._playFilters.update((prev) => {
      const next = { ...prev, [key]: value || undefined };

      if (key === 'playType' && value) {
        next.concept = undefined;
      }

      return next;
    });
  }

  protected setFootballSide(side: 'offense' | 'defense' | 'special-teams' | undefined): void {
    this._playFilters.update((prev) => ({
      ...prev,
      side,
      playType: undefined,
      concept: undefined,
    }));
  }

  protected clearPlayFilters(): void {
    this._playFilters.set({});
  }

  protected readonly hasActivePlayFilters = computed(() => {
    const { personnel, side, concept, formation, playType } = this._playFilters();
    return [personnel, side, concept, formation, playType].some(
      (value) => (value ?? '').trim().length > 0
    );
  });

  protected readonly filteredPlays = computed(() => {
    const plays = this.selectedPlaybook()?.plays || [];
    const { personnel, side, concept, formation, playType } = this._playFilters();

    const normalize = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

    const matchesFootballPlayType = (play: PlaybookPlay, wantedType: string): boolean => {
      const desired = normalize(wantedType);
      if (!desired) return true;

      const playTypeValue = normalize(play.playType);
      const tags = (play.conceptTags ?? []).map((tag) => normalize(tag));
      const haystack = [
        playTypeValue,
        normalize(play.title),
        normalize(play.name),
        normalize(play.objective),
        ...tags,
      ].join(' ');

      if (desired === 'coverage') {
        return (
          playTypeValue.includes('coverage') ||
          playTypeValue.includes('cover') ||
          tags.some((tag) => tag.includes('coverage') || tag.includes('cover')) ||
          haystack.includes('coverage') ||
          haystack.includes('cover ')
        );
      }

      return (
        playTypeValue.includes(desired) ||
        tags.some((tag) => tag.includes(desired)) ||
        haystack.includes(desired)
      );
    };

    return plays.filter((play) => {
      if (personnel && play.personnel !== personnel) return false;
      if (formation && play.formation !== formation) return false;
      if (side) {
        const playSide = normalize(play.category);
        if (side === 'special-teams') {
          if (
            !['special-teams', 'special teams', 'specialteams', 'st'].some(
              (entry) => playSide === entry
            )
          ) {
            if (
              !['kickoff', 'punt', 'return', 'field goal', 'extra point', 'pat'].some((entry) =>
                [
                  playSide,
                  normalize(play.playType),
                  normalize(play.objective),
                  normalize(play.title),
                  normalize(play.name),
                ]
                  .join(' ')
                  .includes(entry)
              )
            ) {
              return false;
            }
          }
        } else if (playSide !== side) {
          return false;
        }
      }
      if (playType && !matchesFootballPlayType(play, playType)) return false;
      if (concept && !(play.conceptTags || []).includes(concept)) return false;
      return true;
    });
  });

  private readonly http = inject(HttpClient);
  private readonly agentX = inject(AgentXService);
  private readonly logger = inject(NxtLoggingService).child('AgentXPlaybooksPanel');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly toast = inject(NxtToastService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly playbooksService = inject(PlaybooksService);
  private readonly document = inject(DOCUMENT);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;
  private readonly diagramsPanel = viewChild(AgentXDiagramsPanelComponent);
  protected readonly testIds = TEST_IDS.PLAYBOOK;
  protected readonly playbooksReleaseLabel = getAgentXReleaseLabel('playbooks');
  protected readonly generatedPlaysReleaseLabel = getAgentXReleaseLabel('generatedPlays');
  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  // ── Read state ──────────────────────────────────────────────────────────────
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly printing = signal(false);
  protected readonly printError = signal<string | null>(null);
  protected readonly _teamId = signal<string | null>(null);
  protected readonly _inputSport = signal<string | null>(null);
  protected readonly _practiceScriptsOnly = signal(false);
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
  protected readonly isPlaybookAskAgentMenuVisible = signal(false);
  protected readonly playbookAskAgentPromptOptions = PLAYBOOK_ASK_AGENT_PROMPTS;
  protected readonly deletingPlayIndex = signal<number | null>(null);
  protected readonly savingPlay = signal(false);

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
  protected readonly activeCallsheetMenuId = signal<string | null>(null);
  protected readonly deletingCallsheetId = signal<string | null>(null);
  protected readonly callsheetGroupDraft = signal<readonly CallsheetGroup[]>([]);
  protected readonly callsheetGroupAddPlayDrafts = signal<Readonly<Record<string, string>>>({});
  protected readonly callsheetGroupsSaving = signal(false);
  protected readonly draggingCallsheetGroupId = signal<string | null>(null);
  protected readonly callsheetGroupDropIndicator = signal<{
    groupId: string;
    placement: 'before' | 'after';
  } | null>(null);
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
  protected readonly hasUnsavedCallsheetGroupChanges = computed(() => {
    const detail = this.selectedCallsheetDetail();
    if (!detail) return false;

    const savedGroups = this.normalizeCallsheetGroupsForUi(detail.groups, detail.plays ?? []);
    const draftGroups = this.normalizeCallsheetGroupsForUi(
      this.callsheetGroupDraft(),
      detail.plays ?? []
    );

    return !this.areCallsheetGroupsEqual(savedGroups, draftGroups);
  });
  protected readonly installPlanReasonings = signal<Map<string, string>>(new Map());
  private readonly installNotesFormatCache = new Map<string, readonly string[]>();

  // ── Practice Scripts: Script matrix workspace ───────────────────────────────
  protected readonly practiceScripts = signal<readonly PracticeScriptSummary[]>([]);
  protected readonly practiceScriptsLoading = signal(false);
  protected readonly selectedPracticeScriptId = signal<string | null>(null);
  protected readonly selectedPracticeScriptDetail = signal<PracticeScriptDetail | null>(null);
  protected readonly selectedPracticeScriptDetailLoading = signal(false);
  protected readonly activePracticeScriptMenuId = signal<string | null>(null);
  protected readonly deletingPracticeScriptId = signal<string | null>(null);
  protected readonly editingPracticeScriptId = signal<string | null>(null);
  protected readonly practiceScriptEditForm = signal<PracticeScriptEditForm>({
    ...EMPTY_PRACTICE_SCRIPT_EDIT_FORM,
  });
  protected readonly savingPracticeScript = signal(false);
  protected readonly savingPracticeScriptOrder = signal(false);

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
  protected readonly practiceScriptsOnlyMode = computed(() => this._practiceScriptsOnly());
  protected readonly hasTeamContext = computed(() => {
    const id = this._teamId();
    return typeof id === 'string' && id.trim().length > 0;
  });
  protected readonly activeSport = computed(
    () => this._inputSport() ?? this.selectedPlaybook()?.sport ?? ''
  );
  protected readonly isFootballSport = computed(() =>
    this.activeSport().trim().toLowerCase().includes('football')
  );
  protected readonly sportConfig = computed(() => getSportPlaybookConfig(this.activeSport()));
  protected readonly footballPlayTypeLabel = computed(() => {
    const side = this.playFilters().side;
    if (side === 'defense') return 'Blitz/Coverage';
    if (side === 'special-teams') return 'Kick/Punt Type';
    return 'Run/Pass Type';
  });
  protected readonly footballPlayTypeOptions = computed(() => {
    const side = this.playFilters().side;
    if (side === 'defense') {
      return [
        { value: 'blitz', label: 'Blitz' },
        { value: 'coverage', label: 'Coverage' },
      ] as const;
    }

    if (side === 'special-teams') {
      return [
        { value: 'kickoff', label: 'Kickoff' },
        { value: 'punt', label: 'Punt' },
        { value: 'return', label: 'Return' },
        { value: 'field goal', label: 'Field Goal' },
        { value: 'extra point', label: 'Extra Point' },
      ] as const;
    }

    return [
      { value: 'run', label: 'Run' },
      { value: 'pass', label: 'Pass' },
    ] as const;
  });

  private applyDefaultFootballPlayFilters(playbook: PlaybookDetail | null): void {
    if (!playbook || !this.isFootballSport()) return;

    const currentFilters = this._playFilters();
    if (currentFilters.side) return;

    this._playFilters.set({
      ...currentFilters,
      side: 'offense',
    });
  }
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

  protected onPracticeScriptsPlaybookChange(event: Event): void {
    const nextPlaybookId = (event.target as HTMLSelectElement).value;
    if (!nextPlaybookId) return;

    const nextPlaybook = this.playbooks().find((playbook) => playbook.id === nextPlaybookId);
    if (!nextPlaybook || nextPlaybook.id === this.selectedPlaybook()?.id) {
      return;
    }

    this.selectPlaybook(nextPlaybook);
  }

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

  @Input()
  set practiceScriptsOnly(value: boolean | string | null | undefined) {
    const normalized = value === '' || value === true || value === 'true';
    this._practiceScriptsOnly.set(normalized);
    if (normalized) {
      this.activePlaybookTab.set('play-script');
    }
  }

  constructor() {
    void this.loadPlaybooks();
  }

  protected clearSelection(): void {
    this.selectedPlaybook.set(null);
    this.printError.set(null);
    this.activePlaybookTab.set(this.getDefaultActivePlaybookTab());
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
    this.activeCallsheetMenuId.set(null);
    this.deletingCallsheetId.set(null);
    this.callsheetGroupDraft.set([]);
    this.callsheetGroupAddPlayDrafts.set({});
    this.callsheetGroupsSaving.set(false);
    this.draggingCallsheetGroupId.set(null);
    this.callsheetGroupDropIndicator.set(null);
    this.callsheetPendingRemovalPlayName.set(null);
    this.collapsedCallsheetGroupIds.set(new Set());
    this.activeCallsheetGroupMenuId.set(null);
    this.isPlaybookAskAgentMenuVisible.set(false);
    this.practiceScripts.set([]);
    this.practiceScriptsLoading.set(false);
    this.selectedPracticeScriptId.set(null);
    this.selectedPracticeScriptDetail.set(null);
    this.selectedPracticeScriptDetailLoading.set(false);
    this.activePracticeScriptMenuId.set(null);
    this.deletingPracticeScriptId.set(null);
    this.editingPracticeScriptId.set(null);
    this.practiceScriptEditForm.set({ ...EMPTY_PRACTICE_SCRIPT_EDIT_FORM });
    this.savingPracticeScript.set(false);
    this.savingPracticeScriptOrder.set(false);
    this.installPlanReasonings.set(new Map());
    this.gamePlans.set([]);
    this.gamePlansLoading.set(false);
    this.gamePlanSaving.set(false);
    this.editingGamePlanId.set(null);
    this.editingGamePlanPlays.set([]);
    this.editingMeta.set(false);
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

  public async refreshData(): Promise<void> {
    const selectedPlaybookId = this.selectedPlaybook()?.id ?? null;
    const selectedCallsheetId = this.selectedCallsheetId();
    const selectedPracticeScriptId = this.selectedPracticeScriptId();

    await this.loadPlaybooks();

    if (
      !selectedPlaybookId ||
      !this.playbooks().some((playbook) => playbook.id === selectedPlaybookId)
    ) {
      return;
    }

    await this.loadPlaybookDetail(selectedPlaybookId);

    if (selectedCallsheetId && this.selectedCallsheetId() === selectedCallsheetId) {
      await this.loadSelectedCallsheetDetail(selectedCallsheetId);
    }

    if (selectedPracticeScriptId && this.selectedPracticeScriptId() === selectedPracticeScriptId) {
      await this.loadSelectedPracticeScriptDetail(selectedPracticeScriptId);
    }
  }

  protected reload(): void {
    this.clearSelection();
    void this.loadPlaybooks();
  }

  protected async openPrintOptions(): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook || this.printing()) return;

    const overlayRef = this.overlay.open<
      AgentXPlaybookPrintOptionsModalComponent,
      AgentXPlaybookPrintSelection | null
    >({
      component: AgentXPlaybookPrintOptionsModalComponent,
      inputs: {
        playbookTitle: playbook.title || playbook.name || 'Playbook',
        sport: playbook.sport,
        practiceScriptsOnly: this.practiceScriptsOnlyMode(),
        hasActivePlayFilters: this.hasActivePlayFilters(),
        filteredPlayCount: this.filteredPlays().length,
        totalPlayCount: playbook.plays?.length ?? 0,
        callsheets: this.callsheets(),
        practiceScripts: this.practiceScripts(),
        initialSelection: this.buildDefaultPrintSelection(),
      },
      size: 'lg',
      ariaLabel: 'Print playbook options',
      panelClass: 'agent-x-playbook-print-overlay',
      backdropDismiss: true,
      escDismiss: true,
      showCloseButton: false,
    });

    const result = await overlayRef.closed;
    if (result.reason !== 'close' || !result.data) return;

    await this.printSelection(result.data);
  }

  protected async printCurrentPlaybook(): Promise<void> {
    await this.printSelection(this.buildDefaultPrintSelection());
  }

  private async printSelection(selection: AgentXPlaybookPrintSelection): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.printing()) return;

    this.printing.set(true);
    this.printError.set(null);

    const activeTab = selection.scope === 'full' ? 'full' : selection.targetTab;

    this.logger.info('Preparing playbook print packet', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      activeTab,
      scope: selection.scope,
      targetTab: selection.targetTab,
      practiceScriptsOnly: this.practiceScriptsOnlyMode(),
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:print', {
      status: 'pending',
      activeTab,
      scope: selection.scope,
      targetTab: selection.targetTab,
      practiceScriptsOnly: this.practiceScriptsOnlyMode(),
    });

    try {
      const request = await this.resolvePrintDocumentRequest(playbook, selection);

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'playbook_print_requested',
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
        playCount: request.plays.length,
      });

      this.printPlaybookPacket(playbook, request);

      this.breadcrumb.trackStateChange('agent-x:playbooks:print', {
        status: 'ready',
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'playbook_print_opened',
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
        playCount: request.plays.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to prepare print preview';
      this.printError.set(message);
      this.logger.error('Playbook print preview failed', err, {
        playbookId: playbook.id,
        teamId: playbook.teamId,
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
      });
      this.breadcrumb.trackStateChange('agent-x:playbooks:print', {
        status: 'failed',
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'playbook_print_failed',
        playbookId: playbook.id,
        teamId: playbook.teamId,
        sport: playbook.sport,
        activeTab,
        scope: selection.scope,
        targetTab: selection.targetTab,
      });
    } finally {
      this.printing.set(false);
    }
  }

  private printPlaybookPacket(
    playbook: PlaybookDetail,
    request: PlaybookPrintDocumentRequest
  ): void {
    const hostWindow = this.document.defaultView;
    if (!hostWindow?.document?.body) {
      throw new Error('Print preview is unavailable in this environment');
    }

    const iframe = this.document.createElement('iframe');
    iframe.title = 'NXT1 Playbook Print Preview';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    const removeIframe = (): void => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        removeIframe();
        return;
      }

      let cleanedUp = false;
      const cleanup = (): void => {
        if (cleanedUp) return;
        cleanedUp = true;
        removeIframe();
      };

      printWindow.addEventListener('afterprint', cleanup, { once: true });
      hostWindow.setTimeout(cleanup, 60_000);
      hostWindow.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    };

    hostWindow.document.body.appendChild(iframe);

    const printDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!printDocument) {
      removeIframe();
      throw new Error('Unable to create playbook print preview document');
    }

    printDocument.open();
    printDocument.write(this.buildPlaybookPrintHtml(playbook, request));
    printDocument.close();
  }

  private buildPlaybookPrintHtml(
    playbook: PlaybookDetail,
    request: PlaybookPrintDocumentRequest
  ): string {
    const title = (playbook.title || playbook.name || 'Playbook').trim();
    const generatedAt = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const packetLabel = this.getPrintPacketLabel(request);
    const inventoryValue = this.getPrintInventoryLabel(request);
    const metaItems = [
      { label: 'Sport', value: playbook.sport ? toTitleCase(playbook.sport) : 'Team' },
      { label: 'Season', value: playbook.season ?? 'Current' },
      { label: 'Inventory', value: inventoryValue },
      { label: 'Updated', value: this.formatDate(playbook.updatedAt || playbook.createdAt) },
    ];
    const filterLabel = request.useFilteredPlays ? '<span class="print-pill">Filtered</span>' : '';
    const installBoardHtml = request.includeInstallBoard
      ? this.buildPrintInstallBoard(request.plays)
      : '';
    const callsheetHtml = request.includeCallsheet
      ? this.buildPrintCallsheetSection(
          request.callsheet,
          request.generatedCallsheetRows,
          this.getCallsheetSituationText()
        )
      : '';
    const practiceScriptHtml = request.includePracticeScript
      ? this.buildPrintPracticeScriptSection(request.practiceScript)
      : '';
    const playsHtml =
      request.includePlays && request.plays.length > 0
        ? request.plays.map((play, index) => this.buildPrintPlayCard(play, index)).join('')
        : '<section class="empty-state">No plays are available for this coach packet.</section>';
    const playsSectionHtml = request.includePlays
      ? `<section class="packet-section packet-section--plays">
        <div class="section-heading">
          <p class="eyebrow">Play Cards</p>
          <h2>Staff Detail Sheets</h2>
        </div>
      </section>
      <section class="plays-section" aria-label="Printable plays">
        ${playsHtml}
      </section>`
      : '';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${this.escapePrintText(title)} | NXT1 Playbook</title>
    <style>${this.buildPlaybookPrintStyles()}</style>
  </head>
  <body>
    <main class="packet">
      <header class="packet-header">
        <div>
          <p class="eyebrow">${this.escapePrintText(packetLabel)}</p>
          <h1>${this.escapePrintText(title)}</h1>
        </div>
        <div class="header-aside">
          ${filterLabel}
          <span>Generated ${this.escapePrintText(generatedAt)}</span>
        </div>
      </header>
      <section class="meta-grid">
        ${metaItems
          .map(
            (item) =>
              `<span><strong>${this.escapePrintText(item.label)}</strong>${this.escapePrintText(item.value)}</span>`
          )
          .join('')}
      </section>
      ${installBoardHtml}
      ${callsheetHtml}
      ${practiceScriptHtml}
      ${playsSectionHtml}
    </main>
  </body>
</html>`;
  }

  private buildPrintInstallBoard(plays: readonly PlaybookPlay[]): string {
    if (!plays.length) return '';

    const stageCards = INSTALL_STAGES.map((stage) => {
      const stagePlays = plays.filter((play) => (play.installStage ?? 'install') === stage);
      const playList = stagePlays
        .slice(0, 8)
        .map(
          (play) => `<li>${this.escapePrintText(play.title || play.name || 'Untitled Play')}</li>`
        )
        .join('');
      const overflow =
        stagePlays.length > 8 ? `<li class="muted">+${stagePlays.length - 8} more</li>` : '';

      return `<article class="install-summary-card">
        <span>${this.escapePrintText(getStageDisplayNameValue(stage))}</span>
        <strong>${stagePlays.length}</strong>
        <ul>${playList || '<li class="muted">No plays assigned</li>'}${overflow}</ul>
      </article>`;
    }).join('');

    return `<section class="packet-section">
      <div class="section-heading">
        <p class="eyebrow">Install Board</p>
        <h2>Teaching Progression</h2>
      </div>
      <div class="install-summary-grid">${stageCards}</div>
    </section>`;
  }

  private buildPrintCallsheetSection(
    callsheet: CallsheetDetail | null,
    generatedRows: readonly CallsheetAiPlayRanking[],
    generatedSituationText: string
  ): string {
    const callsheetPlays = callsheet?.plays?.length ? callsheet.plays : generatedRows;
    if (!callsheetPlays.length) return '';

    const playByName = new Map(callsheetPlays.map((play) => [play.playName, play] as const));
    const groups = callsheet?.groups?.length
      ? callsheet.groups
      : [
          {
            id: 'print-primary',
            name: callsheet?.title ?? 'Call Menu',
            playNames: callsheetPlays.map((play) => play.playName),
          },
        ];
    const rows = groups
      .flatMap((group) =>
        group.playNames
          .map((playName) => ({ groupName: group.name, play: playByName.get(playName) }))
          .filter(
            (
              row
            ): row is {
              groupName: string;
              play: { playName: string; score: number; reasoning: string };
            } => Boolean(row.play)
          )
      )
      .map(
        (row) => `<tr>
          <td>${this.escapePrintText(row.groupName)}</td>
          <td>${this.escapePrintText(row.play.playName)}</td>
          <td>${this.escapePrintText(`${Math.round(row.play.score)}/100`)}</td>
          <td>${this.escapePrintText(row.play.reasoning)}</td>
        </tr>`
      )
      .join('');

    return `<section class="packet-section">
      <div class="section-heading section-heading--split">
        <div>
          <p class="eyebrow">Callsheet</p>
          <h2>${this.escapePrintText(callsheet?.title ?? 'Situational Menu')}</h2>
        </div>
        <span>${this.escapePrintText(callsheet?.situation ?? generatedSituationText)}</span>
      </div>
      ${callsheet?.notes ? `<p class="packet-note">${this.escapePrintText(callsheet.notes)}</p>` : ''}
      <table class="print-table print-table--callsheet">
        <thead><tr><th>Group</th><th>Call</th><th>Grade</th><th>Why</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  private buildPrintPracticeScriptSection(script: PracticeScriptDetail | null): string {
    const periods = script?.periods ?? [];
    if (!script || !periods.length) return '';

    const rows = periods
      .map(
        (period, index) => `<tr>
          <td>${index + 1}</td>
          <td>${this.escapePrintText(period.label)}</td>
          <td>${this.escapePrintText(period.clock)}</td>
          <td>${this.escapePrintText(period.reps)}</td>
          <td>${this.escapePrintText(period.callType)}</td>
          <td>${this.escapePrintText(period.playName)}</td>
          <td>${this.escapePrintText(period.coachingPoint || period.notes || '')}</td>
        </tr>`
      )
      .join('');

    const objectives = (script.objectives ?? [])
      .map((objective) => `<span>${this.escapePrintText(objective)}</span>`)
      .join('');

    return `<section class="packet-section">
      <div class="section-heading section-heading--split">
        <div>
          <p class="eyebrow">Practice Script</p>
          <h2>${this.escapePrintText(script.title)}</h2>
        </div>
        <span>${this.escapePrintText(script.focus)} • ${this.escapePrintText(script.tempo)}</span>
      </div>
      ${objectives ? `<div class="mini-chip-row mini-chip-row--objectives">${objectives}</div>` : ''}
      <table class="print-table print-table--script">
        <thead><tr><th>#</th><th>Period</th><th>Clock</th><th>Reps</th><th>Type</th><th>Call</th><th>Coaching Point</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${script.notes ? `<p class="packet-note">${this.escapePrintText(script.notes)}</p>` : ''}
    </section>`;
  }

  private buildPrintPlayCard(play: PlaybookPlay, index: number): string {
    const title = (play.title || play.name || `Play ${index + 1}`).trim();
    const breakdown = this.buildPlayBreakdown(play);
    const diagram = this.buildPrintDiagram(play, title);
    const metaChips = breakdown.metaChips
      .map((chip) => `<span class="chip">${this.escapePrintText(chip)}</span>`)
      .join('');
    const sections = breakdown.sections.map((section) => this.buildPrintSection(section)).join('');
    const cardClass = diagram
      ? 'play-card play-card--with-diagram'
      : 'play-card play-card--text-only';

    return `<article class="${cardClass}">
      <div class="play-card-header">
        <span class="play-number">${String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>${this.escapePrintText(title)}</h2>
          ${breakdown.subtitle ? `<p>${this.escapePrintText(breakdown.subtitle)}</p>` : ''}
        </div>
      </div>
      ${metaChips ? `<div class="chip-row">${metaChips}</div>` : ''}
      <div class="play-body">
        ${diagram ?? ''}
        <div class="play-sections">${sections || '<p class="muted">No coaching notes yet.</p>'}</div>
      </div>
    </article>`;
  }

  private buildPrintSection(section: {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
    chips?: string[];
  }): string {
    const paragraphs = (section.paragraphs ?? [])
      .filter((item) => item.trim().length > 0)
      .map((item) => `<p>${this.escapePrintText(item)}</p>`)
      .join('');
    const bullets = (section.bullets ?? [])
      .filter((item) => item.trim().length > 0)
      .map((item) => `<li>${this.escapePrintText(item)}</li>`)
      .join('');
    const chips = (section.chips ?? [])
      .filter((item) => item.trim().length > 0)
      .map((item) => `<span>${this.escapePrintText(item)}</span>`)
      .join('');

    return `<section class="print-section">
      <h3>${this.escapePrintText(section.title)}</h3>
      ${paragraphs}
      ${bullets ? `<ul>${bullets}</ul>` : ''}
      ${chips ? `<div class="mini-chip-row">${chips}</div>` : ''}
    </section>`;
  }

  private buildPrintDiagram(play: PlaybookPlay, title: string): string | null {
    const diagramUrl = play.diagramUrl?.trim();
    if (!diagramUrl) {
      return null;
    }

    if (!this.isImageUrl(diagramUrl)) {
      return `<div class="diagram diagram-link">
        <strong>Diagram Resource</strong>
        <span>${this.escapePrintText(diagramUrl)}</span>
      </div>`;
    }

    return `<figure class="diagram">
      <img src="${this.escapePrintAttribute(diagramUrl)}" alt="${this.escapePrintAttribute(title)} diagram" />
      <figcaption>${this.escapePrintText(title)} diagram</figcaption>
    </figure>`;
  }

  private buildPlaybookPrintStyles(): string {
    return `@page { size: letter; margin: 0.36in; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  color: #111827;
  background: #ffffff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.packet { max-width: 8in; margin: 0 auto; }
.packet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 0 0 10px;
  border-bottom: 2.5px solid #111827;
}
.eyebrow {
  margin: 0 0 4px;
  color: #4b5563;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
h1 { margin: 0; font-size: 25px; line-height: 1.04; letter-spacing: 0; }
.header-aside {
  display: grid;
  justify-items: end;
  gap: 5px;
  color: #4b5563;
  font-size: 10px;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
.print-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid #111827;
  border-radius: 999px;
  color: #111827;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 9px 0 10px;
}
.meta-grid span {
  display: grid;
  gap: 2px;
  min-height: 38px;
  padding: 7px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  font-size: 10px;
  font-weight: 850;
}
.meta-grid strong {
  color: #64748b;
  font-size: 7.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.packet-section {
  margin: 12px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.packet-section--plays { margin-bottom: 7px; }
.section-heading {
  margin-bottom: 7px;
  padding-bottom: 5px;
  border-bottom: 1px solid #cbd5e1;
}
.section-heading--split {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: #111827;
  font-size: 14px;
  line-height: 1.1;
}
.section-heading > span,
.section-heading--split > span {
  color: #475569;
  font-size: 9px;
  font-weight: 800;
  text-align: right;
}
.install-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.install-summary-card {
  min-height: 92px;
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-top: 4px solid #111827;
  border-radius: 5px;
  background: #f8fafc;
}
.install-summary-card span {
  display: block;
  color: #475569;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.install-summary-card strong {
  display: block;
  margin: 3px 0;
  color: #111827;
  font-size: 20px;
  line-height: 1;
}
.install-summary-card ul {
  margin: 0;
  padding-left: 13px;
}
.install-summary-card li {
  font-size: 8.5px;
  line-height: 1.25;
}
.packet-note {
  margin: 0 0 7px;
  padding: 7px 8px;
  border-left: 3px solid #111827;
  background: #f8fafc;
  color: #1f2937;
  font-size: 9.5px;
  font-weight: 650;
}
.print-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #111827;
  font-size: 8.6px;
}
.print-table th {
  padding: 5px 5px;
  background: #111827;
  color: #ffffff;
  font-size: 7.5px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
}
.print-table td {
  padding: 5px;
  border-top: 1px solid #d1d5db;
  color: #111827;
  line-height: 1.25;
  vertical-align: top;
  word-break: break-word;
}
.print-table tbody tr:nth-child(even) td { background: #f8fafc; }
.print-table--callsheet th:nth-child(1), .print-table--callsheet td:nth-child(1) { width: 18%; }
.print-table--callsheet th:nth-child(2), .print-table--callsheet td:nth-child(2) { width: 24%; }
.print-table--callsheet th:nth-child(3), .print-table--callsheet td:nth-child(3) { width: 10%; text-align: center; }
.print-table--script th:nth-child(1), .print-table--script td:nth-child(1) { width: 5%; text-align: center; }
.print-table--script th:nth-child(2), .print-table--script td:nth-child(2) { width: 14%; }
.print-table--script th:nth-child(3), .print-table--script td:nth-child(3) { width: 9%; }
.print-table--script th:nth-child(4), .print-table--script td:nth-child(4) { width: 7%; text-align: center; }
.print-table--script th:nth-child(5), .print-table--script td:nth-child(5) { width: 12%; }
.print-table--script th:nth-child(6), .print-table--script td:nth-child(6) { width: 18%; }
.mini-chip-row--objectives { margin: 0 0 7px; }
.plays-section { display: grid; gap: 12px; }
.play-card {
  border: 1px solid #111827;
  border-radius: 6px;
  padding: 10px;
  background: #ffffff;
  break-inside: auto;
  page-break-inside: auto;
}
.play-card + .play-card {
  margin-top: 4px;
}
.play-card-header {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  break-inside: avoid;
  page-break-inside: avoid;
}
.play-number {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: #111827;
  color: #ffffff;
  font-size: 11px;
  font-weight: 900;
}
.play-card h2 { margin: 0; font-size: 15px; line-height: 1.12; letter-spacing: 0; }
.play-card-header p { margin: 3px 0 0; color: #4b5563; font-size: 10px; font-weight: 700; }
.chip-row, .mini-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;
}
.chip, .mini-chip-row span {
  display: inline-flex;
  align-items: center;
  min-height: 17px;
  padding: 1px 6px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f8fafc;
  color: #111827;
  font-size: 9px;
  font-weight: 800;
}
.play-body {
  display: grid;
  gap: 10px;
  margin-top: 9px;
}
.play-card--with-diagram .play-body {
  grid-template-columns: minmax(0, 1fr);
}
.play-card--text-only .play-body {
  grid-template-columns: minmax(0, 1fr);
}
.diagram {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  min-height: 150px;
  max-height: 245px;
  margin: 0;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #f9fafb;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
  justify-self: center;
  width: min(100%, 5.8in);
}
.diagram img { display: block; width: 100%; max-height: 220px; object-fit: contain; }
.diagram figcaption, .diagram span { padding: 0 8px 6px; color: #4b5563; font-size: 9px; font-weight: 700; word-break: break-word; }
.diagram-link { padding: 10px; align-items: start; justify-items: start; }
.diagram-link strong { font-size: 10px; }
.play-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  align-content: start;
}
.play-card--with-diagram .play-sections {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.print-section {
  break-inside: avoid;
  page-break-inside: avoid;
  padding-top: 1px;
}
h3 {
  margin: 0 0 2px;
  color: #111827;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.print-section p, .muted { margin: 0; color: #1f2937; font-size: 10px; }
ul { margin: 0; padding-left: 14px; }
li { margin: 0; color: #1f2937; font-size: 10px; }
li + li { margin-top: 2px; }
.empty-state {
  border: 1px dashed #9ca3af;
  border-radius: 6px;
  padding: 24px;
  color: #4b5563;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
@media (max-width: 720px) {
  .packet-header, .play-body { display: grid; grid-template-columns: 1fr; }
  .header-aside { justify-items: start; text-align: left; }
  .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .install-summary-grid { grid-template-columns: 1fr; }
  .section-heading--split { display: grid; }
  .section-heading--split > span { text-align: left; }
  .play-sections { grid-template-columns: 1fr; }
}`;
  }

  private escapePrintText(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapePrintAttribute(value: unknown): string {
    return this.escapePrintText(value).replace(/`/g, '&#96;');
  }

  private buildDefaultPrintSelection(): AgentXPlaybookPrintSelection {
    const targetTab = this.getDefaultPrintTargetTab();
    const useGeneratedCallsheetBoard = targetTab === 'callsheet' && !this.selectedCallsheetId();

    return {
      scope: 'current',
      targetTab,
      useFilteredPlays:
        this.hasActivePlayFilters() && (targetTab === 'plays' || targetTab === 'install'),
      useGeneratedCallsheetBoard,
      callsheetId: useGeneratedCallsheetBoard ? null : this.selectedCallsheetId(),
      practiceScriptId: this.selectedPracticeScriptId(),
    };
  }

  private async resolvePrintDocumentRequest(
    playbook: PlaybookDetail,
    selection: AgentXPlaybookPrintSelection
  ): Promise<PlaybookPrintDocumentRequest> {
    const useFilteredPlays = selection.useFilteredPlays && this.hasActivePlayFilters();
    const plays = useFilteredPlays ? this.filteredPlays() : (playbook.plays ?? []);
    const includeCallsheet = selection.scope === 'full' || selection.targetTab === 'callsheet';
    const includePracticeScript =
      selection.scope === 'full' || selection.targetTab === 'play-script';

    const callsheet =
      includeCallsheet && !selection.useGeneratedCallsheetBoard && selection.callsheetId
        ? await this.fetchCallsheetDetailForPrint(selection.callsheetId)
        : null;
    const practiceScript =
      includePracticeScript && selection.practiceScriptId
        ? await this.fetchPracticeScriptDetailForPrint(selection.practiceScriptId)
        : null;

    return {
      scope: selection.scope,
      targetTab: selection.targetTab,
      plays,
      callsheet,
      practiceScript,
      generatedCallsheetRows: selection.useGeneratedCallsheetBoard
        ? this.buildGeneratedCallsheetRows()
        : [],
      useFilteredPlays,
      includeInstallBoard: selection.scope === 'full' || selection.targetTab === 'install',
      includeCallsheet:
        includeCallsheet && (selection.useGeneratedCallsheetBoard || callsheet !== null),
      includePracticeScript: includePracticeScript && practiceScript !== null,
      includePlays: selection.scope === 'full' || selection.targetTab === 'plays',
    };
  }

  private async fetchCallsheetDetailForPrint(callsheetId: string): Promise<CallsheetDetail | null> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || !callsheetId.trim()) {
      return null;
    }

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

    return response.data.callsheet;
  }

  private async fetchPracticeScriptDetailForPrint(
    scriptId: string
  ): Promise<PracticeScriptDetail | null> {
    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || !scriptId.trim()) {
      return null;
    }

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

    return {
      ...response.data.script,
      periods: normalizePracticeScriptPeriods(response.data.script.periods),
    };
  }

  private buildGeneratedCallsheetRows(): readonly CallsheetAiPlayRanking[] {
    return this.filteredCallsheetPlays()
      .map((play, index) => {
        const playName = (play.title || play.name || `Play ${index + 1}`).trim();
        const aiRanking = this.callsheetAiRankings().get(playName);

        return {
          playName,
          score: aiRanking?.score ?? Math.round((play.successRate ?? 0) * 100),
          reasoning:
            aiRanking?.reasoning ??
            'Selected from current situation filters and baseline playbook fit.',
        } satisfies CallsheetAiPlayRanking;
      })
      .filter((play) => play.playName.length > 0);
  }

  private getPrintPacketLabel(request: PlaybookPrintDocumentRequest): string {
    if (request.scope === 'full') return 'NXT1 Full Coach Packet';

    switch (request.targetTab) {
      case 'install':
        return 'NXT1 Install Board';
      case 'callsheet':
        return 'NXT1 Callsheet';
      case 'play-script':
        return 'NXT1 Practice Script';
      case 'plays':
      default:
        return 'NXT1 Play Cards';
    }
  }

  private getPrintInventoryLabel(request: PlaybookPrintDocumentRequest): string {
    if (request.scope === 'current' && request.targetTab === 'callsheet') {
      const callCount = request.callsheet?.plays?.length ?? request.generatedCallsheetRows.length;
      return `${callCount} ${callCount === 1 ? 'call' : 'calls'}`;
    }

    if (request.scope === 'current' && request.targetTab === 'play-script') {
      const periodCount = request.practiceScript?.periods?.length ?? 0;
      return `${periodCount} ${periodCount === 1 ? 'period' : 'periods'}`;
    }

    return `${request.plays.length} ${request.plays.length === 1 ? 'play' : 'plays'}`;
  }

  private getDefaultActivePlaybookTab(): 'plays' | 'install' | 'callsheet' | 'play-script' {
    return this._practiceScriptsOnly() ? 'play-script' : 'plays';
  }

  private getDefaultPrintTargetTab(): AgentXPlaybookPrintTargetTab {
    return this._practiceScriptsOnly() ? 'play-script' : this.activePlaybookTab();
  }

  protected selectPlaybook(playbook: PlaybookSummary): void {
    this.detailLoading.set(true);
    this.selectedPlaybook.set(null);
    this.printError.set(null);
    this.activePlaybookTab.set(this.getDefaultActivePlaybookTab());
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
    this.activePracticeScriptMenuId.set(null);
    this.deletingPracticeScriptId.set(null);
    this.editingPracticeScriptId.set(null);
    this.practiceScriptEditForm.set({ ...EMPTY_PRACTICE_SCRIPT_EDIT_FORM });
    this.savingPracticeScript.set(false);
    this.savingPracticeScriptOrder.set(false);
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

  protected isPlaybookAskAgentMenuOpen(): boolean {
    return this.isPlaybookAskAgentMenuVisible();
  }

  protected onTogglePlaybookAskAgentMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.isPlaybookAskAgentMenuVisible.update((open) => !open);
  }

  protected closePlaybookAskAgentMenu(): void {
    this.isPlaybookAskAgentMenuVisible.set(false);
  }

  protected onPlaybookAskAgentPromptSelect(promptId: PlaybookAskAgentPromptId, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId) {
      this.closePlaybookAskAgentMenu();
      return;
    }

    const prompt = this.buildPlaybookAskAgentPrompt(playbook, promptId);
    this.logger.info('Starting ask-agent prompt from playbooks panel', {
      playbookId: playbook.id,
      teamId: playbook.teamId,
      sport: playbook.sport,
      promptId,
    });
    this.breadcrumb.trackStateChange('agent-x:playbooks:ask-agent-prompt', {
      status: 'chat-started',
      playbookId: playbook.id,
      promptId,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      action: `playbook_ask_agent_${promptId}`,
      teamId: playbook.teamId,
      playbookId: playbook.id,
      sport: playbook.sport,
    });

    this.agentX.queueStartupMessage(prompt);
    this.closePlaybookAskAgentMenu();
  }

  private buildPlaybookAskAgentPrompt(
    playbook: PlaybookDetail,
    promptId: PlaybookAskAgentPromptId
  ): string {
    const playbookName = (playbook.title || playbook.name || 'this playbook').trim();
    const context = `${playbookName} (${playbook.sport})`;

    switch (promptId) {
      case 'gameday-playbook':
        return `Build a gameday playbook from ${context}. Create priority calls, sequencing logic, and fallback counters for key situations.`;
      case 'suggest-new-plays':
        return `Suggest new plays for ${context}. Identify current gaps, then recommend additions with fit rationale.`;
      case 'install-plan':
        return `Create an install plan for ${context}. Organize from install to rep to game-ready with coaching emphasis by phase.`;
      case 'coaching-points':
        return `Generate coaching points for ${context}. Include common busts, correction cues, and position-group emphasis.`;
      case 'create-scout-team-playbook':
        return `Create a scout team playbook from ${context}. Mirror opponent tendencies and produce a practice-ready scout script.`;
      case 'practice-scripts':
        return `Build practice scripts from ${context}. Output period-by-period structure with reps, call focus, and coaching notes.`;
      case 'variations':
        return `Create variations for ${context}. Provide formation, motion, and personnel variants while preserving core teaching.`;
      case 'opening-script':
        return `Build an opening script from ${context}. Give first 10-15 calls and explain what each call is setting up.`;
      case 'tempo-packages':
        return `Create tempo packages for ${context}. Provide normal, fast, and emergency tempo menus with situational guidance.`;
      case 'trick-play-ideas':
        return `Suggest trick play ideas for ${context}. Keep them realistic, high-leverage, and aligned with our identity.`;
    }
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

  protected togglePracticeScript(scriptId: string): void {
    if (this.selectedPracticeScriptId() === scriptId) {
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      this.activePracticeScriptMenuId.set(null);
      return;
    }

    this.selectedPracticeScriptId.set(scriptId);
    void this.loadSelectedPracticeScriptDetail(scriptId);
  }

  protected async printSavedPracticeScript(scriptId: string): Promise<void> {
    if (this.printing()) return;

    await this.printSelection({
      scope: 'current',
      targetTab: 'play-script',
      useFilteredPlays: false,
      useGeneratedCallsheetBoard: false,
      callsheetId: null,
      practiceScriptId: scriptId,
    });
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

      if (this.editingPracticeScriptId() === scriptId) {
        this.cancelEditPracticeScript();
      }

      this.closePracticeScriptMenu();
      await this.loadPracticeScriptsForSelectedPlaybook();
    } catch {
      this.error.set('Unable to delete practice script right now. Please try again.');
    } finally {
      this.deletingPracticeScriptId.set(null);
    }
  }

  protected isPracticeScriptMenuOpen(scriptId: string): boolean {
    return this.activePracticeScriptMenuId() === scriptId;
  }

  protected onOpenPracticeScriptMenu(event: Event, scriptId: string): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.activePracticeScriptMenuId() === scriptId) {
      this.closePracticeScriptMenu();
      return;
    }

    this.closeCallsheetMenu();
    this.closeCallsheetGroupMenu();
    this.activePracticeScriptMenuId.set(scriptId);
  }

  protected closePracticeScriptMenu(): void {
    this.activePracticeScriptMenuId.set(null);
  }

  protected togglePracticeScriptFromMenu(scriptId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.closePracticeScriptMenu();
    this.togglePracticeScript(scriptId);
  }

  protected async printPracticeScriptFromMenu(scriptId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    this.closePracticeScriptMenu();
    await this.printSavedPracticeScript(scriptId);
  }

  protected async deletePracticeScriptFromMenu(scriptId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.deletePracticeScript(scriptId);
  }

  protected isPracticeScriptFirst(scriptId: string): boolean {
    return this.practiceScripts().findIndex((script) => script.id === scriptId) <= 0;
  }

  protected isPracticeScriptLast(scriptId: string): boolean {
    const scripts = this.practiceScripts();
    return scripts.findIndex((script) => script.id === scriptId) === scripts.length - 1;
  }

  protected async movePracticeScriptInList(
    scriptId: string,
    direction: -1 | 1,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    const playbook = this.selectedPlaybook();
    const currentScripts = [...this.practiceScripts()];
    const currentIndex = currentScripts.findIndex((script) => script.id === scriptId);
    const nextIndex = currentIndex + direction;
    if (
      !playbook?.id ||
      !playbook.teamId ||
      this.savingPracticeScriptOrder() ||
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= currentScripts.length
    ) {
      return;
    }

    const nextScripts = [...currentScripts];
    [nextScripts[currentIndex], nextScripts[nextIndex]] = [
      nextScripts[nextIndex],
      nextScripts[currentIndex],
    ];
    const orderedScripts = nextScripts.map((script, index) => ({ ...script, displayOrder: index }));

    this.savingPracticeScriptOrder.set(true);
    this.practiceScripts.set(orderedScripts);
    try {
      await Promise.all(
        orderedScripts.map((script, index) =>
          firstValueFrom(
            this.http.patch<MutationResponse>(
              `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts/${script.id}`,
              {
                teamId: playbook.teamId,
                displayOrder: index,
              }
            )
          )
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'practice_script_reordered',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });
    } catch {
      this.practiceScripts.set(currentScripts);
      this.error.set('Unable to reorder practice scripts right now. Please try again.');
    } finally {
      this.savingPracticeScriptOrder.set(false);
    }
  }

  protected async startEditPracticeScript(scriptId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    this.closePracticeScriptMenu();

    if (this.selectedPracticeScriptId() !== scriptId) {
      this.selectedPracticeScriptId.set(scriptId);
    }

    if (this.selectedPracticeScriptDetail()?.id !== scriptId) {
      await this.loadSelectedPracticeScriptDetail(scriptId);
    }

    const detail = this.selectedPracticeScriptDetail();
    if (!detail || detail.id !== scriptId) return;

    this.editingPracticeScriptId.set(scriptId);
    this.practiceScriptEditForm.set(this.createPracticeScriptEditForm(detail));
  }

  protected async startEditPracticeScriptFromMenu(scriptId: string, event: Event): Promise<void> {
    await this.startEditPracticeScript(scriptId, event);
  }

  protected cancelEditPracticeScript(): void {
    this.editingPracticeScriptId.set(null);
    this.practiceScriptEditForm.set({ ...EMPTY_PRACTICE_SCRIPT_EDIT_FORM });
  }

  protected patchPracticeScriptEditForm(field: keyof PracticeScriptEditForm, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    const value = target?.value ?? '';
    this.practiceScriptEditForm.update((form) => ({ ...form, [field]: value }));
  }

  protected patchPracticeScriptPeriod(
    index: number,
    field: keyof PracticeScriptPeriod,
    event: Event
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    const value = target?.value ?? '';
    this.practiceScriptEditForm.update((form) => {
      const periods = form.periods.map((period, periodIndex) => {
        if (periodIndex !== index) return period;
        if (field === 'reps') {
          const reps = Number(value);
          return { ...period, reps: Number.isFinite(reps) ? Math.max(0, Math.round(reps)) : 0 };
        }
        return { ...period, [field]: value };
      });
      return { ...form, periods };
    });
  }

  protected addPracticeScriptPeriodToForm(): void {
    this.practiceScriptEditForm.update((form) => {
      const nextIndex = form.periods.length + 1;
      const period: PracticeScriptPeriod = {
        id: `period_${Date.now()}_${nextIndex}`,
        label: `Period ${nextIndex}`,
        clock: '--:--',
        reps: 0,
        callType: 'Team',
        playName: 'Open Field',
      };
      return { ...form, periods: [...form.periods, period] };
    });
  }

  protected movePracticeScriptPeriodInForm(index: number, direction: -1 | 1, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.practiceScriptEditForm.update((form) => {
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= form.periods.length) return form;

      const periods = [...form.periods];
      [periods[index], periods[nextIndex]] = [periods[nextIndex], periods[index]];
      return { ...form, periods };
    });
  }

  protected removePracticeScriptPeriodFromForm(index: number, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.practiceScriptEditForm.update((form) => {
      if (form.periods.length <= 1) return form;
      return { ...form, periods: form.periods.filter((_, periodIndex) => periodIndex !== index) };
    });
  }

  protected canSavePracticeScriptEdit(): boolean {
    const form = this.practiceScriptEditForm();
    return !this.savingPracticeScript() && form.title.trim().length > 0 && form.periods.length > 0;
  }

  protected async savePracticeScriptEdit(scriptId: string): Promise<void> {
    const playbook = this.selectedPlaybook();
    const detail = this.selectedPracticeScriptDetail();
    const form = this.practiceScriptEditForm();
    if (!playbook?.id || !playbook.teamId || !detail || detail.id !== scriptId) return;
    if (!this.canSavePracticeScriptEdit()) return;

    const periods = normalizePracticeScriptPeriods(form.periods);
    const objectives = this.parseLineList(form.objectives);
    const payload = {
      teamId: playbook.teamId,
      title: form.title.trim(),
      focus: form.focus.trim(),
      tempo: form.tempo.trim(),
      scriptDate: form.scriptDate.trim(),
      opponent: form.opponent.trim(),
      objectives,
      periods,
      notes: form.notes.trim(),
    };

    this.savingPracticeScript.set(true);
    try {
      const response = await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/practice-scripts/${scriptId}`,
          payload
        )
      );
      const updatedAt =
        typeof response.data?.['updatedAt'] === 'string'
          ? response.data['updatedAt']
          : new Date().toISOString();
      const totalReps = periods.reduce((sum, period) => sum + period.reps, 0);
      const nextDetail: PracticeScriptDetail = {
        ...detail,
        title: payload.title,
        focus: payload.focus,
        tempo: payload.tempo,
        scriptDate: payload.scriptDate || undefined,
        opponent: payload.opponent || undefined,
        objectives,
        periods,
        notes: payload.notes,
        totalPeriods: periods.length,
        totalReps,
        updatedAt,
      };

      this.selectedPracticeScriptDetail.set(nextDetail);
      this.practiceScripts.update((scripts) =>
        scripts.map((script) =>
          script.id === scriptId
            ? {
                ...script,
                title: nextDetail.title,
                focus: nextDetail.focus,
                tempo: nextDetail.tempo,
                scriptDate: nextDetail.scriptDate,
                opponent: nextDetail.opponent,
                totalPeriods: nextDetail.totalPeriods,
                totalReps: nextDetail.totalReps,
                updatedAt,
              }
            : script
        )
      );
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'practice_script_updated',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });
      this.cancelEditPracticeScript();
    } catch {
      this.error.set('Unable to save practice script right now. Please try again.');
    } finally {
      this.savingPracticeScript.set(false);
    }
  }

  private createPracticeScriptEditForm(detail: PracticeScriptDetail): PracticeScriptEditForm {
    return {
      title: detail.title,
      focus: detail.focus,
      tempo: detail.tempo,
      scriptDate: detail.scriptDate ?? '',
      opponent: detail.opponent ?? '',
      objectives: (detail.objectives ?? []).join('\n'),
      notes: detail.notes ?? '',
      periods: normalizePracticeScriptPeriods(detail.periods),
    };
  }

  protected selectCallsheet(callsheetId: string): void {
    this.selectedCallsheetId.set(callsheetId);
    void this.loadSelectedCallsheetDetail(callsheetId);
  }

  protected isCallsheetMenuOpen(callsheetId: string): boolean {
    return this.activeCallsheetMenuId() === callsheetId;
  }

  protected onOpenCallsheetMenu(event: Event, callsheetId: string): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.activeCallsheetMenuId() === callsheetId) {
      this.closeCallsheetMenu();
      return;
    }

    this.closeCallsheetGroupMenu();
    this.activeCallsheetMenuId.set(callsheetId);
  }

  protected closeCallsheetMenu(): void {
    this.activeCallsheetMenuId.set(null);
  }

  protected toggleCallsheetFromMenu(callsheetId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.closeCallsheetMenu();
    this.toggleCallsheet(callsheetId);
  }

  protected async printCallsheetFromMenu(callsheetId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    this.closeCallsheetMenu();
    await this.printSavedCallsheet(callsheetId);
  }

  protected toggleCallsheet(callsheetId: string): void {
    if (this.selectedCallsheetId() === callsheetId) {
      this.selectedCallsheetId.set(null);
      this.selectedCallsheetDetail.set(null);
      this.selectedCallsheetDetailLoading.set(false);
      this.activeCallsheetMenuId.set(null);
      this.deletingCallsheetId.set(null);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.draggingCallsheetGroupId.set(null);
      this.callsheetGroupDropIndicator.set(null);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      return;
    }

    this.selectCallsheet(callsheetId);
  }

  protected async printSavedCallsheet(callsheetId: string): Promise<void> {
    if (this.printing()) return;

    await this.printSelection({
      scope: 'current',
      targetTab: 'callsheet',
      useFilteredPlays: false,
      useGeneratedCallsheetBoard: false,
      callsheetId,
      practiceScriptId: null,
    });
  }

  protected async deleteSavedCallsheet(callsheetId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();

    const playbook = this.selectedPlaybook();
    if (!playbook?.id || !playbook.teamId || this.deletingCallsheetId()) return;

    this.deletingCallsheetId.set(callsheetId);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/callsheets/${callsheetId}`,
          { params: { teamId: playbook.teamId } }
        )
      );

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'callsheet_deleted',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });

      if (this.selectedCallsheetId() === callsheetId) {
        this.selectedCallsheetId.set(null);
        this.selectedCallsheetDetail.set(null);
        this.selectedCallsheetDetailLoading.set(false);
        this.callsheetGroupDraft.set([]);
        this.callsheetGroupAddPlayDrafts.set({});
        this.callsheetGroupsSaving.set(false);
        this.draggingCallsheetGroupId.set(null);
        this.callsheetGroupDropIndicator.set(null);
        this.callsheetPendingRemovalPlayName.set(null);
        this.collapsedCallsheetGroupIds.set(new Set());
      }

      this.closeCallsheetMenu();
      await this.loadCallsheetsForSelectedPlaybook();
    } catch {
      this.error.set('Unable to delete callsheet right now. Please try again.');
    } finally {
      this.deletingCallsheetId.set(null);
    }
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
    this.callsheetGroupDraft.set([nextGroup, ...groups]);
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

  protected onCallsheetGroupDragStart(groupId: string, event: DragEvent): void {
    if (this.callsheetGroupsSaving()) {
      event.preventDefault();
      return;
    }

    this.draggingCallsheetGroupId.set(groupId);
    this.callsheetGroupDropIndicator.set(null);
    this.closeCallsheetGroupMenu();

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', groupId);
    }
  }

  protected onCallsheetGroupDragEnd(): void {
    this.draggingCallsheetGroupId.set(null);
    this.callsheetGroupDropIndicator.set(null);
  }

  protected onCallsheetGroupDragOver(groupId: string, event: DragEvent): void {
    const draggingGroupId = this.draggingCallsheetGroupId();
    if (!draggingGroupId || draggingGroupId === groupId) return;

    event.preventDefault();
    const placement = this.resolveCallsheetGroupDropPlacement(event);
    this.callsheetGroupDropIndicator.set({
      groupId,
      placement,
    });
    this.reorderCallsheetGroups(draggingGroupId, groupId, placement);

    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected onCallsheetGroupDragLeave(groupId: string, event: DragEvent): void {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget?.contains(relatedTarget)) return;

    const indicator = this.callsheetGroupDropIndicator();
    if (indicator?.groupId === groupId) {
      this.callsheetGroupDropIndicator.set(null);
    }
  }

  protected onCallsheetGroupDrop(groupId: string, event: DragEvent): void {
    event.preventDefault();

    const draggedGroupId =
      event.dataTransfer?.getData('text/plain').trim() || this.draggingCallsheetGroupId();
    const placement =
      this.callsheetGroupDropIndicator()?.groupId === groupId
        ? this.callsheetGroupDropIndicator()!.placement
        : this.resolveCallsheetGroupDropPlacement(event);

    if (draggedGroupId && draggedGroupId !== groupId) {
      this.reorderCallsheetGroups(draggedGroupId, groupId, placement);
    }

    this.draggingCallsheetGroupId.set(null);
    this.callsheetGroupDropIndicator.set(null);
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

  protected reorderCallsheetGroups(
    sourceGroupId: string,
    targetGroupId: string,
    placement: 'before' | 'after'
  ): void {
    const detail = this.selectedCallsheetDetail();
    if (!detail) return;

    const groups = this.normalizeCallsheetGroupsForUi(
      this.callsheetGroupDraft(),
      detail.plays ?? []
    );
    const sourceIndex = groups.findIndex((group) => group.id === sourceGroupId);
    if (sourceIndex < 0) return;

    const [sourceGroup] = groups.splice(sourceIndex, 1);
    const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
    if (!sourceGroup || targetIndex < 0) return;

    const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
    groups.splice(insertIndex, 0, sourceGroup);
    this.callsheetGroupDraft.set(groups);
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
      await this.loadCallsheetsForSelectedPlaybook({
        silent: true,
        preserveSelection: true,
      });
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
    if (
      !playbook?.id ||
      !playbook.teamId ||
      !detail?.id ||
      this.callsheetGroupsSaving() ||
      !this.hasUnsavedCallsheetGroupChanges()
    ) {
      return;
    }

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
      await this.loadCallsheetsForSelectedPlaybook({
        silent: true,
        preserveSelection: true,
      });
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
      'Extract formations, plays, install notes, and coaching points, then ask me to confirm before saving anything. Respond with a coach-friendly summary first: total plays, key formations, install priority groups, and top recommendations. Do not dump every play in the first response. Do not offer full play-by-play breakdown unless I explicitly ask for it. Keep install notes clean and readable with one instruction per line. End with this exact question: "Would you like me to create this draft now?"';

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
    const previousPlaybooks = this.playbooks();
    const deletingSelected = this.selectedPlaybook()?.id === playbookId;
    const optimisticPlaybooks = previousPlaybooks.filter((playbook) => playbook.id !== playbookId);

    // Optimistically remove only the deleted playbook to avoid UI list collapse.
    this.playbooks.set(optimisticPlaybooks);

    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(`${this.baseUrl}/playbooks/${playbookId}`)
      );
      this.deletingPlaybookId.set(null);
      await this.loadPlaybooks();

      if (optimisticPlaybooks.length > 0 && this.playbooks().length === 0) {
        // Guard against transient empty refreshes that can occur during panel state churn.
        this.playbooks.set(optimisticPlaybooks);
        this.logger.warn('Playbook delete refresh returned empty unexpectedly; preserving list', {
          playbookId,
          optimisticCount: optimisticPlaybooks.length,
          teamId: this._teamId(),
          sport: this._inputSport(),
        });
        void this.loadPlaybooks();
      }

      if (deletingSelected) {
        this.clearSelection();
      }
    } catch {
      // Roll back optimistic update on failure.
      this.playbooks.set(previousPlaybooks);
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

  private buildPlayEditorConfig(
    index: number,
    play: PlaybookPlay,
    startInEditMode: boolean,
    preparedDiagramEditor: PreparedPlayDiagramEditor | null
  ): MediaViewerBreakdownEditorConfig {
    const formationLabel = this.sportConfig().formationLabel;
    const personnelLabel = this.sportConfig().personnelLabel;

    return {
      title: play.title || play.name || 'Untitled Play',
      editLabel: 'Edit',
      saveLabel: 'Save',
      savingLabel: 'Saving...',
      startInEditMode,
      diagramTools: preparedDiagramEditor?.tools,
      fields: [
        {
          key: 'name',
          label: 'Play Name',
          value: play.name ?? play.title ?? '',
          required: true,
          placeholder: 'Enter play name',
        },
        { key: 'series', label: 'Series', value: play.series ?? '', placeholder: 'Series' },
        { key: 'category', label: 'Category', value: play.category ?? '', placeholder: 'Category' },
        {
          key: 'formation',
          label: formationLabel,
          value: play.formation ?? '',
          placeholder: formationLabel,
        },
        {
          key: 'personnel',
          label: personnelLabel,
          value: play.personnel ?? '',
          placeholder: personnelLabel,
        },
        {
          key: 'objective',
          label: 'Objective',
          value: play.objective ?? '',
          type: 'textarea',
          rows: 3,
          placeholder: 'Objective',
        },
        {
          key: 'playBreakdown',
          label: 'Play Breakdown',
          value: play.playBreakdown ?? '',
          type: 'textarea',
          rows: 5,
          placeholder: 'Assignments, reads, route concepts, and why it works',
        },
        {
          key: 'installNotes',
          label: 'Install Notes',
          value: play.installNotes ?? '',
          type: 'textarea',
          rows: 3,
          placeholder: 'Use clean lines or bullets',
        },
        {
          key: 'conceptTags',
          label: 'Concept Tags',
          value: (play.conceptTags ?? []).join(', '),
          type: 'textarea',
          rows: 2,
          placeholder: 'Comma-separated',
        },
        {
          key: 'installStage',
          label: 'Install Stage',
          value: play.installStage ?? '',
          type: 'select',
          options: [
            { value: '', label: 'Select stage' },
            { value: 'install', label: 'Install' },
            { value: 'rep', label: 'Rep' },
            { value: 'game-ready', label: 'Game-Ready' },
          ],
        },
        {
          key: 'diagramUrl',
          label: 'Diagram URL',
          value: play.diagramUrl ?? '',
          type: 'url',
          placeholder: 'https://...',
        },
        {
          key: 'diagram',
          label: 'Upload Diagram',
          value: '',
          type: 'file',
          placeholder: 'Choose image',
        },
        {
          key: 'coachingPoints',
          label: 'Coaching Points',
          value: (play.coachingPoints ?? []).join('\n'),
          type: 'textarea',
          rows: 4,
          placeholder: 'One point per line',
        },
        {
          key: 'commonBusts',
          label: 'Common Busts',
          value: (play.commonBusts ?? []).join('\n'),
          type: 'textarea',
          rows: 3,
          placeholder: 'One bust per line',
        },
        {
          key: 'correctionCues',
          label: 'Correction Cues',
          value: (play.correctionCues ?? []).join('\n'),
          type: 'textarea',
          rows: 3,
          placeholder: 'One cue per line',
        },
        {
          key: 'drillProgression',
          label: 'Drill Progression',
          value: (play.drillProgression ?? []).join('\n'),
          type: 'textarea',
          rows: 3,
          placeholder: 'One drill step per line',
        },
        {
          key: 'situations',
          label: 'Situations',
          value: (play.situations ?? []).join(', '),
          type: 'textarea',
          rows: 2,
          placeholder: 'Comma-separated',
        },
      ],
      onSave: async (values, files) => {
        const form: PlayForm = { ...EMPTY_PLAY_FORM, ...values };
        const playSaved = await this.saveEditPlay(index, form, files['diagram'] ?? null);
        if (!playSaved) return;

        if (preparedDiagramEditor?.assetId) {
          const diagramsPanel = this.diagramsPanel();
          if (!diagramsPanel) {
            this.toast.error('Diagram editor is not ready yet. Please try again.');
            return;
          }

          const diagramSaved = await diagramsPanel.saveEmbeddedDiagramEditor(
            preparedDiagramEditor.assetId,
            { title: toTitleCase(form.name) }
          );
          if (!diagramSaved) return;
        }

        await this.mediaViewer.dismiss();
      },
    };
  }

  private async preparePlayDiagramEditor(
    index: number,
    play: PlaybookPlay
  ): Promise<PreparedPlayDiagramEditor | null> {
    if (!play.diagramAssetId?.trim() && !play.diagramUrl?.trim()) {
      return null;
    }

    const diagramsPanel = this.diagramsPanel();
    if (!diagramsPanel) {
      return null;
    }

    try {
      const assetId = await this.resolvePlayDiagramAssetId(index, play);
      if (!assetId) {
        return null;
      }

      const tools = await diagramsPanel.prepareEmbeddedDiagramEditor(assetId);
      if (!tools) {
        return null;
      }

      return { assetId, tools };
    } catch (error) {
      this.logger.error('Failed to prepare inline play SVG tools', error, {
        playIndex: index,
        playName: play.title || play.name || null,
      });
      return null;
    }
  }

  private async resolvePlayDiagramAssetId(
    index: number,
    play: PlaybookPlay
  ): Promise<string | null> {
    const existingAssetId = play.diagramAssetId?.trim();
    if (existingAssetId) {
      return existingAssetId;
    }

    const playbook = this.selectedPlaybook();
    const diagramUrl = play.diagramUrl?.trim();
    if (!playbook?.id || !diagramUrl) {
      return null;
    }

    await firstValueFrom(
      this.http.patch<MutationResponse>(`${this.baseUrl}/playbooks/${playbook.id}/plays/${index}`, {
        name: toTitleCase(play.name || play.title || `Play ${index + 1}`),
        series: play.series?.trim() || undefined,
        category: play.category?.trim() || undefined,
        formation: play.formation?.trim() || undefined,
        personnel: play.personnel?.trim() || undefined,
        objective: play.objective?.trim() || undefined,
        playBreakdown: play.playBreakdown?.trim() || undefined,
        installNotes: play.installNotes?.trim() || undefined,
        diagramUrl,
        conceptTags: play.conceptTags ?? [],
        installStage: play.installStage || undefined,
        coachingPoints: play.coachingPoints ?? [],
        commonBusts: play.commonBusts ?? [],
        correctionCues: play.correctionCues ?? [],
        drillProgression: play.drillProgression ?? [],
        situations: play.situations ?? [],
      })
    );

    await this.loadPlaybookDetail(playbook.id);
    return this.selectedPlaybook()?.plays?.[index]?.diagramAssetId?.trim() ?? null;
  }

  protected async saveEditPlay(
    index: number,
    form: PlayForm,
    diagramFile: File | null
  ): Promise<boolean> {
    const playbook = this.selectedPlaybook();
    if (!form.name.trim() || !playbook) return false;
    this.savingPlay.set(true);
    try {
      const uploadedDiagramUrl = await this.uploadPlayDiagramFileIfNeeded(diagramFile);
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
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        action: 'play_updated_from_breakdown_modal',
        teamId: playbook.teamId,
        playbookId: playbook.id,
        sport: playbook.sport,
      });
      await this.loadPlaybookDetail(playbook.id);
      return true;
    } catch (error) {
      this.logger.error('Failed to save play from breakdown modal', error, {
        playbookId: playbook.id,
        playIndex: index,
      });
      this.toast.error('Unable to save play changes right now.');
      return false;
    } finally {
      this.savingPlay.set(false);
    }
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

  protected buildPracticeScriptDragContext(
    script: PracticeScriptSummary | PracticeScriptDetail
  ): AgentXSelectedContext {
    const playbook = this.selectedPlaybook();
    const title = script.title.trim();
    const summaryParts = [
      script.focus?.trim() || undefined,
      script.tempo?.trim() || undefined,
      `${script.totalPeriods ?? 0} periods`,
      `${script.totalReps ?? 0} reps`,
      script.opponent?.trim() ? `vs ${script.opponent.trim()}` : undefined,
      script.archived ? 'archived' : undefined,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

    return {
      id: `practice-script:${script.id}`,
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
        { type: 'practice_script', id: script.id, label: title },
      ],
      metadata: this.compactContextMetadata({
        itemType: 'practice_script',
        teamId: script.teamId,
        playbookId: script.playbookId,
        sport: script.sport,
        focus: script.focus,
        tempo: script.tempo,
        scriptDate: script.scriptDate,
        opponent: script.opponent,
        totalPeriods: script.totalPeriods,
        totalReps: script.totalReps,
        objectiveCount:
          'objectives' in script && Array.isArray(script.objectives)
            ? script.objectives.length
            : undefined,
        periodCount:
          'periods' in script && Array.isArray(script.periods) ? script.periods.length : undefined,
        periodLabels:
          'periods' in script && Array.isArray(script.periods)
            ? script.periods.map((period) => period.label).join(', ')
            : undefined,
        archived: script.archived ?? false,
        updatedAt: script.updatedAt,
        createdAt: script.createdAt,
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

  private resolveCallsheetGroupDropPlacement(event: DragEvent): 'before' | 'after' {
    const currentTarget = event.currentTarget as HTMLElement | null;
    if (!currentTarget) return 'after';

    const bounds = currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    return event.clientY < midpoint ? 'before' : 'after';
  }

  private areCallsheetGroupsEqual(
    leftGroups: readonly CallsheetGroup[],
    rightGroups: readonly CallsheetGroup[]
  ): boolean {
    if (leftGroups.length !== rightGroups.length) return false;

    return leftGroups.every((leftGroup, index) => {
      const rightGroup = rightGroups[index];
      if (!rightGroup) return false;
      if (leftGroup.id !== rightGroup.id || leftGroup.name !== rightGroup.name) return false;
      if (leftGroup.playNames.length !== rightGroup.playNames.length) return false;

      return leftGroup.playNames.every(
        (playName, playIndex) => playName === rightGroup.playNames[playIndex]
      );
    });
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

  protected async openDiagramModal(
    play: PlaybookPlay,
    index: number,
    startInEditMode = false
  ): Promise<void> {
    const title = (play.title || play.name || 'Play').trim();
    const diagramUrl = play.diagramUrl?.trim() || this.buildDiagramPlaceholderDataUrl(title);
    const preparedDiagramEditor = await this.preparePlayDiagramEditor(index, play);

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
        playbookEditor: this.buildPlayEditorConfig(
          index,
          play,
          startInEditMode,
          preparedDiagramEditor
        ),
      });
    } catch (err) {
      this.logger.error('Failed to open diagram modal', err, { diagramUrl, title });
    } finally {
      this.diagramsPanel()?.resetEmbeddedDiagramEditor();
    }
  }

  private buildDiagramPlaceholderDataUrl(title: string): string {
    const escapedTitle = title.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[char] ?? char;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#101010"/><rect x="80" y="70" width="800" height="400" rx="20" fill="none" stroke="#404040" stroke-width="3"/><text x="480" y="260" fill="#f4f4f5" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">${escapedTitle}</text><text x="480" y="310" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">No diagram attached</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private buildPlayBreakdown(play: PlaybookPlay): {
    subtitle?: string;
    metaChips: string[];
    sections: Array<{ title: string; paragraphs?: string[]; bullets?: string[]; chips?: string[] }>;
  } {
    const subtitle = [play.series, play.category ? toTitleCase(play.category) : '', play.formation]
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

  private async uploadPlayDiagramFileIfNeeded(file: File | null): Promise<string | null> {
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
      const loadedPlaybooks = this.playbooksService.playbooks();
      this.playbooks.set(loadedPlaybooks);

      if (this._practiceScriptsOnly() && !this.selectedPlaybook() && loadedPlaybooks.length > 0) {
        this.selectPlaybook(loadedPlaybooks[0]);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbooks.');
      // Preserve current list so a transient reload failure does not blank the panel.
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
      this.applyDefaultFootballPlayFilters(response.data.playbook);
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

  private async loadCallsheetsForSelectedPlaybook(options?: {
    readonly silent?: boolean;
    readonly preserveSelection?: boolean;
  }): Promise<void> {
    const playbook = this.selectedPlaybook();
    const preserveSelection = options?.preserveSelection ?? true;
    const previousSelectedCallsheetId = this.selectedCallsheetId();
    const previousCallsheets = this.callsheets();
    const shouldShowLoading = !(options?.silent ?? false);
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

    if (shouldShowLoading) {
      this.callsheetsLoading.set(true);
    }
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
      const nextSelectedCallsheetId = preserveSelection
        ? previousSelectedCallsheetId &&
          callsheets.some((callsheet) => callsheet.id === previousSelectedCallsheetId)
          ? previousSelectedCallsheetId
          : null
        : null;

      this.callsheets.set(callsheets);
      this.selectedCallsheetId.set(nextSelectedCallsheetId);

      if (!nextSelectedCallsheetId) {
        this.selectedCallsheetDetail.set(null);
        this.selectedCallsheetDetailLoading.set(false);
      }

      this.activeCallsheetMenuId.set(null);
      this.deletingCallsheetId.set(null);

      if (!nextSelectedCallsheetId) {
        this.callsheetGroupDraft.set([]);
        this.callsheetGroupAddPlayDrafts.set({});
        this.callsheetGroupsSaving.set(false);
        this.draggingCallsheetGroupId.set(null);
        this.callsheetGroupDropIndicator.set(null);
        this.callsheetPendingRemovalPlayName.set(null);
        this.collapsedCallsheetGroupIds.set(new Set());
      }

      this.activeCallsheetGroupMenuId.set(null);
    } catch (err) {
      this.callsheets.set(previousCallsheets);
      if (!preserveSelection) {
        this.selectedCallsheetId.set(null);
        this.selectedCallsheetDetail.set(null);
        this.callsheetGroupDraft.set([]);
        this.callsheetGroupAddPlayDrafts.set({});
        this.callsheetGroupsSaving.set(false);
        this.callsheetPendingRemovalPlayName.set(null);
        this.collapsedCallsheetGroupIds.set(new Set());
      }

      this.activeCallsheetMenuId.set(null);
      this.deletingCallsheetId.set(null);
      this.activeCallsheetGroupMenuId.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load callsheets.');
    } finally {
      if (shouldShowLoading) {
        this.callsheetsLoading.set(false);
      }
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

      const normalizedGroups = this.normalizeCallsheetGroupsForUi(
        detail.groups,
        detail.plays ?? []
      );

      this.selectedCallsheetDetail.set(detail);
      this.callsheetGroupDraft.set(normalizedGroups);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.draggingCallsheetGroupId.set(null);
      this.callsheetGroupDropIndicator.set(null);
      this.callsheetPendingRemovalPlayName.set(null);
      // Default to collapsed groups each time a callsheet detail is opened/refreshed.
      this.collapsedCallsheetGroupIds.set(new Set(normalizedGroups.map((group) => group.id)));
      this.activeCallsheetGroupMenuId.set(null);
      this.callsheetFilters.set({ ...(detail.filters ?? {}) });
      this.callsheetAiRankings.set(rankingMap);
    } catch (err) {
      this.selectedCallsheetDetail.set(null);
      this.callsheetGroupDraft.set([]);
      this.callsheetGroupAddPlayDrafts.set({});
      this.callsheetGroupsSaving.set(false);
      this.draggingCallsheetGroupId.set(null);
      this.callsheetGroupDropIndicator.set(null);
      this.callsheetPendingRemovalPlayName.set(null);
      this.collapsedCallsheetGroupIds.set(new Set());
      this.activeCallsheetGroupMenuId.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load callsheet detail.');
    } finally {
      this.selectedCallsheetDetailLoading.set(false);
    }
  }

  private async loadPracticeScriptsForSelectedPlaybook(options?: {
    readonly silent?: boolean;
    readonly preserveSelection?: boolean;
  }): Promise<void> {
    const playbook = this.selectedPlaybook();
    const preserveSelection = options?.preserveSelection ?? true;
    const previousSelectedScriptId = this.selectedPracticeScriptId();
    const previousScripts = this.practiceScripts();
    const shouldShowLoading = !(options?.silent ?? false);
    if (!playbook?.id || !playbook.teamId) {
      this.practiceScripts.set([]);
      this.practiceScriptsLoading.set(false);
      this.selectedPracticeScriptId.set(null);
      this.selectedPracticeScriptDetail.set(null);
      this.selectedPracticeScriptDetailLoading.set(false);
      this.cancelEditPracticeScript();
      return;
    }

    if (shouldShowLoading) {
      this.practiceScriptsLoading.set(true);
    }
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

      const scripts = [...(response.data?.scripts ?? [])];
      const nextSelectedScriptId = preserveSelection
        ? previousSelectedScriptId &&
          scripts.some((script) => script.id === previousSelectedScriptId)
          ? previousSelectedScriptId
          : null
        : null;

      this.practiceScripts.set(scripts);
      this.selectedPracticeScriptId.set(nextSelectedScriptId);

      if (!nextSelectedScriptId) {
        this.selectedPracticeScriptDetail.set(null);
        this.selectedPracticeScriptDetailLoading.set(false);
        this.cancelEditPracticeScript();
      }

      this.activePracticeScriptMenuId.set(null);
    } catch (err) {
      this.practiceScripts.set(previousScripts);
      if (!preserveSelection) {
        this.selectedPracticeScriptId.set(null);
        this.selectedPracticeScriptDetail.set(null);
        this.selectedPracticeScriptDetailLoading.set(false);
        this.cancelEditPracticeScript();
      }

      this.activePracticeScriptMenuId.set(null);
      this.error.set(err instanceof Error ? err.message : 'Unable to load practice scripts.');
    } finally {
      if (shouldShowLoading) {
        this.practiceScriptsLoading.set(false);
      }
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
