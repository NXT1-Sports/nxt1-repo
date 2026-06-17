import { ChangeDetectionStrategy, Component, Input, viewChild } from '@angular/core';
import { AgentXPlaybooksPanelComponent } from './agent-x-playbooks-panel.component';

@Component({
  selector: 'nxt1-agent-x-practice-scripts-panel',
  standalone: true,
  imports: [AgentXPlaybooksPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nxt1-agent-x-playbooks-panel [teamId]="teamId" [sport]="sport" [practiceScriptsOnly]="true" />
  `,
})
export class AgentXPracticeScriptsPanelComponent {
  @Input() teamId: string | null = null;
  @Input() sport: string | null = null;

  private readonly playbooksPanel = viewChild(AgentXPlaybooksPanelComponent);

  public isDetailView(): boolean {
    return false;
  }

  public getHeaderTitle(): string {
    return 'Practice Scripts';
  }

  public backToList(): void {
    // The dedicated practice scripts panel keeps playbook switching in-panel.
  }

  public async refreshData(): Promise<void> {
    await this.playbooksPanel()?.refreshData();
  }
}
