import { Directive, HostListener, output } from '@angular/core';

@Directive({
  selector: '[nxtDragDrop]',
  standalone: true,
})
export class NxtDragDropDirective {
  readonly dragStateChange = output<boolean>();
  readonly filesDropped = output<File[]>();

  private dragDepth = 0;
  private isActive = false;

  @HostListener('dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.dragDepth += 1;
    this.setActive(true);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (!this.hasFiles(event)) {
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
    if (!this.hasFiles(event)) {
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
    if (!this.hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const files = Array.from(event.dataTransfer?.files ?? []);
    this.reset();

    if (files.length > 0) {
      this.filesDropped.emit(files);
    }
  }

  private hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }

    return Array.from(types).includes('Files');
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
