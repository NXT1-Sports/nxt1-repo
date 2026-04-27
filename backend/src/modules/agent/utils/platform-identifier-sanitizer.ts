const REDACTED_TOKEN = '[redacted]';
const REDACTED_ROUTE = '[redacted-route]';

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
    .replace(/\/(?:profile|team|organization|org|post|event)\/[A-Za-z0-9/_-]+/gi, REDACTED_ROUTE)
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
  return sanitizeStringInternal(value);
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
