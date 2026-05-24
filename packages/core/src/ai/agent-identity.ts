/**
 * @fileoverview Agent X — Single Source of Truth for Identity & System Prompt
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * This is the ONE place that defines who Agent X is. Every agent (Primary +
 * coordinators) composes its system prompt from `AGENT_X_IDENTITY` so the
 * voice, persona, and platform self-knowledge never drift.
 *
 * The Primary Agent additionally injects a live CapabilityCard (auto-generated
 * from the ToolRegistry/SkillRegistry/CoordinatorRegistry at runtime) and a
 * one-paragraph user-context summary on top of this identity.
 *
 * 100% Portable — Zero framework dependencies.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentXMode = 'chat' | 'creator' | 'analyzer' | 'planner' | 'commander';

export interface AgentIdentitySnapshot {
  /** Stable persona / mission / voice block (>=1y stable). */
  readonly identity: string;
  /** Compact capability card describing the live tool/coordinator inventory. */
  readonly capabilityCard?: string;
  /** One-paragraph compression of the current user's context. */
  readonly userSummary?: string;
  /** Mode-specific addendum (free-form rules for the current run). */
  readonly modeAddendum?: string;
}

interface ExtractedMediaAttachment {
  readonly url: string;
  readonly name: string;
  readonly type: 'image' | 'video' | 'doc' | 'app';
  readonly mimeType?: string;
  readonly storagePath?: string;
  readonly sizeBytes?: number;
  readonly thumbnailUrl?: string;
  readonly cloudflareVideoId?: string;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isAbsoluteHttpUrl(value: string | undefined): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function resolvePreferredAttachmentUrl(file: Record<string, unknown>): string | undefined {
  const directUrl = readNonEmptyString(file['url']);
  const downloadUrl = readNonEmptyString(file['downloadUrl']);

  if (isAbsoluteHttpUrl(downloadUrl)) return downloadUrl;
  if (isAbsoluteHttpUrl(directUrl)) return directUrl;
  return downloadUrl ?? directUrl;
}

function collectFfmpegThumbnailUrls(resultData: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const pushUrl = (value: unknown): void => {
    const normalized = readNonEmptyString(value);
    if (normalized && isAbsoluteHttpUrl(normalized)) {
      urls.push(normalized);
    }
  };

  pushUrl(resultData['thumbnailUrl']);

  const records = Array.isArray(resultData['toolCallRecords'])
    ? (resultData['toolCallRecords'] as unknown[])
    : [];

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const recordObj = record as Record<string, unknown>;
    if (recordObj['toolName'] !== 'ffmpeg_generate_thumbnail') continue;
    if (recordObj['status'] !== 'success') continue;

    const output =
      recordObj['output'] && typeof recordObj['output'] === 'object'
        ? (recordObj['output'] as Record<string, unknown>)
        : null;
    if (!output) continue;

    pushUrl(output['thumbnailUrl']);
    pushUrl(output['imageUrl']);
    pushUrl(output['outputUrl']);

    const nestedResult =
      output['result'] && typeof output['result'] === 'object'
        ? (output['result'] as Record<string, unknown>)
        : null;
    if (nestedResult) {
      pushUrl(nestedResult['thumbnailUrl']);
      pushUrl(nestedResult['imageUrl']);
      pushUrl(nestedResult['outputUrl']);
    }
  }

  return urls;
}

function pairFfmpegThumbnailWithVideo(
  attachments: readonly ExtractedMediaAttachment[],
  thumbnailUrls: readonly string[]
): ExtractedMediaAttachment[] {
  if (thumbnailUrls.length === 0) return [...attachments];

  const videoIndexes = attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter((entry) => entry.attachment.type === 'video')
    .map((entry) => entry.index);

  if (videoIndexes.length === 0) return [...attachments];

  const thumbnailSet = new Set(
    thumbnailUrls.map((url) => url.trim()).filter((url) => url.length > 0)
  );
  if (thumbnailSet.size === 0) return [...attachments];

  // Use the latest video attachment as the thumbnail target.
  const targetVideoIndex = videoIndexes[videoIndexes.length - 1] ?? 0;
  const thumbnailUrl = [...thumbnailSet][thumbnailSet.size - 1] ?? '';
  if (!thumbnailUrl) return [...attachments];

  const remapped = attachments.map((attachment, index) => {
    if (index !== targetVideoIndex) return attachment;
    return {
      ...attachment,
      ...(attachment.thumbnailUrl ? {} : { thumbnailUrl }),
    };
  });

  // Remove standalone image attachments produced by ffmpeg_generate_thumbnail
  // once they are promoted to the target video's thumbnailUrl.
  return remapped.filter(
    (attachment, index) =>
      !(
        index !== targetVideoIndex &&
        attachment.type === 'image' &&
        thumbnailSet.has(attachment.url.trim())
      )
  );
}

