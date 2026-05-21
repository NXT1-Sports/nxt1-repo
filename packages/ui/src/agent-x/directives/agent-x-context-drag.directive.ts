import { Directive, HostBinding, HostListener, input } from '@angular/core';
import {
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';

@Directive({
  selector: '[nxtAgentXContextDrag]',
  standalone: true,
})
export class AgentXContextDragDirective {
  readonly context = input<AgentXSelectedContext | null>(null, {
    alias: 'nxtAgentXContextDrag',
  });
  readonly disabled = input(false, { alias: 'nxtAgentXContextDragDisabled' });

  private dragging = false;

  @HostBinding('attr.draggable')
  get draggable(): 'true' | null {
    return this.canDrag ? 'true' : null;
  }

  @HostBinding('class.agent-x-context-drag-source')
  protected readonly dragSourceClass = true;

  @HostBinding('class.agent-x-context-drag-source--disabled')
  get disabledClass(): boolean {
    return !this.canDrag;
  }

  @HostBinding('class.agent-x-context-drag-source--dragging')
  get draggingClass(): boolean {
    return this.dragging;
  }

  @HostListener('dragstart', ['$event'])
  protected onDragStart(event: DragEvent): void {
    const context = this.context();
    if (!this.canDrag || !context || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(
      AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
      serializeAgentXSelectedContextForDrag(context)
    );
    event.dataTransfer.setData('text/plain', context.title);
    this.dragging = true;
  }

  @HostListener('dragend')
  protected onDragEnd(): void {
    this.dragging = false;
  }

  private get canDrag(): boolean {
    const context = this.context();
    return !this.disabled() && !!context?.id.trim() && !!context.title.trim();
  }
}
