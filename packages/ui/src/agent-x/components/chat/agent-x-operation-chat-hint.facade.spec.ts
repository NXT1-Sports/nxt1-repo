import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentXOperationChatHintFacade } from './agent-x-operation-chat-hint.facade';

describe('AgentXOperationChatHintFacade', () => {
  afterEach(() => {
    try {
      TestBed.inject(AgentXOperationChatHintFacade).resetHints();
    } catch {
      // No injector configured for this test.
    }
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

    vi.advanceTimersByTime(24_000);

    expect(facade.shouldRenderDock()).toBe(true);
    expect(facade.hints()).toEqual([
      expect.objectContaining({
        hintKey: 'PANEL_HINT:film-review',
        title: 'Film Review',
      }),
    ]);

    vi.advanceTimersByTime(1_000);

    expect(facade.shouldRenderDock()).toBe(false);
    expect(facade.hints()).toEqual([]);

    facade.showPanelHint('film-review');

    expect(facade.shouldRenderDock()).toBe(false);
  });

  it('can show a different first-open panel hint after one panel has been seen', () => {
    const facade = createFacade();

    facade.showPanelHint('gameplans');
    facade.dismissHint('PANEL_HINT:gameplans');
    facade.showPanelHint('practice-scripts');

    expect(facade.hints()).toEqual([
      expect.objectContaining({
        hintKey: 'PANEL_HINT:practice-scripts',
        title: 'Practice Scripts',
      }),
    ]);
  });

  it('does not reshow a panel hint after the chat remounts', () => {
    const facade = createFacade();

    facade.showPanelHint('files');
    expect(facade.shouldRenderDock()).toBe(true);

    TestBed.resetTestingModule();

    const remountedFacade = createFacade();
    remountedFacade.showPanelHint('files');

    expect(remountedFacade.shouldRenderDock()).toBe(false);
    expect(remountedFacade.hints()).toEqual([]);
  });

  it('shows a delayed leave-thread hint for the first active user run', () => {
    vi.useFakeTimers();
    const facade = createFacade();

    facade.armFirstUserRunHint();
    facade.setFirstUserRunActive(true);

    vi.advanceTimersByTime(9_000);
    expect(facade.shouldRenderDock()).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(facade.shouldRenderDock()).toBe(true);
    expect(facade.hints()).toEqual([
      expect.objectContaining({
        hintKey: 'FIRST_USER_RUN:leave-thread',
        title: 'Keep working while Agent X runs',
      }),
    ]);
  });

  it('does not show the delayed leave-thread hint when run stops before 10 seconds', () => {
    vi.useFakeTimers();
    const facade = createFacade();

    facade.armFirstUserRunHint();
    facade.setFirstUserRunActive(true);
    vi.advanceTimersByTime(4_000);
    facade.setFirstUserRunActive(false);
    vi.advanceTimersByTime(10_000);

    expect(facade.shouldRenderDock()).toBe(false);
    expect(facade.hints()).toEqual([]);
  });
});