// ─── Agent X Identity (the constant) ─────────────────────────────────────────

/**
 * Stable identity block. Cacheable as the prefix of the OpenRouter prompt cache.
 *
 * - Persona: who Agent X is, why it exists, how it speaks.
 * - Product: what NXT1 is, the role-aware audience, the domain edge.
 * - Behavior: streaming, tool use, refusal patterns, tone calibration.
 *
 * NEVER hardcode product taglines, role personas, or capabilities here that
 * belong in the live capability card or the user context summary.
 */
/**
 * Extract media attachments from tool resultData and return as AgentXAttachment array.
 * - imageUrl, videoUrl, outputUrl scalar fields → one attachment each
 * - imageUrls[], videoUrls[] arrays → one attachment each
 * - files[] array → map each using url, name, mimeType
 * - persistedMediaUrls[] → map each
 *
 * Dedup by URL. Used by backend at save time to populate message.attachments[].
 */
export function extractMediaAttachmentsFromResultData(
  resultData: Record<string, unknown>
): ExtractedMediaAttachment[] {
  const attachments: ExtractedMediaAttachment[] = [];
  const seen = new Set<string>();

  const addAttachment = (attachment: ExtractedMediaAttachment): void => {
    const url = attachment.url;
    if (!url || typeof url !== 'string') return;
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    attachments.push({ ...attachment, url: normalized });
  };

  const collectFromRecord = (record: Record<string, unknown>): void => {
    // Scalar fields: imageUrl, videoUrl, outputUrl
    if (typeof record['imageUrl'] === 'string') {
      addAttachment({
        url: record['imageUrl'],
        name: 'image.jpg',
        type: 'image',
      });
    }
    if (typeof record['videoUrl'] === 'string') {
      addAttachment({
        url: record['videoUrl'],
        name: 'video.mp4',
        type: 'video',
      });
    }
    if (typeof record['outputUrl'] === 'string') {
      addAttachment({
        url: record['outputUrl'],
        name: 'video.mp4',
        type: 'video',
      });
    }

    // Array fields: imageUrls, videoUrls
    if (Array.isArray(record['imageUrls'])) {
      (record['imageUrls'] as unknown[]).forEach((url, idx) => {
        if (typeof url !== 'string') return;
        addAttachment({
          url,
          name: `image-${idx}.jpg`,
          type: 'image',
        });
      });
    }
    if (Array.isArray(record['videoUrls'])) {
      (record['videoUrls'] as unknown[]).forEach((url, idx) => {
        if (typeof url !== 'string') return;
        addAttachment({
          url,
          name: `video-${idx}.mp4`,
          type: 'video',
        });
      });
    }

    // files[] array: map each item's url/name/mimeType
    if (Array.isArray(record['files'])) {
      (record['files'] as unknown[]).forEach((file, idx) => {
        if (!file || typeof file !== 'object') return;
        const obj = file as Record<string, unknown>;
        const url = resolvePreferredAttachmentUrl(obj);
        const name = typeof obj['name'] === 'string' ? obj['name'] : `file-${idx}`;
        const mimeType = readNonEmptyString(obj['mimeType']) ?? '';
        const type = mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('video/')
            ? 'video'
            : 'doc';
        if (!url) return;
        addAttachment({
          url,
          name,
          type,
          ...(mimeType ? { mimeType } : {}),
          ...(readNonEmptyString(obj['storagePath'])
            ? { storagePath: readNonEmptyString(obj['storagePath']) }
            : {}),
          ...(readNonNegativeNumber(obj['sizeBytes']) !== undefined
            ? { sizeBytes: readNonNegativeNumber(obj['sizeBytes']) }
            : {}),
          ...(readNonEmptyString(obj['thumbnailUrl'])
            ? { thumbnailUrl: readNonEmptyString(obj['thumbnailUrl']) }
            : {}),
          ...(readNonEmptyString(obj['cloudflareVideoId'])
            ? { cloudflareVideoId: readNonEmptyString(obj['cloudflareVideoId']) }
            : {}),
        });
      });
    }

    // downloadUrl: generated export file (PDF, CSV) from DynamicExportTool
    if (typeof record['downloadUrl'] === 'string') {
      const exportUrl = record['downloadUrl'];
      const exportName = typeof record['fileName'] === 'string' ? record['fileName'] : 'export';
      const mimeType = readNonEmptyString(record['mimeType']) ?? '';
      const exportType: 'image' | 'video' | 'doc' = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'doc';
      addAttachment({
        url: exportUrl,
        name: exportName,
        type: exportType,
        ...(mimeType ? { mimeType } : {}),
        ...(readNonEmptyString(record['storagePath'])
          ? { storagePath: readNonEmptyString(record['storagePath']) }
          : {}),
        ...(readNonNegativeNumber(record['sizeBytes']) !== undefined
          ? { sizeBytes: readNonNegativeNumber(record['sizeBytes']) }
          : {}),
      });
    }

    // persistedMediaUrls[] array: map each as media
    if (Array.isArray(record['persistedMediaUrls'])) {
      (record['persistedMediaUrls'] as unknown[]).forEach((url, idx) => {
        if (typeof url !== 'string') return;
        const type = url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video';
        const name = type === 'image' ? `media-${idx}.jpg` : `media-${idx}.mp4`;
        addAttachment({ url, name, type });
      });
    }
  };

  const nestedRecords: Record<string, unknown>[] = [];
  const queueNestedRecord = (value: unknown): void => {
    if (value && typeof value === 'object') {
      nestedRecords.push(value as Record<string, unknown>);
    }
  };

  queueNestedRecord(resultData['coordinator_artifacts']);
  queueNestedRecord(resultData['coordinatorArtifacts']);

  if (Array.isArray(resultData['toolCallRecords'])) {
    (resultData['toolCallRecords'] as unknown[]).forEach((record) => {
      if (!record || typeof record !== 'object') return;
      const recordObj = record as Record<string, unknown>;
      queueNestedRecord(recordObj['output']);
    });
  }

  // Top-level extraction first, then nested records from coordinator delegation outputs.
  collectFromRecord(resultData);
  for (const nested of nestedRecords) {
    collectFromRecord(nested);
  }

  const ffmpegThumbnailUrls = collectFfmpegThumbnailUrls(resultData);
  return pairFfmpegThumbnailWithVideo(attachments, ffmpegThumbnailUrls);
}

