/**
 * @fileoverview Thread replay budget selection.
 *
 * Video analysis jobs send the source media separately through tool inputs, so
 * replaying a large historical thread mostly consumes model context without
 * helping the media model. Keep media turns focused on recent attachment
 * context while leaving ordinary chat/research turns unchanged.
 */

const DEFAULT_THREAD_REPLAY_MAX_TOKENS = 50_000;
const MEDIA_THREAD_REPLAY_MAX_TOKENS = 8_000;

const MEDIA_CONTEXT_PATTERN =
  /\b(attached video|video attachment|videoattachments?|cloudflarevideoid|analyze_video|game film|film analysis|highlight reel|highlight video|uploaded video|source video|clip|footage)\b/i;

export interface ThreadReplayBudgetInput {
  readonly intent?: string;
  readonly videoAttachments?: readonly unknown[];
}

export function resolveThreadReplayMaxTokens(input: ThreadReplayBudgetInput): number {
  if (input.videoAttachments && input.videoAttachments.length > 0) {
    return MEDIA_THREAD_REPLAY_MAX_TOKENS;
  }

  if (input.intent && MEDIA_CONTEXT_PATTERN.test(input.intent)) {
    return MEDIA_THREAD_REPLAY_MAX_TOKENS;
  }

  return DEFAULT_THREAD_REPLAY_MAX_TOKENS;
}

export const THREAD_REPLAY_BUDGETS = {
  defaultMaxTokens: DEFAULT_THREAD_REPLAY_MAX_TOKENS,
  mediaMaxTokens: MEDIA_THREAD_REPLAY_MAX_TOKENS,
} as const;
