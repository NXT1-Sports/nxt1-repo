/**
 * @fileoverview Agent X Welcome Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Welcome screen with animated title and quick task grid.
 * Shown when conversation is empty.
 */

import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  schoolOutline,
  personOutline,
  mailOutline,
  statsChartOutline,
  searchOutline,
  footballOutline,
  peopleOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import type { AgentXQuickTask } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon/icon.component';
import { AgentXService } from './agent-x.service';

@Component({
  selector: 'nxt1-agent-x-welcome',
  standalone: true,
  imports: [CommonModule, IonIcon, NxtIconComponent],
  template: `
    <div class="welcome-screen">
      <!-- Animated Welcome Heading -->
      <div class="welcome-header">
        <div class="ai-icon-container">
          <nxt1-icon name="bolt" [size]="48" class="ai-icon" />
        </div>
        <h1 class="welcome-title">{{ currentTitle() }}</h1>
        <p class="welcome-subtitle">
          Your AI command center for recruiting, media, and evaluations
        </p>
      </div>

      <!-- Quick Actions Grid -->
      <div class="quick-actions-container">
        @if (showAthleteTasks()) {
          <div class="task-section">
            @if (isLoggedOut()) {
              <h3 class="section-title">For Athletes</h3>
            }
            <div class="task-grid">
              @for (task of athleteTasks(); track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
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
              @for (task of coachTasks(); track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
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
              @for (task of collegeTasks(); track task.id) {
                <button type="button" class="task-card" (click)="onTaskClick(task)">
                  <ion-icon [name]="task.icon" class="task-icon"></ion-icon>
                  <span class="task-title">{{ task.title }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .welcome-screen {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        padding-top: 2rem;
        overflow-y: auto;
      }

      .welcome-header {
        text-align: center;
        margin-bottom: 2rem;
      }

      .ai-icon-container {
        display: flex;
        justify-content: center;
        margin-bottom: 1rem;
      }

      .ai-icon {
        color: var(--agent-primary, #ccff00);
        filter: drop-shadow(0 0 20px var(--agent-primary-glow, rgba(204, 255, 0, 0.3)));
        animation: pulse 2s ease-in-out infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.05);
        }
      }

      .welcome-title {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--agent-text-primary, #ffffff);
        margin: 0 0 0.5rem;
        transition: opacity 0.3s ease;
      }

      .welcome-subtitle {
        font-size: 1rem;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
      }

      .quick-actions-container {
        flex: 1;
      }

      .task-section {
        margin-bottom: 1.5rem;
      }

      .section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 0.75rem;
        padding-left: 0.25rem;
      }

      .task-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }

      @media (min-width: 600px) {
        .task-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .task-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1rem;
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--agent-border, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        min-height: 90px;
      }

      .task-card:hover {
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.04));
        border-color: var(--agent-primary, #ccff00);
        transform: translateY(-2px);
      }

      .task-card:active {
        transform: translateY(0) scale(0.98);
      }

      .task-icon {
        font-size: 1.5rem;
        color: var(--agent-primary, #ccff00);
      }

      .task-title {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--agent-text-primary, #ffffff);
        text-align: center;
        line-height: 1.3;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXWelcomeComponent {
  private readonly agentX = inject(AgentXService);

  // ============================================
  // INPUTS
  // ============================================

  readonly currentTitle = input.required<string>();
  readonly showAthleteTasks = input<boolean>(true);
  readonly showCoachTasks = input<boolean>(true);
  readonly showCollegeTasks = input<boolean>(true);
  readonly isLoggedOut = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly taskSelected = output<AgentXQuickTask>();

  // ============================================
  // TASKS (from core constants)
  // ============================================

  protected readonly athleteTasks = computed(() => this.agentX.athleteTasks());
  protected readonly coachTasks = computed(() => this.agentX.coachTasks());
  protected readonly collegeTasks = computed(() => this.agentX.collegeTasks());

  constructor() {
    // Register icons
    addIcons({
      schoolOutline,
      personOutline,
      mailOutline,
      statsChartOutline,
      searchOutline,
      footballOutline,
      peopleOutline,
      checkmarkCircleOutline,
    });
  }

  // ============================================
  // HANDLERS
  // ============================================

  protected onTaskClick(task: AgentXQuickTask): void {
    this.taskSelected.emit(task);
  }
}
