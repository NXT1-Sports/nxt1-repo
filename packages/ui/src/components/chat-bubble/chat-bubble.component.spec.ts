import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AgentXMessagePart } from '@nxt1/core/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtChatBubbleComponent } from './chat-bubble.component';

describe('NxtChatBubbleComponent', () => {
  let fixture: ComponentFixture<NxtChatBubbleComponent>;
  let component: NxtChatBubbleComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NxtChatBubbleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NxtChatBubbleComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  function setParts(parts: readonly AgentXMessagePart[]): void {
    (component as unknown as { parts: () => readonly AgentXMessagePart[] }).parts = () => parts;
  }

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
