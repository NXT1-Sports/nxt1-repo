import { describe, expect, it } from 'vitest';
import { toDispatchInput } from '../agent-push-adapter.service.js';

describe('agent-push-adapter.service', () => {
  it('maps task completed intent to unified agent action payload', () => {
    const payload = toDispatchInput({
      kind: 'agent_task_completed',
      userId: 'user-1',
      operationId: 'op-1',
      sessionId: 'session-1',
      threadId: 'thread-1',
      agentId: 'strategy_coordinator',
      title: 'Done',
      body: 'Task completed',
      imageUrl: 'https://cdn.example.com/image.jpg',
    });

    expect(payload.type).toBe('agent_action');
    expect(payload.deepLink).toBe('/agent-x?thread=thread-1');
    expect(payload.data).toMatchObject({
      sessionId: 'session-1',
      operationId: 'op-1',
      entityId: 'op-1',
      threadId: 'thread-1',
      imageUrl: 'https://cdn.example.com/image.jpg',
    });
    expect(payload.mediaType).toBe('image');
    expect(payload.idempotencyKey).toBe('agent_task_completed_op-1');
  });

  it('maps briefing ready intent to a deterministic per-user daily agent action payload', () => {
    const payload = toDispatchInput({
      kind: 'agent_briefing_ready',
      userId: 'user-1',
      operationId: 'briefing-op-1',
      title: 'Daily Briefing Ready',
      body: 'Your morning briefing is ready.',
      briefingDate: '2026-06-09T15:00:00.000Z',
    });

    expect(payload.type).toBe('agent_action');
    expect(payload.data).toMatchObject({
      operationId: 'briefing-op-1',
      entityId: 'briefing_2026-06-09',
      briefingDate: '2026-06-09',
    });
    expect(payload.idempotencyKey).toBe('agent_briefing_ready_user-1_2026-06-09');
  });

  it('dedupes repeated briefing ready intents for the same user and day', () => {
    const firstPayload = toDispatchInput({
      kind: 'agent_briefing_ready',
      userId: 'user-1',
      operationId: 'briefing-op-1',
      title: 'Daily Briefing Ready',
      body: 'First briefing copy.',
      briefingDate: '2026-06-09T15:00:00.000Z',
    });
    const retryPayload = toDispatchInput({
      kind: 'agent_briefing_ready',
      userId: 'user-1',
      operationId: 'briefing-op-2',
      title: 'Daily Briefing Ready',
      body: 'Updated briefing copy.',
      briefingDate: '2026-06-09T15:01:00.000Z',
    });

    expect(retryPayload.idempotencyKey).toBe(firstPayload.idempotencyKey);
  });

  it('maps needs approval intent to high-priority dynamic alert payload', () => {
    const payload = toDispatchInput({
      kind: 'agent_needs_approval',
      userId: 'user-1',
      operationId: 'op-1',
      approvalId: 'approval-1',
      reason: 'needs_approval',
      title: 'Approval needed',
      body: 'Please approve this action',
      toolName: 'send_email',
    });

    expect(payload.type).toBe('dynamic_agent_alert');
    expect(payload.priority).toBe('high');
    expect(payload.data).toMatchObject({
      approvalId: 'approval-1',
      operationId: 'op-1',
      reason: 'needs_approval',
      toolName: 'send_email',
      entityId: 'approval-1',
    });
  });

  it('maps scheduled execution completed intent with deterministic idempotency key', () => {
    const payload = toDispatchInput({
      kind: 'agent_scheduled_execution_completed',
      userId: 'user-1',
      operationId: 'recurring-op-1',
      scheduleId: 'repeat:abc123',
      runId: 'repeat:abc123:1711111111111',
      title: 'Scheduled Agent Task Complete',
      body: 'Finished recurring run',
    });

    expect(payload.type).toBe('agent_action');
    expect(payload.idempotencyKey).toBe('sched_c_repeat_abc123_1711111111111');
    expect(payload.data).toMatchObject({
      scheduleId: 'repeat:abc123',
      runId: 'repeat:abc123:1711111111111',
      scheduledExecutionStatus: 'completed',
      entityId: 'repeat:abc123:1711111111111',
    });
  });

  it('maps scheduled execution failed intent to thread deep link and run-based idempotency key', () => {
    const payload = toDispatchInput({
      kind: 'agent_scheduled_execution_failed',
      userId: 'user-1',
      operationId: 'recurring-op-1',
      scheduleId: 'repeat:abc123',
      runId: 'repeat:abc123:1711111111111',
      threadId: 'thread-99',
      title: 'Scheduled Agent Task Failed',
      body: 'Run failed',
      errorMessage: 'Tool error',
    });

    expect(payload.deepLink).toBe('/agent-x?thread=thread-99');
    expect(payload.idempotencyKey).toBe('sched_f_repeat_abc123_1711111111111');
    expect(payload.data).toMatchObject({
      scheduleId: 'repeat:abc123',
      runId: 'repeat:abc123:1711111111111',
      scheduledExecutionStatus: 'failed',
      failed: 'true',
      entityId: 'repeat:abc123:1711111111111',
    });
  });

  it('throws for scheduled execution failure intent missing runId', () => {
    expect(() =>
      toDispatchInput({
        kind: 'agent_scheduled_execution_failed',
        userId: 'user-1',
        operationId: 'recurring-op-1',
        scheduleId: 'repeat:abc123',
        runId: '',
        title: 'Scheduled Agent Task Failed',
        body: 'Run failed',
        errorMessage: 'Tool error',
      })
    ).toThrow('runId is required');
  });
});
