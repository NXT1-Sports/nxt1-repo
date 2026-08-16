import { ChangeDetectionStrategy, Component, Input, output, viewChild } from '@angular/core';
import type { AgentXLibraryFile } from '../../services/agent-x-files.service';

import { AgentXFilesPanelInnerComponent } from './agent-x-files-panel.component';

@Component({
  selector: 'nxt1-agent-x-files-panel',
  standalone: true,
  imports: [AgentXFilesPanelInnerComponent],
  template: `
    <nxt1-agent-x-files-panel-inner
      [teamId]="teamId"
      [role]="role"
      [sport]="sport"
      [enableDrawTool]="enableDrawTool"
      (askAgentPromptRequested)="askAgentPromptRequested.emit($event)"
      (inlineVideoViewChange)="inlineVideoViewChange.emit($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilesPanelComponent {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;

  readonly askAgentPromptRequested = output<string>();
  readonly inlineVideoViewChange = output<boolean>();

  private readonly innerPanel = viewChild(AgentXFilesPanelInnerComponent);

  public visibleOpenTabs(): readonly AgentXLibraryFile[] {
    return this.innerPanel()?.visibleOpenTabs() ?? [];
  }

  public selectedId(): string | null {
    return this.innerPanel()?.selectedId() ?? null;
  }

  public selectedTabId(): string | null {
    return this.innerPanel()?.selectedTabId() ?? null;
  }

  public isInlineVideoView(): boolean {
    return this.innerPanel()?.isInlineVideoView() ?? false;
  }

  public getInlineHeaderTitle(): string {
    return this.innerPanel()?.getInlineHeaderTitle() ?? 'The Lab';
  }

  public async refreshData(options?: { readonly background?: boolean }): Promise<void> {
    await this.innerPanel()?.refreshData(options);
  }

  public async seekToTimestampMs(
    timeMs: number,
    options?: { readonly filmReviewId?: string | null; readonly sourceId?: string | null }
  ): Promise<void> {
    await this.innerPanel()?.seekToTimestampMs(timeMs, options);
  }

  public async onSelectReview(fileId: string): Promise<void> {
    await this.innerPanel()?.onSelectReview(fileId);
  }

  public getReviewDisplayTitle(file: Pick<AgentXLibraryFile, 'name'>): string {
    return this.innerPanel()?.getReviewDisplayTitle(file) ?? file.name;
  }

  public closeVideoTab(tabId?: string, event?: Event): void {
    this.innerPanel()?.closeVideoTab(tabId, event);
  }

  public reorderVideoTabsByIndex(previousIndex: number, currentIndex: number): void {
    this.innerPanel()?.reorderVideoTabsByIndex(previousIndex, currentIndex);
  }

  public openVideoFromLibrary(): void {
    this.innerPanel()?.openVideoFromLibrary();
  }

  public backToLibrary(): void {
    this.innerPanel()?.backToLibrary();
  }

  public focusFolder(folderId: string): boolean {
    return this.innerPanel()?.focusFolder(folderId) ?? false;
  }
}
