import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  Input,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TeamGamePlanDoc } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import type { AgentXSelectedContext, AgentXSelectedContextMetadataValue } from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtMarkdownComponent } from '../../../components/markdown';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import { getAgentXReleaseLabel } from '../../utils/agent-x-release-stage.utils';

type GamePlanDetail = TeamGamePlanDoc;
type GamePlanSummary = Pick<
  GamePlanDetail,
  | 'id'
  | 'teamId'
  | 'sport'
  | 'title'
  | 'phase'
  | 'status'
  | 'gameDate'
  | 'opponentName'
  | 'updatedAt'
>;
type GamePlanMomentPriority = NonNullable<GamePlanDetail['priorities']>[number];
type GamePlanStrengthWeakness = NonNullable<GamePlanDetail['strengthsWeaknesses']>[number];
type GamePlanBlock = NonNullable<GamePlanDetail['planBlocks']>[number];
type GamePlanAdjustmentTrigger = NonNullable<GamePlanDetail['adjustmentTriggers']>[number];
type GamePlanSection = NonNullable<GamePlanDetail['customSections']>[number];
type GamePlanLinkedPlay = NonNullable<GamePlanDetail['linkedPlays']>[number];

interface DisplayStrengthWeaknessItem {
  readonly id: string;
  readonly label: string;
  readonly side: 'own' | 'opponent';
  readonly type: 'strength' | 'weakness';
  readonly impactLevel: GamePlanStrengthWeakness['impactLevel'];
  readonly actionPlan?: string;
  readonly evidenceNote?: string;
  readonly tags?: readonly string[];
}

interface GameplansResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlans: readonly GamePlanSummary[];
    readonly count: number;
  };
  readonly error?: string;
}

interface GamePlanDetailResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlan: GamePlanDetail;
  };
  readonly error?: string;
}

interface GamePlanMutationResponse {
  readonly success: boolean;
  readonly data?: {
    readonly gamePlan?: GamePlanDetail;
  };
  readonly error?: string;
}

