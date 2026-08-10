const REDACTED_TOKEN = '[redacted]';
const REDACTED_ROUTE = '[redacted-route]';
const PRESERVED_PUBLIC_URL_TOKEN = '__NXT1_PUBLIC_URL__';
const INTERNAL_PROTOCOL_TAIL_CHARS = 32;
const INTERNAL_PROTOCOL_MARKERS = [
  '<｜DSML｜',
  '<|DSML|',
  '<tool_calls',
  '</tool_calls',
  '<function=',
] as const;

function findInternalProtocolMarkerIndex(value: string): number {
  const indexes = INTERNAL_PROTOCOL_MARKERS.map((marker) => value.indexOf(marker)).filter(
    (index) => index >= 0
  );
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function findInternalProtocolBlockEnd(value: string): number {
  const closingPattern = /<\/[|｜]DSML[|｜](?:invoke|parameter|tool_calls)>/g;
  let endIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = closingPattern.exec(value)) !== null) {
    endIndex = match.index + match[0].length;
  }

  const toolCallsEnd = value.indexOf('</tool_calls>');
  if (toolCallsEnd >= 0) {
    endIndex = Math.max(endIndex, toolCallsEnd + '</tool_calls>'.length);
  }

  return endIndex;
}

export function containsInternalProtocolMarkup(value: string): boolean {
  return (
    findInternalProtocolMarkerIndex(value) >= 0 ||
    /\bdynamic_export\b/i.test(value) ||
    /<\/?[|｜]DSML[|｜]/i.test(value)
  );
}

export function stripInternalProtocolMarkup(value: string): string {
  let remaining = value;
  let output = '';

  while (remaining.length > 0) {
    const markerIndex = findInternalProtocolMarkerIndex(remaining);
    if (markerIndex < 0) {
      output += remaining;
      break;
    }

    output += remaining.slice(0, markerIndex);
    const protocolBlock = remaining.slice(markerIndex);
    const blockEnd = findInternalProtocolBlockEnd(protocolBlock);
    if (blockEnd < 0) {
      break;
    }
    remaining = protocolBlock.slice(blockEnd);
  }

  return output
    .replace(/<\/?[|｜]DSML[|｜][^>]*>/gi, '')
    .replace(/<\/?tool_calls[^>]*>/gi, '')
    .replace(/<function=[^>]+>/gi, '')
    .replace(/\bdynamic_export\b/gi, 'export generator')
    .replace(/\n{3,}/g, '\n\n');
}

export class InternalProtocolStreamSanitizer {
  private pending = '';
  private droppingProtocolBlock = false;

  push(chunk: string): string {
    if (!chunk) return '';

    if (this.droppingProtocolBlock) {
      this.pending += chunk;
      return this.flushProtocolBlockIfComplete();
    }

    const combined = this.pending + chunk;
    const markerIndex = findInternalProtocolMarkerIndex(combined);

    if (markerIndex >= 0) {
      const safePrefix = combined.slice(0, markerIndex);
      this.pending = combined.slice(markerIndex);
      this.droppingProtocolBlock = true;
      return stripInternalProtocolMarkup(safePrefix) + this.flushProtocolBlockIfComplete();
    }

    if (combined.length <= INTERNAL_PROTOCOL_TAIL_CHARS) {
      this.pending = combined;
      return '';
    }

    const emitLength = combined.length - INTERNAL_PROTOCOL_TAIL_CHARS;
    const safeText = combined.slice(0, emitLength);
    this.pending = combined.slice(emitLength);
    return stripInternalProtocolMarkup(safeText);
  }

  flush(): string {
    if (this.droppingProtocolBlock) {
      this.pending = '';
      this.droppingProtocolBlock = false;
      return '';
    }

    const safeText = stripInternalProtocolMarkup(this.pending);
    this.pending = '';
    return safeText;
  }

  private flushProtocolBlockIfComplete(): string {
    const blockEnd = findInternalProtocolBlockEnd(this.pending);
    if (blockEnd < 0) return '';

    const remainder = this.pending.slice(blockEnd);
    this.pending = '';
    this.droppingProtocolBlock = false;
    return this.push(remainder);
  }
}

