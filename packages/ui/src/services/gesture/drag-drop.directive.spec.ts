import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';

import { NxtDragDropDirective } from './drag-drop.directive';

describe('NxtDragDropDirective', () => {
  it('emits active state for file drags and resets on leave', () => {
    const directive = createDirective();
    const dragStates: boolean[] = [];

    directive.dragStateChange.subscribe((active) => {
      dragStates.push(active);
    });

    const enterEvent = createDragEvent(['Files'], []);
    const leaveEvent = createDragEvent(['Files'], []);

    directive.onDragEnter(enterEvent);
    directive.onDragLeave(leaveEvent);

    expect(dragStates).toEqual([true, false]);
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
    expect(leaveEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('emits dropped files and clears the active state', () => {
    const directive = createDirective();
    const dragStates: boolean[] = [];
    const droppedFiles: File[][] = [];
    const file = new File(['hello'], 'brief.pdf', { type: 'application/pdf' });

    directive.dragStateChange.subscribe((active) => {
      dragStates.push(active);
    });
    directive.filesDropped.subscribe((files) => {
      droppedFiles.push(files);
    });

    directive.onDragEnter(createDragEvent(['Files'], [file]));
    const dropEvent = createDragEvent(['Files'], [file]);
    directive.onDrop(dropEvent);

    expect(droppedFiles).toEqual([[file]]);
    expect(dragStates).toEqual([true, false]);
    expect(dropEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('emits multiple selected contexts from one drag payload', () => {
    const directive = createDirective();
    const droppedContexts: AgentXSelectedContext[][] = [];
    const contexts: AgentXSelectedContext[] = [
      {
        id: 'film-play:review-1:play-1',
        kind: 'film_play',
        title: 'Inside zone @ 00:14',
        source: { type: 'film_review', id: 'review-1', label: 'Week 1' },
      },
      {
        id: 'film-play:review-1:play-2',
        kind: 'film_play',
        title: 'Counter bash @ 00:27',
        source: { type: 'film_review', id: 'review-1', label: 'Week 1' },
      },
    ];

    directive.selectedContextsDropped.subscribe((value) => {
      droppedContexts.push(value);
    });

    directive.onDrop(createContextDragEvent(contexts));

    expect(droppedContexts).toEqual([contexts]);
  });

  it('ignores drag events without files', () => {
    const directive = createDirective();
    const dragStates: boolean[] = [];
    const event = createDragEvent(['text/plain'], []);

    directive.dragStateChange.subscribe((active) => {
      dragStates.push(active);
    });

    directive.onDragEnter(event);

    expect(dragStates).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('emits selected contexts through the same drag state lifecycle', () => {
    const directive = createDirective();
    const dragStates: boolean[] = [];
    const droppedContexts: AgentXSelectedContext[][] = [];
    const context: AgentXSelectedContext = {
      id: 'playbook-play:pb-1:mesh',
      kind: 'playbook_item',
      title: 'Mesh Concept',
      source: { type: 'playbook', id: 'pb-1', label: 'Week 4' },
    };

    directive.dragStateChange.subscribe((active) => {
      dragStates.push(active);
    });
    directive.selectedContextsDropped.subscribe((contexts) => {
      droppedContexts.push(contexts);
    });

    directive.onDragEnter(createContextDragEvent(context));
    const dropEvent = createContextDragEvent(context);
    directive.onDrop(dropEvent);

    expect(droppedContexts).toEqual([[context]]);
    expect(dragStates).toEqual([true, false]);
    expect(dropEvent.preventDefault).toHaveBeenCalledOnce();
  });
});

function createDragEvent(types: string[], files: File[]): DragEvent {
  return {
    dataTransfer: {
      types,
      files,
      dropEffect: 'none',
      getData: vi.fn(() => ''),
    } as DataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
}

function createContextDragEvent(
  context: AgentXSelectedContext | readonly AgentXSelectedContext[]
): DragEvent {
  return {
    dataTransfer: {
      types: [AGENT_X_SELECTED_CONTEXT_DRAG_MIME],
      files: [],
      dropEffect: 'none',
      getData: vi.fn((type: string) =>
        type === AGENT_X_SELECTED_CONTEXT_DRAG_MIME
          ? serializeAgentXSelectedContextForDrag(context)
          : ''
      ),
    } as unknown as DataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
}

function createDirective(): NxtDragDropDirective {
  const injector = Injector.create({ providers: [] });
  return runInInjectionContext(injector, () => new NxtDragDropDirective());
}
