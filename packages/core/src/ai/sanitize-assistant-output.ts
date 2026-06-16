/**
 * @fileoverview Sanitize Assistant Output — strip echoed user attachments.
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * The LLM sometimes echoes user-uploaded media back into its reply as
 * `<video>`, `<img>`, or `![]()` blocks — duplicating what is already shown
 * in the user's own message bubble. This module deterministically removes
 * those echoes BEFORE the assistant text reaches the UI or persistence.
 *
 * Two surfaces:
 *
 *   1. `stripEchoedUserAttachments(text, urls)` — for fully-formed text
 *      (e.g. the final persisted `result.summary`).
 *
 *   2. `createStreamingSanitizer(urls)` — a stateful filter for token-by-token
 *      streaming. Holds back tokens that look like the start of a media tag
 *      until the closing token arrives, then evaluates and emits.
 *
 * 100% Portable — Zero framework dependencies. Pure functions only.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StreamingSanitizer {
  /** Push a streamed chunk; returns text safe to forward downstream. */
  push(chunk: string): string;
  /** Flush any held-back buffer at end-of-stream and return its sanitized form. */
  flush(): string;
}

// ─── URL set helper ─────────────────────────────────────────────────────────

/**
 * Build a normalized URL set from a list of user-attachment URLs.
 * Discards non-strings, empty values, and whitespace-only entries.
 */
export function buildAttachmentUrlSet(
  urls: readonly (string | undefined | null)[]
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (trimmed.length === 0) continue;
    set.add(trimmed);
  }
  return set;
}

// ─── Internal: regex patterns ──────────────────────────────────────────────
//
// All three regexes capture the URL in group 1 so a single replacer can
// look it up against the user-attachment set.

const VIDEO_TAG = /<video\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>(?:[\s\S]*?<\/video>)?/gi;
const IMG_TAG = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\/?>(?:\s*<\/img>)?/gi;
// ![alt](URL "optional title") — URL is everything up to the first whitespace or closing paren.
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

// ─── Public: static sanitizer ──────────────────────────────────────────────

/**
 * Remove `<video>`, `<img>`, and `![alt](url)` blocks whose URL matches a
 * user-uploaded attachment. Preserves all other markdown and HTML.
 *
 * - Hyperlinks `[text](url)` are NOT stripped (legitimate citations).
 * - Bare URLs in prose are NOT stripped (the bug is specifically embedded media).
 * - Collapses 3+ consecutive blank lines to a single blank line so removed
 *   blocks don't leave a vertical gap.
 */
