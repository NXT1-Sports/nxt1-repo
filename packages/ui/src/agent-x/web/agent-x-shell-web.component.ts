/**
 * @fileoverview Agent X Shell — Web (SSR-Optimized, Zero Ionic)
 * @module @nxt1/ui/agent-x/web
 * @version 1.0.0
 *
 * Web-optimized Agent X shell using design token CSS.
 * 100% SSR-safe with semantic HTML. Zero Ionic components —
 * pure Angular + design tokens for the web shell layout.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * The shared AgentXInputComponent is kept as-is (user requirement).
 * Welcome, chat, and option scroller are web-native variants.
 *
 * For mobile app, use AgentXShellComponent (Ionic variant) instead.
 *
 * @example
 * ```html
 * <nxt1-agent-x-shell-web
 *   [user]="userInfo()"
 *   [hideHeader]="isDesktop()"
 *   (avatarClick)="onAvatarClick()"
 *   (modeChange)="onModeChange($event)"
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
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  AgentXQuickTask,
  AgentXMode,
  AgentXDraft,
  AgentXTemplateCategory,
  AgentXTemplate,
  AgentXBundle,
  AgentXTaskItem,
} from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../../components/page-header';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../../components/section-nav-web';
import { AgentXService } from '../agent-x.service';
import { AgentXModeContentComponent } from '../modes';
import { AgentXChatComponent } from '../agent-x-chat.component';
import { AgentXInputComponent } from '../agent-x-input.component';
import { NxtToastService } from '../../services/toast/toast.service';

/**
 * User info for header display.
 */
export interface AgentXUser {
  readonly photoURL?: string | null;
  readonly displayName?: string | null;
  readonly role?: string;
}

@Component({
  selector: 'nxt1-agent-x-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtPageHeaderComponent,
    NxtDesktopPageHeaderComponent,
    NxtSectionNavWebComponent,
    AgentXModeContentComponent,
    AgentXChatComponent,
    AgentXInputComponent,
  ],
  template: `
    <!-- Mobile Page Header (hidden on desktop when sidebar provides navigation) -->
    @if (!hideHeader()) {
      <nxt1-page-header
        title="Agent X"
        [avatarSrc]="user()?.photoURL"
        [avatarName]="displayName()"
        [actions]="headerActions"
        (avatarClick)="avatarClick.emit()"
        (actionClick)="onHeaderAction($event)"
      />
    }

    <main class="agent-main" role="main">
      <!-- Desktop Page Header -->
      @if (hideHeader()) {
        <nxt1-desktop-page-header
          title="Agent X"
          subtitle="Your AI-powered recruiting assistant."
        />
      }

      <!-- Two-Column Layout: Side Nav + Content -->
      <div class="agent-layout">
        <!-- Side Navigation (Desktop) / Pill Strip (Mobile) -->
        <nxt1-section-nav-web
          [items]="modeNavItems"
          [activeId]="agentX.selectedMode()"
          ariaLabel="Agent X modes"
          (selectionChange)="onModeNavChange($event)"
        />

        <!-- Content Panel -->
        <div class="agent-content">
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
      </div>
    </main>

    <!-- Shared Input Bar (fixed, outside main scroll) -->
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
         AGENT X WEB SHELL — Two-Column Layout
         Zero Ionic, SSR-safe, design-token CSS
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .agent-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        padding-bottom: 0;
      }

      /* Two-column grid: side nav + content */
      .agent-layout {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--nxt1-spacing-8, 32px);
        align-items: start;
      }

      /* Scrollable content area between tabs and input bar */
      .agent-content {
        display: flex;
        flex-direction: column;
        min-height: calc(100vh - 280px);
        min-width: 0;
        padding-bottom: calc(100px + env(safe-area-inset-bottom, 0));
      }

      /*
       * Input bar alignment: CSS custom properties cascade naturally
       * to <nxt1-agent-x-input> which is a child of :host.
       * On desktop, offset left edge past sidebar + shell padding + nav + gap
       * so the input bar is centered within the content column.
       */
      @media (min-width: 769px) {
        :host {
          --agent-input-desktop-left: calc(var(--nxt1-sidebar-width, 280px) + 16px + 200px + 32px);
          --agent-input-desktop-right: 16px;
          --agent-input-align-items: center;
        }
      }

      /* ==============================
         RESPONSIVE: Tablet & Mobile
         ============================== */

      @media (max-width: 768px) {
        .agent-main {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: 0;
        }

        .agent-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShellWebComponent {
  protected readonly agentX = inject(AgentXService);
  private readonly toast = inject(NxtToastService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<AgentXUser | null>(null);

  /** Hide mobile page header (desktop sidebar provides navigation) */
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

  protected readonly displayName = computed(() => this.user()?.displayName ?? 'User');

  // ============================================
  // STATIC CONFIG
  // ============================================

  protected readonly headerActions: PageHeaderAction[] = [
    {
      id: 'clear',
      icon: 'refresh-outline',
      label: 'Clear conversation',
    },
  ];

  protected readonly modeNavItems: readonly SectionNavItem[] = [
    { id: 'highlights', label: 'Highlights' },
    { id: 'graphics', label: 'Graphics' },
    { id: 'recruiting', label: 'Recruiting' },
    { id: 'evaluation', label: 'Evaluation' },
  ];

  constructor() {
    afterNextRender(() => {
      this.agentX.startTitleAnimation();
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'clear':
        this.agentX.clearMessages();
        break;
    }
  }

  protected onModeNavChange(event: SectionNavChangeEvent): void {
    this.agentX.setMode(event.id as AgentXMode);
    this.modeChange.emit(event.id as AgentXMode);
  }

  protected onDraftSelected(draft: AgentXDraft): void {
    this.toast.info(`Opening draft: ${draft.title}`);
  }

  protected onViewAllDrafts(): void {
    this.toast.info('View all drafts coming soon');
  }

  protected onCreateNewDraft(): void {
    this.toast.info('Create new draft coming soon');
  }

  protected onCategorySelected(category: AgentXTemplateCategory): void {
    this.agentX.setUserMessage(`Create a ${category.label.toLowerCase()}`);
  }

  protected onTemplateSelected(template: AgentXTemplate): void {
    this.agentX.setUserMessage(`Create using the "${template.title}" template`);
  }

  protected onBundleSelected(bundle: AgentXBundle): void {
    this.agentX.setUserMessage(`Start the ${bundle.title}`);
  }

  protected onModeTaskSelected(task: AgentXTaskItem): void {
    this.agentX.setUserMessage(task.title);
  }

  protected async onTaskSelected(task: AgentXQuickTask): Promise<void> {
    await this.agentX.selectTask(task);
  }

  protected async onSendMessage(): Promise<void> {
    await this.agentX.sendMessage();
  }

  protected async onToggleTasks(): Promise<void> {
    this.toast.info('Task panel coming soon');
  }
}