@Component({
  selector: 'nxt1-agent-x-gameplans-panel',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    NxtMarkdownComponent,
    NxtStateViewComponent,
    AgentXContextDragDirective,
  ],
  template: `
    <div class="gameplans-panel">
      @if (showingDetail() && selectedPlan()) {
        <!-- DETAIL VIEW -->
        <div class="gameplan-detail">
          <div class="detail-header detail-header--actions-only">
            <div class="detail-header-actions">
              <span class="detail-badge" [attr.data-status]="selectedPlan()!.status | lowercase">
                {{ selectedPlan()!.status }}
              </span>
              @if (gameplansReleaseLabel) {
                <span class="detail-release-badge">{{ gameplansReleaseLabel }}</span>
              }
              <button
                type="button"
                class="detail-export-btn"
                (click)="exportSelectedPlanPdf()"
                aria-label="Export game plan as PDF"
              >
                <nxt1-icon name="download" [size]="16"></nxt1-icon>
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          <!-- Meta Information -->
          <div class="detail-meta">
            @if (editingBox() === 'coreMetadata') {
              <div class="box-edit-form detail-meta__form">
                <input
                  class="form-input"
                  placeholder="Title"
                  [value]="coreMetadataEdit().title"
                  (input)="onCoreMetadataInput('title', $event)"
                />
                <div class="form-row">
                  <select
                    class="form-input"
                    [value]="coreMetadataEdit().status"
                    (change)="onCoreMetadataInput('status', $event)"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                  <select
                    class="form-input"
                    [value]="coreMetadataEdit().phase"
                    (change)="onCoreMetadataInput('phase', $event)"
                  >
                    <option value="pregame">Pregame</option>
                    <option value="in-game">In-Game</option>
                    <option value="postgame">Postgame</option>
                    <option value="scouting">Scouting</option>
                  </select>
                </div>
                <div class="form-row">
                  <input
                    class="form-input"
                    placeholder="Game date"
                    [value]="coreMetadataEdit().gameDate"
                    (input)="onCoreMetadataInput('gameDate', $event)"
                  />
                  <input
                    class="form-input"
                    placeholder="Opponent"
                    [value]="coreMetadataEdit().opponentName"
                    (input)="onCoreMetadataInput('opponentName', $event)"
                  />
                </div>
                <div class="form-row">
                  <input
                    class="form-input"
                    placeholder="Season"
                    [value]="coreMetadataEdit().season"
                    (input)="onCoreMetadataInput('season', $event)"
                  />
                  <input
                    class="form-input"
                    placeholder="Division"
                    [value]="coreMetadataEdit().division"
                    (input)="onCoreMetadataInput('division', $event)"
                  />
                </div>
                <select
                  class="form-input"
                  [value]="coreMetadataEdit().perspectiveTeam"
                  (change)="onCoreMetadataInput('perspectiveTeam', $event)"
                >
                  <option value="">Perspective</option>
                  <option value="own">Own</option>
                  <option value="opponent">Opponent</option>
                  <option value="neutral">Neutral</option>
                </select>
                <div class="form-actions">
                  <button type="button" class="btn-cancel" (click)="cancelEditBox()">Cancel</button>
                  <button
                    type="button"
                    class="btn-save"
                    [disabled]="mutating()"
                    (click)="saveEditBox('coreMetadata')"
                  >
                    {{ mutating() ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </div>
            } @else {
              <button
                type="button"
                class="box-edit-btn detail-meta__edit"
                aria-label="Edit game plan metadata"
                (click)="startEditBox('coreMetadata')"
              >
                <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
              </button>
              <div class="meta-group">
                <span class="meta-label">Sport</span>
                <span class="meta-value">{{ selectedPlan()!.sport | titlecase }}</span>
              </div>
              <div class="meta-group">
                <span class="meta-label">Phase</span>
                <span class="meta-value">{{ selectedPlan()!.phase | titlecase }}</span>
              </div>
              @if (selectedPlan()!.gameDate) {
                <div class="meta-group">
                  <span class="meta-label">Game Date</span>
                  <span class="meta-value">{{ formatDate(selectedPlan()!.gameDate!) }}</span>
                </div>
              }
              @if (selectedPlan()!.opponentName) {
                <div class="meta-group">
                  <span class="meta-label">Opponent</span>
                  <span class="meta-value">{{ selectedPlan()!.opponentName }}</span>
                </div>
              }
              @if (selectedPlan()!.season) {
                <div class="meta-group">
                  <span class="meta-label">Season</span>
                  <span class="meta-value">{{ selectedPlan()!.season }}</span>
                </div>
              }
              @if (selectedPlan()!.division) {
                <div class="meta-group">
                  <span class="meta-label">Division</span>
                  <span class="meta-value">{{ selectedPlan()!.division }}</span>
                </div>
              }
              @if (selectedPlan()!.perspectiveTeam) {
                <div class="meta-group">
                  <span class="meta-label">Perspective</span>
                  <span class="meta-value">{{ selectedPlan()!.perspectiveTeam | titlecase }}</span>
                </div>
              }
            }
          </div>

          <!-- Plan Content Sections -->
          <div class="detail-sections">
            @if (selectedPlan()!.ownTeamColor || selectedPlan()!.opponentTeamColor) {
              <section class="detail-section detail-section--team-colors detail-section--hidden">
                <div class="detail-section__head">
                  <h3 class="section-title">Team Colors</h3>
                  @if (editingBox() !== 'teamColors') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit team colors"
                      (click)="startEditBox('teamColors')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'teamColors') {
                  <div class="box-edit-form">
                    <div class="form-row">
                      <input
                        class="form-input"
                        type="color"
                        [value]="teamColorsEdit().ownTeamColor || '#000000'"
                        (input)="onTeamColorsInput('ownTeamColor', $event)"
                      />
                      <input
                        class="form-input"
                        placeholder="Own team color"
                        [value]="teamColorsEdit().ownTeamColor"
                        (input)="onTeamColorsInput('ownTeamColor', $event)"
                      />
                    </div>
                    <div class="form-row">
                      <input
                        class="form-input"
                        type="color"
                        [value]="teamColorsEdit().opponentTeamColor || '#000000'"
                        (input)="onTeamColorsInput('opponentTeamColor', $event)"
                      />
                      <input
                        class="form-input"
                        placeholder="Opponent team color"
                        [value]="teamColorsEdit().opponentTeamColor"
                        (input)="onTeamColorsInput('opponentTeamColor', $event)"
                      />
                    </div>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('teamColors')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="color-legend">
                    @if (selectedPlan()!.ownTeamColor) {
                      <div class="color-chip-row">
                        <span
                          class="color-chip"
                          [style.background-color]="selectedPlan()!.ownTeamColor"
                        ></span>
                        <span class="section-meta"
                          >Own Team · {{ selectedPlan()!.ownTeamColor }}</span
                        >
                      </div>
                    }
                    @if (selectedPlan()!.opponentTeamColor) {
                      <div class="color-chip-row">
                        <span
                          class="color-chip"
                          [style.background-color]="selectedPlan()!.opponentTeamColor"
                        ></span>
                        <span class="section-meta"
                          >Opponent · {{ selectedPlan()!.opponentTeamColor }}</span
                        >
                      </div>
                    }
                  </div>
                }
              </section>
            }

            @if (editingBox() === 'identityFocus' || selectedPlan()!.identityFocus) {
              <section class="detail-section detail-section--identity">
                <div class="detail-section__head">
                  <h3 class="section-title">Identity & Focus</h3>
                  @if (editingBox() !== 'identityFocus') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit identity and focus"
                      (click)="startEditBox('identityFocus')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'identityFocus') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="3"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Describe your team's identity and focus..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('identityFocus')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <nxt1-markdown
                    class="section-content section-content--markdown"
                    [content]="markdownContent(selectedPlan()!.identityFocus)"
                  />
                }
              </section>
            }

            @if (editingBox() === 'primaryAttackPlan' || selectedPlan()!.primaryAttackPlan) {
              <section class="detail-section detail-section--primary-attack">
                <div class="detail-section__head">
                  <h3 class="section-title">Primary Attack Plan</h3>
                  @if (editingBox() !== 'primaryAttackPlan') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit primary attack plan"
                      (click)="startEditBox('primaryAttackPlan')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'primaryAttackPlan') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="3"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Describe your primary attack plan..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('primaryAttackPlan')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <nxt1-markdown
                    class="section-content section-content--markdown"
                    [content]="markdownContent(selectedPlan()!.primaryAttackPlan)"
                  />
                }
              </section>
            }

            @if (editingBox() === 'defensivePriorities' || selectedPlan()!.defensivePriorities) {
              <section
                class="detail-section detail-section--defensive-priorities detail-section--hidden"
              >
                <div class="detail-section__head">
                  <h3 class="section-title">Defensive Priorities</h3>
                  @if (editingBox() !== 'defensivePriorities') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit defensive priorities"
                      (click)="startEditBox('defensivePriorities')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'defensivePriorities') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="3"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Describe your defensive priorities..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('defensivePriorities')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <nxt1-markdown
                    class="section-content section-content--markdown"
                    [content]="markdownContent(selectedPlan()!.defensivePriorities)"
                  />
                }
              </section>
            }

            @if (editingBox() === 'specialSituations' || selectedPlan()!.specialSituations) {
              <section class="detail-section detail-section--special-situations">
                <div class="detail-section__head">
                  <h3 class="section-title">Special Situations</h3>
                  @if (editingBox() !== 'specialSituations') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit special situations"
                      (click)="startEditBox('specialSituations')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'specialSituations') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="3"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Describe special situations..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('specialSituations')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <nxt1-markdown
                    class="section-content section-content--markdown"
                    [content]="markdownContent(selectedPlan()!.specialSituations)"
                  />
                }
              </section>
            }

            <section class="detail-section detail-section--strengths">
              <div class="detail-section__head">
                <h3 class="section-title">Strengths & Weaknesses</h3>
                <button
                  type="button"
                  class="btn-save"
                  [disabled]="mutating()"
                  (click)="startCreateStrengthWeakness()"
                >
                  Add Item
                </button>
              </div>
              <div class="priority-list">
                @for (item of strengthWeaknessItems(); track item.id + '-' + $index) {
                  <article class="priority-item">
                    <div class="priority-item__head">
                      <h4 class="priority-item__title">{{ item.label }}</h4>
                      <span class="sw-pill" [attr.data-level]="item.impactLevel">{{
                        formatStrengthWeaknessImpact(item.impactLevel)
                      }}</span>
                      <div class="item-actions">
                        <button
                          type="button"
                          class="box-edit-btn"
                          aria-label="Edit strength or weakness"
                          [disabled]="mutating()"
                          (click)="startEditStrengthWeakness($index)"
                        >
                          <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                        </button>
                        <button
                          type="button"
                          class="btn-delete-mini"
                          [disabled]="mutating()"
                          (click)="removeStrengthWeakness($index, $event)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    @if (editingStrengthWeaknessIndex() === $index) {
                      <div class="item-edit-form">
                        <input
                          class="form-input"
                          placeholder="Label"
                          [value]="strengthWeaknessEdit().label"
                          (input)="onStrengthWeaknessEditInput('label', $event)"
                        />
                        <div class="form-row">
                          <select
                            class="form-input"
                            [value]="strengthWeaknessEdit().side"
                            (change)="onStrengthWeaknessEditInput('side', $event)"
                          >
                            <option value="own">Own</option>
                            <option value="opponent">Opponent</option>
                          </select>
                          <select
                            class="form-input"
                            [value]="strengthWeaknessEdit().type"
                            (change)="onStrengthWeaknessEditInput('type', $event)"
                          >
                            <option value="strength">Strength</option>
                            <option value="weakness">Weakness</option>
                          </select>
                        </div>
                        <div class="form-row">
                          <select
                            class="form-input"
                            [value]="strengthWeaknessEdit().impactLevel"
                            (change)="onStrengthWeaknessEditInput('impactLevel', $event)"
                          >
                            <option value="must_win">Must Win</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                          <div></div>
                        </div>
                        <textarea
                          class="form-input form-textarea"
                          rows="3"
                          placeholder="Action plan"
                          [value]="strengthWeaknessEdit().actionPlan"
                          (input)="onStrengthWeaknessEditInput('actionPlan', $event)"
                        ></textarea>
                        <textarea
                          class="form-input form-textarea"
                          rows="2"
                          placeholder="Evidence note"
                          [value]="strengthWeaknessEdit().evidenceNote"
                          (input)="onStrengthWeaknessEditInput('evidenceNote', $event)"
                        ></textarea>
                        <input
                          class="form-input"
                          placeholder="Tags (comma separated)"
                          [value]="strengthWeaknessEdit().tags"
                          (input)="onStrengthWeaknessEditInput('tags', $event)"
                        />
                        <div class="form-actions">
                          <button
                            type="button"
                            class="btn-cancel"
                            (click)="cancelStrengthWeaknessEdit()"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="btn-save"
                            [disabled]="mutating()"
                            (click)="saveStrengthWeaknessEdit()"
                          >
                            {{ mutating() ? 'Saving…' : 'Save Item' }}
                          </button>
                        </div>
                      </div>
                    } @else {
                      <p class="section-meta">
                        {{ item.side | titlecase }} · {{ item.type | titlecase }}
                      </p>
                      @if (item.actionPlan) {
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="item.actionPlan"
                        />
                      } @else {
                        <p class="section-meta">No detailed action plan saved for this item yet.</p>
                      }
                      @if (item.evidenceNote) {
                        <nxt1-markdown
                          class="section-meta section-content--markdown"
                          [content]="'Evidence: ' + item.evidenceNote"
                        />
                      }
                      @if (item.tags && item.tags.length > 0) {
                        <div class="tags-list">
                          @for (tag of item.tags; track tag) {
                            <span class="tag">{{ tag }}</span>
                          }
                        </div>
                      }
                    }
                  </article>
                }

                @if (editingStrengthWeaknessIndex() === -1) {
                  <article class="priority-item">
                    <h4 class="priority-item__title">New Item</h4>
                    <div class="item-edit-form">
                      <input
                        class="form-input"
                        placeholder="Label"
                        [value]="strengthWeaknessEdit().label"
                        (input)="onStrengthWeaknessEditInput('label', $event)"
                      />
                      <div class="form-row">
                        <select
                          class="form-input"
                          [value]="strengthWeaknessEdit().side"
                          (change)="onStrengthWeaknessEditInput('side', $event)"
                        >
                          <option value="own">Own</option>
                          <option value="opponent">Opponent</option>
                        </select>
                        <select
                          class="form-input"
                          [value]="strengthWeaknessEdit().type"
                          (change)="onStrengthWeaknessEditInput('type', $event)"
                        >
                          <option value="strength">Strength</option>
                          <option value="weakness">Weakness</option>
                        </select>
                      </div>
                      <div class="form-row">
                        <select
                          class="form-input"
                          [value]="strengthWeaknessEdit().impactLevel"
                          (change)="onStrengthWeaknessEditInput('impactLevel', $event)"
                        >
                          <option value="must_win">Must Win</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                        <div></div>
                      </div>
                      <textarea
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="Action plan"
                        [value]="strengthWeaknessEdit().actionPlan"
                        (input)="onStrengthWeaknessEditInput('actionPlan', $event)"
                      ></textarea>
                      <textarea
                        class="form-input form-textarea"
                        rows="2"
                        placeholder="Evidence note"
                        [value]="strengthWeaknessEdit().evidenceNote"
                        (input)="onStrengthWeaknessEditInput('evidenceNote', $event)"
                      ></textarea>
                      <input
                        class="form-input"
                        placeholder="Tags (comma separated)"
                        [value]="strengthWeaknessEdit().tags"
                        (input)="onStrengthWeaknessEditInput('tags', $event)"
                      />
                      <div class="form-actions">
                        <button
                          type="button"
                          class="btn-cancel"
                          (click)="cancelStrengthWeaknessEdit()"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          class="btn-save"
                          [disabled]="mutating()"
                          (click)="saveStrengthWeaknessEdit()"
                        >
                          {{ mutating() ? 'Saving…' : 'Add Item' }}
                        </button>
                      </div>
                    </div>
                  </article>
                }

                @if (
                  strengthWeaknessItems().length === 0 && editingStrengthWeaknessIndex() === null
                ) {
                  <p class="section-content">No strengths and weaknesses recorded yet.</p>
                }
              </div>
            </section>

            @if (editingBox() === 'scoutingReport' || selectedPlan()!.scoutingReport) {
              <section class="detail-section detail-section--scouting-report">
                <div class="detail-section__head">
                  <h3 class="section-title">Scouting Report</h3>
                  @if (editingBox() !== 'scoutingReport') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit scouting report"
                      (click)="startEditBox('scoutingReport')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'scoutingReport') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="3"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Scouting report notes..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('scoutingReport')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <nxt1-markdown
                    class="section-content section-content--markdown"
                    [content]="markdownContent(selectedPlan()!.scoutingReport)"
                  />
                }
              </section>
            }

            @if (
              editingBox() === 'openingScript' ||
              (selectedPlan()!.openingScript && selectedPlan()!.openingScript!.length > 0)
            ) {
              <section class="detail-section detail-section--opening-script">
                <div class="detail-section__head">
                  <h3 class="section-title">Opening Script</h3>
                  @if (editingBox() !== 'openingScript') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit opening script"
                      (click)="startEditBox('openingScript')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'openingScript') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="4"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="One play per line..."
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('openingScript')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <ul class="script-list">
                    @for (line of selectedPlan()!.openingScript!; track $index) {
                      <li>
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="line"
                        />
                      </li>
                    }
                  </ul>
                }
              </section>
            }

            @if (
              editingBox() === 'priorities' ||
              (selectedPlan()!.priorities && selectedPlan()!.priorities!.length > 0)
            ) {
              <section class="detail-section detail-section--priorities">
                <div class="detail-section__head">
                  <h3 class="section-title">Priorities</h3>
                  @if (editingBox() !== 'priorities') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit moment priorities"
                      (click)="startEditBox('priorities')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'priorities') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="10"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('priorities')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="priority-list">
                    @for (priority of selectedPlan()!.priorities!; track priority.id) {
                      <article
                        class="priority-item"
                        [nxtAgentXContextDrag]="buildGamePlanPriorityDragContext(priority)"
                      >
                        <div class="priority-item__head">
                          <h4 class="priority-item__title">{{ priority.title }}</h4>
                          <span class="sw-pill" [attr.data-level]="priority.level">{{
                            formatImpactLevel(priority.level)
                          }}</span>
                        </div>
                        <p class="section-meta">
                          {{ priority.domain | titlecase }} · {{ priority.moment | titlecase }}
                        </p>
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="priority.objective"
                        />
                        @if (priority.successMetric) {
                          <nxt1-markdown
                            class="section-meta section-content--markdown"
                            [content]="'Success metric: ' + priority.successMetric"
                          />
                        }
                      </article>
                    }
                  </div>
                }
              </section>
            }

            @if (
              editingBox() === 'planBlocks' ||
              (selectedPlan()!.planBlocks && selectedPlan()!.planBlocks!.length > 0)
            ) {
              <section class="detail-section detail-section--plan-blocks">
                <div class="detail-section__head">
                  <h3 class="section-title">Plan Blocks</h3>
                  @if (editingBox() !== 'planBlocks') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit plan blocks"
                      (click)="startEditBox('planBlocks')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'planBlocks') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="10"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('planBlocks')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="priority-list">
                    @for (block of sortedPlanBlocks(selectedPlan()!.planBlocks!); track block.id) {
                      <article
                        class="priority-item"
                        [nxtAgentXContextDrag]="buildGamePlanBlockDragContext(block)"
                      >
                        <div class="priority-item__head">
                          <h4 class="priority-item__title">{{ block.title }}</h4>
                          <span class="sw-pill">{{ block.domain | titlecase }}</span>
                        </div>
                        <p class="section-meta">
                          Order {{ block.order }}
                          @if (block.moment) {
                            · {{ block.moment | titlecase }}
                          }
                        </p>
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="block.content"
                        />
                      </article>
                    }
                  </div>
                }
              </section>
            }

            @if (true) {
              <section class="detail-section detail-section--adjustment-triggers">
                <div class="detail-section__head">
                  <h3 class="section-title">Adjustment Triggers</h3>
                  <button
                    type="button"
                    class="btn-save"
                    [disabled]="mutating()"
                    (click)="startCreateAdjustmentTrigger()"
                  >
                    Add Trigger
                  </button>
                </div>
                <div class="priority-list">
                  @for (
                    trigger of selectedPlan()!.adjustmentTriggers ?? [];
                    track trigger.trigger + '-' + $index
                  ) {
                    <article class="priority-item">
                      <div class="priority-item__head">
                        <h4 class="priority-item__title">{{ trigger.trigger }}</h4>
                        <div class="item-actions">
                          <button
                            type="button"
                            class="box-edit-btn"
                            aria-label="Edit trigger"
                            [disabled]="mutating()"
                            (click)="startEditAdjustmentTrigger($index)"
                          >
                            <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                          </button>
                          <button
                            type="button"
                            class="btn-delete-mini"
                            [disabled]="mutating()"
                            (click)="removeAdjustmentTrigger($index, $event)"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      @if (editingAdjustmentTriggerIndex() === $index) {
                        <div class="item-edit-form">
                          <input
                            class="form-input"
                            placeholder="Trigger"
                            [value]="adjustmentTriggerEdit().trigger"
                            (input)="onAdjustmentTriggerEditInput('trigger', $event)"
                          />
                          <textarea
                            class="form-input form-textarea"
                            rows="4"
                            placeholder="Adjustment"
                            [value]="adjustmentTriggerEdit().adjustment"
                            (input)="onAdjustmentTriggerEditInput('adjustment', $event)"
                          ></textarea>
                          <textarea
                            class="form-input form-textarea"
                            rows="2"
                            placeholder="Diagnosis (optional)"
                            [value]="adjustmentTriggerEdit().diagnosis"
                            (input)="onAdjustmentTriggerEditInput('diagnosis', $event)"
                          ></textarea>
                          <div class="form-row">
                            <input
                              class="form-input"
                              placeholder="Validation Window"
                              [value]="adjustmentTriggerEdit().validationWindow"
                              (input)="onAdjustmentTriggerEditInput('validationWindow', $event)"
                            />
                            <input
                              class="form-input"
                              placeholder="Expected Outcome"
                              [value]="adjustmentTriggerEdit().expectedOutcome"
                              (input)="onAdjustmentTriggerEditInput('expectedOutcome', $event)"
                            />
                          </div>
                          <input
                            class="form-input"
                            placeholder="Tags (comma separated)"
                            [value]="adjustmentTriggerEdit().tags"
                            (input)="onAdjustmentTriggerEditInput('tags', $event)"
                          />
                          <div class="form-actions">
                            <button
                              type="button"
                              class="btn-cancel"
                              (click)="cancelAdjustmentTriggerEdit()"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              class="btn-save"
                              [disabled]="mutating()"
                              (click)="saveAdjustmentTriggerEdit()"
                            >
                              {{ mutating() ? 'Saving…' : 'Save Trigger' }}
                            </button>
                          </div>
                        </div>
                      } @else {
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="trigger.adjustment"
                        />
                        @if (trigger.diagnosis) {
                          <nxt1-markdown
                            class="section-meta section-content--markdown"
                            [content]="'Diagnosis: ' + trigger.diagnosis"
                          />
                        }
                        @if (trigger.validationWindow) {
                          <nxt1-markdown
                            class="section-meta section-content--markdown"
                            [content]="'Validation Window: ' + trigger.validationWindow"
                          />
                        }
                        @if (trigger.expectedOutcome) {
                          <nxt1-markdown
                            class="section-meta section-content--markdown"
                            [content]="'Expected Outcome: ' + trigger.expectedOutcome"
                          />
                        }
                        @if (trigger.tags && trigger.tags.length > 0) {
                          <p class="section-meta">Tags: {{ trigger.tags.join(', ') }}</p>
                        }
                      }
                    </article>
                  }

                  @if (editingAdjustmentTriggerIndex() === -1) {
                    <article class="priority-item">
                      <h4 class="priority-item__title">New Trigger</h4>
                      <div class="item-edit-form">
                        <input
                          class="form-input"
                          placeholder="Trigger"
                          [value]="adjustmentTriggerEdit().trigger"
                          (input)="onAdjustmentTriggerEditInput('trigger', $event)"
                        />
                        <textarea
                          class="form-input form-textarea"
                          rows="4"
                          placeholder="Adjustment"
                          [value]="adjustmentTriggerEdit().adjustment"
                          (input)="onAdjustmentTriggerEditInput('adjustment', $event)"
                        ></textarea>
                        <textarea
                          class="form-input form-textarea"
                          rows="2"
                          placeholder="Diagnosis (optional)"
                          [value]="adjustmentTriggerEdit().diagnosis"
                          (input)="onAdjustmentTriggerEditInput('diagnosis', $event)"
                        ></textarea>
                        <div class="form-row">
                          <input
                            class="form-input"
                            placeholder="Validation Window"
                            [value]="adjustmentTriggerEdit().validationWindow"
                            (input)="onAdjustmentTriggerEditInput('validationWindow', $event)"
                          />
                          <input
                            class="form-input"
                            placeholder="Expected Outcome"
                            [value]="adjustmentTriggerEdit().expectedOutcome"
                            (input)="onAdjustmentTriggerEditInput('expectedOutcome', $event)"
                          />
                        </div>
                        <input
                          class="form-input"
                          placeholder="Tags (comma separated)"
                          [value]="adjustmentTriggerEdit().tags"
                          (input)="onAdjustmentTriggerEditInput('tags', $event)"
                        />
                        <div class="form-actions">
                          <button
                            type="button"
                            class="btn-cancel"
                            (click)="cancelAdjustmentTriggerEdit()"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="btn-save"
                            [disabled]="mutating()"
                            (click)="saveAdjustmentTriggerEdit()"
                          >
                            {{ mutating() ? 'Saving…' : 'Add Trigger' }}
                          </button>
                        </div>
                      </div>
                    </article>
                  }
                </div>
              </section>
            }

            @if (true) {
              <section class="detail-section detail-section--custom-sections">
                <div class="detail-section__head">
                  <h3 class="section-title">Custom Sections</h3>
                  <button
                    type="button"
                    class="btn-save"
                    [disabled]="mutating()"
                    (click)="startCreateCustomSection()"
                  >
                    Add Section
                  </button>
                </div>
                <div class="priority-list">
                  @for (
                    sectionEntry of customSectionsForDisplay(selectedPlan()!.customSections ?? []);
                    track sectionEntry.section.key + '-' + sectionEntry.index
                  ) {
                    <article class="priority-item">
                      <div class="priority-item__head">
                        <h4 class="priority-item__title">{{ sectionEntry.section.title }}</h4>
                        <div class="item-actions">
                          <button
                            type="button"
                            class="box-edit-btn"
                            aria-label="Edit custom section"
                            [disabled]="mutating()"
                            (click)="startEditCustomSection(sectionEntry.index)"
                          >
                            <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                          </button>
                          <button
                            type="button"
                            class="btn-delete-mini"
                            [disabled]="mutating()"
                            (click)="removeCustomSection(sectionEntry.index, $event)"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      @if (editingCustomSectionIndex() === sectionEntry.index) {
                        <div class="item-edit-form">
                          <input
                            class="form-input"
                            placeholder="Title"
                            [value]="customSectionEdit().title"
                            (input)="onCustomSectionEditInput('title', $event)"
                          />
                          <div class="form-row">
                            <input
                              class="form-input"
                              placeholder="Key (optional)"
                              [value]="customSectionEdit().key"
                              (input)="onCustomSectionEditInput('key', $event)"
                            />
                            <input
                              class="form-input"
                              placeholder="Order (optional)"
                              [value]="customSectionEdit().order"
                              (input)="onCustomSectionEditInput('order', $event)"
                            />
                          </div>
                          <input
                            class="form-input"
                            placeholder="Tags (comma separated)"
                            [value]="customSectionEdit().tags"
                            (input)="onCustomSectionEditInput('tags', $event)"
                          />
                          <textarea
                            class="form-input form-textarea"
                            rows="5"
                            placeholder="Content"
                            [value]="customSectionEdit().content"
                            (input)="onCustomSectionEditInput('content', $event)"
                          ></textarea>
                          <div class="form-actions">
                            <button
                              type="button"
                              class="btn-cancel"
                              (click)="cancelCustomSectionEdit()"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              class="btn-save"
                              [disabled]="mutating()"
                              (click)="saveCustomSectionEdit()"
                            >
                              {{ mutating() ? 'Saving…' : 'Save Section' }}
                            </button>
                          </div>
                        </div>
                      } @else {
                        <nxt1-markdown
                          class="section-content section-content--markdown"
                          [content]="sectionEntry.section.content"
                        />
                        @if (sectionEntry.section.tags && sectionEntry.section.tags.length > 0) {
                          <p class="section-meta">
                            Tags: {{ sectionEntry.section.tags.join(', ') }}
                          </p>
                        }
                        @if (sectionEntry.section.order !== undefined) {
                          <p class="section-meta">Order: {{ sectionEntry.section.order }}</p>
                        }
                      }
                    </article>
                  }

                  @if (editingCustomSectionIndex() === -1) {
                    <article class="priority-item">
                      <h4 class="priority-item__title">New Section</h4>
                      <div class="item-edit-form">
                        <input
                          class="form-input"
                          placeholder="Title"
                          [value]="customSectionEdit().title"
                          (input)="onCustomSectionEditInput('title', $event)"
                        />
                        <div class="form-row">
                          <input
                            class="form-input"
                            placeholder="Key (optional)"
                            [value]="customSectionEdit().key"
                            (input)="onCustomSectionEditInput('key', $event)"
                          />
                          <input
                            class="form-input"
                            placeholder="Order (optional)"
                            [value]="customSectionEdit().order"
                            (input)="onCustomSectionEditInput('order', $event)"
                          />
                        </div>
                        <input
                          class="form-input"
                          placeholder="Tags (comma separated)"
                          [value]="customSectionEdit().tags"
                          (input)="onCustomSectionEditInput('tags', $event)"
                        />
                        <textarea
                          class="form-input form-textarea"
                          rows="5"
                          placeholder="Content"
                          [value]="customSectionEdit().content"
                          (input)="onCustomSectionEditInput('content', $event)"
                        ></textarea>
                        <div class="form-actions">
                          <button
                            type="button"
                            class="btn-cancel"
                            (click)="cancelCustomSectionEdit()"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="btn-save"
                            [disabled]="mutating()"
                            (click)="saveCustomSectionEdit()"
                          >
                            {{ mutating() ? 'Saving…' : 'Add Section' }}
                          </button>
                        </div>
                      </div>
                    </article>
                  }
                </div>
              </section>
            }

            @if (
              editingBox() === 'linkedPlaybookIds' ||
              (selectedPlan()!.linkedPlaybookIds && selectedPlan()!.linkedPlaybookIds!.length > 0)
            ) {
              <section class="detail-section detail-section--linked-playbooks">
                <div class="detail-section__head">
                  <h3 class="section-title">Linked Playbooks</h3>
                  @if (editingBox() !== 'linkedPlaybookIds') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit linked playbooks"
                      (click)="startEditBox('linkedPlaybookIds')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'linkedPlaybookIds') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="6"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('linkedPlaybookIds')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="tags-list">
                    @for (id of selectedPlan()!.linkedPlaybookIds!; track id) {
                      <span class="tag">{{ id }}</span>
                    }
                  </div>
                }
              </section>
            }

            @if (
              editingBox() === 'linkedPlays' ||
              (selectedPlan()!.linkedPlays && selectedPlan()!.linkedPlays!.length > 0)
            ) {
              <section class="detail-section detail-section--linked-plays">
                <div class="detail-section__head">
                  <h3 class="section-title">Linked Plays</h3>
                  @if (editingBox() !== 'linkedPlays') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit linked plays"
                      (click)="startEditBox('linkedPlays')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'linkedPlays') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="10"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('linkedPlays')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="plays-list">
                    @for (
                      play of selectedPlan()!.linkedPlays!;
                      track play.playId ?? play.playName
                    ) {
                      <article
                        class="play-item"
                        [nxtAgentXContextDrag]="buildGamePlanLinkedPlayDragContext(play)"
                      >
                        <h4 class="priority-item__title">{{ play.playName }}</h4>
                        @if (play.usage) {
                          <p class="section-meta">Usage: {{ play.usage }}</p>
                        }
                        @if (play.diagramUrl) {
                          <a
                            class="diagram-preview-card"
                            [href]="play.diagramUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            [attr.aria-label]="'Open diagram for ' + play.playName"
                          >
                            @if (isImageUrl(play.diagramUrl)) {
                              <img
                                class="diagram-preview-image"
                                [src]="play.diagramUrl"
                                [alt]="play.playName + ' diagram preview'"
                                loading="lazy"
                              />
                            }
                          </a>
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
                          @if (play.scoutingCutupUrl) {
                            <a
                              class="play-link"
                              [href]="play.scoutingCutupUrl"
                              target="_blank"
                              rel="noopener noreferrer"
                              >Cutup</a
                            >
                          }
                          @if (play.urls) {
                            @for (resource of play.urls; track resource.url) {
                              <a
                                class="play-link"
                                [href]="resource.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                >{{ resource.label }}</a
                              >
                            }
                          }
                        </div>
                      </article>
                    }
                  </div>
                }
              </section>
            }

            @if (
              editingBox() === 'tags' || (selectedPlan()!.tags && selectedPlan()!.tags!.length > 0)
            ) {
              <section class="detail-section detail-section--tags">
                <div class="detail-section__head">
                  <h3 class="section-title">Tags</h3>
                  @if (editingBox() !== 'tags') {
                    <button
                      type="button"
                      class="box-edit-btn"
                      aria-label="Edit tags"
                      (click)="startEditBox('tags')"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                  }
                </div>
                @if (editingBox() === 'tags') {
                  <div class="box-edit-form">
                    <textarea
                      class="form-input form-textarea"
                      rows="2"
                      [value]="editBuffer()"
                      (input)="onEditBufferInput($event)"
                      placeholder="Comma-separated tags (e.g. fast, zone, blitz)"
                    ></textarea>
                    <div class="form-actions">
                      <button type="button" class="btn-cancel" (click)="cancelEditBox()">
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="btn-save"
                        [disabled]="mutating()"
                        (click)="saveEditBox('tags')"
                      >
                        {{ mutating() ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="tags-list">
                    @for (tag of selectedPlan()!.tags!; track tag) {
                      <span class="tag">{{ tag }}</span>
                    }
                  </div>
                }
              </section>
            }

            <section class="detail-section detail-section--record-metadata">
              <div class="detail-section__head">
                <h3 class="section-title">Record Metadata</h3>
              </div>
              <p class="section-meta">
                Source: {{ selectedPlan()!.source }}
                @if (selectedPlan()!.sourceUrl) {
                  ·
                  <a
                    class="play-link"
                    [href]="selectedPlan()!.sourceUrl!"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Source URL</a
                  >
                }
              </p>
              <p class="section-meta">Schema Version: {{ selectedPlan()!.schemaVersion }}</p>
              <p class="section-meta">Created: {{ formatDate(selectedPlan()!.createdAt) }}</p>
              <p class="section-meta">Updated: {{ formatDate(selectedPlan()!.updatedAt) }}</p>
              <p class="section-meta">Created By: {{ selectedPlan()!.createdBy }}</p>
              <p class="section-meta">Updated By: {{ selectedPlan()!.updatedBy }}</p>
            </section>
          </div>
        </div>
      } @else if (showingDetail() && detailLoading()) {
        <div class="gameplans-loading">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      } @else if (loading()) {
        <!-- LOADING STATE -->
        <div class="gameplans-loading">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      } @else if (!hasTeamContext()) {
        <nxt1-state-view
          variant="empty"
          icon="users"
          title="Team Context Required"
          message="Select a team to view game plans for that team only"
        />
      } @else if (error()) {
        <!-- ERROR STATE -->
        <nxt1-state-view
          variant="error"
          title="Unable to load"
          [message]="error() ?? 'Failed to load game plans'"
          actionLabel="Try Again"
          actionIcon="refresh"
          (action)="reload()"
        />
      } @else {
        <div class="playbooks-list-header">
          <div>
            <h3>
              Game Plans
              @if (gameplansReleaseLabel) {
                <span class="release-badge">{{ gameplansReleaseLabel }}</span>
              }
            </h3>
            @if (plans().length === 0 && !showCreateForm()) {
              <p>No game plans yet. Start from Agent X or import your files.</p>
            }
          </div>
          @if (!showCreateForm()) {
            <div class="playbooks-list-header-actions">
              <button type="button" class="btn-new" (click)="startCreate()">
                <nxt1-icon name="plus" [size]="14"></nxt1-icon>
                New
              </button>
            </div>
          }
        </div>

        @if (showCreateForm()) {
          <div class="inline-form">
            <h4 class="form-heading">New Game Plan</h4>
            <input
              class="form-input"
              placeholder="Game plan title *"
              [value]="newGamePlan().title"
              (input)="patchNewGamePlan('title', $event)"
            />
            <div class="form-row">
              <input
                class="form-input"
                placeholder="Opponent"
                [value]="newGamePlan().opponentName"
                (input)="patchNewGamePlan('opponentName', $event)"
              />
              <input
                class="form-input"
                placeholder="Game date (YYYY-MM-DD)"
                [value]="newGamePlan().gameDate"
                (input)="patchNewGamePlan('gameDate', $event)"
              />
            </div>
            <div class="form-row">
              <select
                class="form-input"
                [value]="newGamePlan().phase"
                (change)="patchNewGamePlan('phase', $event)"
              >
                <option value="pregame">Pregame</option>
                <option value="in-game">In-Game</option>
                <option value="postgame">Postgame</option>
                <option value="scouting">Scouting</option>
              </select>
              <select
                class="form-input"
                [value]="newGamePlan().status"
                (change)="patchNewGamePlan('status', $event)"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelCreate()">Cancel</button>
              <button
                type="button"
                class="btn-save"
                [disabled]="mutating() || !newGamePlan().title.trim() || !activeSport()"
                (click)="createGamePlan()"
              >
                {{ mutating() ? 'Creating…' : 'Create Game Plan' }}
              </button>
            </div>
          </div>
        }

        @if (plans().length === 0 && !showCreateForm()) {
          <div class="playbooks-empty-state" [attr.data-testid]="testIds.LIST_EMPTY_STATE">
            <nxt1-state-view
              variant="empty"
              icon="clipboard"
              title="No Game Plans"
              message="Import your game plan files or have Agent X build a complete game plan draft from scratch."
            />

            <input
              #gamePlanImportInput
              type="file"
              class="hidden-file-input"
              accept=".pdf,.doc,.docx,.txt,.rtf,.md,.csv,.xls,.xlsx,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              (change)="onImportGamePlanFilesSelected($event)"
            />

            <div class="playbooks-empty-actions">
              <button
                type="button"
                class="btn-empty-action"
                (click)="openGamePlanImportPicker(gamePlanImportInput)"
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
                <span>Import Game Plan</span>
              </button>

              <button
                type="button"
                class="btn-empty-action btn-empty-action--primary"
                (click)="startCreateGamePlanChat()"
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
                <span>Create Game Plan</span>
              </button>
            </div>
          </div>
        } @else {
          <!-- LIST VIEW -->
          <div class="gameplans-list" [attr.data-testid]="testIds.LIST_CONTAINER">
            @for (plan of plans(); track plan.id) {
              @if (deletingPlanId() === plan.id) {
                <div class="gameplan-card-static gameplan-card--confirm">
                  <p class="delete-msg">
                    Delete <strong>{{ plan.title }}</strong
                    >? This cannot be undone.
                  </p>
                  <div class="form-actions">
                    <button type="button" class="btn-cancel" (click)="cancelDeletePlan()">
                      Keep
                    </button>
                    <button
                      type="button"
                      class="btn-delete-confirm"
                      [disabled]="mutating()"
                      (click)="deleteSelectedPlan(plan.id)"
                    >
                      {{ mutating() ? 'Deleting…' : 'Delete' }}
                    </button>
                  </div>
                </div>
              } @else {
                <article
                  class="gameplan-card"
                  [attr.data-testid]="testIds.LIST_ITEM"
                  [nxtAgentXContextDrag]="buildGamePlanSummaryDragContext(plan)"
                  (click)="selectPlan(plan.id)"
                >
                  <div class="gameplan-card__head">
                    <h3 class="gameplan-card__title">{{ plan.title }}</h3>
                    <span class="gameplan-card__badge" [attr.data-status]="plan.status | lowercase">
                      {{ plan.status }}
                    </span>
                    @if (gameplansReleaseLabel) {
                      <span class="gameplan-card__release-badge">{{ gameplansReleaseLabel }}</span>
                    }
                  </div>

                  <div class="gameplan-card__meta">
                    <span class="gameplan-meta-tag">{{ plan.sport | titlecase }}</span>
                    <span class="gameplan-meta-tag">{{ plan.phase | titlecase }}</span>
                    @if (plan.opponentName) {
                      <span class="gameplan-meta-tag gameplan-meta-tag--opponent">
                        vs {{ plan.opponentName }}
                      </span>
                    }
                  </div>

                  <p class="gameplan-card__time">Updated {{ formatDate(plan.updatedAt) }}</p>

                  <div class="card-crud-row">
                    <button
                      type="button"
                      class="icon-btn icon-btn--sm"
                      title="Edit"
                      aria-label="Edit game plan"
                      [disabled]="mutating()"
                      (click)="openPlanForInlineEdit(plan.id, 'coreMetadata', $event)"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn--sm icon-btn--danger"
                      title="Delete"
                      aria-label="Delete game plan"
                      [disabled]="mutating()"
                      (click)="confirmDeletePlan(plan, $event)"
                    >
                      <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                    </button>
                  </div>
                </article>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .gameplans-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 10px 12px 12px;
        gap: var(--nxt1-spacing-3, 12px);
        scrollbar-width: thin;
        scrollbar-color: var(--agent-border, rgba(0, 0, 0, 0.08)) transparent;
      }

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

      .playbooks-list-header p {
        margin: 4px 0 0;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.76rem;
      }

      .playbooks-list-header-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
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

      .playbooks-empty-state {
        display: grid;
        justify-items: center;
        gap: 14px;
      }

      .hidden-file-input {
        display: none;
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

      .agent-x-context-drag-source:not(.agent-x-context-drag-source--disabled) {
        cursor: grab;
      }

      .agent-x-context-drag-source--dragging {
        cursor: grabbing;
        opacity: 0.62;
      }

      /* ════════════════════════════════════════════
         LOADING STATE
         ════════════════════════════════════════════ */

      .gameplans-loading {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .skeleton-card {
        height: 120px;
        border-radius: var(--nxt1-radius-lg, 14px);
        background: linear-gradient(
          90deg,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 0%,
          var(--agent-surface-hover, rgba(0, 0, 0, 0.05)) 50%,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 2s infinite;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* ════════════════════════════════════════════
         STATE VIEW (Error / Empty)
         ════════════════════════════════════════════ */

      :host ::ng-deep nxt1-state-view {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
      }

      /* ════════════════════════════════════════════
         PLANS LIST
         ════════════════════════════════════════════ */

      .gameplans-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
      }

      @media (max-width: 560px) {
        .gameplans-list {
          grid-template-columns: 1fr;
        }
      }

      /* ════════════════════════════════════════════
         GAMEPLAN CARD
         ════════════════════════════════════════════ */

      .gameplan-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .gameplan-card-static {
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .gameplan-card:hover {
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      /* Card Header (Title + Status Badge) */
      .gameplan-card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .gameplan-card__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--agent-text-primary, #1a1a1a);
        word-break: break-word;
      }

      .gameplan-card__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
        flex-shrink: 0;
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .gameplan-card__badge[data-status='draft'] {
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
      }

      .gameplan-card__badge[data-status='active'] {
        background: rgba(34, 197, 94, 0.1);
        color: rgb(34, 197, 94);
      }

      .gameplan-card__badge[data-status='completed'] {
        background: rgba(100, 116, 139, 0.1);
        color: rgb(100, 116, 139);
      }

      .release-badge,
      .gameplan-card__release-badge,
      .detail-release-badge {
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

      /* Card Metadata (Sport / Phase / Opponent) */
      .gameplan-card__meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .gameplan-meta-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        font-size: 12px;
        font-weight: 500;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .gameplan-meta-tag--opponent {
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
      }

      /* Card Timestamp */
      .gameplan-card__time {
        margin: 0;
        font-size: 11px;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .card-crud-row {
        display: flex;
        justify-content: flex-start;
        gap: 4px;
        margin-top: auto;
      }

      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        cursor: pointer;
      }

      .icon-btn:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-primary, #ccff00);
      }

      .icon-btn--sm {
        width: 24px;
        height: 24px;
      }

      .icon-btn--danger:hover {
        border-color: rgba(239, 68, 68, 0.6);
        color: rgb(239, 68, 68);
      }

      /* ════════════════════════════════════════════
         DARK MODE SUPPORT
         ════════════════════════════════════════════ */

      :host-context(.dark) .gameplan-card,
      :host-context([data-theme='dark']) .gameplan-card {
        background: var(--agent-surface, rgba(255, 255, 255, 0.04));
      }

      :host-context(.dark) .gameplan-card:hover,
      :host-context([data-theme='dark']) .gameplan-card:hover {
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.06));
      }

      :host-context(.dark) .skeleton-card,
      :host-context([data-theme='dark']) .skeleton-card {
        background: linear-gradient(
          90deg,
          var(--agent-surface, rgba(255, 255, 255, 0.04)) 0%,
          var(--agent-surface-hover, rgba(255, 255, 255, 0.06)) 50%,
          var(--agent-surface, rgba(255, 255, 255, 0.04)) 100%
        );
        background-size: 200% 100%;
      }

      /* ════════════════════════════════════════════
         DETAIL VIEW
         ════════════════════════════════════════════ */

      .gameplan-detail {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5, 20px);
        animation: slideIn 0.2s ease;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Detail Header (Back + Badge) */
      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .detail-header--actions-only {
        justify-content: flex-end;
      }

      .detail-header-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .detail-back-link {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-1, 4px);
        border: none;
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        transition: color 0.15s ease;
      }

      .detail-back-link:hover,
      .detail-back-link:focus-visible {
        color: var(--agent-primary, #ccff00);
        outline: none;
      }

      .detail-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .detail-badge[data-status='draft'] {
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
      }

      .detail-badge[data-status='active'] {
        background: rgba(34, 197, 94, 0.1);
        color: rgb(34, 197, 94);
      }

      .detail-badge[data-status='completed'] {
        background: rgba(100, 116, 139, 0.1);
        color: rgb(100, 116, 139);
      }

      .detail-export-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 6px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .detail-export-btn:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      /* Detail Title */
      .detail-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--agent-text-primary, #1a1a1a);
      }

      /* Detail Meta */
      .detail-meta {
        position: relative;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }

      .detail-meta__edit {
        position: absolute;
        top: 8px;
        right: 8px;
      }

      .meta-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .meta-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .meta-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--agent-text-primary, #1a1a1a);
      }

      /* Detail Sections */
      .detail-sections {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
      }

      .detail-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
      }

      .detail-section--hidden {
        display: none;
      }

      .detail-section--identity {
        order: 2;
      }

      .detail-section--scouting-report {
        order: 3;
      }

      .detail-section--opening-script {
        order: 4;
      }

      .detail-section--primary-attack {
        order: 5;
      }

      .detail-section--priorities {
        order: 6;
      }

      .detail-section--special-situations {
        order: 7;
      }

      .detail-section--strengths {
        order: 8;
      }

      .detail-section--adjustment-triggers {
        order: 9;
      }

      .detail-section--plan-blocks {
        order: 10;
      }

      .detail-section--custom-sections {
        order: 11;
      }

      .detail-section--linked-playbooks {
        order: 12;
      }

      .detail-section--linked-plays {
        order: 13;
      }

      .detail-section--tags {
        order: 14;
      }

      .detail-section--record-metadata {
        order: 15;
      }

      .detail-section__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* New Game Plan form parity with Playbooks panel */
      .inline-form {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        padding: 14px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
      }

      .form-heading {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .inline-form .form-actions {
        margin-top: 2px;
      }

      .inline-form .btn-cancel,
      .inline-form .btn-save {
        height: 28px;
        padding: 4px 10px;
        font-size: 0.74rem;
        border-radius: var(--nxt1-radius-sm, 8px);
      }

      .inline-form .btn-save {
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.15));
        color: var(--agent-text-primary, #1a1a1a);
        box-shadow: none;
        transform: none;
      }

      .inline-form .btn-save:hover {
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.24));
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
        box-shadow: none;
        transform: none;
      }

      .inline-form .btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .box-edit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .box-edit-btn:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-primary, #ccff00);
      }

      /* ── Inline edit form (matches playbook panel) ── */
      .box-edit-form {
        display: grid;
        gap: 7px;
        margin-top: 8px;
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
        font-family: inherit;
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
      .item-edit-form {
        display: grid;
        gap: 8px;
      }
      .item-actions {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .btn-delete-mini {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.08);
        color: rgb(220, 38, 38);
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        height: 24px;
        white-space: nowrap;
      }
      .btn-delete-mini:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .form-help {
        margin: 0;
        font-size: 12px;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
        line-height: 1.4;
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
      .btn-cancel:hover {
        border-color: var(--agent-text-muted, rgba(0, 0, 0, 0.3));
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
        transition:
          background-color 140ms ease,
          border-color 140ms ease,
          color 140ms ease,
          box-shadow 140ms ease,
          transform 140ms ease;
      }
      .btn-save:hover {
        background: var(--agent-primary, #ccff00);
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-bg, #0a0d08);
        transform: translateY(-1px);
        box-shadow:
          0 0 0 1px var(--agent-primary, #ccff00) inset,
          0 6px 14px var(--agent-primary-glow, rgba(204, 255, 0, 0.32));
      }
      .btn-save:focus-visible {
        outline: 2px solid var(--agent-primary, #ccff00);
        outline-offset: 2px;
      }
      .btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
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

      .delete-msg {
        margin: 0;
        font-size: 0.78rem;
      }

      .section-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .section-content {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        word-break: break-word;
      }

      .section-content--markdown {
        display: block;
      }

      .section-content--markdown .md {
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .section-content--markdown .md p,
      .section-content--markdown .md li,
      .section-content--markdown .md strong,
      .section-content--markdown .md em,
      .section-content--markdown .md a {
        color: inherit;
      }

      .section-content--markdown .md p {
        margin: 0 0 4px;
      }

      .section-content--markdown .md p:last-child {
        margin-bottom: 0;
      }

      .section-content--markdown .md ul,
      .section-content--markdown .md ol {
        margin: 0;
        padding-left: 18px;
      }

      .section-meta {
        margin: 0;
        font-size: 12px;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      /* Script List */
      .script-list {
        margin: 0;
        padding-left: var(--nxt1-spacing-4, 16px);
        list-style-type: disc;
      }

      .script-list li {
        margin-bottom: var(--nxt1-spacing-2, 8px);
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* Tags */
      .tags-list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .sw-list,
      .priority-list,
      .plays-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .sw-item,
      .priority-item,
      .play-item {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      .sw-item__head,
      .priority-item__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .priority-item__head {
        justify-content: space-between;
      }

      .priority-item__title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--agent-text-primary, #1a1a1a);
      }

      .sw-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 700;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .sw-pill[data-side='own'] {
        background: rgba(34, 197, 94, 0.1);
        color: rgb(34, 197, 94);
      }

      .sw-pill[data-side='opponent'] {
        background: rgba(59, 130, 246, 0.1);
        color: rgb(59, 130, 246);
      }

      .sw-pill[data-type='weakness'] {
        background: rgba(239, 68, 68, 0.12);
        color: rgb(220, 38, 38);
      }

      .sw-pill[data-level='must_win'] {
        background: rgba(239, 68, 68, 0.12);
        color: rgb(220, 38, 38);
      }

      .sw-pill[data-level='high'] {
        background: rgba(249, 115, 22, 0.12);
        color: rgb(234, 88, 12);
      }

      .sw-pill[data-level='medium'] {
        background: rgba(234, 179, 8, 0.14);
        color: rgb(161, 98, 7);
      }

      .sw-pill[data-level='low'] {
        background: rgba(100, 116, 139, 0.1);
        color: rgb(71, 85, 105);
      }

      .play-links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .diagram-preview-card {
        display: block;
        position: relative;
        width: 100%;
        min-height: 120px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        overflow: hidden;
        text-decoration: none;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        cursor: pointer;
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
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 12px;
        font-weight: 600;
      }

      .play-link {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
      }

      .play-link:hover {
        text-decoration: underline;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 4px;
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        font-size: 12px;
        font-weight: 600;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXGameplansPanelComponent {
  // In-place editing state for boxes
  private readonly _editingBox = signal<string | null>(null);
  public editingBox = computed(() => this._editingBox());
  private readonly _editBuffer = signal<string>('');
  public editBuffer = computed(() => this._editBuffer());
  private readonly _coreMetadataEdit = signal({
    title: '',
    phase: '',
    status: '',
    gameDate: '',
    opponentName: '',
    season: '',
    division: '',
    perspectiveTeam: '',
  });
  public coreMetadataEdit = computed(() => this._coreMetadataEdit());
  private readonly _teamColorsEdit = signal({ ownTeamColor: '', opponentTeamColor: '' });
  public teamColorsEdit = computed(() => this._teamColorsEdit());
  private readonly _editingAdjustmentTriggerIndex = signal<number | null>(null);
  public editingAdjustmentTriggerIndex = computed(() => this._editingAdjustmentTriggerIndex());
  private readonly _adjustmentTriggerEdit = signal({
    trigger: '',
    adjustment: '',
    diagnosis: '',
    validationWindow: '',
    expectedOutcome: '',
    tags: '',
  });
  public adjustmentTriggerEdit = computed(() => this._adjustmentTriggerEdit());
  private readonly _editingCustomSectionIndex = signal<number | null>(null);
  public editingCustomSectionIndex = computed(() => this._editingCustomSectionIndex());
  private readonly _customSectionEdit = signal({
    title: '',
    key: '',
    order: '',
    tags: '',
    content: '',
  });
  public customSectionEdit = computed(() => this._customSectionEdit());
  private readonly _editingStrengthWeaknessIndex = signal<number | null>(null);
  public editingStrengthWeaknessIndex = computed(() => this._editingStrengthWeaknessIndex());
  private readonly _strengthWeaknessEdit = signal({
    id: '',
    label: '',
    side: 'own' as 'own' | 'opponent',
    type: 'strength' as 'strength' | 'weakness',
    impactLevel: 'medium' as 'must_win' | 'high' | 'medium' | 'low',
    actionPlan: '',
    evidenceNote: '',
    tags: '',
  });
  public strengthWeaknessEdit = computed(() => this._strengthWeaknessEdit());

  protected markdownContent(value: string | null | undefined): string {
    return value ?? '';
  }

  public startEditBox(box: string): void {
    const plan = this._detailPlan();
    if (!plan) return;
    this.cancelInlineCollectionEditors();
    this._editingBox.set(box);
    switch (box) {
      case 'identityFocus':
        this._editBuffer.set(plan.identityFocus ?? '');
        break;
      case 'primaryAttackPlan':
        this._editBuffer.set(plan.primaryAttackPlan ?? '');
        break;
      case 'defensivePriorities':
        this._editBuffer.set(plan.defensivePriorities ?? '');
        break;
      case 'specialSituations':
        this._editBuffer.set(plan.specialSituations ?? '');
        break;
      case 'scoutingReport':
        this._editBuffer.set(plan.scoutingReport ?? '');
        break;
      case 'openingScript':
        this._editBuffer.set((plan.openingScript ?? []).join('\n'));
        break;
      case 'tags':
        this._editBuffer.set((plan.tags ?? []).join(', '));
        break;
      case 'priorities':
        this._editBuffer.set(JSON.stringify(plan.priorities ?? [], null, 2));
        break;
      case 'planBlocks':
        this._editBuffer.set(JSON.stringify(plan.planBlocks ?? [], null, 2));
        break;
      case 'adjustmentTriggers':
        this._editingBox.set(null);
        this.startCreateAdjustmentTrigger();
        break;
      case 'customSections':
        this._editingBox.set(null);
        this.startCreateCustomSection();
        break;
      case 'linkedPlaybookIds':
        this._editBuffer.set((plan.linkedPlaybookIds ?? []).join('\n'));
        break;
      case 'linkedPlays':
        this._editBuffer.set(JSON.stringify(plan.linkedPlays ?? [], null, 2));
        break;
      case 'halftimePriorities':
        this._editBuffer.set(JSON.stringify(plan.halftimePriorities ?? [], null, 2));
        break;
      case 'strengthsWeaknesses':
        this._editingBox.set(null);
        this.startCreateStrengthWeakness();
        break;
      case 'coreMetadata':
        this._coreMetadataEdit.set({
          title: plan.title ?? '',
          phase: plan.phase ?? '',
          status: plan.status ?? '',
          gameDate: plan.gameDate ?? '',
          opponentName: plan.opponentName ?? '',
          season: plan.season ?? '',
          division: plan.division ?? '',
          perspectiveTeam: plan.perspectiveTeam ?? '',
        });
        break;
      case 'teamColors':
        this._teamColorsEdit.set({
          ownTeamColor: plan.ownTeamColor ?? '',
          opponentTeamColor: plan.opponentTeamColor ?? '',
        });
        break;
      default:
        this._editBuffer.set('');
    }
  }

  public cancelEditBox(): void {
    this._editingBox.set(null);
    this._editBuffer.set('');
    this.cancelInlineCollectionEditors();
    this._coreMetadataEdit.set({
      title: '',
      phase: '',
      status: '',
      gameDate: '',
      opponentName: '',
      season: '',
      division: '',
      perspectiveTeam: '',
    });
    this._teamColorsEdit.set({ ownTeamColor: '', opponentTeamColor: '' });
  }

  public onEditBufferInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this._editBuffer.set(target.value);
  }

  public onCoreMetadataInput(
    field:
      | 'title'
      | 'phase'
      | 'status'
      | 'gameDate'
      | 'opponentName'
      | 'season'
      | 'division'
      | 'perspectiveTeam',
    event: Event
  ): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    this._coreMetadataEdit.update((current) => ({
      ...current,
      [field]: target.value,
    }));
  }

  public onTeamColorsInput(field: 'ownTeamColor' | 'opponentTeamColor', event: Event): void {
    const target = event.target as HTMLInputElement;
    this._teamColorsEdit.update((current) => ({
      ...current,
      [field]: target.value,
    }));
  }

  public async saveEditBox(box: string): Promise<void> {
    if (this._mutating()) return;
    const value = this._editBuffer();
    switch (box) {
      case 'identityFocus':
        await this.updateSelectedPlan({ identityFocus: value });
        break;
      case 'primaryAttackPlan':
        await this.updateSelectedPlan({ primaryAttackPlan: value });
        break;
      case 'defensivePriorities':
        await this.updateSelectedPlan({ defensivePriorities: value });
        break;
      case 'specialSituations':
        await this.updateSelectedPlan({ specialSituations: value });
        break;
      case 'scoutingReport':
        await this.updateSelectedPlan({ scoutingReport: value });
        break;
      case 'openingScript':
        await this.updateSelectedPlan({
          openingScript: value.split(/\r?\n/).filter((l) => l.trim().length > 0),
        });
        break;
      case 'tags':
        await this.updateSelectedPlan({
          tags: value
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0),
        });
        break;
      case 'priorities':
        await this.updateSelectedPlan({ priorities: JSON.parse(value) });
        break;
      case 'planBlocks':
        await this.updateSelectedPlan({ planBlocks: JSON.parse(value) });
        break;
      case 'linkedPlaybookIds':
        await this.updateSelectedPlan({
          linkedPlaybookIds: value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        });
        break;
      case 'linkedPlays':
        await this.updateSelectedPlan({ linkedPlays: JSON.parse(value) });
        break;
      case 'halftimePriorities':
        await this.updateSelectedPlan({ halftimePriorities: JSON.parse(value) });
        break;
      case 'coreMetadata': {
        const metadata = this._coreMetadataEdit();
        await this.updateSelectedPlan({
          title: metadata.title.trim(),
          phase: metadata.phase,
          status: metadata.status,
          gameDate: metadata.gameDate.trim(),
          opponentName: metadata.opponentName.trim(),
          season: metadata.season.trim(),
          division: metadata.division.trim(),
          perspectiveTeam: metadata.perspectiveTeam,
        });
        break;
      }
      case 'teamColors': {
        const colors = this._teamColorsEdit();
        await this.updateSelectedPlan({
          ownTeamColor: colors.ownTeamColor.trim(),
          opponentTeamColor: colors.opponentTeamColor.trim(),
        });
        break;
      }
    }
    this.cancelEditBox();
  }

  public startCreateAdjustmentTrigger(): void {
    this._editingBox.set(null);
    this.cancelCustomSectionEdit();
    this._editingAdjustmentTriggerIndex.set(-1);
    this._adjustmentTriggerEdit.set({
      trigger: '',
      adjustment: '',
      diagnosis: '',
      validationWindow: '',
      expectedOutcome: '',
      tags: '',
    });
  }

  public startEditAdjustmentTrigger(index: number): void {
    const plan = this._detailPlan();
    if (!plan) return;
    const trigger = plan.adjustmentTriggers?.[index];
    if (!trigger) return;

    this._editingBox.set(null);
    this.cancelCustomSectionEdit();
    this._editingAdjustmentTriggerIndex.set(index);
    this._adjustmentTriggerEdit.set({
      trigger: trigger.trigger ?? '',
      adjustment: trigger.adjustment ?? '',
      diagnosis: trigger.diagnosis ?? '',
      validationWindow: trigger.validationWindow ?? '',
      expectedOutcome: trigger.expectedOutcome ?? '',
      tags: (trigger.tags ?? []).join(', '),
    });
  }

  public cancelAdjustmentTriggerEdit(): void {
    this._editingAdjustmentTriggerIndex.set(null);
    this._adjustmentTriggerEdit.set({
      trigger: '',
      adjustment: '',
      diagnosis: '',
      validationWindow: '',
      expectedOutcome: '',
      tags: '',
    });
  }

  public onAdjustmentTriggerEditInput(
    field: 'trigger' | 'adjustment' | 'diagnosis' | 'validationWindow' | 'expectedOutcome' | 'tags',
    event: Event
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this._adjustmentTriggerEdit.update((current) => ({
      ...current,
      [field]: target.value,
    }));
  }

  public async saveAdjustmentTriggerEdit(): Promise<void> {
    if (this._mutating()) return;
    const plan = this._detailPlan();
    const index = this._editingAdjustmentTriggerIndex();
    if (!plan || index === null) return;

    const draft = this._adjustmentTriggerEdit();
    const trigger = draft.trigger.trim();
    const adjustment = draft.adjustment.trim();
    if (!trigger || !adjustment) {
      this._error.set('Trigger and adjustment are required.');
      return;
    }

    const next = [...(plan.adjustmentTriggers ?? [])];
    const item: GamePlanAdjustmentTrigger = {
      trigger,
      adjustment,
      ...(draft.diagnosis.trim() ? { diagnosis: draft.diagnosis.trim() } : {}),
      ...(draft.validationWindow.trim() ? { validationWindow: draft.validationWindow.trim() } : {}),
      ...(draft.expectedOutcome.trim() ? { expectedOutcome: draft.expectedOutcome.trim() } : {}),
      ...(this.parseCsvList(draft.tags).length > 0 ? { tags: this.parseCsvList(draft.tags) } : {}),
    };

    if (index === -1) {
      next.push(item);
    } else if (index >= 0 && index < next.length) {
      next[index] = item;
    } else {
      return;
    }

    await this.updateSelectedPlan({ adjustmentTriggers: next });
    this.cancelAdjustmentTriggerEdit();
  }

  public async removeAdjustmentTrigger(index: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this._mutating()) return;

    const plan = this._detailPlan();
    const triggers = plan?.adjustmentTriggers ?? [];
    if (!plan || index < 0 || index >= triggers.length) return;

    const next = triggers.filter((_, i) => i !== index);
    await this.updateSelectedPlan({ adjustmentTriggers: next });

    const editingIndex = this._editingAdjustmentTriggerIndex();
    if (editingIndex === index) {
      this.cancelAdjustmentTriggerEdit();
    } else if (editingIndex !== null && editingIndex > index) {
      this._editingAdjustmentTriggerIndex.set(editingIndex - 1);
    }
  }

  public startCreateCustomSection(): void {
    this._editingBox.set(null);
    this.cancelAdjustmentTriggerEdit();
    this._editingCustomSectionIndex.set(-1);
    this._customSectionEdit.set({ title: '', key: '', order: '', tags: '', content: '' });
  }

  public startEditCustomSection(index: number): void {
    const plan = this._detailPlan();
    if (!plan) return;
    const section = plan.customSections?.[index];
    if (!section) return;

    this._editingBox.set(null);
    this.cancelAdjustmentTriggerEdit();
    this._editingCustomSectionIndex.set(index);
    this._customSectionEdit.set({
      title: section.title ?? '',
      key: section.key ?? '',
      order: typeof section.order === 'number' ? String(section.order) : '',
      tags: (section.tags ?? []).join(', '),
      content: section.content ?? '',
    });
  }

  public cancelCustomSectionEdit(): void {
    this._editingCustomSectionIndex.set(null);
    this._customSectionEdit.set({ title: '', key: '', order: '', tags: '', content: '' });
  }

  public onCustomSectionEditInput(
    field: 'title' | 'key' | 'order' | 'tags' | 'content',
    event: Event
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this._customSectionEdit.update((current) => ({
      ...current,
      [field]: target.value,
    }));
  }

  public async saveCustomSectionEdit(): Promise<void> {
    if (this._mutating()) return;
    const plan = this._detailPlan();
    const index = this._editingCustomSectionIndex();
    if (!plan || index === null) return;

    const draft = this._customSectionEdit();
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content) {
      this._error.set('Custom section title and content are required.');
      return;
    }

    const orderRaw = draft.order.trim();
    if (orderRaw && !/^\d+$/.test(orderRaw)) {
      this._error.set('Order must be a whole number when provided.');
      return;
    }

    const next = [...(plan.customSections ?? [])];
    const section: GamePlanSection = {
      title,
      key: draft.key.trim() || this.createSectionKeyFromTitle(title),
      content,
      ...(orderRaw ? { order: Number(orderRaw) } : {}),
      ...(this.parseCsvList(draft.tags).length > 0 ? { tags: this.parseCsvList(draft.tags) } : {}),
    };

    if (index === -1) {
      next.push(section);
    } else if (index >= 0 && index < next.length) {
      next[index] = section;
    } else {
      return;
    }

    await this.updateSelectedPlan({ customSections: next });
    this.cancelCustomSectionEdit();
  }

  public async removeCustomSection(index: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this._mutating()) return;

    const plan = this._detailPlan();
    const sections = plan?.customSections ?? [];
    if (!plan || index < 0 || index >= sections.length) return;

    const next = sections.filter((_, i) => i !== index);
    await this.updateSelectedPlan({ customSections: next });

    const editingIndex = this._editingCustomSectionIndex();
    if (editingIndex === index) {
      this.cancelCustomSectionEdit();
    } else if (editingIndex !== null && editingIndex > index) {
      this._editingCustomSectionIndex.set(editingIndex - 1);
    }
  }

  public customSectionsForDisplay(
    sections: readonly GamePlanSection[]
  ): ReadonlyArray<{ readonly index: number; readonly section: GamePlanSection }> {
    return sections
      .map((section, index) => ({ index, section }))
      .sort(
        (a, b) =>
          (a.section.order ?? Number.MAX_SAFE_INTEGER) -
          (b.section.order ?? Number.MAX_SAFE_INTEGER)
      );
  }

  public startCreateStrengthWeakness(): void {
    this._editingBox.set(null);
    this.cancelAdjustmentTriggerEdit();
    this.cancelCustomSectionEdit();
    this._editingStrengthWeaknessIndex.set(-1);
    this._strengthWeaknessEdit.set({
      id: '',
      label: '',
      side: 'own',
      type: 'strength',
      impactLevel: 'medium',
      actionPlan: '',
      evidenceNote: '',
      tags: '',
    });
  }

  public startEditStrengthWeakness(index: number): void {
    const plan = this._detailPlan();
    if (!plan) return;
    const item = plan.strengthsWeaknesses?.[index];
    if (!item) return;

    this._editingBox.set(null);
    this.cancelAdjustmentTriggerEdit();
    this.cancelCustomSectionEdit();
    this._editingStrengthWeaknessIndex.set(index);
    this._strengthWeaknessEdit.set({
      id: item.id ?? '',
      label: item.label ?? '',
      side: item.side === 'opponent' ? 'opponent' : 'own',
      type: item.type === 'weakness' ? 'weakness' : 'strength',
      impactLevel:
        item.impactLevel === 'must_win' ||
        item.impactLevel === 'high' ||
        item.impactLevel === 'medium' ||
        item.impactLevel === 'low'
          ? item.impactLevel
          : 'medium',
      actionPlan: item.actionPlan ?? '',
      evidenceNote: item.evidence?.note ?? '',
      tags: (item.tags ?? []).join(', '),
    });
  }

  public cancelStrengthWeaknessEdit(): void {
    this._editingStrengthWeaknessIndex.set(null);
    this._strengthWeaknessEdit.set({
      id: '',
      label: '',
      side: 'own',
      type: 'strength',
      impactLevel: 'medium',
      actionPlan: '',
      evidenceNote: '',
      tags: '',
    });
  }

  public onStrengthWeaknessEditInput(
    field: 'label' | 'side' | 'type' | 'impactLevel' | 'actionPlan' | 'evidenceNote' | 'tags',
    event: Event
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const value = target.value;

    if (field === 'side') {
      this._strengthWeaknessEdit.update((current) => ({
        ...current,
        side: value === 'opponent' ? 'opponent' : 'own',
      }));
      return;
    }

    if (field === 'type') {
      this._strengthWeaknessEdit.update((current) => ({
        ...current,
        type: value === 'weakness' ? 'weakness' : 'strength',
      }));
      return;
    }

    if (field === 'impactLevel') {
      this._strengthWeaknessEdit.update((current) => ({
        ...current,
        impactLevel:
          value === 'must_win' || value === 'high' || value === 'medium' || value === 'low'
            ? value
            : 'medium',
      }));
      return;
    }

    this._strengthWeaknessEdit.update((current) => ({
      ...current,
      [field]: value,
    }));
  }

  public async saveStrengthWeaknessEdit(): Promise<void> {
    if (this._mutating()) return;

    const plan = this._detailPlan();
    const index = this._editingStrengthWeaknessIndex();
    if (!plan || index === null) return;

    const draft = this._strengthWeaknessEdit();
    const label = draft.label.trim();
    if (!label) {
      this._error.set('Strength/weakness label is required.');
      return;
    }

    const next = [...(plan.strengthsWeaknesses ?? [])];
    const evidenceNote = draft.evidenceNote.trim();
    const evidence = evidenceNote ? { type: 'note' as const, note: evidenceNote } : undefined;

    const baseId = draft.id.trim();
    const generatedId =
      baseId || `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const item: GamePlanStrengthWeakness = {
      id: generatedId,
      side: draft.side,
      type: draft.type,
      label,
      impactLevel: draft.impactLevel,
      ...(draft.actionPlan.trim() ? { actionPlan: draft.actionPlan.trim() } : {}),
      ...(evidence ? { evidence } : {}),
      ...(this.parseCsvList(draft.tags).length > 0 ? { tags: this.parseCsvList(draft.tags) } : {}),
    };

    if (index === -1) {
      next.push(item);
    } else if (index >= 0 && index < next.length) {
      next[index] = item;
    } else {
      return;
    }

    await this.updateSelectedPlan({ strengthsWeaknesses: next });
    this.cancelStrengthWeaknessEdit();
  }

  public async removeStrengthWeakness(index: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this._mutating()) return;

    const plan = this._detailPlan();
    const items = plan?.strengthsWeaknesses ?? [];
    if (!plan || index < 0 || index >= items.length) return;

    const next = items.filter((_, i) => i !== index);
    await this.updateSelectedPlan({ strengthsWeaknesses: next });

    const editingIndex = this._editingStrengthWeaknessIndex();
    if (editingIndex === index) {
      this.cancelStrengthWeaknessEdit();
    } else if (editingIndex !== null && editingIndex > index) {
      this._editingStrengthWeaknessIndex.set(editingIndex - 1);
    }
  }

  private cancelInlineCollectionEditors(): void {
    this.cancelAdjustmentTriggerEdit();
    this.cancelCustomSectionEdit();
    this.cancelStrengthWeaknessEdit();
  }

  private parseCsvList(value: string | undefined): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private createSectionKeyFromTitle(title: string): string {
    const key = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return key || 'custom-section';
  }

  public async openPlanForInlineEdit(planId: string, box: string, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const teamId = this._teamId();
    if (!teamId || this._mutating()) return;

    this._selectedPlanId.set(planId);
    this._detailLoading.set(true);
    this._detailPlan.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<GamePlanDetailResponse>(`${this.baseUrl}/gameplans/${planId}`, {
          params: { teamId },
        })
      );

      if (response.success && response.data?.gamePlan && response.data.gamePlan.teamId === teamId) {
        this._detailPlan.set(response.data.gamePlan);
        this.startEditBox(box);
      } else {
        this._selectedPlanId.set(null);
      }
    } catch {
      this._selectedPlanId.set(null);
    } finally {
      this._detailLoading.set(false);
    }
  }

  private readonly documentRef = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly agentX = inject(AgentXService);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  readonly testIds = TEST_IDS.GAMEPLAN;
  protected readonly gameplansReleaseLabel = getAgentXReleaseLabel('gameplans');
  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _plans = signal<readonly GamePlanSummary[]>([]);
  private readonly _sport = signal<string | null>(null);
  private readonly _teamId = signal<string | null>(null);
  private readonly _selectedPlanId = signal<string | null>(null);
  private readonly _detailPlan = signal<GamePlanDetail | null>(null);
  private readonly _detailLoading = signal(false);
  private readonly _mutating = signal(false);
  private readonly _deletingPlanId = signal<string | null>(null);

  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly plans = computed(() => this._plans());
  readonly activeSport = computed(() => {
    const preferred = this._sport();
    if (preferred) return preferred;
    const firstPlanSport = this._plans()[0]?.sport?.trim();
    return firstPlanSport && firstPlanSport.length > 0 ? firstPlanSport : null;
  });
  readonly hasTeamContext = computed(() => {
    const teamId = this._teamId();
    return typeof teamId === 'string' && teamId.trim().length > 0;
  });
  readonly selectedPlanId = computed(() => this._selectedPlanId());
  readonly selectedPlan = computed(() => this._detailPlan());
  readonly strengthWeaknessItems = computed(() =>
    this.buildStrengthWeaknessDisplayItems(this._detailPlan()?.strengthsWeaknesses)
  );
  readonly detailLoading = computed(() => this._detailLoading());
  readonly showingDetail = computed(() => this._selectedPlanId() !== null);
  readonly mutating = computed(() => this._mutating());
  readonly deletingPlanId = computed(() => this._deletingPlanId());
  readonly showCreateForm = signal(false);
  readonly newGamePlan = signal({
    title: '',
    opponentName: '',
    gameDate: '',
    phase: 'pregame',
    status: 'draft',
  });

  @Input()
  set sport(value: string | null | undefined) {
    const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    this._sport.set(normalized);
  }

  @Input()
  set teamId(value: string | null | undefined) {
    const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    if (normalized === this._teamId()) return;
    this._teamId.set(normalized);
    this.clearSelection();
    void this.reload();
  }

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    const teamId = this._teamId();
    if (!teamId) {
      this._plans.set([]);
      this._loading.set(false);
      return;
    }

    try {
      const sport = this._sport()?.trim().toLowerCase();
      const params: Record<string, string> = {
        limit: '12',
        teamId,
      };
      if (sport) params['sport'] = sport;

      const response = await firstValueFrom(
        this.http.get<GameplansResponse>(`${this.baseUrl}/gameplans`, {
          params,
        })
      );

      if (!response.success) {
        this._plans.set([]);
        this._error.set(response.error ?? 'Unable to load game plans');
        return;
      }

      this._plans.set(response.data?.gamePlans ?? []);
    } catch {
      this._plans.set([]);
      this._error.set('Unable to load game plans right now');
    } finally {
      this._loading.set(false);
    }
  }

  selectPlan(planId: string): void {
    const teamId = this._teamId();
    if (!teamId) return;

    this._selectedPlanId.set(planId);
    this._detailLoading.set(true);
    this._detailPlan.set(null);

    firstValueFrom(
      this.http.get<GamePlanDetailResponse>(`${this.baseUrl}/gameplans/${planId}`, {
        params: { teamId },
      })
    )
      .then((response) => {
        if (
          response.success &&
          response.data?.gamePlan &&
          response.data.gamePlan.teamId === teamId
        ) {
          this._detailPlan.set(response.data.gamePlan);
        } else {
          this._selectedPlanId.set(null);
        }
      })
      .catch(() => {
        this._selectedPlanId.set(null);
      })
      .finally(() => {
        this._detailLoading.set(false);
      });
  }

  clearSelection(): void {
    this._selectedPlanId.set(null);
    this._detailPlan.set(null);
  }

  public isDetailView(): boolean {
    return this.showingDetail();
  }

  public getHeaderTitle(): string {
    const plan = this.selectedPlan();
    return plan?.title?.trim() || 'Game Plans';
  }

  public backToList(): void {
    this.clearSelection();
  }

  formatDate(value: unknown): string {
    if (value instanceof Date) {
      return this.formatDate(value.toISOString());
    }
    if (typeof value === 'object' && value !== null) {
      const seconds = (value as { readonly seconds?: unknown }).seconds;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) {
        return this.formatDate(new Date(seconds * 1000).toISOString());
      }
    }
    if (typeof value !== 'string') {
      return String(value ?? '');
    }

    const time = Date.parse(value);
    if (Number.isNaN(time)) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(time));
  }

  formatImpactLevel(level: GamePlanMomentPriority['level']): string {
    if (level === 'must_win') return 'Must Win';
    if (level === 'high') return 'High';
    if (level === 'medium') return 'Medium';
    return 'Low';
  }

  formatStrengthWeaknessImpact(level: GamePlanStrengthWeakness['impactLevel']): string {
    return this.formatImpactLevel(level);
  }

  private normalizeTextValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private buildStrengthWeaknessDisplayItems(
    items: readonly GamePlanStrengthWeakness[] | undefined
  ): readonly DisplayStrengthWeaknessItem[] {
    if (!items || items.length === 0) return [];

    return items.map((item, index) => {
      const actionPlan = this.normalizeTextValue(item.actionPlan);
      const evidenceNote = this.normalizeTextValue(item.evidence?.note);
      const fallbackLabel =
        this.normalizeTextValue(item.label) ??
        actionPlan ??
        evidenceNote ??
        `Strength/Weakness ${index + 1}`;
      const normalizedLabel = fallbackLabel.toLowerCase();
      const inferredTypeFromLabel: 'strength' | 'weakness' | undefined =
        normalizedLabel.includes('weakness') ||
        normalizedLabel.includes('risk') ||
        normalizedLabel.includes('concern')
          ? 'weakness'
          : normalizedLabel.includes('strength') || normalizedLabel.includes('advantage')
            ? 'strength'
            : undefined;
      const inferredSideFromLabel: 'own' | 'opponent' | undefined =
        normalizedLabel.includes('opponent') ||
        normalizedLabel.includes('their ') ||
        normalizedLabel.startsWith('their')
          ? 'opponent'
          : normalizedLabel.includes('our ') ||
              normalizedLabel.startsWith('our') ||
              normalizedLabel.includes('own')
            ? 'own'
            : undefined;

      return {
        id: this.normalizeTextValue(item.id) ?? `sw-${index + 1}`,
        label: fallbackLabel,
        side:
          inferredSideFromLabel ??
          (item.side === 'opponent' ? 'opponent' : item.side === 'own' ? 'own' : 'own'),
        type:
          inferredTypeFromLabel ??
          (item.type === 'weakness'
            ? 'weakness'
            : item.type === 'strength'
              ? 'strength'
              : 'strength'),
        impactLevel:
          item.impactLevel === 'must_win' ||
          item.impactLevel === 'high' ||
          item.impactLevel === 'medium' ||
          item.impactLevel === 'low'
            ? item.impactLevel
            : 'medium',
        ...(actionPlan ? { actionPlan } : {}),
        ...(evidenceNote ? { evidenceNote } : {}),
        ...(item.tags && item.tags.length > 0 ? { tags: item.tags } : {}),
      } satisfies DisplayStrengthWeaknessItem;
    });
  }

  sortedPlanBlocks(blocks: readonly GamePlanBlock[]): readonly GamePlanBlock[] {
    return [...blocks].sort((a, b) => a.order - b.order);
  }

  sortedCustomSections(sections: readonly GamePlanSection[]): readonly GamePlanSection[] {
    return [...sections].sort(
      (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    );
  }

  buildGamePlanSummaryDragContext(plan: GamePlanSummary): AgentXSelectedContext {
    return {
      id: `game-plan:${plan.id}`,
      kind: 'game_plan_item',
      title: plan.title,
      summary: plan.opponentName ? `Game plan vs ${plan.opponentName}` : `${plan.phase} game plan`,
      source: {
        type: 'game_plan',
        id: plan.id,
        label: plan.title,
      },
      entityRefs: [{ type: 'game_plan', id: plan.id, label: plan.title }],
      metadata: this.compactContextMetadata({
        itemType: 'game_plan',
        teamId: plan.teamId,
        sport: plan.sport,
        phase: plan.phase,
        status: plan.status,
        opponentName: plan.opponentName,
        gameDate: plan.gameDate,
        updatedAt: plan.updatedAt,
      }),
    };
  }

  buildGamePlanPriorityDragContext(priority: GamePlanMomentPriority): AgentXSelectedContext {
    const plan = this.selectedPlan();
    const planTitle = plan?.title ?? 'Game Plan';

    return {
      id: `game-plan-priority:${plan?.id ?? 'active'}:${priority.id}`,
      kind: 'game_plan_item',
      title: priority.title,
      summary: priority.objective,
      source: {
        type: 'game_plan',
        ...(plan?.id ? { id: plan.id } : {}),
        label: planTitle,
      },
      entityRefs: [
        ...(plan?.id ? [{ type: 'game_plan', id: plan.id, label: planTitle }] : []),
        { type: 'game_plan_priority', id: priority.id, label: priority.title },
      ],
      metadata: this.compactContextMetadata({
        itemType: 'game_plan_priority',
        teamId: plan?.teamId,
        sport: plan?.sport,
        domain: priority.domain,
        moment: priority.moment,
        level: priority.level,
        successMetric: priority.successMetric,
      }),
    };
  }

  buildGamePlanBlockDragContext(block: GamePlanBlock): AgentXSelectedContext {
    const plan = this.selectedPlan();
    const planTitle = plan?.title ?? 'Game Plan';

    return {
      id: `game-plan-block:${plan?.id ?? 'active'}:${block.id}`,
      kind: 'game_plan_item',
      title: block.title,
      summary: block.content,
      source: {
        type: 'game_plan',
        ...(plan?.id ? { id: plan.id } : {}),
        label: planTitle,
      },
      entityRefs: [
        ...(plan?.id ? [{ type: 'game_plan', id: plan.id, label: planTitle }] : []),
        { type: 'game_plan_block', id: block.id, label: block.title },
      ],
      metadata: this.compactContextMetadata({
        itemType: 'game_plan_block',
        teamId: plan?.teamId,
        sport: plan?.sport,
        domain: block.domain,
        moment: block.moment,
        order: block.order,
      }),
    };
  }

  buildGamePlanLinkedPlayDragContext(play: GamePlanLinkedPlay): AgentXSelectedContext {
    const plan = this.selectedPlan();
    const planTitle = plan?.title ?? 'Game Plan';
    const playId = play.playId ?? play.playName;

    return {
      id: `game-plan-linked-play:${plan?.id ?? 'active'}:${playId}`,
      kind: 'playbook_item',
      title: play.playName,
      ...(play.usage ? { summary: play.usage } : {}),
      source: {
        type: 'game_plan',
        ...(plan?.id ? { id: plan.id } : {}),
        label: planTitle,
      },
      entityRefs: [
        ...(plan?.id ? [{ type: 'game_plan', id: plan.id, label: planTitle }] : []),
        { type: 'playbook_play', id: playId, label: play.playName },
      ],
      media: {
        ...(play.videoUrl ? { videoUrl: play.videoUrl } : {}),
        ...(play.diagramUrl ? { imageUrl: play.diagramUrl } : {}),
      },
      metadata: this.compactContextMetadata({
        itemType: 'game_plan_linked_play',
        teamId: plan?.teamId,
        sport: plan?.sport,
        usage: play.usage,
        installUrl: play.installUrl,
        scoutingCutupUrl: play.scoutingCutupUrl,
      }),
    };
  }

  private compactContextMetadata(
    metadata: Record<string, unknown>
  ): Readonly<Record<string, AgentXSelectedContextMetadataValue>> {
    return Object.fromEntries(
      Object.entries(metadata).flatMap(([key, value]) => {
        const normalized = this.toContextMetadataValue(value);
        return normalized === undefined ? [] : [[key, normalized]];
      })
    ) as Readonly<Record<string, AgentXSelectedContextMetadataValue>>;
  }

  private toContextMetadataValue(value: unknown): AgentXSelectedContextMetadataValue | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const seconds = (value as { readonly seconds?: unknown }).seconds;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) {
        return new Date(seconds * 1000).toISOString();
      }
    }

    return undefined;
  }

  isImageUrl(url: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  exportSelectedPlanPdf(): void {
    const plan = this._detailPlan();
    if (!plan) return;

    void firstValueFrom(
      this.http.get(`${this.baseUrl}/gameplans/${plan.id}/export.pdf`, {
        observe: 'response',
        responseType: 'blob',
      })
    )
      .then((response) => {
        const blob = response.body;
        if (!blob) return;

        const disposition = response.headers.get('content-disposition') ?? '';
        const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
        const fallbackName = `${
          plan.title
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'game-plan'
        }.pdf`;
        const fileName = filenameMatch?.[1] ?? fallbackName;

        const objectUrl = URL.createObjectURL(blob);
        const anchor = this.documentRef.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        this.documentRef.body?.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        this._error.set('Unable to export PDF right now');
      });
  }

  async editPlanSummary(plan: GamePlanSummary, event: Event): Promise<void> {
    await this.openPlanForInlineEdit(plan.id, 'coreMetadata', event);
  }

  confirmDeletePlan(plan: GamePlanSummary, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this._mutating()) return;
    this._deletingPlanId.set(plan.id);
  }

  cancelDeletePlan(): void {
    this._deletingPlanId.set(null);
  }

  async deleteSelectedPlan(gamePlanId: string): Promise<void> {
    await this.deleteGamePlan(gamePlanId);
  }

  startCreate(): void {
    this._error.set(null);
    this.showCreateForm.set(true);
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newGamePlan.set({
      title: '',
      opponentName: '',
      gameDate: '',
      phase: 'pregame',
      status: 'draft',
    });
  }

  patchNewGamePlan(
    field: 'title' | 'opponentName' | 'gameDate' | 'phase' | 'status',
    event: Event
  ): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.newGamePlan.update((current) => ({ ...current, [field]: value }));
  }

  async createGamePlan(): Promise<void> {
    const teamId = this._teamId();
    const sport = this.activeSport()?.trim().toLowerCase();
    const form = this.newGamePlan();
    const title = form.title.trim();

    if (!teamId || !sport || !title) {
      this._error.set('Team, sport, and title are required');
      return;
    }

    await this.createGamePlanFromPayload({
      teamId,
      sport,
      title,
      phase: form.phase,
      status: form.status,
      ...(form.opponentName.trim().length > 0 ? { opponentName: form.opponentName.trim() } : {}),
      ...(form.gameDate.trim().length > 0 ? { gameDate: form.gameDate.trim() } : {}),
    });

    if (!this._error()) {
      this.cancelCreate();
    }
  }

  openGamePlanImportPicker(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  onImportGamePlanFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length === 0) {
      return;
    }

    this.agentX.addFiles(files);
    this.agentX.queueStartupMessage(
      'Use these files to build a complete game plan for our next opponent. Ask me any missing context, then draft a final plan with priorities, phases, and linked plays.'
    );
    if (input) {
      input.value = '';
    }
  }

  startCreateGamePlanChat(): void {
    this.agentX.queueStartupMessage(
      'Create a game plan for our upcoming game. Start by asking me the opponent, matchup priorities, and any constraints, then draft a complete plan with phases, key plays, and coaching points.'
    );
  }

  async editTeamColors(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.startEditBox('teamColors');
  }

  async editCoreMetadata(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.startEditBox('coreMetadata');
  }

  async editTextField(
    field:
      | 'identityFocus'
      | 'primaryAttackPlan'
      | 'defensivePriorities'
      | 'specialSituations'
      | 'scoutingReport',
    label: string,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    void label;
    this.startEditBox(field);
  }

  async editStringListField(
    field: 'openingScript' | 'tags' | 'linkedPlaybookIds',
    label: string,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    void label;
    this.startEditBox(field);
  }

  async editJsonListField(
    field:
      | 'halftimePriorities'
      | 'strengthsWeaknesses'
      | 'priorities'
      | 'planBlocks'
      | 'adjustmentTriggers'
      | 'customSections'
      | 'linkedPlays',
    label: string,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    void label;
    this.startEditBox(field);
  }

  async editPlanRecord(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.startEditBox('coreMetadata');
  }

  private async updateSelectedPlan(patch: Record<string, unknown>): Promise<void> {
    const selected = this._detailPlan();
    if (!selected) return;
    await this.updateGamePlan(selected.id, patch);
  }

  private async updateGamePlan(gamePlanId: string, patch: Record<string, unknown>): Promise<void> {
    const teamId = this._teamId();
    if (!teamId || this._mutating()) return;

    this._mutating.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.put<GamePlanMutationResponse>(`${this.baseUrl}/gameplans/${gamePlanId}`, patch, {
          params: { teamId },
        })
      );

      if (!response.success) {
        this._error.set(response.error ?? 'Unable to update game plan');
        return;
      }

      const updated = response.data?.gamePlan;
      if (updated) {
        this._detailPlan.set(updated);
        this._plans.update((plans) =>
          plans.map((plan) =>
            plan.id === updated.id
              ? {
                  ...plan,
                  title: updated.title,
                  phase: updated.phase,
                  status: updated.status,
                  gameDate: updated.gameDate,
                  opponentName: updated.opponentName,
                  updatedAt: updated.updatedAt,
                }
              : plan
          )
        );
      }
    } catch {
      this._error.set('Unable to update game plan right now');
    } finally {
      this._mutating.set(false);
    }
  }

  private async createGamePlanFromPayload(payload: Record<string, unknown>): Promise<void> {
    if (this._mutating()) return;

    this._mutating.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<GamePlanMutationResponse>(`${this.baseUrl}/gameplans`, payload)
      );

      if (!response.success) {
        this._error.set(response.error ?? 'Unable to create game plan');
        return;
      }

      await this.reload();
    } catch {
      this._error.set('Unable to create game plan right now');
    } finally {
      this._mutating.set(false);
    }
  }

  private async deleteGamePlan(gamePlanId: string): Promise<void> {
    const teamId = this._teamId();
    if (!teamId || this._mutating()) return;

    this._mutating.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.delete<GamePlanMutationResponse>(`${this.baseUrl}/gameplans/${gamePlanId}`, {
          params: { teamId },
        })
      );

      if (!response.success) {
        this._error.set(response.error ?? 'Unable to delete game plan');
        return;
      }

      this._plans.update((plans) => plans.filter((plan) => plan.id !== gamePlanId));
      this._deletingPlanId.set(null);
      if (this._selectedPlanId() === gamePlanId) {
        this.clearSelection();
      }
    } catch {
      this._error.set('Unable to delete game plan right now');
    } finally {
      this._mutating.set(false);
    }
  }
}