/**
 * Strip storage artifact URLs from LLM response text.
 * Removes raw storage URLs matching known patterns: Firebase Storage,
 * Google Cloud Storage, S3, CDN download links. Preserves regular web URLs.
 */
export interface SanitizeStorageUrlsOptions {
  readonly normalizeWhitespace?: boolean;
}

const STORAGE_DELIVERABLE_EXTENSION_RE =
  /\.(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|mp4|mov|m4v|webm|avi|mkv|pdf|csv|tsv|xls|xlsx|doc|docx|ppt|pptx|txt|json|zip)(?:$|[?#])/i;

function shouldPreserveStorageUrl(urlValue: string): boolean {
  try {
    const parsed = new URL(urlValue);
    const decodedPath = decodeURIComponent(parsed.pathname);

    if (STORAGE_DELIVERABLE_EXTENSION_RE.test(decodedPath)) {
      return true;
    }

    if (parsed.searchParams.get('alt') === 'media') {
      return true;
    }

    if (
      parsed.searchParams.has('token') ||
      parsed.searchParams.has('X-Goog-Algorithm') ||
      parsed.searchParams.has('X-Goog-Signature') ||
      parsed.searchParams.has('X-Amz-Algorithm') ||
      parsed.searchParams.has('X-Amz-Signature')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function sanitizeStorageUrlsFromText(
  content: string,
  options: SanitizeStorageUrlsOptions = {}
): string {
  const { normalizeWhitespace = true } = options;

  // Strip only non-deliverable storage URLs. Real downloadable media/document
  // links must remain intact so the assistant can hand off working outputs.
  const storageUrlPattern =
    /https:\/\/(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com|[^\s)\]]+\.s3(?:\.\w+-\w+-\d)?(?:\.amazonaws\.com)?|[^\s)\]]+\.cloudfront\.net)\/[^\s)\]]+/gi;

  const sanitized = content.replace(storageUrlPattern, (match) =>
    shouldPreserveStorageUrl(match) ? match : ''
  );

  if (!normalizeWhitespace) {
    return sanitized;
  }

  // Clean up resulting double-spaces/newlines for finalized text.
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

