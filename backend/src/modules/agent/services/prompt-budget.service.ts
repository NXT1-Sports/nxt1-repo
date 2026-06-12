/**
 * @fileoverview Prompt Budget Governor — Per-Turn Token Ceiling Enforcement
 * @module @nxt1/backend/modules/agent/services/prompt-budget.service
 *
 * Bounds the size of any single LLM prompt. Does NOT bound total operation
 * work — long jobs still run to completion. This guards against silent
 * model-side context-window overflows by trimming oversized observations
 * and oldest assistant/tool exchange pairs before each LLM call.
 *
 * Degradation order (deterministic, applied in sequence until under budget):
 *   1. Truncate oldest tool-result observations to 25% of their length.
 *   2. Truncate oversized non-system messages.
 *   3. Drop oldest exchanges (kept verbatim window unchanged).
 *   4. Inject a single `[Earlier in this thread]` system note placeholder
 *      summarising the dropped content (caller may overwrite with a real
 *      LLM-generated summary via {@link ThreadHistorySummarizerService}).
 *   5. Throw `PROMPT_BUDGET_EXCEEDED` — surfaces to the user as
 *      "this conversation has grown too large; start a new thread".
 *
 * Token estimate: char-count / 4 + 4 per message (rough Anthropic/OpenAI
 * average for English mixed with JSON). Cheaper than running a real
 * tokeniser on every turn and accurate to within ~10%, which is fine for
 * a guard that only fires near the ceiling.
 */

import type { LLMMessage } from '../llm/llm.types.js';
import { logger } from '../../../utils/logger.js';

const TRUNCATE_OBSERVATION_RATIO = 0.25;
const TRUNCATE_MARKER = '\n…[truncated by budget governor]';
const SUMMARY_PLACEHOLDER_PREFIX = '[Earlier in this thread]';

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = '\n...[middle truncated by budget governor]...\n';
  if (maxChars <= marker.length + 200) {
    return text.slice(0, Math.max(0, maxChars - TRUNCATE_MARKER.length)) + TRUNCATE_MARKER;
  }
  const headChars = Math.floor((maxChars - marker.length) * 0.65);
  const tailChars = maxChars - marker.length - headChars;
  return `${text.slice(0, headChars)}${marker}${text.slice(-tailChars)}`;
}

export interface PromptBudgetConfig {
  readonly maxPromptTokens: number;
  readonly maxMessageChars: number;
  readonly maxToolResultChars: number;
}

export class PromptBudgetExceededError extends Error {
  readonly code = 'PROMPT_BUDGET_EXCEEDED';
  constructor(estimatedTokens: number, ceiling: number) {
    super(
      `Prompt size (${estimatedTokens.toLocaleString()} est. tokens) exceeds ceiling ` +
        `(${ceiling.toLocaleString()}) even after degradation. ` +
        'Start a new thread to continue.'
    );
    this.name = 'PromptBudgetExceededError';
  }
}

