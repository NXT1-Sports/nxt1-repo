/**
 * @fileoverview Smoke tests for the prompt-budget governor.
 * Verifies the degradation ladder fires deterministically in the
 * documented order and ultimately throws when exhausted.
 */

import { describe, expect, it } from 'vitest';
import { PromptBudgetExceededError, PromptBudgetService } from '../prompt-budget.service.js';
import type { LLMMessage } from '../../llm/llm.types.js';

const TINY_CFG = {
  maxPromptTokens: 100,
  maxMessageChars: 4_000,
  maxToolResultChars: 200,
} as const;

function bigContent(chars: number): string {
  return 'x'.repeat(chars);
}

describe('PromptBudgetService', () => {
  const svc = new PromptBudgetService();

  it('returns no-op when prompt is already under budget', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'short' },
      { role: 'user', content: 'hi' },
    ];
    const result = svc.applyBudget(messages, TINY_CFG, 'router');
    expect(result.degradationsApplied).toEqual([]);
    expect(messages).toHaveLength(2);
  });

  it('Step 1: truncates oversized tool observations to 25%', () => {
    const obs = bigContent(2_000);
    const messages: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'thinking', tool_calls: [] },
      { role: 'tool', content: obs, tool_call_id: 't1' },
    ];

    const result = svc.applyBudget(messages, { ...TINY_CFG, maxPromptTokens: 200 }, 'router');

    expect(result.degradationsApplied).toContain('truncate_tool_observations');
    const truncated = messages[3]?.content as string;
    expect(truncated.length).toBeLessThan(obs.length);
    expect(truncated).toContain('[truncated by budget governor]');
  });

  it('Step 2: drops oldest exchanges when truncation alone is insufficient', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'initial intent' },
    ];
    // 40 small turns; tail of 8 stays under a 600-token budget.
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'assistant', content: bigContent(200) });
      messages.push({ role: 'user', content: bigContent(200) });
    }
    const before = messages.length;

    const result = svc.applyBudget(messages, { ...TINY_CFG, maxPromptTokens: 600 }, 'router');

    expect(result.degradationsApplied).toContain('drop_oldest_exchanges');
    expect(messages.length).toBeLessThan(before);
    // System + initial user message must be preserved.
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.content).toBe('initial intent');
  });

  it('Step 3: injects [Earlier in this thread] placeholder when ladder is exhausted', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'initial intent' },
    ];
    // Build a prompt that will fail every step — but verify the placeholder
    // is inserted before the error is thrown.
    for (let i = 0; i < 30; i++) {
      messages.push({ role: 'assistant', content: bigContent(2_000) });
    }

    expect(() =>
      svc.applyBudget(messages, { ...TINY_CFG, maxPromptTokens: 200 }, 'router')
    ).toThrow(PromptBudgetExceededError);

    // Placeholder MUST have been spliced in before the throw.
    const placeholder = messages.find(
      (m) =>
        m.role === 'system' &&
        typeof m.content === 'string' &&
        m.content.startsWith('[Earlier in this thread]')
    );
    expect(placeholder).toBeDefined();
  });

  it('Step 4: throws PromptBudgetExceededError when ladder is exhausted', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: bigContent(100_000) },
      { role: 'user', content: bigContent(100_000) },
    ];

    expect(() => svc.applyBudget(messages, TINY_CFG, 'router')).toThrow(PromptBudgetExceededError);
  });

  it('estimateTokens is roughly chars/4 + 4 overhead', () => {
    const messages: LLMMessage[] = [{ role: 'user', content: bigContent(400) }];
    const est = svc.estimateTokens(messages);
    // 400/4 = 100, +4 overhead = 104. Allow ±5 for rounding.
    expect(est).toBeGreaterThanOrEqual(99);
    expect(est).toBeLessThanOrEqual(110);
  });
});
