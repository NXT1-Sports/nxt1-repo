import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NxtInlineVideoPreviewDirective } from './inline-video-preview.directive';

@Component({
  standalone: true,
  imports: [NxtInlineVideoPreviewDirective],
  template: `
    <video
      nxt1InlineVideoPreview
      [nxt1InlineVideoPreview]="src()"
      [nxt1InlineVideoPreviewPoster]="poster()"
    ></video>
  `,
})
class InlineVideoPreviewHostComponent {
  readonly src = signal('https://cdn.example.com/video.mp4');
  readonly poster = signal<string | null>('https://cdn.example.com/video-thumb.jpg');
}

describe('NxtInlineVideoPreviewDirective', () => {
  let fixture: ComponentFixture<InlineVideoPreviewHostComponent>;

  function video(): HTMLVideoElement {
    return fixture.nativeElement.querySelector('video') as HTMLVideoElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InlineVideoPreviewHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InlineVideoPreviewHostComponent);
  });

  it('renders thumbnail URLs through the poster attribute', () => {
    fixture.detectChanges();

    expect(video().getAttribute('poster')).toBe('https://cdn.example.com/video-thumb.jpg');
  });

  it('uses the markdown inline-video fallback timestamp when no poster is available', () => {
    fixture.componentInstance.poster.set(null);
    fixture.detectChanges();

    expect(video().getAttribute('poster')).toBeNull();
    expect(video().getAttribute('src')).toBe('https://cdn.example.com/video.mp4#t=0.001');
  });

  it('sets mobile-safe inline preview attributes without autoplay or controls', () => {
    fixture.detectChanges();

    expect(video().hasAttribute('playsinline')).toBe(true);
    expect(video().hasAttribute('webkit-playsinline')).toBe(true);
    expect(video().getAttribute('preload')).toBe('metadata');
    expect(video().hasAttribute('muted')).toBe(true);
    expect(video().hasAttribute('autoplay')).toBe(false);
    expect(video().hasAttribute('controls')).toBe(false);
  });
});
