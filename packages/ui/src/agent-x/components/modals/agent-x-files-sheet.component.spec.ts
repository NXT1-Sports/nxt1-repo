import { describe, expect, it, vi } from 'vitest';

import { AgentXFilesSheetComponent } from './agent-x-files-sheet.component';

type AgentXFilesSheetTestAccess = {
  askAgentPromptHandler?: (prompt: string) => void | Promise<void>;
  inlineVideoViewChangeHandler?: (isInlineVideoView: boolean) => void;
  onAskAgentPromptRequested(prompt: string): void;
  onInlineVideoViewChange(isInlineVideoView: boolean): void;
};

describe('AgentXFilesSheetComponent', () => {
  it('forwards Ask Agent prompts to the host callback', () => {
    const component = Object.create(AgentXFilesSheetComponent.prototype) as AgentXFilesSheetTestAccess;
    const handler = vi.fn();
    component.askAgentPromptHandler = handler;

    component.onAskAgentPromptRequested('Summarize files');

    expect(handler).toHaveBeenCalledWith('Summarize files');
  });

  it('forwards inline video state changes to the host callback', () => {
    const component = Object.create(AgentXFilesSheetComponent.prototype) as AgentXFilesSheetTestAccess;
    const handler = vi.fn();
    component.inlineVideoViewChangeHandler = handler;

    component.onInlineVideoViewChange(true);

    expect(handler).toHaveBeenCalledWith(true);
  });
});
