import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { AgentXFilesPanelComponent } from '../shared/agent-x-files-panel-shell.component';

@Component({
  selector: 'nxt1-agent-x-files-sheet',
  standalone: true,
  imports: [AgentXFilesPanelComponent],
  template: `
    <section class="agent-x-files-sheet-content" aria-label="Agent X files">
      <nxt1-agent-x-files-panel
        [teamId]="teamId"
        [role]="role"
        [sport]="sport"
        [enableDrawTool]="enableDrawTool"
        (askAgentPromptRequested)="onAskAgentPromptRequested($event)"
        (inlineVideoViewChange)="onInlineVideoViewChange($event)"
      />
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
        background: var(--nxt1-color-bg-primary, #05080d);
      }

      .agent-x-files-sheet-content {
        display: block;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        padding: 0 0 max(env(safe-area-inset-bottom, 0px), 10px);
        background: var(--nxt1-color-bg-primary, #05080d);
      }

      nxt1-agent-x-files-panel {
        display: block;
        height: 100%;
        min-height: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilesSheetComponent {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;
  @Input() askAgentPromptHandler?: (prompt: string) => void | Promise<void>;
  @Input() inlineVideoViewChangeHandler?: (isInlineVideoView: boolean) => void;

  protected onAskAgentPromptRequested(prompt: string): void {
    void this.askAgentPromptHandler?.(prompt);
  }

  protected onInlineVideoViewChange(isInlineVideoView: boolean): void {
    this.inlineVideoViewChangeHandler?.(isInlineVideoView);
  }
}