export const AGENT_X_IDENTITY = `You are Agent X — NXT1's AI command center for the entire sports industry.

NXT1 is the first AI-native platform built for athletes, coaches, scouts,
parents, sports directors, and college programs. Most platforms are passive;
NXT1 is active. Users describe what they need in plain language and you
execute — analyzing film, designing graphics, drafting outreach, scheduling
visits, building strategic plans, generating highlight reels, surfacing
recruiting intel, and orchestrating multi-step workflows end-to-end.

You are not a generic chatbot. You are "the first AI born in the locker
room" — fluent in NCAA compliance, sport-specific strategy, recruiting
calendars, position-specific evaluation, and the lived rhythm of an
athletic year (off-season, pre-season, in-season, post-season).

# Identity

- You speak with confidence, warmth, and precision. No filler. No fake
  apologies. No corporate hedging.
- You are the user's coach-in-the-pocket: encouraging when they need a push,
  direct when they need accountability, surgical when they need a deliverable.
- Match the user's role tone (athlete: motivational; coach: peer-to-peer;
  scout: evaluative; parent: reassuring; director: strategic).
- You operate INSIDE the NXT1 product. You can open Live Views, send emails,
  generate graphics, manage rosters, and run multi-step plans for the user.
  Never tell a user "I cannot do that" if a delegate or tool can.

# How You Work

- You are a streaming agent. When you intend to call a tool that takes more
  than a second, narrate the transition in ONE short, natural sentence first
  (e.g., "Pulling your latest profile…"), then call the tool. Do not template
  the same prelude every turn — let the wording match the moment.
- You have access to:
  - Lazy context tools (profile, memories, sync summaries, other-thread
    history, active threads) — call them only when the answer requires data
    you don't already have in this thread.
  - Delegate tools (one per specialist coordinator) — use these for any task
    inside a coordinator's domain. Delegation is a strength, not a fallback.
  - Plan-and-execute tool — use this ONLY when the user's intent decomposes
    into multiple dependent steps that span coordinators. Single-step or
    single-coordinator tasks should NOT trigger planning.
  - A small fast-path set (Live View open/navigate, capability lookup) for
    obvious one-shot intents.
- Never call data-mutation tools directly when a coordinator owns the
  domain — delegate. This keeps audit, billing, skills, and approvals
  consistent.
- Be parallel when safe. On the first turn of a complex request, fire
  multiple lazy-context fetches in one round.
- Tool results are observations, not the answer. Always synthesize a final
  user-facing message after your last tool call.
- During long workflows, share short operational progress updates naturally.
  Keep them specific to current steps, avoid repeated templates, and never
  invent results or counts you do not explicitly have.

# Conversation Continuity

- The current thread's recent turns are ALWAYS in your context window. Refer
  to them by content, not by ID. You never need to "look up" the current
  thread.
- Other threads are tool-fetched (call \`get_other_thread_history\` or
  \`get_active_threads\` only when the user explicitly references a different
  conversation).

# Capability Self-Knowledge

- You know exactly what NXT1 can do because the live capability card is in
  your prompt. When asked "what can you do?" answer from that card — never
  refuse, never give a generic answer.
- For deep, structured capability listings, call \`whoami_capabilities\`.

# Refusal & Honesty

- If a request truly cannot be satisfied (out-of-scope, missing required
  external auth, policy violation), state that plainly in one or two
  sentences and offer the closest valid action.
- Never hallucinate platform identifiers (user IDs, team IDs, post IDs,
  routes, document IDs). Refer to entities by name only.
- Never invent UI navigation that is not explicitly confirmed by tool output,
  capability card data, or injected context. Do not tell users to tap
  "Messages", "Inbox", or any nav icon unless that exact destination is
  confirmed in-context.
- For email-access guidance, default to connected-provider actions in chat
  (Gmail/Outlook tools) and Settings -> Email for connection management.
  Do not fabricate alternate inbox paths.

# Tool-First Discipline (CRITICAL)

Any verifiable fact about colleges, schools, coaches, athletes, teams,
rosters, schedules, stats, NIL deals, or rankings requires a tool call
BEFORE you answer — your training data is stale.

- NXT1 data (users, teams, posts, rosters, stats) → \`search_nxt1_platform\`
  or \`query_nxt1_platform_data\`.
- General public info (NCAA programs, coaches, schools) → \`search_web\`.
- Synthesize from tool results only. If tools return nothing, say so.
- "I think" / "from what I recall" / "as of my last update" are forbidden.
  Either you have a tool result, or you say you cannot find it.

# Output Style

- Default to crisp, scannable prose. Use short paragraphs and lists when they
  carry meaning. Use markdown structure when the user needs structure
  (timelines, comparisons, plans). Otherwise prefer plain text.
- End most replies with the clearest single next action the user can take.

# Handling Tool-Generated Files

- When a tool produces a generated asset, you MUST embed or link it directly in
  the same response. Use the format that matches the asset type:
  - **Images** — embed inline: ![description](https://your-url) — renders as a visible image in the chat
  - **Videos** — embed inline using an HTML video tag: <video src="https://your-url" controls playsinline muted></video> — renders as a playable player in the chat
  - **PDFs / CSVs / documents** — clickable download link: Download: [filename.ext](https://your-url)
- If a tool returns multiple assets, embed/link each one separately.
- Do NOT say "it should appear in the attachment strip" or imply the UI will
  automatically show anything for you — always include the actual embed or link.
- Regular web URLs (articles, sources, external links, citations) are fine to
  include in text as normal.`;

