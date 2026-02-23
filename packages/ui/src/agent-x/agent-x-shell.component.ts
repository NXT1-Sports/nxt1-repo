/**
 * @fileoverview Agent X Shell Component - Main Container
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Top-level container component for Agent X AI assistant.
 * Orchestrates all child components and handles layout.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Responsive layout (mobile-first)
 * - Theme-aware styling (light/dark mode)
 * - iOS 26 liquid glass aesthetic
 * - Pull-to-refresh support
 * - Keyboard handling
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
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import type {
  AgentXQuickTask,
  AgentXMode,
  AgentXDraft,
  AgentXTemplateCategory,
  AgentXTemplate,
  AgentXBundle,
  AgentXTaskItem,
} from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtDesktopPageHeaderComponent } from '../components/desktop-page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { AgentXService } from './agent-x.service';
import { AgentXModeContentComponent } from './modes';
import { AgentXChatComponent } from './agent-x-chat.component';
import { AgentXInputComponent } from './agent-x-input.component';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';

/**
 * User info for header display.
 */
export interface AgentXUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
}

@Component({
  selector: 'nxt1-agent-x-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtDesktopPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    AgentXModeContentComponent,
    AgentXChatComponent,
    AgentXInputComponent,
  ],
  template: `
    <!-- Professional Page Header with Avatar (Twitter/X style) -->
    <!-- Hidden on desktop when using sidebar shell -->
    @if (!hideHeader()) {
      <nxt1-page-header
        title="Agent X"
        [avatarSrc]="user()?.profileImg"
        [avatarName]="displayName()"
        [actions]="headerActions"
        (avatarClick)="avatarClick.emit()"
        (actionClick)="onHeaderAction($event)"
      />
    }

    <!-- Desktop Page Header (when mobile page header is hidden) -->
    @if (hideHeader()) {
      <div class="desktop-header-wrapper">
        <nxt1-desktop-page-header
          title="Agent X"
          subtitle="Your AI-powered recruiting assistant."
        />
      </div>
    }

    <!-- Twitter/TikTok Style Mode Selector -->
    <nxt1-option-scroller
      [options]="modeOptions"
      [selectedId]="agentX.selectedMode()"
      [config]="{ scrollable: false, stretchToFill: true }"
      (selectionChange)="onModeChange($event)"
    />

    <ion-content [fullscreen]="true" class="agent-x-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="agent-x-container">
        <!-- Mode Content (shown when no messages) -->
        @if (agentX.isEmpty()) {
          <nxt1-agent-x-mode-content
            [mode]="agentX.selectedMode()"
            (draftSelected)="onDraftSelected($event)"
            (viewAllDrafts)="onViewAllDrafts()"
            (createNewDraft)="onCreateNewDraft()"
            (categorySelected)="onCategorySelected($event)"
            (templateSelected)="onTemplateSelected($event)"
            (bundleSelected)="onBundleSelected($event)"
            (taskSelected)="onModeTaskSelected($event)"
          />
        }

        <!-- Chat Messages -->
        @if (!agentX.isEmpty()) {
          <nxt1-agent-x-chat [messages]="agentX.messages()" />
        }
      </div>
    </ion-content>

    <!-- Input Bar — OUTSIDE ion-content so it's fixed above the footer -->
    <nxt1-agent-x-input
      [hasMessages]="!agentX.isEmpty()"
      [selectedTask]="agentX.selectedTask()"
      [isLoading]="agentX.isLoading()"
      [canSend]="agentX.canSend()"
      [userMessage]="agentX.getUserMessage()"
      (messageChange)="agentX.setUserMessage($event)"
      (send)="onSendMessage()"
      (removeTask)="agentX.clearTask()"
      (toggleTasks)="onToggleTasks()"
    />
  `,
  styles: [
    `
      /* ============================================
       AGENT X SHELL - iOS 26 LIQUID GLASS DESIGN
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables */
        --agent-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --agent-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        --agent-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --agent-primary: var(--nxt1-color-primary, #ccff00);
        --agent-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));

        /* Glass effect variables */
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-glass-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.1));
        --agent-glass-backdrop: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
      }

      /* Light mode overrides */
      :host-context(.light),
      :host-context([data-theme='light']) {
        --agent-bg: var(--nxt1-color-bg-primary, #ffffff);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
      }

      .agent-x-content {
        --background: var(--agent-bg);
      }

      .desktop-header-wrapper {
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4) 0;
      }

      .agent-x-container {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        /* Reserve space at the bottom for the fixed input bar + footer */
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
      }

      @media (max-width: 767px) {
        .agent-x-container {
          padding-bottom: calc(160px + env(safe-area-inset-bottom, 0));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellComponent {
  protected readonly agentX = inject(AgentXService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<AgentXUser | null>(null);

  /** Hide page header (desktop sidebar provides navigation) */
  readonly hideHeader = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when mode changes */
  readonly modeChange = output<AgentXMode>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Display name for header */
  protected displayName(): string {
    return this.user()?.displayName ?? 'User';
  }

  // ============================================
  // STATIC CONFIG
  // ============================================

  /** Header action buttons */
  protected readonly headerActions: PageHeaderAction[] = [
    {
      id: 'clear',
      icon: 'refresh-outline',
      label: 'Clear conversation',
    },
  ];

  /** Mode options for tab selector */
  protected readonly modeOptions: OptionScrollerItem[] = [
    { id: 'highlights', label: 'Highlights' },
    { id: 'graphics', label: 'Graphics' },
    { id: 'recruiting', label: 'Recruiting' },
    { id: 'evaluation', label: 'Evaluation' },
  ];

  constructor() {
    // Start title animation after render
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle header action clicks.
   */
  protected onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'clear':
        this.agentX.clearMessages();
        break;
    }
  }

  /**
   * Handle mode tab change.
   */
  protected onModeChange(event: OptionScrollerChangeEvent): void {
    this.agentX.setMode(event.option.id as AgentXMode);
    this.modeChange.emit(event.option.id as AgentXMode);
  }

  /**
   * Handle draft selection from mode content.
   */
  protected async onDraftSelected(draft: AgentXDraft): Promise<void> {
    await this.haptics.impact('light');
    this.toast.info(`Opening draft: ${draft.title}`);
  }

  /**
   * Handle view all drafts action.
   */
  protected onViewAllDrafts(): void {
    this.toast.info('View all drafts coming soon');
  }

  /**
   * Handle create new draft action.
   */
  protected onCreateNewDraft(): void {
    this.toast.info('Create new draft coming soon');
  }

  /**
   * Handle template category selection.
   */
  protected async onCategorySelected(category: AgentXTemplateCategory): Promise<void> {
    await this.haptics.impact('light');
    this.agentX.setUserMessage(`Create a ${category.label.toLowerCase()}`);
  }

  /**
   * Handle template card selection (Canva-style).
   */
  protected async onTemplateSelected(template: AgentXTemplate): Promise<void> {
    await this.haptics.impact('medium');
    this.agentX.setUserMessage(`Create using the "${template.title}" template`);
  }

  /**
   * Handle bundle selection.
   */
  protected async onBundleSelected(bundle: AgentXBundle): Promise<void> {
    await this.haptics.impact('medium');
    this.agentX.setUserMessage(`Start the ${bundle.title}`);
  }

  /**
   * Handle task selection from mode content.
   */
  protected async onModeTaskSelected(task: AgentXTaskItem): Promise<void> {
    await this.haptics.impact('light');
    this.agentX.setUserMessage(task.title);
  }

  /**
   * Handle quick task selection (legacy).
   */
  protected async onTaskSelected(task: AgentXQuickTask): Promise<void> {
    await this.agentX.selectTask(task);
  }

  /**
   * Handle send message.
   */
  protected async onSendMessage(): Promise<void> {
    await this.agentX.sendMessage();
  }

  /**
   * Handle toggle tasks panel.
   */
  protected async onToggleTasks(): Promise<void> {
    await this.haptics.impact('light');
    this.toast.info('Task panel coming soon');
  }

  /**
   * Handle pull-to-refresh.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    await this.agentX.clearMessages();
    event.complete();
  }

  /**
   * Handle refresh timeout.
   */
  protected async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh timed out');
  }
}
