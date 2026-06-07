import { describe, expect, it } from 'vitest';
import type { AgentJobPayload } from '@nxt1/core';
import {
  buildAgentJobRetryPayload,
  classifyAgentJobAutoResolveType,
  getAgentJobAutoResolveMaxAttempts,
  shouldAutoRetryAgentJob,
  shouldSendAgentJobCustomerRecoveryEmail,
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

  it('disables automatic retries for OpenRouter insufficient credits', () => {
    expect(getAgentJobAutoResolveMaxAttempts('openrouter_insufficient_credits', 1)).toBe(0);

    expect(
      shouldAutoRetryAgentJob(
        {
          replayPayload: {
            operationId: 'original-operation',
            userId: 'user-1',
            intent: 'Create a graphic',
            sessionId: 'session-1',
            origin: 'user',
            context: {},
          },
        },
        'openrouter_insufficient_credits'
      )
    ).toBe(false);
  });

  it('does not retry jobs that are already platform-sponsored retries', () => {
    expect(
      shouldAutoRetryAgentJob(
        {
          replayPayload: {
            operationId: 'retry-operation',
            userId: 'user-1',
            intent: 'Retry this job',
            sessionId: 'session-1',
            origin: 'user',
            context: {
              platformSponsoredRetry: true,
              rerunOfOperationId: 'original-operation',
            },
          },
        },
        'job_timeout'
      )
    ).toBe(false);

    expect(
      shouldAutoRetryAgentJob(
        {
          replayPayload: {
            operationId: 'original-operation',
            userId: 'user-1',
            intent: 'Retry this job',
            sessionId: 'session-1',
            origin: 'user',
            context: {},
          },
        },
        'job_timeout'
      )
    ).toBe(true);
  });

  it('suppresses customer emails for platform-sponsored retries and onboarding flows', () => {
    expect(
      shouldSendAgentJobCustomerRecoveryEmail({
        origin: 'user',
        replayPayload: {
          operationId: 'retry-op',
          userId: 'user-1',
          intent: 'Retry request',
          sessionId: 'session-1',
          origin: 'user',
          context: {
            platformSponsoredRetry: true,
            rerunOfOperationId: 'original-op',
          },
        },
      })
    ).toBe(false);

    expect(
      shouldSendAgentJobCustomerRecoveryEmail({
        origin: 'user',
        replayPayload: {
          operationId: 'onboarding-op',
          userId: 'user-1',
          intent: 'Sync connected accounts',
          sessionId: 'session-1',
          origin: 'user',
          context: {
            origin: 'onboarding',
            step: 'link-sources',
          },
        },
      })
    ).toBe(false);
  });

  it('suppresses customer emails for connected account resync jobs', () => {
    expect(
      shouldSendAgentJobCustomerRecoveryEmail({
        origin: 'user',
        replayPayload: {
          operationId: 'resync-op',
          userId: 'user-1',
          intent: 'Re-sync all connected accounts',
          sessionId: 'session-1',
          origin: 'user',
          context: {
            source: 'connected_accounts',
            trigger: 'manual_resync',
          },
        },
      })
    ).toBe(false);

    expect(
      shouldSendAgentJobCustomerRecoveryEmail({
        origin: 'user',
        replayPayload: {
          operationId: 'chat-op',
          userId: 'user-1',
          intent: 'Write me an outreach email',
          sessionId: 'session-1',
          origin: 'user',
          context: {},
        },
      })
    ).toBe(true);
  });
});
