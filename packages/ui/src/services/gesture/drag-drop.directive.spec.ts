import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

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
});

function createDragEvent(types: string[], files: File[]): DragEvent {
  return {
    dataTransfer: {
      types,
      files,
      dropEffect: 'none',
    } as DataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
}

function createDirective(): NxtDragDropDirective {
  const injector = Injector.create({ providers: [] });
  return runInInjectionContext(injector, () => new NxtDragDropDirective());
}
