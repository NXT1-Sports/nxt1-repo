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
import type { AgentXSelectedContext, AgentXSelectedContextMetadataValue } from '@nxt1/core/ai';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';

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
type GamePlanBlock = NonNullable<GamePlanDetail['planBlocks']>[number];
type GamePlanSection = NonNullable<GamePlanDetail['customSections']>[number];
type GamePlanLinkedPlay = NonNullable<GamePlanDetail['linkedPlays']>[number];

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

@Component({
  selector: 'nxt1-agent-x-gameplans-panel',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtStateViewComponent, AgentXContextDragDirective],
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
          </div>

          <!-- Plan Content Sections -->
          <div class="detail-sections">
            @if (selectedPlan()!.ownTeamColor || selectedPlan()!.opponentTeamColor) {
              <section class="detail-section">
                <h3 class="section-title">Team Colors</h3>
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
              </section>
            }

            @if (selectedPlan()!.identityFocus) {
              <section class="detail-section">
                <h3 class="section-title">Identity & Focus</h3>
                <p class="section-content">{{ selectedPlan()!.identityFocus }}</p>
              </section>
            }

            @if (selectedPlan()!.primaryAttackPlan) {
              <section class="detail-section">
                <h3 class="section-title">Primary Attack Plan</h3>
                <p class="section-content">{{ selectedPlan()!.primaryAttackPlan }}</p>
              </section>
            }

            @if (selectedPlan()!.defensivePriorities) {
              <section class="detail-section">
                <h3 class="section-title">Defensive Priorities</h3>
                <p class="section-content">{{ selectedPlan()!.defensivePriorities }}</p>
              </section>
            }

            @if (selectedPlan()!.specialSituations) {
              <section class="detail-section">
                <h3 class="section-title">Special Situations</h3>
                <p class="section-content">{{ selectedPlan()!.specialSituations }}</p>
              </section>
            }

            @if (selectedPlan()!.openingScript && selectedPlan()!.openingScript!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Opening Script</h3>
                <ul class="script-list">
                  @for (line of selectedPlan()!.openingScript!; track $index) {
                    <li>{{ line }}</li>
                  }
                </ul>
              </section>
            }

            @if (
              selectedPlan()!.halftimePriorities && selectedPlan()!.halftimePriorities!.length > 0
            ) {
              <section class="detail-section">
                <h3 class="section-title">Halftime Priorities</h3>
                <div class="priority-list">
                  @for (
                    priority of selectedPlan()!.halftimePriorities!;
                    track priority.label + '-' + $index
                  ) {
                    <article class="priority-item">
                      <div class="priority-item__head">
                        <h4 class="priority-item__title">{{ priority.label }}</h4>
                        <span class="sw-pill">{{ priority.kind | titlecase }}</span>
                      </div>
                      <p class="section-content">{{ priority.content }}</p>
                    </article>
                  }
                </div>
              </section>
            }

            @if (selectedPlan()!.tags && selectedPlan()!.tags!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Tags</h3>
                <div class="tags-list">
                  @for (tag of selectedPlan()!.tags!; track tag) {
                    <span class="tag">{{ tag }}</span>
                  }
                </div>
              </section>
            }

            @if (
              selectedPlan()!.strengthsWeaknesses && selectedPlan()!.strengthsWeaknesses!.length > 0
            ) {
              <section class="detail-section">
                <h3 class="section-title">Strengths & Weaknesses</h3>
                <div class="sw-list">
                  @for (item of selectedPlan()!.strengthsWeaknesses!; track item.id) {
                    <article class="sw-item">
                      <div class="sw-item__head">
                        <span class="sw-pill" [attr.data-side]="item.side">{{
                          item.side === 'own' ? 'Our Team' : 'Opponent'
                        }}</span>
                        <span class="sw-pill" [attr.data-type]="item.type">{{
                          item.type | titlecase
                        }}</span>
                        <span class="sw-pill" [attr.data-level]="item.impactLevel">{{
                          formatImpactLevel(item.impactLevel)
                        }}</span>
                      </div>
                      <p class="section-content">{{ item.label }}</p>
                      @if (item.actionPlan) {
                        <p class="section-meta">Action: {{ item.actionPlan }}</p>
                      }
                    </article>
                  }
                </div>
              </section>
            }

            @if (selectedPlan()!.priorities && selectedPlan()!.priorities!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Moment Priorities</h3>
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
                      <p class="section-content">{{ priority.objective }}</p>
                      @if (priority.successMetric) {
                        <p class="section-meta">Success metric: {{ priority.successMetric }}</p>
                      }
                    </article>
                  }
                </div>
              </section>
            }

            @if (selectedPlan()!.planBlocks && selectedPlan()!.planBlocks!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Plan Blocks</h3>
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
                      <p class="section-content">{{ block.content }}</p>
                    </article>
                  }
                </div>
              </section>
            }

            @if (
              selectedPlan()!.adjustmentTriggers && selectedPlan()!.adjustmentTriggers!.length > 0
            ) {
              <section class="detail-section">
                <h3 class="section-title">Adjustment Triggers</h3>
                <div class="priority-list">
                  @for (
                    trigger of selectedPlan()!.adjustmentTriggers!;
                    track trigger.trigger + '-' + $index
                  ) {
                    <article class="priority-item">
                      <h4 class="priority-item__title">{{ trigger.trigger }}</h4>
                      <p class="section-content">{{ trigger.adjustment }}</p>
                      @if (trigger.diagnosis) {
                        <p class="section-meta">Diagnosis: {{ trigger.diagnosis }}</p>
                      }
                      @if (trigger.validationWindow) {
                        <p class="section-meta">
                          Validation Window: {{ trigger.validationWindow }}
                        </p>
                      }
                      @if (trigger.expectedOutcome) {
                        <p class="section-meta">Expected Outcome: {{ trigger.expectedOutcome }}</p>
                      }
                    </article>
                  }
                </div>
              </section>
            }

            @if (selectedPlan()!.customSections && selectedPlan()!.customSections!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Custom Sections</h3>
                <div class="priority-list">
                  @for (
                    section of sortedCustomSections(selectedPlan()!.customSections!);
                    track section.key
                  ) {
                    <article class="priority-item">
                      <h4 class="priority-item__title">{{ section.title }}</h4>
                      <p class="section-content">{{ section.content }}</p>
                      @if (section.tags && section.tags.length > 0) {
                        <p class="section-meta">Tags: {{ section.tags.join(', ') }}</p>
                      }
                    </article>
                  }
                </div>
              </section>
            }

            @if (
              selectedPlan()!.linkedPlaybookIds && selectedPlan()!.linkedPlaybookIds!.length > 0
            ) {
              <section class="detail-section">
                <h3 class="section-title">Linked Playbooks</h3>
                <div class="tags-list">
                  @for (id of selectedPlan()!.linkedPlaybookIds!; track id) {
                    <span class="tag">{{ id }}</span>
                  }
                </div>
              </section>
            }

            @if (selectedPlan()!.linkedPlays && selectedPlan()!.linkedPlays!.length > 0) {
              <section class="detail-section">
                <h3 class="section-title">Linked Plays</h3>
                <div class="plays-list">
                  @for (play of selectedPlan()!.linkedPlays!; track play.playId ?? play.playName) {
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
                          } @else {
                            <div class="diagram-preview-fallback">
                              <nxt1-icon name="image" [size]="20"></nxt1-icon>
                              <span>Open Diagram Preview</span>
                            </div>
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
              </section>
            }

            <section class="detail-section">
              <h3 class="section-title">Record Metadata</h3>
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
      } @else if (plans().length === 0) {
        <!-- EMPTY STATE -->
        <nxt1-state-view
          variant="empty"
          icon="clipboard"
          title="No Game Plans"
          message="Start creating game plans to organize your team strategy"
        />
      } @else {
        <!-- LIST VIEW -->
        <div class="gameplans-list">
          @for (plan of plans(); track plan.id) {
            <article
              class="gameplan-card"
              [nxtAgentXContextDrag]="buildGamePlanSummaryDragContext(plan)"
              (click)="selectPlan(plan.id)"
            >
              <div class="gameplan-card__head">
                <h3 class="gameplan-card__title">{{ plan.title }}</h3>
                <span class="gameplan-card__badge" [attr.data-status]="plan.status | lowercase">
                  {{ plan.status }}
                </span>
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
            </article>
          }
        </div>
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

      .gameplan-card:hover {
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      /* Card Header (Title + Status Badge) */
      .gameplan-card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
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
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
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
  private readonly documentRef = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _plans = signal<readonly GamePlanSummary[]>([]);
  private readonly _teamId = signal<string | null>(null);
  private readonly _selectedPlanId = signal<string | null>(null);
  private readonly _detailPlan = signal<GamePlanDetail | null>(null);
  private readonly _detailLoading = signal(false);

  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly plans = computed(() => this._plans());
  readonly hasTeamContext = computed(() => {
    const teamId = this._teamId();
    return typeof teamId === 'string' && teamId.trim().length > 0;
  });
  readonly selectedPlanId = computed(() => this._selectedPlanId());
  readonly selectedPlan = computed(() => this._detailPlan());
  readonly detailLoading = computed(() => this._detailLoading());
  readonly showingDetail = computed(() => this._selectedPlanId() !== null);

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
      const response = await firstValueFrom(
        this.http.get<GameplansResponse>(`${this.baseUrl}/gameplans`, {
          params: {
            limit: '12',
            teamId,
          },
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
      const seconds = (value as { seconds?: unknown }).seconds;
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
}
