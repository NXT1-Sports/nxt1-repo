/**
 * @fileoverview Agent X Lab Bottom Sheet (Mobile)
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Full-height adaptive bottom sheet wrapper that renders "The Lab"
 * (files, film review, diagrams, documents) inside mobile Agent X.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import { AgentXFilesPanelComponent } from '../shared/agent-x-files-panel-shell.component';
import { AGENT_X_WORKSPACE_TERMS, type AgentXSelectedContext } from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import { AgentXService } from '../../services/agent-x.service';

export interface AgentXLabSheetCloseResult {
  readonly action?: 'ask-agent' | 'stage-contexts';
  readonly prompt?: string;
}

@Component({
  selector: 'nxt1-agent-x-lab-sheet',
  standalone: true,
  imports: [CommonModule, IonContent, NxtSheetHeaderComponent, AgentXFilesPanelComponent],
  template: `
    <div class="lab-sheet-shell">
      <nxt1-sheet-header
        [title]="title"
        closePosition="right"
        [showBorder]="true"
        [showClose]="true"
        (closeSheet)="dismiss()"
      />

      <ion-content class="lab-sheet-content">
        <div class="lab-sheet-body">
          <nxt1-agent-x-files-panel
            [teamId]="teamId"
            [role]="role"
            [sport]="sport"
            [enableDrawTool]="false"
            [compact]="true"
            (askAgentPromptRequested)="onAskAgentPromptRequested($event)"
          />
        </div>
      </ion-content>

      @if (selectedAgentContexts().length > 0) {
        <footer class="lab-sheet-footer">
          <button
            type="button"
            class="lab-sheet-footer__btn"
            aria-label="Send selected files to Agent X input"
            (click)="sendSelectedContextsToAgentX()"
          >
            <svg
              class="lab-sheet-footer__logo"
              viewBox="0 0 612 792"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="10"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path [attr.d]="agentLogoPath" />
              <polygon [attr.points]="agentLogoPolygon" />
            </svg>
            <span>Send to Agent X</span>
          </button>
        </footer>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: var(--nxt1-color-text-primary);

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

        --nxt1-color-primary: #ccff00;
        --nxt1-color-border-primary: #ccff00;
        --nxt1-color-alpha-primary10: rgba(204, 255, 0, 0.1);
        --ion-color-primary: #ccff00;
        --ion-color-primary-rgb: 204, 255, 0;
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

      .lab-sheet-shell {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .lab-sheet-content {
        flex: 1;
        min-height: 0;
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .lab-sheet-body {
        padding: 12px 14px 28px;
        min-height: 100%;
      }

      nxt1-agent-x-files-panel {
        display: block;
        width: 100%;
      }

      .lab-sheet-footer {
        flex-shrink: 0;
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        padding-bottom: calc(var(--nxt1-spacing-4, 16px) + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .lab-sheet-footer__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        min-height: 56px;
        padding: 0 var(--nxt1-spacing-5, 20px);
        border: none;
        border-radius: var(--nxt1-radius-xl, 16px);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        line-height: 1;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease),
          transform var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease);
      }

      .lab-sheet-footer__btn:active {
        opacity: 0.9;
        transform: scale(0.98);
      }

      .lab-sheet-footer__logo {
        width: 28px;
        height: 28px;
        flex: 0 0 28px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXLabSheetComponent {
  private readonly modalController = inject(ModalController);
  private readonly agentXService = inject(AgentXService);

  private readonly filesPanel = viewChild(AgentXFilesPanelComponent);

  readonly close = output<AgentXLabSheetCloseResult>();

  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';

  readonly title = AGENT_X_WORKSPACE_TERMS.workspaceTitle;
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  protected readonly selectedAgentContexts = (): readonly AgentXSelectedContext[] =>
    this.filesPanel()?.selectedAgentContexts() ?? [];

  onAskAgentPromptRequested(prompt: string): void {
    this.dismiss({ action: 'ask-agent', prompt });
  }

  protected sendSelectedContextsToAgentX(): void {
    const selectedContexts = this.selectedAgentContexts();

    if (selectedContexts.length === 0) {
      return;
    }

    this.agentXService.queueSelectedContexts(selectedContexts);
    this.dismiss({ action: 'stage-contexts' });
  }

  dismiss(result?: AgentXLabSheetCloseResult): void {
    const role =
      result?.action === 'ask-agent' || result?.action === 'stage-contexts'
        ? result.action
        : 'dismiss';

    void this.modalController.dismiss(result, role);
    this.close.emit(result ?? {});
  }
}
