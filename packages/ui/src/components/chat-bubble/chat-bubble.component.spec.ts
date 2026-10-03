import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { AgentXMessagePart } from '@nxt1/core/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtChatBubbleComponent } from './chat-bubble.component';
import { NxtMarkdownComponent } from '../markdown/markdown.component';

@Component({ selector: 'nxt1-markdown', template: '' })
class MarkdownStubComponent {
  @Input() content = '';
  @Input() isStreaming = false;
  @Input() openDocumentsInPanel = false;
  @Output() documentRequested = new EventEmitter<string>();
  @Output() mediaRequested = new EventEmitter();
  @Output() timestampClicked = new EventEmitter<number>();
}

describe('NxtChatBubbleComponent', () => {
  let fixture: ComponentFixture<NxtChatBubbleComponent>;
  let component: NxtChatBubbleComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NxtChatBubbleComponent],
    })
      .overrideComponent(NxtChatBubbleComponent, {
        remove: { imports: [NxtMarkdownComponent] },
        add: { imports: [MarkdownStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(NxtChatBubbleComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  function setParts(parts: readonly AgentXMessagePart[]): void {
    (component as unknown as { parts: () => readonly AgentXMessagePart[] }).parts = () => parts;
  }

  it.each([false, true])(
    'forwards document requests from %s structured text parts to the chat host',
    (structured) => {
      const url = 'https://cdn.nxt1.test/report.docx';
      Object.defineProperty(component, 'openDocumentsInPanel', { value: () => true });
      if (structured) {
        setParts([{ type: 'text', content: `[Report](${url})` }]);
      } else {
        Object.defineProperty(component, 'content', { value: () => `[Report](${url})` });
      }
      const requested = vi.fn();
      component.documentRequested.subscribe(requested);
      fixture.detectChanges();
      const markdown = fixture.debugElement.query(By.directive(MarkdownStubComponent))
        .componentInstance as MarkdownStubComponent;
      expect(markdown.openDocumentsInPanel).toBe(true);
      markdown.documentRequested.emit(url);
      expect(requested).toHaveBeenCalledWith(url);
    }
  );

  it('emits mediaRequested when a generated image tile is clicked', () => {
    const spy = vi.fn();

    setParts([
      {
        type: 'image',
        url: 'https://cdn.nxt1.test/generated-graphic.jpg',
        alt: 'Generated graphic',
      },
    ]);

    component.mediaRequested.subscribe(spy);
    fixture.detectChanges();

    nativeEl.querySelector<HTMLButtonElement>('.bubble-media-button')?.click();

    expect(spy).toHaveBeenCalledWith({
      url: 'https://cdn.nxt1.test/generated-graphic.jpg',
      type: 'image',
      alt: 'Generated graphic',
    });
  });

  it('emits mediaRequested when a generated video tile is clicked', () => {
    const spy = vi.fn();

    setParts([
      {
        type: 'video',
        url: 'https://cdn.nxt1.test/generated-reel.mp4',
      },
    ]);

    component.mediaRequested.subscribe(spy);
    fixture.detectChanges();

    nativeEl.querySelector<HTMLButtonElement>('.bubble-media-button--video')?.click();

    expect(spy).toHaveBeenCalledWith({
      url: 'https://cdn.nxt1.test/generated-reel.mp4',
      type: 'video',
    });
  });
});
