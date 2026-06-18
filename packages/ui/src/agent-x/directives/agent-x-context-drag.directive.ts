import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, HostBinding, HostListener, inject, input } from '@angular/core';
import {
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';

type DragContextPayload = AgentXSelectedContext | readonly AgentXSelectedContext[];

type DragPreviewTheme = {
  surface: string;
  surfaceMuted: string;
  surfaceAccent: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  shadow: string;
  fontFamily: string;
};

@Directive({
  selector: '[nxtAgentXContextDrag]',
  standalone: true,
})
export class AgentXContextDragDirective {
  readonly context = input<DragContextPayload | null>(null, {
    alias: 'nxtAgentXContextDrag',
  });
  readonly disabled = input(false, { alias: 'nxtAgentXContextDragDisabled' });

  private readonly document = inject(DOCUMENT);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private dragging = false;
  private dragPreviewElement: HTMLElement | null = null;

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
    const contexts = this.normalizedContexts();
    if (!this.canDrag || contexts.length === 0 || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    const payload = contexts.length === 1 ? contexts[0] : contexts;
    const plainText =
      contexts.length === 1 ? contexts[0].title : `${contexts.length} selected contexts`;

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(
      AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
      serializeAgentXSelectedContextForDrag(payload as unknown as AgentXSelectedContext)
    );
    event.dataTransfer.setData('text/plain', plainText);
    this.applyDragPreview(contexts, event);
    this.dragging = true;
  }

  @HostListener('dragend')
  protected onDragEnd(): void {
    this.dragging = false;
    this.destroyDragPreview();
  }

  private get canDrag(): boolean {
    return !this.disabled() && this.normalizedContexts().length > 0;
  }

  private normalizedContexts(): readonly AgentXSelectedContext[] {
    const context = this.context();
    if (!context) {
      return [];
    }

    const contexts = Array.isArray(context) ? context : [context];
    return contexts.filter((entry) => !!entry?.id.trim() && !!entry.title.trim());
  }

  private applyDragPreview(contexts: readonly AgentXSelectedContext[], event: DragEvent): void {
    if (contexts.length <= 1 || !event.dataTransfer?.setDragImage) {
      this.destroyDragPreview();
      return;
    }

    const body = this.document.body;
    if (!body) {
      return;
    }

    this.destroyDragPreview();
    const theme = this.resolveDragPreviewTheme();

    const preview = this.document.createElement('div');
    preview.setAttribute('aria-hidden', 'true');
    preview.style.position = 'fixed';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    preview.style.pointerEvents = 'none';
    preview.style.zIndex = '2147483647';
    preview.style.width = '228px';
    preview.style.padding = '0';
    preview.style.background = 'transparent';

    const shadowBack = this.document.createElement('div');
    shadowBack.style.position = 'absolute';
    shadowBack.style.inset = '10px 14px -10px 14px';
    shadowBack.style.borderRadius = '16px';
    shadowBack.style.background = theme.surfaceMuted;
    shadowBack.style.opacity = '0.38';
    shadowBack.style.transform = 'translateY(8px) scale(0.96)';

    const shadowMid = this.document.createElement('div');
    shadowMid.style.position = 'absolute';
    shadowMid.style.inset = '6px 10px -6px 10px';
    shadowMid.style.borderRadius = '16px';
    shadowMid.style.background = theme.surface;
    shadowMid.style.opacity = '0.7';
    shadowMid.style.transform = 'translateY(4px) scale(0.98)';

    const card = this.document.createElement('div');
    card.style.position = 'relative';
    card.style.display = 'grid';
    card.style.gap = '8px';
    card.style.padding = '12px 14px';
    card.style.borderRadius = '16px';
    card.style.border = `1px solid ${theme.border}`;
    card.style.background = theme.surface;
    card.style.boxShadow = theme.shadow;
    card.style.backdropFilter = 'blur(12px)';
    card.style.color = theme.textPrimary;
    card.style.fontFamily = theme.fontFamily;

    const header = this.document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';

    const label = this.document.createElement('div');
    label.textContent =
      contexts.length === 2 ? '2 selected clips' : `${contexts.length} selected clips`;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.letterSpacing = '0.01em';

    const badge = this.document.createElement('div');
    badge.textContent = String(contexts.length);
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.minWidth = '24px';
    badge.style.height = '24px';
    badge.style.padding = '0 8px';
    badge.style.borderRadius = '999px';
    badge.style.border = `1px solid ${theme.border}`;
    badge.style.background = theme.surfaceAccent;
    badge.style.color = theme.textPrimary;
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '700';

    header.append(label, badge);

    const titles = contexts
      .slice(0, 2)
      .map((context) => context.title.trim())
      .filter(Boolean);
    const summary = this.document.createElement('div');
    summary.style.display = 'grid';
    summary.style.gap = '4px';

    for (const title of titles) {
      const line = this.document.createElement('div');
      line.textContent = title;
      line.style.fontSize = '12px';
      line.style.fontWeight = '600';
      line.style.lineHeight = '1.3';
      line.style.whiteSpace = 'nowrap';
      line.style.overflow = 'hidden';
      line.style.textOverflow = 'ellipsis';
      summary.appendChild(line);
    }

    if (contexts.length > titles.length) {
      const more = this.document.createElement('div');
      more.textContent = `+${contexts.length - titles.length} more`;
      more.style.fontSize = '11px';
      more.style.fontWeight = '600';
      more.style.lineHeight = '1.2';
      more.style.color = theme.textSecondary;
      summary.appendChild(more);
    }

    card.append(header, summary);
    preview.append(shadowBack, shadowMid, card);
    body.appendChild(preview);

    const hostRect = this.elementRef.nativeElement.getBoundingClientRect();
    const offsetX = Math.min(28, Math.max(12, hostRect.width * 0.18));
    const offsetY = Math.min(24, Math.max(12, hostRect.height * 0.35));
    event.dataTransfer.setDragImage(card, offsetX, offsetY);
    this.dragPreviewElement = preview;
  }

  private destroyDragPreview(): void {
    this.dragPreviewElement?.remove();
    this.dragPreviewElement = null;
  }

  private resolveDragPreviewTheme(): DragPreviewTheme {
    const view = this.document.defaultView;
    const rootElement = this.document.documentElement;
    if (!view || !rootElement) {
      return {
        surface: '#ffffff',
        surfaceMuted: '#e2e8f0',
        surfaceAccent: '#eef2ff',
        border: '#cbd5e1',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        shadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
        fontFamily: 'system-ui, sans-serif',
      };
    }

    const hostStyles = view.getComputedStyle(this.elementRef.nativeElement);
    const rootStyles = view.getComputedStyle(rootElement);

    return {
      surface: this.readCssVar(rootStyles, '--nxt1-color-surface-100', '#ffffff'),
      surfaceMuted: this.readCssVar(rootStyles, '--nxt1-color-surface-200', '#e2e8f0'),
      surfaceAccent: this.readCssVar(rootStyles, '--nxt1-color-alpha-primary10', '#eef2ff'),
      border: this.readCssVar(rootStyles, '--nxt1-color-border-primary', '#cbd5e1'),
      textPrimary: this.readCssVar(rootStyles, '--nxt1-color-text-primary', '#0f172a'),
      textSecondary: this.readCssVar(rootStyles, '--nxt1-color-text-secondary', '#475569'),
      shadow: this.readCssVar(
        rootStyles,
        '--nxt1-navigation-dropdown',
        '0 18px 40px rgba(15, 23, 42, 0.18)'
      ),
      fontFamily: hostStyles.fontFamily || 'system-ui, sans-serif',
    };
  }

  private readCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  }
}
