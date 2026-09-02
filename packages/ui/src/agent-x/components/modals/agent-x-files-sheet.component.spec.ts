import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import { AgentXFilesPanelComponent } from '../shared/agent-x-files-panel-shell.component';
import { AgentXFilesSheetComponent } from './agent-x-files-sheet.component';

@Component({
  selector: 'nxt1-agent-x-files-panel',
  standalone: true,
  template: '',
})
class StubAgentXFilesPanelComponent {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;
  @Output() readonly askAgentPromptRequested = new EventEmitter<string>();
  @Output() readonly inlineVideoViewChange = new EventEmitter<boolean>();
}

type AgentXFilesSheetTestAccess = {
  askAgentPromptHandler?: (prompt: string) => void | Promise<void>;
  inlineVideoViewChangeHandler?: (isInlineVideoView: boolean) => void;
  onAskAgentPromptRequested(prompt: string): void;
  onInlineVideoViewChange(isInlineVideoView: boolean): void;
};

describe('AgentXFilesSheetComponent', () => {
  async function renderSheet() {
    await TestBed.configureTestingModule({
      imports: [AgentXFilesSheetComponent],
    })
      .overrideComponent(AgentXFilesSheetComponent, {
        remove: { imports: [AgentXFilesPanelComponent] },
        add: { imports: [StubAgentXFilesPanelComponent] },
      })
      .compileComponents();

    return TestBed.createComponent(AgentXFilesSheetComponent);
  }

  it('forwards Ask Agent prompts to the host callback', () => {
    const component = Object.create(
      AgentXFilesSheetComponent.prototype
    ) as AgentXFilesSheetTestAccess;
    const handler = vi.fn();
    component.askAgentPromptHandler = handler;

    component.onAskAgentPromptRequested('Summarize files');

    expect(handler).toHaveBeenCalledWith('Summarize files');
  });

  it('forwards inline video state changes to the host callback', () => {
    const component = Object.create(
      AgentXFilesSheetComponent.prototype
    ) as AgentXFilesSheetTestAccess;
    const handler = vi.fn();
    component.inlineVideoViewChangeHandler = handler;

    component.onInlineVideoViewChange(true);

    expect(handler).toHaveBeenCalledWith(true);
  });

  it('binds context and events into the shared files panel template', async () => {
    const fixture = await renderSheet();
    const component = fixture.componentInstance;
    const askHandler = vi.fn();
    const inlineHandler = vi.fn();
    component.teamId = 'team-123';
    component.role = 'coach';
    component.sport = 'football';
    component.enableDrawTool = true;
    component.askAgentPromptHandler = askHandler;
    component.inlineVideoViewChangeHandler = inlineHandler;

    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.directive(StubAgentXFilesPanelComponent))
      .componentInstance as StubAgentXFilesPanelComponent;

    expect(panel.teamId).toBe('team-123');
    expect(panel.role).toBe('coach');
    expect(panel.sport).toBe('football');
    expect(panel.enableDrawTool).toBe(true);

    panel.askAgentPromptRequested.emit('Summarize files');
    panel.inlineVideoViewChange.emit(true);

    expect(askHandler).toHaveBeenCalledWith('Summarize files');
    expect(inlineHandler).toHaveBeenCalledWith(true);
  });
});
