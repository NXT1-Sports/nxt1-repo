import { describe, expect, it } from 'vitest';
import {
  buildAttachmentUrlSet,
  createStreamingSanitizer,
  stripEchoedUserAttachments,
} from './sanitize-assistant-output.js';

const USER_VIDEO = 'https://storage.googleapis.com/nxt1/users/abc/videos/clip.mov';
const USER_IMAGE = 'https://storage.googleapis.com/nxt1/users/abc/images/photo.jpg';
const TOOL_VIDEO = 'https://cdn.example.com/generated/highlight-reel.mp4';

const URLS = buildAttachmentUrlSet([USER_VIDEO, USER_IMAGE]);

describe('buildAttachmentUrlSet', () => {
  it('skips null, undefined, empty, and whitespace entries', () => {
    const set = buildAttachmentUrlSet(['a', '', '  ', null, undefined, 'b']);
    expect(set.size).toBe(2);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
  });

  it('trims surrounding whitespace before adding', () => {
    const set = buildAttachmentUrlSet(['  https://example.com  ']);
    expect(set.has('https://example.com')).toBe(true);
  });
});

describe('stripEchoedUserAttachments', () => {
  it('returns the input unchanged when the URL set is empty', () => {
    const text = `Here's <video src="${USER_VIDEO}" controls></video>`;
    expect(stripEchoedUserAttachments(text, buildAttachmentUrlSet([]))).toBe(text);
  });

  it('strips a <video> tag whose src matches a user attachment', () => {
    const text = `<video src="${USER_VIDEO}" controls playsinline muted></video>\n\nHere's your clip.`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe("Here's your clip.");
  });

  it('preserves a <video> tag whose src does NOT match a user attachment', () => {
    const text = `Generated reel: <video src="${TOOL_VIDEO}" controls></video>`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe(text);
  });

  it('strips an <img> tag whose src matches a user attachment', () => {
    const text = `Here's the photo: <img src="${USER_IMAGE}" alt="me" />`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe("Here's the photo:");
  });

  it('strips a markdown image whose URL matches a user attachment', () => {
    const text = `Photo:\n\n![me](${USER_IMAGE})\n\nLooks great.`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe('Photo:\n\nLooks great.');
  });

  it('preserves a markdown link whose URL matches a user attachment', () => {
    // Bracketless `!` is a markdown LINK, not an image — must be kept.
    const text = `See [my clip](${USER_VIDEO}) here.`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe(text);
  });

  it('handles multiple echoed media in a single text', () => {
    const text = `<video src="${USER_VIDEO}"></video>\n![me](${USER_IMAGE})\n\nDone.`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe('Done.');
  });

  it('collapses excessive blank lines created by removals', () => {
    const text = `Top.\n\n<video src="${USER_VIDEO}"></video>\n\n\n\nBottom.`;
    const out = stripEchoedUserAttachments(text, URLS);
    expect(out).toBe('Top.\n\nBottom.');
  });
});

describe('createStreamingSanitizer', () => {
  it('passes through text unchanged when URL set is empty', () => {
    const s = createStreamingSanitizer(buildAttachmentUrlSet([]));
    expect(s.push('hello ')).toBe('hello ');
    expect(s.push('world')).toBe('world');
    expect(s.flush()).toBe('');
  });

  it('emits safe text immediately and strips a complete <video> tag', () => {
    const s = createStreamingSanitizer(URLS);
    const out =
      s.push('Watching: ') +
      s.push(`<video src="${USER_VIDEO}" controls></video>`) +
      s.push(' enjoy!') +
      s.flush();
    expect(out).toBe('Watching:  enjoy!');
  });

  it('preserves a tool-generated <video> while stripping a user one in the same stream', () => {
    const s = createStreamingSanitizer(URLS);
    const out =
      s.push(`Original: <video src="${USER_VIDEO}"></video>\n`) +
      s.push(`Reel: <video src="${TOOL_VIDEO}" controls></video>`) +
      s.flush();
    expect(out).toContain(TOOL_VIDEO);
    expect(out).not.toContain(USER_VIDEO);
  });

  it('holds back a tag that is split across chunks and emits it sanitized', () => {
    const s = createStreamingSanitizer(URLS);
    const part1 = s.push('Here is the clip: <vid');
    const part2 = s.push(`eo src="${USER_VIDEO}" controls>`);
    const part3 = s.push('</video> and done.');
    const flushed = s.flush();
    expect(part1 + part2 + part3 + flushed).toBe('Here is the clip:  and done.');
  });

  it('emits an incomplete tag held in buffer when flush() is called', () => {
    const s = createStreamingSanitizer(URLS);
    s.push('prefix ');
    s.push(`<video src="${USER_VIDEO}" controls>`);
    // Stream ended mid-tag — flush should still strip if URL matches.
    const flushed = s.flush();
    expect(flushed).toBe('');
  });

  it('flushes a false-positive prefix that never closes', () => {
    const s = createStreamingSanitizer(URLS);
    // `<video` appears but never gets a closing tag and never a src — it should
    // eventually flow through as harmless text on flush.
    const pushed = s.push('Talking about <video tags in this paragraph.');
    const flushed = s.flush();
    expect(pushed + flushed).toBe('Talking about <video tags in this paragraph.');
  });

  it('does not split a danger prefix across chunks at the boundary', () => {
    const s = createStreamingSanitizer(URLS);
    // Chunk ends with the literal `<` — must be held until the next push so
    // `<video` is detected as a single token.
    const part1 = s.push('warm up <');
    const part2 = s.push(`video src="${USER_VIDEO}" controls></video> done`);
    const flushed = s.flush();
    expect(part1 + part2 + flushed).toBe('warm up  done');
  });

  it('strips a markdown image split across chunks', () => {
    const s = createStreamingSanitizer(URLS);
    const part1 = s.push('Pic: ![pho');
    const part2 = s.push(`to](${USER_IMAGE})!`);
    const flushed = s.flush();
    expect(part1 + part2 + flushed).toBe('Pic: !');
  });
});