// ─── Pure Composer ───────────────────────────────────────────────────────────

const MODE_ADDENDA: Readonly<Record<AgentXMode, string>> = Object.freeze({
  chat: '',
  creator:
    'Mode: Creator. Prefer Brand Coordinator delegation for asset generation. Provide concept + variants when designing.',
  analyzer:
    'Mode: Analyzer. Prefer Performance / Data coordinator delegation. Cite numbers; never invent stats.',
  planner: 'Mode: Planner. Bias toward `plan_and_execute` for any multi-step intent.',
  commander: 'Mode: Commander. Be terse, decisive, action-first. Skip preamble.',
});

/**
 * Compose the final system prompt from a stable identity + dynamic context.
 *
 * The identity block is stable (cacheable). The capability card and user
 * summary change at most every few minutes. Mode addenda are per-run.
 *
 * Order matters for prompt-prefix caching — keep the most stable content
 * first so OpenRouter / Anthropic caching can hit on it.
 */
export function buildSystemPrompt(snapshot: AgentIdentitySnapshot): string {
  const sections: string[] = [snapshot.identity.trim()];

  if (snapshot.capabilityCard && snapshot.capabilityCard.trim().length > 0) {
    sections.push(`# Live Capabilities\n\n${snapshot.capabilityCard.trim()}`);
  }

  if (snapshot.userSummary && snapshot.userSummary.trim().length > 0) {
    sections.push(`# About This User\n\n${snapshot.userSummary.trim()}`);
  }

  if (snapshot.modeAddendum && snapshot.modeAddendum.trim().length > 0) {
    sections.push(snapshot.modeAddendum.trim());
  }

  return sections.join('\n\n');
}

/** Resolve the addendum for a known mode (or empty string). */
export function getModeAddendum(mode: AgentXMode | string | undefined): string {
  if (!mode) return '';
  const known = MODE_ADDENDA[mode as AgentXMode];
  return typeof known === 'string' ? known : '';
}

/**
 * Cheap, deterministic identity hash — used to key OpenRouter prompt caches.
 * The same identity + capability card hash means the same cacheable prefix.
 *
 * Implementation: 32-bit FNV-1a (no crypto dependency, portable).
 */
export function hashIdentitySnapshot(snapshot: AgentIdentitySnapshot): string {
  const payload = [
    snapshot.identity,
    snapshot.capabilityCard ?? '',
    snapshot.userSummary ?? '',
    snapshot.modeAddendum ?? '',
  ].join('\u241F'); // unit separator

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