export class PromptBudgetService {
  /**
   * Rough token estimate for a single message: 4 chars/token + 4-token
   * overhead for role/structure framing.
   */
  estimateTokens(messages: readonly LLMMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      const content =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      total += Math.ceil(content.length / 4) + 4;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        total += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
      }
    }
    return total;
  }

  /**
   * Apply the degradation ladder until the prompt fits under
   * `cfg.maxPromptTokens`. The first message (system) is never trimmed;
   * the second message (initial user intent) is preserved when possible.
   *
   * Mutates the array in place by replacing entries (LLMMessage fields
   * themselves are readonly, so individual messages are rebuilt rather
   * than mutated).
   *
   * @returns Metadata about what was trimmed for telemetry.
   * @throws PromptBudgetExceededError if all degradation steps fail.
   */
  applyBudget(
    messages: LLMMessage[],
    cfg: PromptBudgetConfig,
    agentId: string,
    operationId?: string
  ): {
    readonly degradationsApplied: readonly string[];
    readonly tokensBefore: number;
    readonly tokensAfter: number;
  } {
    const degradationsApplied: string[] = [];
    const tokensBefore = this.estimateTokens(messages);

    if (tokensBefore <= cfg.maxPromptTokens) {
      return { degradationsApplied, tokensBefore, tokensAfter: tokensBefore };
    }

    // Step 1a (Phase O — thread-as-truth): drop oldest mid-thread tool
    // result rows that are *very* large (>2000 chars) but stale. With
    // canonical replay, every persisted tool observation is in the
    // prompt every turn — old recruiting-style search results (lists of
    // 20 coaches, full email drafts) accumulate fast. Drop them BEFORE
    // truncating fresh observations so the most recent tool results
    // stay full-fidelity. Preserves the assistant.tool_calls turn that
    // owns each dropped row by clearing its tool_calls entry too,
    // keeping the messages array structurally valid.
    const STALE_TOOL_CHAR_THRESHOLD = 2000;
    // Don't touch the last 6 messages — keep recent ReAct turn intact.
    const STALE_HORIZON = Math.max(2, messages.length - 6);
    const droppedToolCallIds = new Set<string>();
    for (let i = 2; i < STALE_HORIZON; i++) {
      const msg = messages[i];
      if (!msg) continue;
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        if (msg.content.length > STALE_TOOL_CHAR_THRESHOLD) {
          if (msg.tool_call_id) droppedToolCallIds.add(msg.tool_call_id);
          messages[i] = {
            role: 'tool',
            content: '[earlier tool result dropped by budget governor]',
            tool_call_id: msg.tool_call_id,
          } as LLMMessage;
          if (!degradationsApplied.includes('drop_stale_tool_results')) {
            degradationsApplied.push('drop_stale_tool_results');
          }
        }
      }
    }
    if (degradationsApplied.includes('drop_stale_tool_results')) {
      const after = this.estimateTokens(messages);
      logger.info('[PromptBudget] step 1a: dropped stale tool results', {
        agentId,
        operationId,
        droppedCount: droppedToolCallIds.size,
        tokensBefore,
        tokensAfter: after,
      });
      if (after <= cfg.maxPromptTokens) {
        return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
      }
    }

    // Step 1 — Truncate oversized tool observations to 25%.
    let truncatedAny = false;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
      if (msg.content.length <= cfg.maxToolResultChars) continue;
      const target = Math.floor(msg.content.length * TRUNCATE_OBSERVATION_RATIO);
      messages[i] = { ...msg, content: msg.content.slice(0, target) + TRUNCATE_MARKER };
      truncatedAny = true;
    }
    if (truncatedAny) degradationsApplied.push('truncate_tool_observations');
    if (this.estimateTokens(messages) <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 2 — Truncate oversized non-system messages. Thread-as-truth prompts
    // are shaped as [system, ...history, current user], so the current request
    // is often the final user message rather than messages[1]. Preserve both
    // the start and end of long user messages so attachment refs appended near
    // the bottom survive.
    let truncatedLargeMessages = false;
    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.role === 'tool') continue;
      if (typeof msg.content === 'string' && msg.content.length > cfg.maxMessageChars) {
        messages[i] = { ...msg, content: truncateMiddle(msg.content, cfg.maxMessageChars) };
        truncatedLargeMessages = true;
      }
    }
    if (truncatedLargeMessages) degradationsApplied.push('truncate_large_messages');
    if (this.estimateTokens(messages) <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 3 — Drop oldest exchanges. Keep system + last 8 messages (~3-4 last
    // exchanges) at minimum. Do not pin messages[1]: with canonical replay,
    // that is usually old thread history, not the current user request.
    if (messages.length > 4) {
      const KEEP_TAIL = 8;
      const system = messages.slice(0, 1);
      const tail = messages.slice(-KEEP_TAIL);
      messages.length = 0;
      messages.push(...system, ...tail);
      degradationsApplied.push('drop_oldest_exchanges');
    }
    if (this.estimateTokens(messages) <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 4 — Inject placeholder summary note. Caller may overwrite this
    // with a real LLM-generated summary via ThreadHistorySummarizerService.
    const hasSummary = messages.some(
      (m) =>
        m.role === 'system' &&
        typeof m.content === 'string' &&
        m.content.startsWith(SUMMARY_PLACEHOLDER_PREFIX)
    );
    if (!hasSummary) {
      messages.splice(1, 0, {
        role: 'system',
        content: `${SUMMARY_PLACEHOLDER_PREFIX} the conversation has been heavily compressed. Continue with the most recent context.`,
      });
      degradationsApplied.push('inject_summary_placeholder');
    }

    const tokensAfter = this.estimateTokens(messages);
    if (tokensAfter <= cfg.maxPromptTokens) {
      return this.report(degradationsApplied, tokensBefore, messages, agentId, operationId);
    }

    // Step 4 — Give up.
    logger.error('[PromptBudget] Degradation ladder exhausted', {
      agentId,
      operationId,
      tokensBefore,
      tokensAfter,
      ceiling: cfg.maxPromptTokens,
      degradationsApplied,
    });
    throw new PromptBudgetExceededError(tokensAfter, cfg.maxPromptTokens);
  }

  private report(
    degradations: readonly string[],
    tokensBefore: number,
    messages: readonly LLMMessage[],
    agentId: string,
    operationId?: string
  ): { degradationsApplied: readonly string[]; tokensBefore: number; tokensAfter: number } {
    const tokensAfter = this.estimateTokens(messages);
    if (degradations.length > 0) {
      logger.info('[PromptBudget] Degradation applied', {
        agentId,
        operationId,
        tokensBefore,
        tokensAfter,
        degradations,
      });
    }
    return { degradationsApplied: degradations, tokensBefore, tokensAfter };
  }
}

let _instance: PromptBudgetService | null = null;
export function getPromptBudgetService(): PromptBudgetService {
  if (!_instance) _instance = new PromptBudgetService();
  return _instance;
}
