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

export type AgentXMode = 'chat' | 'creator' | 'analyzer' | 'recruiter' | 'planner' | 'commander';

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
): Array<{ url: string; name: string; type: 'image' | 'video' | 'doc' | 'app' }> {
  const attachments: Array<{ url: string; name: string; type: 'image' | 'video' | 'doc' | 'app' }> =
    [];
  const seen = new Set<string>();

  const addAttachment = (
    url: string | undefined,
    name: string,
    type: 'image' | 'video' | 'doc' | 'app'
  ): void => {
    if (!url || typeof url !== 'string') return;
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    attachments.push({ url: normalized, name, type });
  };

  // Scalar fields: imageUrl, videoUrl, outputUrl
  addAttachment(
    typeof resultData['imageUrl'] === 'string' ? resultData['imageUrl'] : undefined,
    'image.jpg',
    'image'
  );
  addAttachment(
    typeof resultData['videoUrl'] === 'string' ? resultData['videoUrl'] : undefined,
    'video.mp4',
    'video'
  );
  addAttachment(
    typeof resultData['outputUrl'] === 'string' ? resultData['outputUrl'] : undefined,
    'video.mp4',
    'video'
  );

  // Array fields: imageUrls, videoUrls
  if (Array.isArray(resultData['imageUrls'])) {
    (resultData['imageUrls'] as unknown[]).forEach((url, idx) => {
      addAttachment(typeof url === 'string' ? url : undefined, `image-${idx}.jpg`, 'image');
    });
  }
  if (Array.isArray(resultData['videoUrls'])) {
    (resultData['videoUrls'] as unknown[]).forEach((url, idx) => {
      addAttachment(typeof url === 'string' ? url : undefined, `video-${idx}.mp4`, 'video');
    });
  }

  // files[] array: map each item's url/name/mimeType
  if (Array.isArray(resultData['files'])) {
    (resultData['files'] as unknown[]).forEach((file, idx) => {
      if (!file || typeof file !== 'object') return;
      const obj = file as Record<string, unknown>;
      const url =
        typeof obj['url'] === 'string'
          ? obj['url']
          : typeof obj['downloadUrl'] === 'string'
            ? obj['downloadUrl']
            : undefined;
      const name = typeof obj['name'] === 'string' ? obj['name'] : `file-${idx}`;
      const mimeType = typeof obj['mimeType'] === 'string' ? obj['mimeType'] : '';
      const type = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'doc';
      addAttachment(url, name, type);
    });
  }

  // persistedMediaUrls[] array: map each as media
  if (Array.isArray(resultData['persistedMediaUrls'])) {
    (resultData['persistedMediaUrls'] as unknown[]).forEach((url, idx) => {
      if (typeof url !== 'string') return;
      const type = url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'video';
      const name = type === 'image' ? `media-${idx}.jpg` : `media-${idx}.mp4`;
      addAttachment(url, name, type);
    });
  }

  return attachments;
}

/**
 * Strip storage artifact URLs from LLM response text.
 * Removes raw storage URLs matching known patterns: Firebase Storage,
 * Google Cloud Storage, S3, CDN download links. Preserves regular web URLs.
 */
export interface SanitizeStorageUrlsOptions {
  readonly normalizeWhitespace?: boolean;
}

export function sanitizeStorageUrlsFromText(
  content: string,
  options: SanitizeStorageUrlsOptions = {}
): string {
  const { normalizeWhitespace = true } = options;

  // Storage URL patterns to strip
  const storagePatterns = [
    /https:\/\/firebasestorage\.googleapis\.com\/[^\s)\]]+/gi,
    /https:\/\/storage\.googleapis\.com\/[^\s)\]]+/gi,
    /https:\/\/[^\s)\]]+\.s3(?:\.\w+-\w+-\d)?(?:\.amazonaws\.com)?\/[^\s)\]]+/gi,
    /https:\/\/[^\s)\]]+\.cloudfront\.net\/[^\s)\]]+\.(?:jpg|jpeg|png|gif|mp4|mov|webm|pdf|csv|xlsx?|docx?)/gi,
    /https:\/\/firebasestorage\.googleapis\.com\/[^\s)\]]+(\?[^\s)\]]*)?\btokentoken=/gi,
  ];

  let sanitized = content;
  for (const pattern of storagePatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

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

- When a tool produces a downloadable file — an image, video, PDF, CSV, spreadsheet,
  or any generated asset — NEVER paste the raw storage URL into your text response.
- Confirm the result with a plain description only. Examples:
  - "Done! Your graphic is ready."
  - "I've exported the data as a CSV." 
  - "Video has been trimmed and is ready for download."
- The download link will be displayed automatically in the UI attachment strip.
- Regular web URLs (articles, sources, external links, citations) are fine to
  include in text as normal.`;

// ─── Pure Composer ───────────────────────────────────────────────────────────

const MODE_ADDENDA: Readonly<Record<AgentXMode, string>> = Object.freeze({
  chat: '',
  creator:
    'Mode: Creator. Prefer Brand Coordinator delegation for asset generation. Provide concept + variants when designing.',
  analyzer:
    'Mode: Analyzer. Prefer Performance / Data coordinator delegation. Cite numbers; never invent stats.',
  recruiter:
    'Mode: Recruiter. Prefer Recruiting Coordinator delegation. Always confirm before sending outbound communication.',
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
