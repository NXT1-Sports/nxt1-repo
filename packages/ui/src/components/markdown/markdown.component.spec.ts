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

  it('normalizes malformed raw video HTML whose src contains media markdown', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(
      `<video src="[View Video](${videoUrl})" controls playsinline muted></video>`
    );

    expect(result).toBe(`[View Video](${videoUrl})`);
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

  it('suppresses incomplete raw video HTML during streaming preprocessing', () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    const result = preprocessMediaPresentationMarkdown(
      `<video src="[View Video](${videoUrl})`,
      true
    );

    expect(result).toBe(`[View Video](${videoUrl})`);
  });

  function setContent(content: string): void {
    (component as unknown as { content: () => string }).content = () => content;
  }

  function setStreaming(value: boolean): void {
    (component as unknown as { isStreaming: () => boolean }).isStreaming = () => value;
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

  it('renders video timestamps as inline seek buttons', async () => {
    setContent('Watch the corner route at 1:23 and the safety rotation at 01:02:03.');
    fixture.detectChanges();
    await fixture.whenStable();

    const buttons = [...nativeEl.querySelectorAll<HTMLButtonElement>('.md-timestamp-link')];

    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe('1:23');
    expect(buttons[0]?.getAttribute('data-md-time-ms')).toBe('83000');
    expect(buttons[1]?.textContent).toBe('01:02:03');
    expect(buttons[1]?.getAttribute('data-md-time-ms')).toBe('3723000');
  });

  it('emits timestamp click requests in milliseconds', async () => {
    const spy = vi.fn();

    component.timestampClicked.subscribe(spy);
    setContent('Jump to 2:05.');
    fixture.detectChanges();
    await fixture.whenStable();

    nativeEl.querySelector<HTMLButtonElement>('.md-timestamp-link')?.click();

    expect(spy).toHaveBeenCalledWith(125000);
  });

  it('does not rewrite timestamps inside code or URLs', async () => {
    setContent('`1:23` https://example.com/watch/1:23 then live at 3:21');
    fixture.detectChanges();
    await fixture.whenStable();

    const buttons = [...nativeEl.querySelectorAll<HTMLButtonElement>('.md-timestamp-link')];

    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('3:21');
  });

  it('does not nest timestamp buttons inside standard markdown links', async () => {
    setContent('[1:23](https://example.com/clip) and the live rep at 2:34');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = nativeEl.querySelector<HTMLAnchorElement>('a[href="https://example.com/clip"]');
    const buttons = [...nativeEl.querySelectorAll<HTMLButtonElement>('.md-timestamp-link')];

    expect(link?.textContent).toBe('1:23');
    expect(link?.querySelector('.md-timestamp-link')).toBeNull();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('2:34');
  });
  it('unwraps malformed nested media markdown so video previews do not get a literal markdown src', async () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    setContent(`![Poster]([View Video](${videoUrl}))`);
    fixture.detectChanges();
    await fixture.whenStable();

    const videoThumb = nativeEl.querySelector<HTMLElement>('[data-md-video-src]');
    const videoPreview = nativeEl.querySelector<HTMLVideoElement>('.md-video-preview');

    expect(videoThumb?.getAttribute('data-md-video-src')).toBe(videoUrl);
    expect(videoPreview?.getAttribute('src')).toContain(videoUrl);
    expect(videoPreview?.getAttribute('src')).not.toContain('[View Video](');
  });

  it('renders malformed raw video HTML through the standard video preview path', async () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    setContent(`<video src="[View Video](${videoUrl})" controls playsinline muted></video>`);
    fixture.detectChanges();
    await fixture.whenStable();

    const videoThumb = nativeEl.querySelector<HTMLElement>('[data-md-video-src]');
    const videoPreview = nativeEl.querySelector<HTMLVideoElement>('.md-video-preview');

    expect(videoThumb?.getAttribute('data-md-video-src')).toBe(videoUrl);
    expect(videoPreview?.getAttribute('src')).toContain(videoUrl);
    expect(videoPreview?.getAttribute('src')).not.toContain('[View Video](');
  });

  it('renders explicit video poster URLs as the visible thumbnail layer', async () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';
    const posterUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel-thumb.jpg';

    setContent(`[View Video](${videoUrl}#poster=${encodeURIComponent(posterUrl)})`);
    fixture.detectChanges();
    await fixture.whenStable();

    const videoThumb = nativeEl.querySelector<HTMLElement>('[data-md-video-src]');
    const poster = nativeEl.querySelector<HTMLImageElement>('img.md-video-poster');
    const videoPreview = nativeEl.querySelector<HTMLVideoElement>('.md-video-preview');

    expect(videoThumb?.getAttribute('data-md-video-src')).toBe(videoUrl);
    expect(videoThumb?.classList.contains('md-video-wrap--has-poster')).toBe(true);
    expect(poster?.getAttribute('src')).toBe(posterUrl);
    expect(videoPreview?.getAttribute('poster')).toBe(posterUrl);
  });

  it('does not expose incomplete raw video HTML as signed-url prose while streaming', async () => {
    const videoUrl = 'https://storage.googleapis.com/nxt1-v2.appspot.com/media/reel.mp4';

    setStreaming(true);
    setContent(`<video src="[View Video](${videoUrl})`);
    fixture.detectChanges();
    await fixture.whenStable();

    const mdText = nativeEl.querySelector('.md')?.textContent ?? '';
    const videoThumb = nativeEl.querySelector<HTMLElement>('[data-md-video-src]');

    expect(mdText).not.toContain('<video src=');
    expect(mdText).not.toContain('X-Goog-Algorithm');
    expect(videoThumb?.getAttribute('data-md-video-src')).toBe(videoUrl);
  });
});
