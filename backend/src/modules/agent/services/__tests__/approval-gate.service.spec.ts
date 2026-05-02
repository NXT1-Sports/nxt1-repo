import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalGateService } from '../approval-gate.service.js';

const { dispatchAgentPushMock } = vi.hoisted(() => ({
  dispatchAgentPushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../agent-push-adapter.service.js', () => ({
  dispatchAgentPush: dispatchAgentPushMock,
}));

describe('approval-gate.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires approval for destructive intel tools', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('delete_timeline_post', {
      postId: 'post-123',
    });

    expect(requirement).not.toBeNull();
    expect(requirement?.policy.toolName).toBe('delete_timeline_post');
    expect(requirement?.policy.riskLevel).toBe('critical');
    expect(requirement?.actionSummary).toContain('Delete timeline post');
  });

  it('requires approval for workspace mutation tools', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('run_google_workspace_tool', {
      tool: 'docs_append_text',
    });

    expect(requirement).not.toBeNull();
    expect(requirement?.policy.toolName).toBe('run_google_workspace_tool');
    expect(requirement?.policy.riskLevel).toBe('high');
    expect(requirement?.actionSummary).toContain('Google Workspace action');
  });

  it('stamps a Firestore TTL timestamp when creating approval requests', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const collection = vi.fn(() => ({ doc }));
    const db = {
      collection,
    } as unknown as Firestore;

    const service = new ApprovalGateService(db);

    const request = await service.requestApproval({
      operationId: 'op-1',
      taskId: 'inline_chat',
      userId: 'user-1',
      threadId: 'thread-1',
      toolName: 'send_email',
      toolInput: {
        userId: 'user-1',
        to: 'coach@example.com',
        toEmail: 'coach@example.com',
        subject: 'Thanks coach',
        body: '<p>Thank you</p>',
      },
      actionSummary: 'Send a thank you email.',
      reasoning: 'The user asked to send an email.',
    });

    expect(request.status).toBe('pending');
    expect(set).toHaveBeenCalledTimes(1);

    const persisted = vi.mocked(set).mock.calls[0]?.[0] as
      | ({
          expiresAt?: { _seconds?: number };
          toolInput?: Record<string, unknown>;
        } & Record<string, unknown>)
      | undefined;

    expect(persisted).toBeDefined();
    expect(persisted?.toolInput).toEqual({
      userId: 'user-1',
      toEmail: 'coach@example.com',
      subject: 'Thanks coach',
      bodyHtml: '<p>Thank you</p>',
    });

    const expiresAt = persisted?.expiresAt;
    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?._seconds).toBe('number');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const retentionSeconds = 30 * 24 * 60 * 60;
    expect(expiresAt!._seconds).toBeGreaterThan(nowSeconds + retentionSeconds - 60);
    expect(expiresAt!._seconds).toBeLessThan(nowSeconds + retentionSeconds + 60);
  });
});
