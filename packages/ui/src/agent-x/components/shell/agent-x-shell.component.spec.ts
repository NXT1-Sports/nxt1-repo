import { describe, expect, it, vi } from 'vitest';

import { SHEET_PRESETS } from '../../../components/bottom-sheet';
import { AgentXFilesSheetComponent } from '../modals/agent-x-files-sheet.component';
import { AgentXShellComponent } from './agent-x-shell.component';

type AgentXShellTestAccess = {
  haptics: { impact: ReturnType<typeof vi.fn> };
  bottomSheet: { openSheet: ReturnType<typeof vi.fn> };
  user: () => {
    activeTeamId: string | null;
    role: string;
    activeSport: string;
  } | null;
  openFilesSheet(): Promise<void>;
  onFilesAskAgentPromptRequested(prompt: string): void;
  onFilesInlineVideoViewChange(isInlineVideoView: boolean): void;
  openOperationChat: ReturnType<typeof vi.fn>;
};

describe('AgentXShellComponent files sheet', () => {
  function createShell(): AgentXShellTestAccess {
    const shell = Object.create(AgentXShellComponent.prototype) as AgentXShellTestAccess;
    shell.haptics = { impact: vi.fn().mockResolvedValue(undefined) };
    shell.bottomSheet = { openSheet: vi.fn().mockResolvedValue({}) };
    shell.user = () => ({
      activeTeamId: 'team-123',
      role: 'coach',
      activeSport: 'football',
    });
    shell.openOperationChat = vi.fn().mockResolvedValue(undefined);
    return shell;
  }

  it('opens the shared files panel in a full-height sheet with user context', async () => {
    const shell = createShell();

    await shell.openFilesSheet();

    expect(shell.haptics.impact).toHaveBeenCalledWith('light');
    expect(shell.bottomSheet.openSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        component: AgentXFilesSheetComponent,
        componentProps: expect.objectContaining({
          teamId: 'team-123',
          role: 'coach',
          sport: 'football',
          enableDrawTool: true,
        }),
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-files-sheet',
      })
    );
  });

  it('routes files Ask Agent prompts into the operation chat sheet', () => {
    const shell = createShell();

    shell.onFilesAskAgentPromptRequested('  Summarize selected clips  ');

    expect(shell.openOperationChat).toHaveBeenCalledWith(
      'agent-x-files',
      'Files',
      'folder',
      'command',
      [],
      '',
      '',
      'Summarize selected clips'
    );
  });

  it('ignores empty files Ask Agent prompts', () => {
    const shell = createShell();

    shell.onFilesAskAgentPromptRequested('   ');

    expect(shell.openOperationChat).not.toHaveBeenCalled();
  });

  it('passes sheet callbacks that preserve files panel events', async () => {
    const shell = createShell();
    const askSpy = vi.fn();
    const inlineSpy = vi.fn();
    shell.onFilesAskAgentPromptRequested = askSpy;
    shell.onFilesInlineVideoViewChange = inlineSpy;

    await shell.openFilesSheet();

    const config = shell.bottomSheet.openSheet.mock.calls[0]?.[0] as {
      componentProps: {
        askAgentPromptHandler: (prompt: string) => void;
        inlineVideoViewChangeHandler: (isInlineVideoView: boolean) => void;
      };
    };
    config.componentProps.askAgentPromptHandler('Build a reel');
    config.componentProps.inlineVideoViewChangeHandler(true);

    expect(askSpy).toHaveBeenCalledWith('Build a reel');
    expect(inlineSpy).toHaveBeenCalledWith(true);
  });
});
