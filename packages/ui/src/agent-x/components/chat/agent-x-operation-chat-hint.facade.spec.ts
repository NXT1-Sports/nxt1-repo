import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentXOperationChatHintFacade } from './agent-x-operation-chat-hint.facade';

describe('AgentXOperationChatHintFacade', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function createFacade(): AgentXOperationChatHintFacade {
    TestBed.configureTestingModule({
      providers: [AgentXOperationChatHintFacade],
    });

    return TestBed.inject(AgentXOperationChatHintFacade);
  }

  it('does not show the dock before a context panel opens', () => {
    const facade = createFacade();

    expect(facade.shouldRenderDock()).toBe(false);
    expect(facade.hints()).toEqual([]);
  });

  it('shows a panel hint once and auto-dismisses it', () => {
    vi.useFakeTimers();
    const facade = createFacade();

    facade.showPanelHint('film-review');

    expect(facade.shouldRenderDock()).toBe(true);
    expect(facade.hints()).toEqual([
      expect.objectContaining({
        hintKey: 'PANEL_HINT:film-review',
        title: 'Film Review',
      }),
    ]);

    vi.advanceTimersByTime(8_000);

    expect(facade.shouldRenderDock()).toBe(false);
    expect(facade.hints()).toEqual([]);

    facade.showPanelHint('film-review');

    expect(facade.shouldRenderDock()).toBe(false);
  });

  it('can show a different first-open panel hint after one panel has been seen', () => {
    const facade = createFacade();

    facade.showPanelHint('gameplans');
    facade.dismissHint('PANEL_HINT:gameplans');
    facade.showPanelHint('playbooks');

    expect(facade.hints()).toEqual([
      expect.objectContaining({
        hintKey: 'PANEL_HINT:playbooks',
        title: 'Playbooks',
      }),
    ]);
  });
});
