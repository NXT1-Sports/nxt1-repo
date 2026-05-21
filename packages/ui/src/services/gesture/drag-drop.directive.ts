import { Directive, HostBinding, HostListener, output } from '@angular/core';
import {
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  parseAgentXSelectedContextDragPayload,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';

@Directive({
  selector: '[nxtDragDrop]',
  standalone: true,
})
export class NxtDragDropDirective {
  readonly dragStateChange = output<boolean>();
  readonly filesDropped = output<File[]>();
  readonly selectedContextsDropped = output<AgentXSelectedContext[]>();

  private dragDepth = 0;
  private isActive = false;

  @HostBinding('class.nxt-drag-drop--active')
  get activeClass(): boolean {
    return this.isActive;
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (!this.hasSupportedPayload(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.dragDepth += 1;
    this.setActive(true);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (!this.hasSupportedPayload(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    this.setActive(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (!this.hasSupportedPayload(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.dragDepth = Math.max(this.dragDepth - 1, 0);
    if (this.dragDepth === 0) {
      this.setActive(false);
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!this.hasSupportedPayload(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const files = Array.from(event.dataTransfer?.files ?? []);
    const selectedContext = this.getSelectedContext(event);
    this.reset();

    if (files.length > 0) {
      this.filesDropped.emit(files);
    }

    if (selectedContext) {
      this.selectedContextsDropped.emit([selectedContext]);
    }
  }

  private hasSupportedPayload(event: DragEvent): boolean {
    return this.hasFiles(event) || this.hasSelectedContext(event);
  }

  private hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }

    return Array.from(types).includes('Files');
  }

  private hasSelectedContext(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }

    return Array.from(types).includes(AGENT_X_SELECTED_CONTEXT_DRAG_MIME);
  }

  private getSelectedContext(event: DragEvent): AgentXSelectedContext | null {
    const rawPayload = event.dataTransfer?.getData(AGENT_X_SELECTED_CONTEXT_DRAG_MIME) ?? '';
    return parseAgentXSelectedContextDragPayload(rawPayload);
  }

  private setActive(active: boolean): void {
    if (this.isActive === active) {
      return;
    }

    this.isActive = active;
    this.dragStateChange.emit(active);
  }

  private reset(): void {
    this.dragDepth = 0;
    this.setActive(false);
  }
}