export function stripEchoedUserAttachments(text: string, urls: ReadonlySet<string>): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (urls.size === 0) return text;

  const replaceIfMatches = (match: string, url: string): string => {
    return urls.has(url.trim()) ? '' : match;
  };

  let result = text;
  result = result.replace(VIDEO_TAG, replaceIfMatches);
  result = result.replace(IMG_TAG, replaceIfMatches);
  result = result.replace(MARKDOWN_IMAGE, replaceIfMatches);

  // Tidy whitespace left by removals.
  result = result.replace(/[ \t]+\n/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

// ─── Public: streaming sanitizer ───────────────────────────────────────────
//
// Algorithm (per `push(chunk)`):
//
//   1. Append chunk to internal buffer.
//   2. Find the earliest "danger prefix" (`<video`, `<img`, `![`) in buffer.
//   3. If none:
//      a. Hold back any trailing partial-prefix bytes (so we don't split a
//         danger token across two emits).
//      b. Emit the rest.
//   4. If a danger prefix is found at position N:
//      a. Emit buffer[0..N] (definitely safe).
//      b. Look for the matching close (`</video>`, `>`, `)`). If found,
//         evaluate the complete tag with `stripEchoedUserAttachments` and
//         emit the result; slide window past the tag and loop.
//      c. If not found, hold the unclosed tag in the buffer for the next
//         push — unless the buffer has grown past a safety threshold, in
//         which case flush it (treat as false positive).

const DANGER_PREFIXES: readonly string[] = ['<video', '<img', '!['] as const;
const MAX_HELD_BUFFER = 8192;

function findEarliestDangerStart(buffer: string, fromIndex = 0): number {
  let earliest = -1;
  for (const prefix of DANGER_PREFIXES) {
    const idx = buffer.indexOf(prefix, fromIndex);
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx;
  }
  return earliest;
}

/**
 * Return the exclusive end index of the danger tag starting at `startIdx`,
 * or `-1` if the tag is not yet fully closed in the buffer.
 */
function findTagEnd(buffer: string, startIdx: number): number {
  if (buffer.startsWith('<video', startIdx)) {
    const close = buffer.indexOf('</video>', startIdx);
    if (close >= 0) return close + '</video>'.length;
    // Self-closing form: <video ... /> — accept the '/>' as a close.
    const openClose = buffer.indexOf('>', startIdx);
    if (openClose < 0) return -1;
    if (buffer[openClose - 1] === '/') return openClose + 1;
    return -1;
  }
  if (buffer.startsWith('<img', startIdx)) {
    const close = buffer.indexOf('>', startIdx);
    return close >= 0 ? close + 1 : -1;
  }
  if (buffer.startsWith('![', startIdx)) {
    // ![alt](url) — close is the first ')' after the '('.
    const openParen = buffer.indexOf('(', startIdx);
    if (openParen < 0) return -1;
    const closeParen = buffer.indexOf(')', openParen);
    return closeParen >= 0 ? closeParen + 1 : -1;
  }
  return -1;
}

/**
 * Length of the longest suffix of `buffer` that is also a (strict) prefix of
 * any danger token. Used to hold back partial bytes between chunks so a token
 * can't be split (e.g. chunk1 ends with `<v`, chunk2 starts with `ideo ...`).
 */
function holdbackSuffixLength(buffer: string): number {
  const maxPrefixLen = Math.max(...DANGER_PREFIXES.map((p) => p.length)) - 1;
  const probeLen = Math.min(maxPrefixLen, buffer.length);
  for (let len = probeLen; len > 0; len--) {
    const suffix = buffer.slice(-len);
    for (const prefix of DANGER_PREFIXES) {
      if (prefix.length > len && prefix.startsWith(suffix)) return len;
    }
  }
  return 0;
}

export function createStreamingSanitizer(urls: ReadonlySet<string>): StreamingSanitizer {
  // Fast path: no attachments to strip — pass-through with no buffering.
  if (urls.size === 0) {
    return {
      push: (chunk: string): string => chunk,
      flush: (): string => '',
    };
  }

  let buffer = '';

  function processBuffer(): string {
    let out = '';
    let cursor = 0;

    // Walk forward through complete danger tags as long as we keep finding them.
    while (true) {
      const dangerIdx = findEarliestDangerStart(buffer, cursor);
      if (dangerIdx < 0) break;

      // Emit the safe text before the danger token.
      out += buffer.slice(cursor, dangerIdx);

      const endIdx = findTagEnd(buffer, dangerIdx);
      if (endIdx < 0) {
        // Tag not yet closed — hold from `dangerIdx` for next push.
        cursor = dangerIdx;
        const heldLen = buffer.length - dangerIdx;
        if (heldLen > MAX_HELD_BUFFER) {
          // Safety net: looks like a false positive. Stop holding and emit it.
          out += buffer.slice(dangerIdx);
          cursor = buffer.length;
        }
        buffer = buffer.slice(cursor);
        return out;
      }

      // Tag is fully closed in the buffer. Evaluate and emit (possibly empty).
      const segment = buffer.slice(dangerIdx, endIdx);
      out += stripEchoedUserAttachments(segment, urls);
      cursor = endIdx;
    }

    // No more danger tokens. Emit safe text, but hold back any trailing
    // suffix that could be the start of a danger token in the next chunk.
    const remainder = buffer.slice(cursor);
    const holdLen = holdbackSuffixLength(remainder);
    if (holdLen === 0) {
      out += remainder;
      buffer = '';
    } else {
      out += remainder.slice(0, remainder.length - holdLen);
      buffer = remainder.slice(remainder.length - holdLen);
    }
    return out;
  }

  return {
    push(chunk: string): string {
      if (typeof chunk !== 'string' || chunk.length === 0) return '';
      buffer += chunk;
      return processBuffer();
    },
    flush(): string {
      if (buffer.length === 0) return '';
      const out = stripEchoedUserAttachments(buffer, urls);
      buffer = '';
      return out;
    },
  };
}
