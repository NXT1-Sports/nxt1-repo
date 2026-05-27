import { describe, expect, it } from 'vitest';
import { preprocessMediaPresentationMarkdown } from './markdown.component';

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

  it('leaves normal code blocks untouched', () => {
    const source = '```ts\nconst url = "https://example.com/file.mp4";\n```';

    expect(preprocessMediaPresentationMarkdown(source)).toBe(source);
  });
});
