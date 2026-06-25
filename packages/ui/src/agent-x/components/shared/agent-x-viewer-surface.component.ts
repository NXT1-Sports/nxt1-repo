import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-viewer-surface',
  standalone: true,
  template: `
    <article class="agent-x-viewer-surface">
      <div class="agent-x-viewer-surface__stage">
        <ng-content select="[viewer-stage]"></ng-content>
      </div>
      <div class="agent-x-viewer-surface__context">
        <ng-content select="[viewer-context]"></ng-content>
      </div>
    </article>
  `,
  styles: [
    `
      .agent-x-viewer-surface {
        position: relative;
        display: grid;
        gap: 16px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .agent-x-viewer-surface__stage,
      .agent-x-viewer-surface__context {
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXViewerSurfaceComponent {}
