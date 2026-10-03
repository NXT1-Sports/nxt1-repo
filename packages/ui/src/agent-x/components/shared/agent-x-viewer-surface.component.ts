import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-viewer-surface',
  standalone: true,
  template: `
    <article class="agent-x-viewer-surface" [class.agent-x-viewer-surface--stretch]="stretch">
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
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }

      .agent-x-viewer-surface {
        position: relative;
        display: grid;
        gap: 16px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      /* Lets the stage flex-grow to fill the column while the context stays scrollable below it. */
      .agent-x-viewer-surface--stretch {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
      }

      .agent-x-viewer-surface__stage,
      .agent-x-viewer-surface__context {
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .agent-x-viewer-surface--stretch .agent-x-viewer-surface__stage {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
      }

      .agent-x-viewer-surface--stretch .agent-x-viewer-surface__context {
        flex: 0 0 auto;
      }

      .agent-x-viewer-surface__stage:empty {
        display: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXViewerSurfaceComponent {
  /** When true, the stage flex-grows to fill the host's height instead of sizing to content. */
  @Input() stretch = false;
}
