/**
 * @fileoverview Agent X Shell Component - AI Command Center
 * @module @nxt1/ui/agent-x
 * @version 2.0.0
 *
 * Redesigned AI-first command center with proactive Daily Briefing,
 * Active Operations queue, and contextual Action Chips.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Layout (top → bottom):
 * 1. Page Header — Agent X logo centered (no text title)
 * 2. Daily Briefing — Proactive AI insights card
 * 3. Coordinators — 2×2 grid of virtual staff cards (Recruiting, Media, Scout, Academics)
 * 4. Weekly Playbook — Always visible (with "Need a Game Plan" state if no goals)
 * 5. Daily Operations — Active background task cards (conditional)
 * 6. Input Bar — Fixed above footer (already exists)
 *
 * @example
 * ```html
 * <nxt1-agent-x-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  afterNextRender,
  effect,
  ElementRef,
  PLATFORM_ID,
  EnvironmentInjector,
  runInInjectionContext,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, NavController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { NxtPageHeaderComponent } from '../../../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../../../components/refresh-container';
import { NxtIconComponent } from '../../../components/icon';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXControlPanelComponent } from './agent-x-control-panel.component';
import { AgentXInputBarComponent } from '../inputs/agent-x-input-bar.component';
import {
  AgentXAttachmentsSheetComponent,
  type ConnectedAppSource,
} from '../modals/agent-x-attachments-sheet.component';
import {
  AgentXControlPanelStateService,
  type AgentXControlPanelKind,
} from '../../services/agent-x-control-panel-state.service';

import {
  AgentXOperationChatComponent,
  type OperationQuickAction,
} from '../chat/agent-x-operation-chat.component';
import {
  buildCoordinatorActionPrompt,
  resolveCoordinatorChipId,
} from '../chat/agent-x-operation-chat.utils';
import { AgentXDashboardSkeletonComponent } from '../shared/agent-x-dashboard-skeleton.component';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../../components/bottom-sheet';
import { NxtMediaViewerService } from '../../../components/media-viewer/media-viewer.service';
import { type ShellWeeklyPlaybookItem, type AgentYieldState } from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import { NxtStateViewComponent } from '../../../components/state-view';
import { ActivityService } from '../../../activity/activity.service';
import { buildLinkSourcesFormData, type OnboardingUserType } from '@nxt1/core';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import { getPlatformFaviconUrl } from '@nxt1/core/platforms';
import type { ConnectedAccountsResyncSource } from '../../../components/connected-sources';
import { buildPendingAttachmentViewer } from '../../utils/pending-attachments-viewer.util';
import {
  bindAgentXKeyboardOffset,
  type AgentXKeyboardOffsetBinding,
} from '../../utils/agent-x-keyboard-offset.util';
import { NxtSidenavService } from '../../../components/sidenav/sidenav.service';

// ============================================
// INTERFACES
// ============================================

/** User info for header display. */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
  readonly selectedSports?: readonly string[];
  readonly connectedSources?: readonly {
    platform: string;
    profileUrl: string;
    faviconUrl?: string;
    scopeType?: 'global' | 'sport' | 'team';
    scopeId?: string;
  }[];
  readonly connectedEmails?: readonly {
    provider: string;
    isActive?: boolean;
  }[];
  readonly firebaseProviders?: readonly {
    providerId: string;
  }[];
}

export interface AgentXConnectedAccountsSaveRequest {
  readonly linkSources: LinkSourcesFormData;
  readonly requestResync?: boolean;
  readonly resyncSources?: readonly ConnectedAccountsResyncSource[];
}

/** A contextual action chip for quick workflows. */
export interface ActionChip {
  readonly id: string;
  readonly label: string;
  readonly subLabel?: string;
  readonly promptText?: string;
  readonly icon: string;
}

/** A group of related quick commands under a category. */
export interface CommandCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly commands: readonly ActionChip[];
  readonly scheduledActions?: readonly ActionChip[];
  readonly suggestedActions?: readonly ActionChip[];
}

/** Daily briefing insight from Agent X. Kept as shared contract for consumers. */
export interface BriefingInsight {
  readonly id: string;
  readonly text: string;
  readonly icon: string;
  readonly type: 'info' | 'warning' | 'success';
}

/** A goal tag linking a playbook task to a user objective. */
export interface GoalTag {
  readonly id: string;
  readonly label: string;
}

/** Legacy weekly timeline item contract used by shared consumers. */
export interface WeeklyPlaybookItem {
  readonly id: string;
  readonly weekLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly details: string;
  readonly actionLabel: string;
  readonly status: 'pending' | 'in-progress' | 'complete' | 'snoozed' | 'problem';
  readonly goal?: GoalTag;
}

const COORDINATOR_ORDER: readonly string[] = [
  'admin coordinator',
  'brand coordinator',
  'strategy coordinator',
  'recruiting coordinator',
  'performance coordinator',
  'data coordinator',
] as const;

