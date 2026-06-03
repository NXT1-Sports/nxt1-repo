import { describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, vi } from 'vitest';
import { NxtBrowserService } from '../../services/browser';
import { NxtMarkdownComponent, preprocessMediaPresentationMarkdown } from './markdown.component';

describe('preprocessMediaPresentationMarkdown', () => {
  it('deindents media-only markdown links so final assets render instead of code blocks', () => {
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt1-staging.appspot.com/o/video.mp4?alt=media&token=abc123';

    const result = preprocessMediaPresentationMarkdown(
      `Download/Play:\n    [View Video](${videoUrl})`
    );

    expect(result).toBe(`Download/Play:\n[View Video](${videoUrl})`);
  });

  it('unwraps fenced media-only image markdown', () => {
    const imageUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/graphic.jpg';

    const result = preprocessMediaPresentationMarkdown(
      `Static Poster:\n\n\`\`\`markdown\n![Generated Image](${imageUrl})\n\`\`\``
    );

    expect(result).toBe(`Static Poster:\n\n![Generated Image](${imageUrl})`);
  });

  it('unwraps inline-code media links', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(`Final: \`[View Video](${videoUrl})\``);

    expect(result).toBe(`Final: [View Video](${videoUrl})`);
  });

  it('unwraps multi-backtick media links', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(`Final: \`\`[View Video](${videoUrl})\`\``);

    expect(result).toBe(`Final: [View Video](${videoUrl})`);
  });

  it('unescapes inline-code media markdown', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(
      `Final: \`\\[View Video\\]\\(${videoUrl}\\)\``
    );

    expect(result).toBe(`Final: [View Video](${videoUrl})`);
  });

  it('unescapes standalone media markdown lines', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(
      `Animated video:\n\\[View Video\\]\\(${videoUrl}\\)`
    );

    expect(result).toBe(`Animated video:\n[View Video](${videoUrl})`);
  });

  it('unescapes fenced media markdown', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(
      `Final:\n\n\`\`\`markdown\n\\[View Video\\]\\(${videoUrl}\\)\n\`\`\``
    );

    expect(result).toBe(`Final:\n\n[View Video](${videoUrl})`);
  });

  it('leaves normal code blocks untouched', () => {
    const source = '```ts\nconst url = "https://example.com/file.mp4";\n```';

    expect(preprocessMediaPresentationMarkdown(source)).toBe(source);
  });
});

describe('NxtMarkdownComponent', () => {
  let fixture: ComponentFixture<NxtMarkdownComponent>;
  let component: NxtMarkdownComponent;
  let nativeEl: HTMLElement;
  let previousDOMPurify: unknown;

  beforeEach(async () => {
    previousDOMPurify = (globalThis as Record<string, unknown>)['DOMPurify'];
    (globalThis as Record<string, unknown>)['DOMPurify'] = {
      sanitize: vi.fn((html: string) => html),
    };

    await TestBed.configureTestingModule({
      imports: [NxtMarkdownComponent],
      providers: [{ provide: NxtBrowserService, useValue: { openLink: vi.fn() } }],
    }).compileComponents();

    fixture = TestBed.createComponent(NxtMarkdownComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    if (previousDOMPurify === undefined) {
      delete (globalThis as Record<string, unknown>)['DOMPurify'];
      return;
    }
    (globalThis as Record<string, unknown>)['DOMPurify'] = previousDOMPurify;
  });

  function setContent(content: string): void {
    (component as unknown as { content: () => string }).content = () => content;
  }

  it('opens video thumbnails even when DOMPurify was already loaded', async () => {
    const spy = vi.fn();
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    component.mediaRequested.subscribe(spy);
    setContent(`[View Video](${videoUrl})`);
    fixture.detectChanges();
    await fixture.whenStable();

    const videoThumb = nativeEl.querySelector<HTMLElement>('[data-md-video-src]');
    expect(videoThumb).toBeTruthy();

    videoThumb?.click();

    expect(spy).toHaveBeenCalledWith({ url: videoUrl, type: 'video' });
  });
});
