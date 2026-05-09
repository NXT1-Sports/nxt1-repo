const REDACTED_TOKEN = '[redacted]';
const REDACTED_ROUTE = '[redacted-route]';
const PRESERVED_PUBLIC_URL_TOKEN = '__NXT1_PUBLIC_URL__';

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
      // Raw firebasestorage / storage.googleapis.com URLs
      .replace(
        /https?:\/\/(?:storage|firebasestorage)\.googleapis\.com\/[^\s"')\]]+/gi,
        '[media-url]'
      )
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
  return restorePreservedPublicAppUrls(sanitizeInfrastructureTerms(redactedClean), preserved.urls);
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