function preservePublicAppUrls(value: string): {
  readonly text: string;
  readonly urls: readonly string[];
} {
  const urls: string[] = [];
  const text = value.replace(
    /https?:\/\/[^\s"')\]]+\/(?:profile|team)\/[A-Za-z0-9/_-]+/gi,
    (match) => {
      const token = `${PRESERVED_PUBLIC_URL_TOKEN}${urls.length}__`;
      urls.push(match);
      return token;
    }
  );

  return { text, urls };
}

function restorePreservedPublicAppUrls(value: string, urls: readonly string[]): string {
  return urls.reduce(
    (restored, url, index) => restored.replace(`${PRESERVED_PUBLIC_URL_TOKEN}${index}__`, url),
    value
  );
}

/**
 * Replaces backend infrastructure terms that must never appear in user-visible text.
 * Platform/app names (Hudl, YouTube, Instagram, etc.) are intentionally preserved —
 * users interact with those directly. Only internal service identifiers are scrubbed.
 */
function sanitizeInfrastructureTerms(value: string): string {
  return (
    value
      // Firebase Storage
      .replace(/\bFirebase\s+Storage\b/gi, 'cloud storage')
      // Firebase signed URL(s)
      .replace(/\bFirebase\s+signed\s+URLs?\b/gi, (m) =>
        /urls?$/i.test(m) ? 'secure media links' : 'secure media link'
      )
      // Keep raw storage URLs intact in user-visible text.
      // Chunked streaming can split URLs across delta boundaries; replacing
      // prefixes (e.g. with [media-url]) corrupts links into relative routes.
      // Apify — internal automation service; order matters (longest match first)
      .replace(/\bApify\s+MP4\s+acquisition\b/gi, 'video format conversion')
      .replace(/\bApify\s+downloader\b/gi, 'video converter')
      .replace(/\bApify\s+actor\b/gi, 'automation task')
      .replace(/\bApify\b/gi, 'video processing')
      // Auth infrastructure terms
      .replace(/\bauth-gated\b/gi, 'platform-secured')
      .replace(/\bauth-backed\b/gi, 'platform-secured')
      // Streaming protocol specifics
      .replace(/\bHLS\s+manifests?\b/gi, 'video stream files')
      .replace(/\bDASH\s+manifests?\b/gi, 'video stream files')
      .replace(/\.m3u8\b/gi, '')
      .replace(/\.mpd\b/gi, '')
      // Generic "signed URL" (a backend transport concept)
      .replace(/\bsigned\s+URLs?\b/gi, (m) => (/urls?$/i.test(m) ? 'secure links' : 'secure link'))
      // Collapse any double spaces left behind by replacements
      .replace(/  +/g, ' ')
  );
}

const EXPLICIT_SENSITIVE_KEYS = new Set([
  'id',
  'ids',
  'uid',
  'userId',
  'userIds',
  'teamId',
  'teamIds',
  'organizationId',
  'organizationIds',
  'postId',
  'postIds',
  'eventId',
  'eventIds',
  'rosterEntryId',
  'rosterEntryIds',
  'recordId',
  'recordIds',
  'threadId',
  'sessionId',
  'operationId',
  'approvalId',
  'unicode',
  'teamCode',
  'route',
  'cursor',
  'nextCursor',
]);

function isSensitiveKey(key: string): boolean {
  if (EXPLICIT_SENSITIVE_KEYS.has(key)) {
    return true;
  }

  return /^[A-Za-z0-9]+Id(?:s)?$/.test(key) || /^[A-Za-z0-9_]+_id(?:s)?$/i.test(key);
}

function sanitizeStringInternal(value: string): string {
  return value
    .replace(
      /("(?:id|ids|uid|unicode|teamCode|route|cursor|nextCursor|[A-Za-z0-9]+Id(?:s)?)"\s*:\s*")[^"]*(")/g,
      `$1${REDACTED_TOKEN}$2`
    )
    .replace(/\/(?:organization|org|post|event)\/[A-Za-z0-9/_-]+/gi, REDACTED_ROUTE)
    .replace(
      /\b(?:user|team|org|organization|post|event|roster|recruit|stat|metric|session|thread|operation|approval)(?:-|_)[A-Za-z0-9-]+\b/gi,
      REDACTED_TOKEN
    )
    .replace(
      /\b(?:user|team|organization|org|post|event|session|thread|operation|approval)\s+id\s*[:#]?\s*[A-Za-z0-9_-]+/gi,
      (match) => match.replace(/[:#]?\s*[A-Za-z0-9_-]+$/i, ` ${REDACTED_TOKEN}`)
    )
    .replace(
      /\b(?:uid|unicode|team\s*code|teamcode|cursor|next\s*cursor)\s*[:#]?\s*[A-Za-z0-9_-]+/gi,
      (match) => match.replace(/[:#]?\s*[A-Za-z0-9_-]+$/i, ` ${REDACTED_TOKEN}`)
    )
    .replace(
      /\b(?:userid|teamid|orgid|organizationid|postid|eventid|threadid|sessionid|operationid|approvalid)\s*[:#]?\s*[A-Za-z0-9_-]+/gi,
      (match) => match.replace(/[:#]?\s*[A-Za-z0-9_-]+$/i, ` ${REDACTED_TOKEN}`)
    );
}

export function sanitizeAgentOutputText(value: string): string {
  const preserved = preservePublicAppUrls(value);
  const sanitized = sanitizeStringInternal(preserved.text);

  // Strip any remaining [redacted] / [redacted-route] tokens from user-visible text.
  // These tokens are fine inside JSON payloads (sanitizeAgentPayload) but must never
  // appear in streamed natural-language responses shown to the user.
  const redactedClean = sanitized
    // Remove "LabelID: [redacted]" or "LabelID [redacted]" patterns (e.g. "TeamID: [redacted]")
    .replace(/\b[A-Za-z]+ID\s*[:#]?\s*\[redacted(?:-route)?\]/gi, '')
    // Remove any remaining standalone [redacted] or [redacted-route] tokens
    .replace(/\s*\[redacted(?:-route)?\]\s*/gi, ' ')
    // Collapse any double spaces left behind
    .replace(/  +/g, ' ');

  // Final pass: scrub backend infrastructure terms (Firebase, Apify, auth-gated, etc.)
  // Only applied to user-visible text, not to LLM observation payloads.
  return restorePreservedPublicAppUrls(
    sanitizeInfrastructureTerms(stripInternalProtocolMarkup(redactedClean)),
    preserved.urls
  );
}

export function sanitizeAgentPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeStringInternal(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAgentPayload(entry)) as T;
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      // Strip undefined values — Firestore rejects `undefined` at any nesting level.
      .filter(([, val]) => val !== undefined)
      .map(([key, entry]) => [key, sanitizeAgentPayload(entry)]);
    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}
