import { describe, expect, it } from 'vitest';
import type { AgentJobPayload } from '@nxt1/core';
import {
  buildAgentJobRetryPayload,
  classifyAgentJobAutoResolveType,
} from '../agent-job-auto-resolver.service.js';

describe('AgentJobAutoResolverService helpers', () => {
  it('classifies OpenRouter 402 insufficient credits as retryable', () => {
    expect(
      classifyAgentJobAutoResolveType(
        'OpenRouter streaming error 402: Insufficient credits. Please add more credits.'
      )
    ).toBe('openrouter_insufficient_credits');
  });

  it('classifies stale job timeouts as retryable', () => {
    expect(
      classifyAgentJobAutoResolveType('Job timed out — no activity for over 100 minutes')
    ).toBe('job_timeout');
  });

  it('classifies unavailable playbook generation as retryable', () => {
    expect(classifyAgentJobAutoResolveType('AI playbook generation unavailable')).toBe(
      'playbook_generation_unavailable'
    );
  });

  it('does not classify unrelated failures as retryable', () => {
    expect(classifyAgentJobAutoResolveType('User cancelled the operation')).toBeNull();
    expect(classifyAgentJobAutoResolveType('Validation failed: sport is required')).toBeNull();
  });

  it('builds no-charge retry payloads without preserving idempotency keys', () => {
    const replayPayload: AgentJobPayload = {
      operationId: 'original-operation',
      userId: 'user-1',
      intent: 'Create a graphic',
      displayIntent: 'Create a graphic',
      sessionId: 'session-1',
      origin: 'user',
      context: {
        idempotencyKey: 'old-key',
        threadId: 'thread-1',
        skipBilling: false,
      },
    };

    const retryPayload = buildAgentJobRetryPayload({
      replayPayload,
      originalOperationId: replayPayload.operationId,
      autoResolveType: 'openrouter_insufficient_credits',
      attempt: 1,
    });

    expect(retryPayload.operationId).not.toBe(replayPayload.operationId);
    expect(retryPayload.sessionId).not.toBe(replayPayload.sessionId);
    expect(retryPayload.context?.['idempotencyKey']).toBeUndefined();
    expect(retryPayload.context?.['skipBilling']).toBe(true);
    expect(retryPayload.context?.['platformSponsoredRetry']).toBe(true);
    expect(retryPayload.context?.['rerunOfOperationId']).toBe('original-operation');
    expect(retryPayload.context?.['threadId']).toBe('thread-1');
  });
});
