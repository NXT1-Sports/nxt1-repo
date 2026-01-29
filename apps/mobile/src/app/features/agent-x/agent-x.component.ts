/**
 * @fileoverview Agent X Component - AI Assistant Page
 * @module @nxt1/mobile/features/agent-x
 * @version 1.0.0
 *
 * AI-powered assistant for NXT1 platform providing intelligent
 * recruiting guidance, college matching, and personalized assistance.
 *
 * Features:
 * - 100% theme-aware Ionic design (light/dark mode)
 * - Sleek chat interface with iOS 26 liquid glass styling
 * - Quick action tasks organized by user type
 * - Pull-to-refresh for conversation reset
 * - Haptic feedback throughout
 * - Professional page header with avatar (Twitter/X pattern)
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sendOutline,
  send,
  attachOutline,
  sparklesOutline,
  sparkles,
  schoolOutline,
  footballOutline,
  peopleOutline,
  mailOutline,
  statsChartOutline,
  personOutline,
  closeCircleOutline,
  refreshOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import {
  NxtPageHeaderComponent,
  NxtSidenavService,
  NxtRefresherComponent,
  NxtToastService,
  HapticsService,
  NxtIconComponent,
  NxtLoggingService,
  type PageHeaderAction,
  type RefreshEvent,
} from '@nxt1/ui';
import { AuthFlowService } from '../auth/services/auth-flow.service';

/**
 * Quick task definition for AI actions
 */
interface QuickTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly prompt: string;
}

/**
 * Chat message interface
 */
interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly isTyping?: boolean;
  readonly error?: boolean;
}

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonSpinner,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtIconComponent,
  ],
  template: `
    <!-- Professional Page Header with Avatar (Twitter/X style) -->
    <nxt1-page-header
      title="Agent X"
      [avatarSrc]="user()?.photoURL"
      [avatarName]="displayName()"
      [actions]="headerActions()"
      (avatarClick)="onAvatarClick()"
      (actionClick)="onHeaderAction($event)"
    />

    <ion-content [fullscreen]="true" class="agent-x-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="agent-x-container">
        <!-- Welcome Screen (shown when no messages) -->
        @if (messages().length === 0) {
          <div class="welcome-screen">
            <!-- Animated Welcome Heading -->
            <div class="welcome-header">
              <div class="ai-icon-container">
                <nxt1-icon name="bolt" [size]="48" class="ai-icon" />
              </div>
              <h1 class="welcome-title">
                {{ currentTitle() }}
              </h1>
              <p class="welcome-subtitle">Your AI-powered recruiting assistant</p>
            </div>

            <!-- Quick Actions Grid -->
            <div class="quick-actions-container">
              @if (showAthleteTasks()) {
                <div class="task-section">
                  @if (isLoggedOut()) {
                    <h3 class="section-title">For Athletes</h3>
                  }
                  <div class="task-grid">
                    @for (task of athleteTasks; track task.id) {
                      <button type="button" class="task-card" (click)="selectTask(task)">
                        <ion-icon [name]="task.icon" class="task-icon"></ion-icon>
                        <span class="task-title">{{ task.title }}</span>
                      </button>
                    }
                  </div>
                </div>
              }

              @if (showCoachTasks()) {
                <div class="task-section">
                  @if (isLoggedOut()) {
                    <h3 class="section-title">For Coaches</h3>
                  }
                  <div class="task-grid">
                    @for (task of coachTasks; track task.id) {
                      <button type="button" class="task-card" (click)="selectTask(task)">
                        <ion-icon [name]="task.icon" class="task-icon"></ion-icon>
                        <span class="task-title">{{ task.title }}</span>
                      </button>
                    }
                  </div>
                </div>
              }

              @if (showCollegeTasks()) {
                <div class="task-section">
                  @if (isLoggedOut()) {
                    <h3 class="section-title">For Colleges</h3>
                  }
                  <div class="task-grid">
                    @for (task of collegeTasks; track task.id) {
                      <button type="button" class="task-card" (click)="selectTask(task)">
                        <ion-icon [name]="task.icon" class="task-icon"></ion-icon>
                        <span class="task-title">{{ task.title }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Chat Messages -->
        @if (messages().length > 0) {
          <div class="messages-container" #messagesContainer>
            @for (message of messages(); track message.id) {
              <div
                class="message-row"
                [class.user]="message.role === 'user'"
                [class.assistant]="message.role === 'assistant'"
                [class.error]="message.error"
              >
                @if (message.role === 'assistant') {
                  <div class="message-avatar">
                    <nxt1-icon name="bolt" [size]="20" />
                  </div>
                }
                <div class="message-bubble">
                  @if (message.isTyping) {
                    <div class="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  } @else {
                    <p class="message-content">{{ message.content }}</p>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Bottom Input Area -->
        <div class="input-container" [class.has-messages]="messages().length > 0">
          <!-- Selected Task Pill -->
          @if (selectedTask()) {
            <div class="task-pill">
              <span class="task-pill-text">{{ selectedTask()?.title }}</span>
              <button
                type="button"
                class="task-pill-remove"
                (click)="removeTask()"
                aria-label="Remove task"
              >
                <ion-icon name="close-circle-outline"></ion-icon>
              </button>
            </div>
          }

          <div class="input-wrapper">
            <textarea
              #messageInput
              [(ngModel)]="userMessage"
              (keydown.enter)="onEnterPress($any($event))"
              placeholder="Ask anything..."
              rows="1"
              [maxlength]="1000"
              class="message-input"
            ></textarea>

            <div class="input-actions">
              <button
                type="button"
                class="action-btn"
                (click)="toggleTaskPanel()"
                aria-label="AI Tasks"
              >
                <ion-icon name="sparkles-outline"></ion-icon>
              </button>

              <button
                type="button"
                class="send-btn"
                (click)="sendMessage()"
                [disabled]="!canSend()"
                aria-label="Send message"
              >
                @if (isLoading()) {
                  <ion-spinner name="crescent" class="send-spinner"></ion-spinner>
                } @else {
                  <ion-icon [name]="canSend() ? 'send' : 'send-outline'"></ion-icon>
                }
              </button>
            </div>
          </div>

          <p class="disclaimer">Agent X can make mistakes. Check important info.</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         AGENT X - iOS 26 LIQUID GLASS DESIGN
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

        /* Message bubbles */
        --agent-user-bubble: var(--agent-primary);
        --agent-user-text: #0a0a0a;
        --agent-assistant-bubble: var(--agent-surface);
        --agent-assistant-text: var(--agent-text-primary);
      }

      /* Light mode overrides */
      :host-context(.ion-palette-light),
      :host-context([data-theme='light']) {
        --agent-bg: var(--nxt1-color-bg-primary, #ffffff);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.1));
        --agent-text-primary: var(--nxt1-color-text-primary, #0a0a0a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-glass-bg: rgba(255, 255, 255, 0.9);
        --agent-glass-border: rgba(0, 0, 0, 0.1);
        --agent-assistant-bubble: rgba(0, 0, 0, 0.05);
      }

      .agent-x-content {
        --background: var(--agent-bg);
      }

      .agent-x-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 800px;
        margin: 0 auto;
        padding: 0 1rem;
      }

      /* ============================================
         WELCOME SCREEN
         ============================================ */
      .welcome-screen {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 2rem 1rem;
        text-align: center;
      }

      .welcome-header {
        margin-bottom: 2.5rem;
      }

      .ai-icon-container {
        width: 80px;
        height: 80px;
        border-radius: 24px;
        background: var(--agent-primary-glow);
        border: 1px solid var(--agent-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        box-shadow: 0 0 40px var(--agent-primary-glow);
      }

      .ai-icon {
        color: var(--agent-primary);
      }

      .welcome-title {
        font-size: 2rem;
        font-weight: 700;
        color: var(--agent-text-primary);
        margin: 0 0 0.5rem;
        letter-spacing: -0.02em;
      }

      .welcome-subtitle {
        font-size: 1rem;
        color: var(--agent-text-secondary);
        margin: 0;
      }

      /* ============================================
         QUICK ACTIONS
         ============================================ */
      .quick-actions-container {
        width: 100%;
        max-width: 600px;
      }

      .task-section {
        margin-bottom: 1.5rem;
      }

      .section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--agent-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 0.75rem;
        text-align: left;
      }

      .task-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }

      .task-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1.25rem 1rem;
        background: var(--agent-glass-bg);
        border: 1px solid var(--agent-glass-border);
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        -webkit-backdrop-filter: var(--agent-glass-backdrop);
        backdrop-filter: var(--agent-glass-backdrop);
      }

      .task-card:hover,
      .task-card:active {
        background: var(--agent-surface-hover);
        border-color: var(--agent-primary);
        transform: translateY(-2px);
      }

      .task-card:active {
        transform: scale(0.98);
      }

      .task-icon {
        font-size: 1.5rem;
        color: var(--agent-primary);
      }

      .task-title {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--agent-text-primary);
        text-align: center;
        line-height: 1.3;
      }

      /* ============================================
         MESSAGES
         ============================================ */
      .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem 0 6rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .message-row {
        display: flex;
        gap: 0.75rem;
        max-width: 85%;
      }

      .message-row.user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }

      .message-row.assistant {
        align-self: flex-start;
      }

      .message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: var(--agent-primary-glow);
        border: 1px solid var(--agent-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--agent-primary);
      }

      .message-bubble {
        padding: 0.875rem 1rem;
        border-radius: 18px;
        max-width: 100%;
      }

      .message-row.user .message-bubble {
        background: var(--agent-user-bubble);
        color: var(--agent-user-text);
        border-bottom-right-radius: 4px;
      }

      .message-row.assistant .message-bubble {
        background: var(--agent-assistant-bubble);
        color: var(--agent-assistant-text);
        border: 1px solid var(--agent-border);
        border-bottom-left-radius: 4px;
      }

      .message-row.error .message-bubble {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
      }

      .message-content {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* Typing Indicator */
      .typing-indicator {
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }

      .typing-indicator span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-text-muted);
        animation: typing-bounce 1.4s infinite ease-in-out both;
      }

      .typing-indicator span:nth-child(1) {
        animation-delay: -0.32s;
      }

      .typing-indicator span:nth-child(2) {
        animation-delay: -0.16s;
      }

      @keyframes typing-bounce {
        0%,
        80%,
        100% {
          transform: scale(0.6);
          opacity: 0.5;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ============================================
         INPUT AREA
         ============================================ */
      .input-container {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 0.75rem 1rem;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px) + 100px);
        background: linear-gradient(to top, var(--agent-bg) 80%, transparent);
      }

      .input-container.has-messages {
        background: var(--agent-bg);
        border-top: 1px solid var(--agent-border);
      }

      .task-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: var(--agent-primary-glow);
        border: 1px solid var(--agent-primary);
        border-radius: 20px;
        margin-bottom: 0.5rem;
      }

      .task-pill-text {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--agent-primary);
      }

      .task-pill-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--agent-primary);
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .task-pill-remove:hover {
        opacity: 1;
      }

      .task-pill-remove ion-icon {
        font-size: 1rem;
      }

      .input-wrapper {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        background: var(--agent-glass-bg);
        border: 1px solid var(--agent-glass-border);
        border-radius: 24px;
        padding: 0.5rem 0.75rem;
        -webkit-backdrop-filter: var(--agent-glass-backdrop);
        backdrop-filter: var(--agent-glass-backdrop);
        max-width: 800px;
        margin: 0 auto;
      }

      .message-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        font-size: 1rem;
        line-height: 1.5;
        color: var(--agent-text-primary);
        padding: 0.5rem 0;
        min-height: 24px;
        max-height: 120px;
        font-family: inherit;
      }

      .message-input::placeholder {
        color: var(--agent-text-muted);
      }

      .input-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: var(--agent-text-secondary);
        transition: all 0.2s;
      }

      .action-btn:hover {
        background: var(--agent-surface-hover);
        color: var(--agent-primary);
      }

      .action-btn ion-icon {
        font-size: 1.25rem;
      }

      .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--agent-primary);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: #0a0a0a;
        transition: all 0.2s;
      }

      .send-btn:disabled {
        background: var(--agent-surface);
        color: var(--agent-text-muted);
        cursor: not-allowed;
      }

      .send-btn:not(:disabled):hover {
        transform: scale(1.05);
        box-shadow: 0 0 20px var(--agent-primary-glow);
      }

      .send-btn:not(:disabled):active {
        transform: scale(0.95);
      }

      .send-btn ion-icon {
        font-size: 1.125rem;
      }

      .send-spinner {
        width: 18px;
        height: 18px;
        --color: currentColor;
      }

      .disclaimer {
        text-align: center;
        font-size: 0.75rem;
        color: var(--agent-text-muted);
        margin: 0.5rem 0 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');

  /** Message input reference */
  private readonly messagesContainer = viewChild<ElementRef>('messagesContainer');

  /** User state */
  readonly user = this.authFlow.user;
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  readonly isLoggedOut = computed(() => !this.user());

  /** Chat state - private writeable signals */
  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _selectedTask = signal<QuickTask | null>(null);
  private readonly _userMessage = signal('');
  private readonly _currentTitle = signal('What can I help with?');

  /** Public readonly computed signals */
  readonly messages = computed(() => this._messages());
  readonly isLoading = computed(() => this._isLoading());
  readonly selectedTask = computed(() => this._selectedTask());
  readonly currentTitle = computed(() => this._currentTitle());

  /** Two-way binding helper for userMessage */
  get userMessage(): string {
    return this._userMessage();
  }
  set userMessage(value: string) {
    this._userMessage.set(value);
  }

  /** Header actions */
  readonly headerActions = signal<PageHeaderAction[]>([
    {
      id: 'clear',
      icon: 'refresh-outline',
      label: 'Clear conversation',
    },
  ]);

  /** Quick tasks for athletes */
  readonly athleteTasks: QuickTask[] = [
    {
      id: 'college-match',
      title: 'Find My Best College Matches',
      description: 'Get personalized college recommendations',
      icon: 'school-outline',
      prompt: 'Help me find college programs that match my athletic profile and academic goals.',
    },
    {
      id: 'improve-profile',
      title: 'Improve My Profile',
      description: 'Get tips to stand out to recruiters',
      icon: 'person-outline',
      prompt:
        'Analyze my profile and give me specific tips to make it more attractive to college coaches.',
    },
    {
      id: 'draft-email',
      title: 'Draft Recruiting Email',
      description: 'Create a professional outreach email',
      icon: 'mail-outline',
      prompt: 'Help me write a professional email to introduce myself to college coaches.',
    },
    {
      id: 'recruiting-timeline',
      title: 'My Recruiting Timeline',
      description: 'Create a personalized action plan',
      icon: 'stats-chart-outline',
      prompt: 'Create a recruiting timeline and action plan based on my graduation year.',
    },
  ];

  /** Quick tasks for coaches */
  readonly coachTasks: QuickTask[] = [
    {
      id: 'find-recruits',
      title: 'Find Top Recruits',
      description: 'Discover athletes for your program',
      icon: 'search-outline',
      prompt: 'Help me find top recruits that would be a good fit for my team.',
    },
    {
      id: 'team-analytics',
      title: 'Team Analytics',
      description: 'Analyze your roster and needs',
      icon: 'stats-chart-outline',
      prompt: 'Analyze my team roster and help identify areas where we need to recruit.',
    },
    {
      id: 'recruiting-strategy',
      title: 'Recruiting Strategy',
      description: 'Build an effective recruiting plan',
      icon: 'football-outline',
      prompt: 'Help me develop a comprehensive recruiting strategy for the upcoming season.',
    },
    {
      id: 'prospect-evaluation',
      title: 'Evaluate Prospects',
      description: 'Get AI-powered prospect insights',
      icon: 'people-outline',
      prompt: 'Help me evaluate and compare prospects I am considering for recruitment.',
    },
  ];

  /** Quick tasks for colleges */
  readonly collegeTasks: QuickTask[] = [
    {
      id: 'roster-needs',
      title: 'Roster Analysis',
      description: 'Identify gaps in your roster',
      icon: 'people-outline',
      prompt: 'Analyze our current roster and help identify position needs for next season.',
    },
    {
      id: 'transfer-portal',
      title: 'Transfer Portal Search',
      description: 'Find transfer candidates',
      icon: 'search-outline',
      prompt: 'Help me find transfer portal candidates that fit our program needs.',
    },
    {
      id: 'scholarship-planning',
      title: 'Scholarship Planning',
      description: 'Optimize scholarship allocation',
      icon: 'school-outline',
      prompt: 'Help me plan our scholarship allocation for the upcoming recruiting class.',
    },
    {
      id: 'compliance-check',
      title: 'Compliance Assistant',
      description: 'NCAA compliance guidance',
      icon: 'checkmark-circle-outline',
      prompt: 'Help me understand NCAA recruiting rules and ensure compliance.',
    },
  ];

  /** Show athlete tasks based on user type */
  readonly showAthleteTasks = computed(() => {
    const user = this.user();
    if (!user) return true; // Show all when logged out
    return user.role === 'athlete';
  });

  /** Show coach tasks based on user type */
  readonly showCoachTasks = computed(() => {
    const user = this.user();
    if (!user) return true; // Show all when logged out
    return user.role === 'coach' || user.role === 'parent';
  });

  /** Show college tasks based on user type */
  readonly showCollegeTasks = computed(() => {
    const user = this.user();
    if (!user) return true; // Show all when logged out
    return (
      user.role === 'college-coach' || user.role === 'scout' || user.role === 'recruiting-service'
    );
  });

  /** Can send message check */
  readonly canSend = computed(() => {
    return this._userMessage().trim().length > 0 && !this._isLoading();
  });

  /** Cleanup reference */
  private readonly destroyRef = inject(DestroyRef);

  /** Animation interval reference for cleanup */
  private titleAnimationInterval?: ReturnType<typeof setInterval>;

  constructor() {
    // Register icons
    addIcons({
      sendOutline,
      send,
      attachOutline,
      sparklesOutline,
      sparkles,
      schoolOutline,
      footballOutline,
      peopleOutline,
      mailOutline,
      statsChartOutline,
      personOutline,
      closeCircleOutline,
      refreshOutline,
      chevronForwardOutline,
    });

    // Title animation
    afterNextRender(() => {
      this.animateTitle();
    });
  }

  /**
   * Animate the welcome title with proper cleanup
   */
  private animateTitle(): void {
    const titles = [
      'What can I help with?',
      'Ready to assist you',
      'Ask me anything',
      'Your AI recruiting assistant',
    ];
    let index = 0;

    this.titleAnimationInterval = setInterval(() => {
      index = (index + 1) % titles.length;
      this._currentTitle.set(titles[index]);
    }, 4000);

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      if (this.titleAnimationInterval) {
        clearInterval(this.titleAnimationInterval);
      }
    });
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern)
   */
  onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle header action button clicks
   */
  onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'clear':
        this.clearConversation();
        break;
    }
  }

  /**
   * Clear the conversation
   */
  async clearConversation(): Promise<void> {
    await this.haptics.impact('light');
    this._messages.set([]);
    this._selectedTask.set(null);
    this._userMessage.set('');
    this.toast.success('Conversation cleared');
  }

  /**
   * Select a quick task
   */
  async selectTask(task: QuickTask): Promise<void> {
    await this.haptics.impact('light');
    this._selectedTask.set(task);
    this._userMessage.set(task.prompt);
  }

  /**
   * Remove selected task
   */
  removeTask(): void {
    this._selectedTask.set(null);
  }

  /**
   * Toggle task panel (placeholder for future enhancement)
   */
  async toggleTaskPanel(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Implement task panel bottom sheet
    this.toast.info('Task panel coming soon');
  }

  /**
   * Handle enter key press
   */
  onEnterPress(event: KeyboardEvent): void {
    if (!event.shiftKey && this.canSend()) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Send a message
   */
  async sendMessage(): Promise<void> {
    if (!this.canSend()) return;

    const content = this._userMessage().trim();
    this._userMessage.set('');
    this._selectedTask.set(null);

    await this.haptics.impact('light');

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this._messages.update((msgs) => [...msgs, userMessage]);

    // Add typing indicator
    const typingMessage: ChatMessage = {
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    };
    this._messages.update((msgs) => [...msgs, typingMessage]);
    this._isLoading.set(true);

    // Scroll to bottom
    this.scrollToBottom();

    try {
      // TODO: Integrate with actual AI backend
      await this.simulateAIResponse(content);
    } catch (error) {
      this.logger.error('Error sending message', error);
      await this.haptics.notification('error');

      // Replace typing with error
      this._messages.update((msgs) => {
        const filtered = msgs.filter((m) => m.id !== 'typing');
        return [
          ...filtered,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
            timestamp: new Date(),
            error: true,
          },
        ];
      });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Simulate AI response (placeholder until backend integration)
   */
  private async simulateAIResponse(userInput: string): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

    const responses = [
      `I understand you're asking about "${userInput.slice(0, 50)}...". Let me help you with that!\n\nThis is a demo response. In the full version, I'll provide personalized recruiting insights, college recommendations, and actionable advice tailored to your profile.`,
      `Great question! Based on what you've shared, here are some initial thoughts:\n\n• First, let's understand your goals better\n• Then I can provide specific recommendations\n• We'll create an action plan together\n\nWhat specific aspect would you like to focus on first?`,
      `I'm here to help with your recruiting journey! Here's what I can assist with:\n\n🎯 College matching based on your profile\n📧 Communication strategies with coaches\n📊 Timeline and milestone planning\n\nLet's dive deeper into what matters most to you.`,
    ];

    const responseContent = responses[Math.floor(Math.random() * responses.length)];

    // Replace typing with actual response
    this._messages.update((msgs) => {
      const filtered = msgs.filter((m) => m.id !== 'typing');
      return [
        ...filtered,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: responseContent,
          timestamp: new Date(),
        },
      ];
    });

    await this.haptics.notification('success');
    this.scrollToBottom();
  }

  /**
   * Scroll messages to bottom
   */
  private scrollToBottom(): void {
    const container = this.messagesContainer();
    if (container) {
      setTimeout(() => {
        container.nativeElement.scrollTop = container.nativeElement.scrollHeight;
      }, 100);
    }
  }

  /**
   * Handle pull-to-refresh
   */
  async handleRefresh(event: RefreshEvent): Promise<void> {
    await this.haptics.impact('light');

    // Clear conversation on refresh
    this._messages.set([]);
    this._selectedTask.set(null);
    this._userMessage.set('');

    event.complete();
    this.toast.success('Conversation reset');
  }

  /**
   * Handle refresh timeout
   */
  async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh timed out');
  }
}
