/**
 * @fileoverview Shared outbound bounce classification helpers
 * @module @nxt1/backend/services/marketing/lifecycle/outbound-bounce-classifier
 */

const PERMANENT_BOUNCE_PATTERNS = [
  /invalid recipient/i,
  /invalid.+address/i,
  /not a valid email/i,
  /not a valid address/i,
  /recipient address rejected/i,
  /address rejected/i,
  /recipient rejected/i,
  /no such user/i,
  /user unknown/i,
  /unknown user/i,
  /mailbox unavailable/i,
  /does not exist/i,
  /rfc 5321/i,
  /550 5\.1\.1/i,
  /550-5\.1\.1/i,
  /553 5\.1\.3/i,
] as const;

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }

  return String(error ?? '').trim();
}

export function classifyOutboundBounceFailure(error: unknown): {
  readonly isBounce: boolean;
  readonly message: string;
} {
  const message = normalizeErrorMessage(error);

  return {
    isBounce: PERMANENT_BOUNCE_PATTERNS.some((pattern) => pattern.test(message)),
    message,
  };
}