function sortCoordinatorCategories(
  categories: readonly CommandCategory[]
): readonly CommandCategory[] {
  const rank = new Map<string, number>(
    COORDINATOR_ORDER.map((label, index) => [label, index] as const)
  );

  return [...categories].sort((a, b) => {
    const aRank = rank.get(a.label.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.label.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.label.localeCompare(b.label);
  });
}

@Component({
  selector: 'nxt1-agent-x-shell',
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtIconComponent,
    NxtStateViewComponent,
    AgentXDashboardSkeletonComponent,
    AgentXInputBarComponent,
  ],
  template: `
    <!-- ═══ PAGE HEADER — Agent X Logo Centered ═══ -->
    @if (!hideHeader()) {
      <nxt1-page-header
        [config]="{ variant: 'transparent', bordered: false }"
        (menuClick)="avatarClick.emit()"
      >
        <!-- Agent X Title in center title slot -->
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Agent</span>
          <svg
            class="header-agent-logo"
            viewBox="0 0 612 792"
            width="40"
            height="40"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="agentXLogoPath" />
            <polygon [attr.points]="agentXLogoPolygon" />
          </svg>
        </div>

        <div pageHeaderSlot="end" class="agent-header-actions">
          <button
            type="button"
            class="agent-header-action"
            aria-label="Usage and billing"
            (click)="onBillingActionClick()"
          >
            <nxt1-icon name="card" [size]="22" className="agent-header-icon" />
          </button>
          <button
            type="button"
            class="agent-header-action"
            aria-label="Activity"
            (click)="onActivityLogClick()"
          >
            <div class="agent-header-icon-wrapper">
              <nxt1-icon name="bell" [size]="22" className="agent-header-icon" />
              @if (activityUnreadCount() > 0) {
                <span class="badge-dot" aria-label="Unread notifications"></span>
              }
            </div>
          </button>
        </div>
      </nxt1-page-header>
    }

    <!-- ═══ SCROLLABLE CONTENT ═══ -->
    <ion-content [fullscreen]="true" class="agent-x-content">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="agent-x-container">
        @if (agentX.dashboardLoading() && !agentX.dashboardLoaded()) {
          <nxt1-agent-x-dashboard-skeleton variant="mobile" />
        } @else if (agentX.dashboardError() && !agentX.dashboardLoaded()) {
          <div class="agent-error-container">
            <nxt1-state-view
              variant="error"
              title="Something went wrong"
              [message]="agentX.dashboardError()"
              actionLabel="Try Again"
              actionIcon="refresh"
              (action)="onRetryDashboard()"
            />
          </div>
        }

        <!-- ═══ 1. DAILY BRIEFING ═══ -->
        @if (agentX.dashboardLoaded()) {
          <section class="briefing-section" aria-label="Daily briefing">
            <button
              type="button"
              class="briefing-status-dot-btn"
              [class.briefing-status-dot-btn--degraded]="agentStatusTone() === 'warning'"
              [class.briefing-status-dot-btn--down]="agentStatusTone() === 'critical'"
              (click)="openControlPanel('status')"
              [attr.aria-label]="agentStatusLabel()"
            >
              <span class="briefing-status-label">{{ agentStatusLabel() }}</span>
              <span
                class="status-dot"
                [class.status-dot--degraded]="agentStatusTone() === 'warning'"
                [class.status-dot--down]="agentStatusTone() === 'critical'"
              ></span>
            </button>

            <h2 class="briefing-greeting">{{ greeting() }}</h2>

            <div class="briefing-content">
              @if (!isBriefingExpanded()) {
                <p class="briefing-summary">{{ briefingPreview() }}</p>
                @if (briefingInsights().length > 0) {
                  <button
                    type="button"
                    class="briefing-toggle"
                    (click)="isBriefingExpanded.set(true)"
                  >
                    Read full briefing
                  </button>
                }
              } @else {
                <ul class="briefing-list">
                  @for (insight of briefingInsights(); track insight.id) {
                    <li class="briefing-list__item">{{ insight.text }}</li>
                  }
                </ul>
                <button
                  type="button"
                  class="briefing-toggle"
                  (click)="isBriefingExpanded.set(false)"
                >
                  Show less
                </button>
              }
            </div>

            <div class="inline-goals">
              <button
                type="button"
                class="inline-goals__manage-btn inline-goals__manage-btn--goals"
                (click)="onSetupGoals()"
              >
                <nxt1-icon name="settings" [size]="14"></nxt1-icon>
                <span>Manage Goals</span>
                @if (agentX.goals().length > 0) {
                  <span class="inline-goals__manage-count">{{ agentX.goals().length }}</span>
                }
              </button>
              <button
                type="button"
                class="inline-goals__manage-btn inline-goals__manage-btn--connected"
                (click)="openConnectedAccounts()"
              >
                <nxt1-icon name="link" [size]="14"></nxt1-icon>
                <span>Connected Accounts</span>
              </button>
            </div>

            <!-- ═══ 2. THIS WEEK'S GAME PLAN (AI-Generated Playbook) ═══ -->
            <section class="action-cards-section" aria-label="This Week's Game Plan">
              <div class="action-plan-header">
                <h3 class="section-title action-plan-title">This Week's Game Plan</h3>
                @if (weeklyPlaybook().length > 0) {
                  <div class="action-plan-status">
                    <div class="action-plan-status-main">
                      <span class="action-plan-percent">{{ actionPlanProgressPercent() }}%</span>
                      <div
                        class="action-plan-progress"
                        aria-label="Action plan progress"
                        [attr.aria-valuenow]="actionPlanProgressPercent()"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        role="progressbar"
                      >
                        <div
                          class="action-plan-progress-bar"
                          [style.width.%]="actionPlanProgressPercent()"
                        ></div>
                      </div>
                    </div>
                    <p class="action-plan-meta">{{ actionPlanCompletionLabel() }}</p>
                  </div>
                }
              </div>

              @if (agentX.playbookGenerating()) {
                <div class="action-plan-generating" aria-label="Loading action plan" role="status">
                  <div class="generating-hero">
                    <div class="generating-logo-ring">
                      <svg viewBox="0 0 612 792" class="generating-x-mark" aria-hidden="true">
                        <path [attr.d]="agentXLogoPath" />
                      </svg>
                    </div>
                    <p class="generating-status">
                      Agent X is building your playbook<span class="typing-dots"
                        ><span>.</span><span>.</span><span>.</span></span
                      >
                    </p>
                    <p class="generating-sub">
                      Reading your profile, reviewing activity, and generating tasks
                    </p>
                  </div>
                  <div class="generating-steps">
                    @for (step of generatingSteps; track step.label; let i = $index) {
                      <div class="generating-step" [style.animation-delay]="i * 600 + 'ms'">
                        <div class="step-indicator">
                          <div class="step-dot"></div>
                        </div>
                        <span class="step-label">{{ step.label }}</span>
                      </div>
                    }
                  </div>
                </div>
              } @else if (allTasksSnoozed()) {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">All Tasks Snoozed</h4>
                  <p class="action-empty-copy">
                    You snoozed everything. Want Agent X to generate a fresh set of actions?
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onRegeneratePlaybook()">
                    Give Me More
                  </button>
                </div>
              } @else if (weeklyPlaybook().length > 0 && !allTasksComplete()) {
                @if (showCategoryPills()) {
                  <div class="category-pills" role="tablist" aria-label="Filter action plan">
                    @for (pill of categoryPills(); track pill.id) {
                      <button
                        type="button"
                        role="tab"
                        class="category-pill"
                        [class.category-pill--active]="activeCategoryId() === pill.id"
                        [attr.aria-selected]="activeCategoryId() === pill.id"
                        (click)="selectCategory(pill.id)"
                      >
                        {{ pill.label }}
                      </button>
                    }
                  </div>
                }
                @for (task of filteredPlaybookItems(); track task.id; let i = $index) {
                  <div
                    class="action-card action-card--enter"
                    [style.animation-delay]="i * 80 + 'ms'"
                  >
                    <div class="card-coordinator">
                      <div class="coordinator-avatar" aria-hidden="true">
                        <svg viewBox="0 0 612 792" class="coordinator-mark">
                          <path [attr.d]="agentXLogoPath" />
                        </svg>
                      </div>
                      <div class="coordinator-copy">
                        <span class="coordinator-brand">Agent X</span>
                        @if (task.coordinator) {
                          <span class="coordinator-role">{{ task.coordinator.label }}</span>
                        }
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">{{ task.title }}</div>
                      <p class="card-description">{{ task.summary }}</p>
                      @if (task.why) {
                        <p class="card-why">
                          <svg
                            class="agent-x-mark"
                            width="16"
                            height="16"
                            viewBox="0 0 612 792"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path [attr.d]="agentXLogoPath" />
                            <polygon [attr.points]="agentXLogoPolygon" />
                          </svg>
                          {{ task.why }}
                        </p>
                      }
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn primary-btn"
                        (click)="onPlaybookAction(task)"
                      >
                        {{ task.actionLabel }}
                      </button>
                      <div class="card-secondary-actions">
                        <button
                          type="button"
                          class="action-btn done-btn"
                          (click)="onMarkDoneTask(task)"
                        >
                          ✓ Done
                        </button>
                        <button
                          type="button"
                          class="action-btn snooze-btn"
                          (click)="onSnoozeTask(task)"
                        >
                          Snooze
                        </button>
                      </div>
                    </div>
                  </div>
                }
              } @else if (allTasksComplete()) {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">Week Complete 🏆</h4>
                  <p class="action-empty-copy">
                    You crushed it. Agent X is still monitoring for new opportunities.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onRegeneratePlaybook()">
                    Give Me More
                  </button>
                </div>
              } @else {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">No Actions Yet</h4>
                  <p class="action-empty-copy">
                    Agent X will generate your personalized action plan based on your goals and
                    profile data.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onGenerateActionsClick()">
                    {{ agentX.goals().length > 0 ? 'Generate Actions' : 'Set Goals' }}
                  </button>
                </div>
              }
            </section>
          </section>
        }
      </div>
    </ion-content>

    <!-- ═══ FOOTER — Coordinators + Claude-style input box ═══ -->
    <div class="agent-x-shell-footer" role="group" aria-label="Agent input">
      <section
        class="floating-coordinators"
        [class.has-files]="agentX.pendingFiles().length > 0"
        aria-label="Coordinators"
      >
        @if (commandCategories().length > 0) {
          <div class="floating-coordinators-scroll" role="list">
            @for (cat of commandCategories(); track cat.id) {
              <button
                type="button"
                role="listitem"
                class="floating-coordinator-pill"
                [attr.data-coordinator]="resolveCoordinatorChipId(cat.id)"
                (click)="onCategoryTap(cat)"
              >
                {{ cat.label }}
              </button>
            }
          </div>
        } @else {
          <div class="floating-coordinators-empty" role="status" aria-live="polite">
            No coordinators are configured for this role.
          </div>
        }
      </section>

      <nxt1-agent-x-input-bar
        [userMessage]="agentX.userMessage()"
        [isLoading]="agentX.isLoading()"
        [uploading]="agentX.uploading()"
        [canSend]="agentX.canSend()"
        [pendingFiles]="agentX.pendingFiles()"
        [pendingSources]="pendingConnectedSources()"
        [selectedTask]="agentX.selectedTask()?.title ?? null"
        (messageChange)="onInputChange($event)"
        (send)="onSendMessage()"
        (toggleAttachments)="onToggleAttachments()"
        (openFile)="onOpenPendingFileViewer($event)"
        (removeFile)="agentX.removeFile($event)"
        (removeSource)="onRemovePendingSource($event)"
        (removeTask)="agentX.clearTask()"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));

        .file-input-hidden {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
          overflow: hidden;
          pointer-events: none;
        }

        --agent-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --agent-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --agent-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --agent-primary: var(--nxt1-color-primary, #ccff00);
        --agent-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-glass-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.1));
        /* Header is transparent — no background override needed */
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --agent-bg: var(--nxt1-color-bg-primary, #ffffff);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
      }

      .header-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        margin-top: -8px;
        margin-left: -18px;
      }

      .header-title-text {
        display: inline-flex;
        align-items: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        color: var(--agent-text-primary);
        line-height: 1;
        transform: translateY(1px);
      }

      .header-agent-logo {
        display: block;
        flex-shrink: 0;
        color: var(--agent-text-primary);
        transform: translateY(1px);
      }

      .agent-header-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .agent-header-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 9999px;
        padding: 0;
        background: transparent;
        color: var(--agent-text-primary);
      }

      .agent-header-icon {
        display: block;
      }

      /* Bell icon wrapper — relative positioning anchors the badge dot */
      .agent-header-icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Red dot badge — identical to footer.component.ts .badge-dot */
      .badge-dot {
        position: absolute;
        top: -2px;
        right: -4px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nxt1-color-badge-background, var(--nxt1-color-error, #ef4444));
        box-shadow: 0 0 4px var(--nxt1-color-badge-shadow, rgba(239, 68, 68, 0.5));
        border: 1.5px solid var(--nxt1-color-background-primary, #0a0a0a);
        animation: badge-dot-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 10;
      }

      @keyframes badge-dot-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .agent-x-content {
        --background: var(--agent-bg);
        flex: 1;
        min-height: 0;
      }

      .agent-x-shell-footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 30;
        background: transparent;
        transform: translateY(calc(-1 * var(--agent-keyboard-offset, 0px)));
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      :host-context(.keyboard-open) .agent-x-shell-footer {
        transition-duration: 0.22s;
      }

      .agent-x-container {
        display: flex;
        flex-direction: column;
        padding: var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(280px + env(safe-area-inset-bottom, 0px));
      }

      .agent-error-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 320px;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
      }

      @media (max-width: 767px) {
        .agent-x-container {
          padding-bottom: calc(320px + env(safe-area-inset-bottom, 0px));
        }
      }

      .operations-section {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .operations-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
      }

      .operations-scroll::-webkit-scrollbar {
        display: none;
      }

      .operation-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        flex-shrink: 0;
        width: 200px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.2s ease,
          border-color 0.3s ease,
          box-shadow 0.3s ease;
      }

      .operation-card:active {
        background: var(--agent-surface-hover);
      }

      .operation-card--processing {
        border-color: var(--agent-primary-glow);
        animation: op-pulse-border 2.4s ease-in-out infinite;
      }

      .operation-card--complete {
        border-color: var(--nxt1-color-success-border, rgba(76, 175, 80, 0.25));
        background: var(--nxt1-color-success-surface, rgba(76, 175, 80, 0.05));
      }

      .operation-card--error {
        border-color: var(--nxt1-color-error-border, rgba(244, 67, 54, 0.25));
        background: var(--nxt1-color-error-surface, rgba(244, 67, 54, 0.05));
      }

      .operation-card--awaiting-input {
        border-color: var(--nxt1-color-warning-border, rgba(255, 152, 0, 0.35));
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.06));
        animation: op-pulse-awaiting 2s ease-in-out infinite;
      }

      .operation-card--awaiting-input .operation-icon {
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.15));
        color: var(--nxt1-color-warning, #ff9800);
      }

      .action-required-banner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.08));
        border: 1px solid var(--nxt1-color-warning-border, rgba(255, 152, 0, 0.25));
        border-radius: var(--nxt1-radius-lg, 14px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        animation: banner-entrance 0.4s ease-out;
      }

      .action-required-banner:active {
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.14));
      }

      .action-required-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-warning-surface, rgba(255, 152, 0, 0.15));
        color: var(--nxt1-color-warning, #ff9800);
        flex-shrink: 0;
        animation: banner-icon-pulse 2s ease-in-out infinite;
      }

      .action-required-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .action-required-title {
        font-size: var(--nxt1-font-size-sm, 13px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--nxt1-color-warning, #ff9800);
        line-height: 1.2;
      }

      .action-required-subtitle {
        font-size: 12px;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.55));
        line-height: 1.3;
      }

      .action-required-chevron {
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.35));
        flex-shrink: 0;
      }

      .operation-top {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .operation-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .operation-card--complete .operation-icon {
        background: var(--nxt1-color-success-surface, rgba(76, 175, 80, 0.1));
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-card--error .operation-icon {
        background: var(--nxt1-color-error-surface, rgba(244, 67, 54, 0.1));
        color: var(--nxt1-color-error, #f44336);
      }

      .operation-label {
        font-size: var(--nxt1-font-size-sm, 13px);
        font-weight: var(--nxt1-font-weight-medium, 500);
        color: var(--agent-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .operation-progress {
        width: 100%;
        height: 3px;
        background: var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        overflow: hidden;
      }

      .operation-progress-bar {
        height: 100%;
        background: var(--agent-primary);
        border-radius: var(--nxt1-radius-full, 9999px);
        transition: width 0.4s ease;
      }

      .operation-progress-bar--processing {
        animation: op-bar-glow 2s ease-in-out infinite;
      }

      .operation-progress-bar--complete {
        background: var(--nxt1-color-success, #4caf50);
      }

      .operation-progress-bar--error {
        background: var(--nxt1-color-error, #f44336);
      }

      .operation-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .operation-status-badge {
        font-size: 10px;
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        line-height: 1;
      }

      .operation-status-badge--processing {
        color: var(--agent-primary);
      }

      .operation-status-badge--complete {
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-status-badge--error {
        color: var(--nxt1-color-error, #f44336);
      }

      .operation-status-badge--awaiting {
        color: var(--nxt1-color-warning, #ff9800);
      }

      .operation-spinner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--agent-primary);
        animation: op-spin 1.2s linear infinite;
      }

      .operation-status-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .operation-status-icon--complete {
        color: var(--nxt1-color-success, #4caf50);
      }

      .operation-status-icon--error {
        color: var(--nxt1-color-error, #f44336);
      }

      .operation-status-icon--awaiting {
        color: var(--nxt1-color-warning, #ff9800);
      }

      .briefing-section {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        padding: var(--nxt1-spacing-6, 24px) 0 var(--nxt1-spacing-4, 16px);
      }

      .briefing-status-dot-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        padding: 0;
        border: none;
        background: transparent;
        color: var(--agent-primary);
        cursor: pointer;
        font-family: inherit;
        -webkit-appearance: none;
        appearance: none;
      }

      .briefing-status-dot-btn--degraded {
        color: #f59e0b;
      }

      .briefing-status-dot-btn--down {
        color: #ef4444;
      }

      .briefing-status-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        line-height: 1;
        text-transform: uppercase;
        color: currentColor;
      }

      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--agent-primary);
        box-shadow: 0 0 6px rgba(204, 255, 0, 0.5);
        flex-shrink: 0;
      }

      .status-dot--degraded {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.45);
      }

      .status-dot--down {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.45);
      }

      .briefing-greeting {
        font-size: 22px;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        line-height: 1.3;
      }

      .briefing-summary {
        width: 100%;
        font-size: 14px;
        line-height: 1.55;
        color: var(--agent-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .briefing-content {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .briefing-toggle {
        background: transparent;
        border: none;
        padding: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-primary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: inherit;
      }

      .briefing-list {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        width: 100%;
      }

      .briefing-list__item {
        position: relative;
        padding-left: var(--nxt1-spacing-4, 16px);
        font-size: 14px;
        line-height: 1.55;
        color: var(--agent-text-secondary);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .briefing-list__item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 8px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--agent-primary);
      }

      .section-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--agent-text-muted);
        margin: 0 0 var(--nxt1-spacing-4, 16px);
      }

      .floating-coordinators {
        position: relative;
        padding: 0 var(--nxt1-footer-left, 16px);
        margin-bottom: 0;
        pointer-events: none;
      }

      .floating-coordinators.has-files {
      }

      @media (min-width: 768px) {
        .floating-coordinators {
          padding: 0 0.75rem;
        }
      }

      .floating-coordinators-scroll {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding: 0 0;
      }

      .floating-coordinators-scroll::-webkit-scrollbar {
        display: none;
      }

      .floating-coordinator-pill {
        --coordinator-pill-accent: var(--agent-primary);
        --coordinator-pill-text: var(--agent-text-primary);
        --coordinator-pill-surface: color-mix(
          in srgb,
          var(--coordinator-pill-accent) 16%,
          var(--agent-bg)
        );
        --coordinator-pill-border: color-mix(
          in srgb,
          var(--coordinator-pill-accent) 52%,
          var(--agent-border)
        );
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 11px 16px;
        background: var(--coordinator-pill-surface);
        color: var(--coordinator-pill-text);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--coordinator-pill-accent) 24%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 12%, white);
        border-color: var(--coordinator-pill-border);
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.15s ease;
      }

      .floating-coordinator-pill:active {
        border-color: color-mix(in srgb, var(--coordinator-pill-accent) 72%, white);
        background: color-mix(in srgb, var(--coordinator-pill-accent) 22%, var(--agent-bg));
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--coordinator-pill-accent) 28%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 14%, white);
        transform: scale(0.98);
      }

      .floating-coordinators-empty {
        pointer-events: auto;
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--agent-surface) 88%, transparent);
        color: var(--agent-text-secondary);
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        padding: 12px 14px;
        white-space: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .floating-coordinators-empty::-webkit-scrollbar {
        display: none;
      }

      .floating-coordinator-pill[data-coordinator='coord-admin'] {
        --coordinator-pill-accent: #3fa3ff;
      }

      .floating-coordinator-pill[data-coordinator='coord-brand'] {
        --coordinator-pill-accent: #ff7a45;
      }

      .floating-coordinator-pill[data-coordinator='coord-strategy'] {
        --coordinator-pill-accent: #9d7bff;
      }

      .floating-coordinator-pill[data-coordinator='coord-performance'] {
        --coordinator-pill-accent: #41b8ff;
      }

      .floating-coordinator-pill[data-coordinator='coord-data'] {
        --coordinator-pill-accent: #2fd39a;
      }

      .floating-coordinator-pill[data-coordinator='coord-recruiting'] {
        --coordinator-pill-accent: #ccff00;
        --coordinator-pill-text: #12170a;
      }

      .floating-coordinator-pill[data-coordinator='coord-media'] {
        --coordinator-pill-accent: #ff7a45;
      }

      .floating-coordinator-pill[data-coordinator='coord-scout'] {
        --coordinator-pill-accent: #41b8ff;
      }

      .floating-coordinator-pill[data-coordinator='coord-academics'] {
        --coordinator-pill-accent: #9d7bff;
      }

      .floating-coordinator-pill[data-coordinator='coord-roster'] {
        --coordinator-pill-accent: #2fd39a;
      }

      .floating-coordinator-pill[data-coordinator='coord-scouting'] {
        --coordinator-pill-accent: #3fa3ff;
      }

      .floating-coordinator-pill[data-coordinator='coord-team-media'] {
        --coordinator-pill-accent: #ff5d8f;
      }

      .floating-coordinator-pill[data-coordinator='coord-prospect-search'] {
        --coordinator-pill-accent: #ffd447;
      }

      .floating-coordinator-pill[data-coordinator='coord-evaluation'] {
        --coordinator-pill-accent: #57d4ff;
      }

      .floating-coordinator-pill[data-coordinator='coord-outreach'] {
        --coordinator-pill-accent: #ff9a3d;
      }

      .floating-coordinator-pill[data-coordinator='coord-compliance'] {
        --coordinator-pill-accent: #44d6c2;
      }

      .action-cards-section {
        width: 100%;
        border-top: 1px solid var(--agent-border);
        padding-top: var(--nxt1-spacing-5, 20px);
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .inline-goals {
        display: flex;
        align-items: stretch;
        gap: var(--nxt1-spacing-2-5, 10px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .inline-goals__manage-btn {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        flex: 1 1 0;
        min-width: 0;
        white-space: nowrap;
        background: none;
        border: 1px solid var(--agent-border);
        border-radius: 10px;
        padding: 10px 10px;
        font-size: clamp(12px, 3.2vw, 13px);
        font-weight: 600;
        color: var(--agent-text-secondary);
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          color 0.15s ease,
          background 0.15s ease;
        font-family: inherit;
      }

      .inline-goals__manage-btn--connected {
        flex: 1.12 1 0;
        padding-inline: 10px;
      }

      .inline-goals__manage-btn--goals {
        flex: 1.04 1 0;
        justify-content: center;
        gap: 10px;
        padding-inline: 14px;
      }

      .inline-goals__manage-btn > nxt1-icon,
      .inline-goals__manage-btn > svg {
        flex-shrink: 0;
      }

      .inline-goals__manage-btn > span:not(.inline-goals__manage-count) {
        min-width: 0;
        white-space: nowrap;
        line-height: 1.2;
      }

      @media (max-width: 360px) {
        .inline-goals {
          gap: 6px;
        }

        .inline-goals__manage-btn {
          padding: 9px 8px;
          font-size: 12px;
        }
      }

      .inline-goals__manage-btn:active {
        color: var(--agent-text-primary);
        background: var(--agent-surface-hover);
      }

      .inline-goals__manage-count {
        margin-left: auto;
        font-size: 11px;
        font-weight: 700;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
        border-radius: 999px;
        padding: 2px 8px;
      }

      .action-plan-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .action-plan-title {
        padding-top: 2px;
        margin-bottom: 0;
      }

      .action-plan-status {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        flex: 0 0 auto;
        min-width: 0;
      }

      .action-plan-status-main {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
        white-space: nowrap;
      }

      .action-plan-meta {
        margin: 0;
        font-size: 11px;
        line-height: 1;
        color: var(--agent-text-secondary);
      }

      .action-plan-percent {
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        color: var(--agent-text-primary);
      }

      .action-plan-progress {
        position: relative;
        width: 56px;
        flex: 0 0 56px;
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--agent-surface-hover);
      }

      .action-plan-progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--agent-primary),
          color-mix(in srgb, var(--agent-primary) 65%, white)
        );
        transition: width 0.28s ease;
      }

      .category-pills {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .category-pills::-webkit-scrollbar {
        display: none;
      }
      .category-pill {
        flex: 0 0 auto;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--agent-border);
        background: transparent;
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .category-pill--active {
        background: var(--agent-primary);
        color: #111;
        border-color: var(--agent-primary);
      }

      .action-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
        transition:
          background 0.2s ease,
          border-color 0.2s ease;
      }

      .action-card:active {
        background: var(--agent-surface-hover);
      }

      .card-coordinator {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .coordinator-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .coordinator-mark {
        width: 26px;
        height: 26px;
        fill: currentColor;
      }

      .coordinator-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .coordinator-brand {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--agent-text-primary, #fff);
      }

      .coordinator-role {
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-secondary);
      }

      .card-content {
        flex: 1;
        min-width: 0;
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--agent-text-primary);
        line-height: 1.4;
      }

      .card-description {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
      }

      .card-why {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 6px 0 0;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
        border-radius: var(--nxt1-radius-md, 8px);
        border-left: 2px solid var(--agent-primary);
      }

      .card-why nxt1-icon {
        flex-shrink: 0;
        margin-top: 1px;
      }

      .card-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        border: none;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        white-space: nowrap;
      }

      .action-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .action-btn.primary-btn {
        background: var(--agent-primary);
        color: #000;
        animation: agent-pulse 2.8s ease-in-out infinite;
        width: 100%;
      }

      .card-secondary-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }

      .action-btn.done-btn {
        background: transparent;
        border: 1px solid var(--agent-primary);
        color: var(--agent-primary);
      }

      .action-btn.snooze-btn {
        background: transparent;
        border: 1px solid var(--agent-border);
        color: var(--agent-text-secondary);
      }

      .action-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-5, 20px);
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px dashed var(--agent-border);
        background: var(--agent-surface);
        opacity: 0;
        transform: translateY(10px);
      }

      .action-empty-state--visible {
        opacity: 1;
        transform: translateY(0);
        transition:
          opacity 0.28s ease,
          transform 0.28s ease;
      }

      .action-empty-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
      }

      .action-empty-title {
        margin: 0;
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--agent-text-primary);
      }

      .action-empty-copy {
        margin: 0;
        font-size: var(--nxt1-font-size-sm, 14px);
        line-height: 1.5;
        color: var(--agent-text-secondary);
        max-width: 38ch;
      }

      .action-empty-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid transparent;
        background: var(--agent-primary);
        color: #000;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        animation: agent-pulse 2.8s ease-in-out infinite;
      }

      .action-empty-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .action-plan-generating {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6, 24px);
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        animation: gen-fade-in 0.4s ease forwards;
      }

      .generating-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        text-align: center;
      }

      .generating-logo-ring {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        animation: gen-pulse 2s ease-in-out infinite;
      }

      .generating-x-mark {
        width: 32px;
        height: 32px;
        fill: var(--agent-primary);
        animation: gen-spin 3s linear infinite;
      }

      .generating-status {
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary, #fff);
        margin: 0;
      }

      .typing-dots span {
        animation: typing-blink 1.4s steps(1) infinite;
        opacity: 0;
      }
      .typing-dots span:nth-child(1) {
        animation-delay: 0s;
      }
      .typing-dots span:nth-child(2) {
        animation-delay: 0.3s;
      }
      .typing-dots span:nth-child(3) {
        animation-delay: 0.6s;
      }

      .generating-sub {
        font-size: 13px;
        color: var(--agent-text-secondary);
        margin: 0;
        max-width: 280px;
      }

      .generating-steps {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        max-width: 280px;
      }

      .generating-step {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        opacity: 0;
        animation: step-appear 0.4s ease forwards;
      }

      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
        animation: dot-pulse 1.6s ease-in-out infinite;
      }

      .step-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--agent-text-secondary);
      }

      .action-card--enter {
        opacity: 0;
        animation: card-slide-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellComponent implements OnInit, OnDestroy {
  protected readonly resolveCoordinatorChipId = resolveCoordinatorChipId;
  protected readonly agentX = inject(AgentXService);
  protected readonly controlPanelState = inject(AgentXControlPanelStateService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly location = inject(Location);
  private readonly navController = inject(NavController);
  private readonly injector = inject(EnvironmentInjector);
  private readonly activityService = inject(ActivityService);
  private readonly sidenavService = inject(NxtSidenavService, { optional: true });
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);

  private keyboardOffsetBinding?: AgentXKeyboardOffsetBinding;

  /** Unread activity count — drives the red dot on the bell icon. */
  protected readonly activityUnreadCount = computed(() => this.activityService.totalUnread());

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info. */
  readonly user = input<AgentXUser | null>(null);

  /** Hide page header (desktop sidebar provides navigation). */
  readonly hideHeader = input(false);

  // ============================================
  // LOCAL STATE
  // ============================================

  protected readonly generatingSteps = [
    { label: 'Loading your profile and goals' },
    { label: 'Reviewing recent activity and progress' },
    { label: 'Generating personalized tasks' },
    { label: 'Finalizing your playbook' },
  ];

  /** Connected app sources staged from attachment sheet taps. */
  protected readonly pendingConnectedSources = signal<ConnectedAppSource[]>([]);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar/hamburger is clicked (open sidenav). */
  readonly avatarClick = output<void>();

  /** Emitted when an action chip is tapped. */
  readonly chipTap = output<ActionChip>();

  /** Emitted when connected accounts need to be saved from the shell. */
  readonly connectedAccountsSave = output<AgentXConnectedAccountsSaveRequest>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Display name for header avatar fallback. */
  protected displayName(): string {
    return this.user()?.displayName ?? 'User';
  }

  /** Time-aware greeting for the Daily Briefing. */
  protected readonly greeting = computed(() => {
    const name = this.user()?.displayName?.split(' ')[0] ?? '';
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${timeGreeting}, ${name}.` : `${timeGreeting}.`;
  });

  // ============================================
  // ROLE-AWARE SHELL CONTENT
  // Uses live dashboard data from AgentXService only.
  // Static fallback content is intentionally disabled to avoid mock-data flashes.
  // ============================================

  /** Briefing preview text — live from service only. */
  protected readonly briefingPreview = computed(() => this.agentX.briefingPreviewText());
  protected readonly briefingInsights = computed(() => this.agentX.briefingInsights());
  protected readonly isBriefingExpanded = signal(false);
  protected readonly agentStatusLabel = this.controlPanelState.statusLabel;
  protected readonly agentStatusTone = this.controlPanelState.statusTone;
  protected readonly agentBudgetBadgeLabel = this.controlPanelState.budgetBadgeLabel;

  // ============================================
  // COORDINATORS — Role-Aware Virtual Staff
  // ============================================

  /** AI-generated weekly playbook timeline items — live from service only. */
  protected readonly weeklyPlaybook = computed<ShellWeeklyPlaybookItem[]>(() =>
    this.agentX.weeklyPlaybook()
  );

  /** Number of completed playbook tasks (snoozed don't count). */
  protected readonly playbookCompletedCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status === 'complete').length
  );

  /** Total number of active (non-snoozed) playbook tasks. */
  protected readonly playbookTotalCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status !== 'snoozed').length
  );

  /** Whether all playbook tasks are complete (show "Give Me More" state). */
  protected readonly allTasksComplete = computed(
    () =>
      this.weeklyPlaybook().length > 0 &&
      this.weeklyPlaybook().every((t) => t.status === 'complete')
  );

  /** Whether every playbook task has been snoozed (none active or complete). */
  protected readonly allTasksSnoozed = computed(() => {
    const items = this.weeklyPlaybook();
    return items.length > 0 && items.every((t) => t.status === 'snoozed');
  });

  /** Pending (non-complete) playbook items to render as action cards. */
  protected readonly pendingPlaybookItems = this.agentX.pendingPlaybookItems;

  // ── Category Pill Filter (delegated to AgentXService) ──────────────────

  protected readonly activeCategoryId = this.agentX.activeCategoryId;
  protected readonly categoryPills = this.agentX.categoryPills;
  protected readonly showCategoryPills = this.agentX.showCategoryPills;
  protected readonly filteredPlaybookItems = this.agentX.filteredPlaybookItems;

  protected selectCategory(id: string): void {
    this.agentX.selectCategory(id);
  }

  /** Playbook-derived progress label. */
  protected readonly actionPlanCompletionLabel = computed(() => {
    const completed = this.playbookCompletedCount();
    const total = this.playbookTotalCount();
    return `${completed} of ${total} cleared this week`;
  });

  /** Playbook-derived progress percentage. */
  protected readonly actionPlanProgressPercent = computed(() => {
    const total = this.playbookTotalCount();
    if (total === 0) return 0;
    return Math.round((this.playbookCompletedCount() / total) * 100);
  });

  /** Coordinator cards are rendered strictly from backend dashboard config. */
  protected readonly commandCategories = computed(() => {
    return sortCoordinatorCategories(this.agentX.coordinators());
  });

  // ============================================
  // HEADER CONFIG
  // ============================================

  constructor() {
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
      this.agentX.loadDashboard();
    });

    effect(() => {
      const pending = this.agentX.pendingThread();
      if (!pending) return;

      // Consume the request immediately to prevent duplicate sheet opens
      // if dashboard signals or route rendering re-run the effect.
      this.agentX.clearPendingThread();

      void this.openOperationChat(
        pending.operationId ?? pending.threadId,
        pending.title,
        pending.icon ?? 'bolt',
        'operation',
        [],
        '',
        pending.threadId
      );
    });

    // Keep AgentXService in sync with the shell's filtered connected sources so
    // operation-chat can always read them regardless of how it was opened.
    effect(() => {
      this.agentX.setAttachmentConnectedSources(this.getAttachmentConnectedSources());
    });
  }

  async ngOnInit(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    this.keyboardOffsetBinding = await bindAgentXKeyboardOffset({
      platformId: this.platformId,
      hostElement: this.hostElement.nativeElement,
      offsetCssVar: '--agent-keyboard-offset',
      safeAreaCssVar: '--footer-safe-area',
      keyboardOffsetTrimPx: -6,
      onKeyboardShow: () => {
        if (!this.sidenavService?.isOpen()) return;

        this.hostElement.nativeElement.style.setProperty('--agent-keyboard-offset', '0px');
        this.hostElement.nativeElement.style.removeProperty('--footer-safe-area');
      },
    });
  }

  ngOnDestroy(): void {
    this.keyboardOffsetBinding?.teardown();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onActivityLogClick(): Promise<void> {
    await this.haptics.impact('light');
    await this.navController.navigateForward('/activity');
  }

  protected async onBillingActionClick(): Promise<void> {
    await this.haptics.impact('light');
    await this.navController.navigateForward('/usage');
  }

  /**
   * Handle "Set Your Goals" button from the empty playbook state.
   * Opens the shared Agent X goals panel.
   */
  protected async onSetupGoals(): Promise<void> {
    await this.openControlPanel('goals');
  }

  protected async openConnectedAccounts(): Promise<void> {
    const user = this.user();
    const role = (user?.role as OnboardingUserType) ?? null;
    const { ConnectedAccountsModalService } = await import('../../../components/connected-sources');
    const service = runInInjectionContext(this.injector, () =>
      inject(ConnectedAccountsModalService)
    );
    const result = await service.open({
      role,
      selectedSports: user?.selectedSports ?? [],
      linkSourcesData: buildLinkSourcesFormData({
        connectedSources: user?.connectedSources ?? [],
        connectedEmails: user?.connectedEmails ?? [],
        firebaseProviders: user?.firebaseProviders ?? [],
      }) as LinkSourcesFormData | null,
      scope: role === 'coach' || role === 'director' ? 'team' : 'athlete',
    });

    if (result.linkSources) {
      this.connectedAccountsSave.emit({
        linkSources: result.linkSources,
        requestResync: result.resync === true,
        resyncSources: result.sources ?? [],
      });
    }
  }

  protected async openControlPanel(panel: AgentXControlPanelKind, required = false): Promise<void> {
    await this.haptics.impact('light');

    const goalIds =
      panel === 'goals'
        ? this.agentX
            .goals()
            .map((goal) =>
              goal.id.startsWith('custom') && goal.text ? `custom:${goal.text}` : goal.id
            )
        : [];

    if (panel === 'goals') {
      this.controlPanelState.hydrateGoals(goalIds);
    }

    this.controlPanelState.notePanelOpened(panel, 'sheet');

    const result = await this.bottomSheet.openSheet<{
      panel: AgentXControlPanelKind;
      saved?: boolean;
    }>({
      component: AgentXControlPanelComponent,
      componentProps: {
        panel,
        presentation: 'sheet',
        required,
        ...(panel === 'goals' ? { initialGoals: goalIds } : {}),
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: !required,
      canDismiss: required
        ? async (_data?: unknown, role?: string) => role === 'save' || role === 'back'
        : true,
      cssClass: 'agent-x-control-panel-sheet',
    });

    // User tapped close without saving in required mode — navigate back
    if (result?.role === 'back') {
      this.location.back();
      return;
    }

    // After saving goals, sync to backend and trigger generation
    if (panel === 'goals' && result?.role === 'save') {
      // Goals already persisted by AgentXControlPanelComponent — just refresh the briefing
      this.agentX.generateBriefing(true).catch(() => undefined);
    }
  }

  /**
   * Handle category pill tap — opens bottom sheet with sub-commands as suggestion chips.
   */
  protected async onCategoryTap(cat: CommandCategory): Promise<void> {
    await this.haptics.impact('light');
    const quickActions: OperationQuickAction[] = cat.commands.map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
      description: cmd.subLabel,
      promptText:
        cmd.promptText ??
        buildCoordinatorActionPrompt({
          coordinatorLabel: cat.label,
          coordinatorDescription: cat.description,
          actionLabel: cmd.label,
          actionDescription: cmd.subLabel,
          surface: 'command',
        }),
      selectedAction: {
        coordinatorId: cat.id,
        actionId: cmd.id,
        surface: 'command',
        label: cmd.label,
      },
    }));
    const suggestedActions: OperationQuickAction[] = (cat.suggestedActions ?? []).map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
      description: cmd.subLabel,
      promptText:
        cmd.promptText ??
        buildCoordinatorActionPrompt({
          coordinatorLabel: cat.label,
          coordinatorDescription: cat.description,
          actionLabel: cmd.label,
          actionDescription: cmd.subLabel,
          surface: 'command',
        }),
      selectedAction: {
        coordinatorId: cat.id,
        actionId: cmd.id,
        surface: 'suggested',
        label: cmd.label,
      },
    }));
    const scheduledActions: OperationQuickAction[] = (cat.scheduledActions ?? []).map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
      description: cmd.subLabel,
      promptText:
        cmd.promptText ??
        buildCoordinatorActionPrompt({
          coordinatorLabel: cat.label,
          coordinatorDescription: cat.description,
          actionLabel: cmd.label,
          actionDescription: cmd.subLabel,
          surface: 'scheduled',
        }),
      selectedAction: {
        coordinatorId: cat.id,
        actionId: cmd.id,
        surface: 'scheduled',
        label: cmd.label,
      },
    }));
    await this.openOperationChat(
      cat.id,
      cat.label,
      cat.icon,
      'command',
      quickActions,
      cat.description,
      '',
      '',
      null,
      'processing',
      null,
      scheduledActions,
      suggestedActions
    );
  }

  /**
   * Handle action chip tap — opens dedicated bottom sheet chat.
   */
  protected async onChipTap(chip: ActionChip): Promise<void> {
    await this.haptics.impact('light');
    this.chipTap.emit(chip);
    await this.openOperationChat(chip.id, chip.label, chip.icon, 'command');
  }

  /**
   * Open the dedicated bottom sheet chat for an operation or command.
   *
   * Any pending files staged in the main input bar are captured and passed
   * as `initialFiles` so the coordinator chat receives the user's attachments.
   * The files are taken from the service (clearing the main shell strip) so
   * ownership transfers to the operation-chat component.
   */
  private async openOperationChat(
    contextId: string,
    contextTitle: string,
    contextIcon: string,
    contextType: 'operation' | 'command',
    quickActions: OperationQuickAction[] = [],
    contextDescription = '',
    threadId = '',
    initialMessage = '',
    yieldState: AgentYieldState | null = null,
    operationStatus:
      | 'processing'
      | 'complete'
      | 'error'
      | 'paused'
      | 'awaiting_input'
      | 'awaiting_approval' = 'processing',
    errorMessage: string | null = null,
    scheduledActions: OperationQuickAction[] = [],
    suggestedActions: OperationQuickAction[] = []
  ): Promise<void> {
    // Capture and transfer any pending attachments from the main input strip
    const servicePendingFiles = this.agentX.pendingFiles();
    const initialFiles = servicePendingFiles.map((f) => ({
      file: f.file,
      previewUrl: f.previewUrl,
      isImage: f.type === 'image',
      isVideo: f.type === 'video',
    }));
    if (servicePendingFiles.length > 0) {
      // Transfer ownership — the operation-chat component now owns the File objects
      this.agentX.takePendingFiles();
    }

    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId,
        contextTitle,
        contextIcon,
        contextType,
        connectedSources: this.getAttachmentConnectedSources(),
        quickActions,
        suggestedActions,
        contextDescription,
        threadId,
        initialMessage,
        initialFiles,
        yieldState,
        operationStatus,
        errorMessage,
        scheduledActions,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /**
   * Handle playbook action card tap — route through the SSE chat loop
   * so the operations log receives real-time status updates.
   */
  protected async onPlaybookAction(task: WeeklyPlaybookItem): Promise<void> {
    if (task.id === 'goal-setup') {
      await this.onSetupGoals();
      return;
    }

    if (this.agentX.dashboardLoaded()) {
      const { intent, title } = this.agentX.preparePlaybookAction(task as ShellWeeklyPlaybookItem);
      // Open operation chat sheet with the intent as initialMessage so it
      // streams via SSE — giving the operations log real-time status events.
      await this.openOperationChat(
        `playbook-${task.id}`,
        title,
        'sparkles',
        'command',
        [],
        '',
        '',
        intent
      );
    } else {
      this.agentX.setUserMessage(`${task.actionLabel}: ${task.title}`);
      await this.onSendMessage();
    }
  }

  /**
   * Handle "Regenerate" playbook button.
   */
  protected async onRegeneratePlaybook(): Promise<void> {
    await this.agentX.generatePlaybook(true);
  }

  protected async onGenerateActionsClick(): Promise<void> {
    if (this.agentX.goals().length > 0) {
      await this.agentX.generatePlaybook(true);
      return;
    }

    await this.onSetupGoals();
  }

  /**
   * Mark a task as explicitly done — user already completed it outside the app.
   */
  protected async onMarkDoneTask(task: ShellWeeklyPlaybookItem): Promise<void> {
    await this.haptics.notification('success');
    this.agentX.markPlaybookItemComplete(task.id);
  }

  /**
   * Snooze an action card — dismisses it from the list with haptic feedback.
   */
  protected async onSnoozeTask(task: ShellWeeklyPlaybookItem): Promise<void> {
    await this.haptics.impact('light');
    this.agentX.snoozePlaybookItem(task.id);
  }

  /**
   * Handle send message — opens the Agent X bottom sheet chat
   * with the user's message and any pending files.
   */
  protected async onSendMessage(): Promise<void> {
    const message = this.agentX.getUserMessage().trim();
    const servicePendingFiles = this.agentX.pendingFiles();

    // Allow send if there's a message OR pending files
    if (!message && servicePendingFiles.length === 0) return;

    // Capture pending files and convert to operation-chat PendingFile shape
    const initialFiles = servicePendingFiles.map((f) => ({
      file: f.file,
      previewUrl: f.previewUrl,
      isImage: f.type === 'image',
      isVideo: f.type === 'video',
    }));

    // Clear the shell input immediately (don't revoke URLs — operation-chat owns them now)
    this.agentX.setUserMessage('');
    this.agentX.clearTask();
    this.agentX.takePendingFiles();
    this.pendingConnectedSources.set([]);
    await this.haptics.impact('light');

    // Open the operation chat bottom sheet with the message and files
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'agent-x-chat',
        contextTitle: 'Agent X',
        contextIcon: 'bolt',
        contextType: 'command',
        connectedSources: this.getAttachmentConnectedSources(),
        initialMessage: message,
        initialFiles,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }

  /** Input change — update service and the keyboard-height CSS var is handled by the component. */
  protected onInputChange(value: string): void {
    this.agentX.setUserMessage(value);
  }

  /** + button — open attachments bottom sheet with file and source options. */
  protected async onToggleAttachments(): Promise<void> {
    await this.haptics.impact('light');

    const result = await this.bottomSheet.openSheet({
      component: AgentXAttachmentsSheetComponent,
      componentProps: {
        connectedSources: this.getAttachmentConnectedSources(),
      },
      breakpoints: [0, 0.5, 0.72],
      initialBreakpoint: 0.5,
      canDismiss: true,
    });

    if (result.data && result.role === 'files-selected') {
      const files = result.data as File[];
      if (files.length > 0) {
        this.agentX.addFiles(files);
      }
    } else if (result.data && result.role === 'source-selected') {
      const source = result.data as ConnectedAppSource;
      this.pendingConnectedSources.update((current) => {
        const exists = current.some(
          (item) => item.platform === source.platform && item.profileUrl === source.profileUrl
        );
        return exists ? current : [...current, source];
      });
    } else if (result.role === 'manage-connected-apps') {
      await this.openConnectedAccounts();
    }
  }

  protected onRemovePendingSource(index: number): void {
    this.pendingConnectedSources.update((current) => current.filter((_, i) => i !== index));
  }

  /** Open shared media viewer for a pending attachment chip (matches web behavior). */
  protected async onOpenPendingFileViewer(index: number): Promise<void> {
    const pendingFiles = this.agentX.pendingFiles();
    if (!pendingFiles.length || index < 0 || index >= pendingFiles.length) {
      return;
    }

    const viewer = buildPendingAttachmentViewer(pendingFiles, index, {
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });

    if (!viewer.items.length) {
      return;
    }

    try {
      await this.mediaViewer.open({
        items: viewer.items,
        initialIndex: viewer.initialIndex,
        showShare: false,
        source: 'agent-x-pending',
        presentation: 'overlay',
      });
    } finally {
      viewer.cleanup();
    }
  }

  /**
   * Role-aware connected sources for the attachment sheet:
   * - Athletes: non-team sources (personal/global + sport)
   * - Coaches/Directors: team-scoped + selected sport-scoped + global sources
   */
  private getAttachmentConnectedSources(): readonly ConnectedAppSource[] {
    const user = this.user();
    const role = (user?.role ?? '').toLowerCase();
    const sources = user?.connectedSources ?? [];
    const selectedSportKeys = new Set(
      (user?.selectedSports ?? [])
        .map((sport) => this.normalizeScopeKey(sport))
        .filter((key): key is string => key.length > 0)
    );

    const withFavicons = sources.map((source) => ({
      ...source,
      faviconUrl:
        source.faviconUrl ?? getPlatformFaviconUrl(source.platform.toLowerCase()) ?? undefined,
    }));

    if (role === 'coach' || role === 'director') {
      return withFavicons.filter((source) => {
        if (source.scopeType === 'team' || source.scopeType === 'global' || !source.scopeType) {
          return true;
        }

        if (source.scopeType === 'sport') {
          const sourceSportKey = this.normalizeScopeKey(source.scopeId);
          return sourceSportKey.length > 0 && selectedSportKeys.has(sourceSportKey);
        }

        return false;
      });
    }

    return withFavicons.filter((source) => source.scopeType !== 'team');
  }

  /** Normalize source/sport keys so scopeId like "baseball" matches selected sport "Baseball". */
  private normalizeScopeKey(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  /**
   * Handle pull-to-refresh — reloads dashboard data.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    await this.agentX.loadDashboard();
    event.complete();
  }

  /** Retry dashboard load after an error. */
  protected onRetryDashboard(): void {
    void this.agentX.loadDashboard();
  }

  /**
   * Handle refresh timeout.
   */
  protected async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh timed out');
  }
}
