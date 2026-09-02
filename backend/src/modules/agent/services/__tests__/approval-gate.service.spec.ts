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

  it('requires approval for email tools', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('send_email', {
      toEmail: 'coach@example.com',
      subject: 'Thanks coach',
    });

    expect(requirement).not.toBeNull();
    expect(requirement?.policy.toolName).toBe('send_email');
    expect(requirement?.policy.riskLevel).toBe('high');
    expect(requirement?.actionSummary).toContain('Send an email');
  });

  it('requires approval for Microsoft 365 mail mutations', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('run_microsoft_365_tool', {
      toolName: 'send-mail',
      arguments: {
        to: ['coach1@example.com', 'coach2@example.com'],
        subject: 'Recruiting update',
      },
    });

    expect(requirement).not.toBeNull();
    expect(requirement?.policy.toolName).toBe('run_microsoft_365_tool');
    expect(requirement?.policy.sessionTrustGroup).toBe('email');
    expect(requirement?.actionSummary).toContain('Send 2 Outlook emails');
    expect(requirement?.actionSummary).toContain('Recruiting update');
  });

  it('does not require approval for non-mail Microsoft 365 mutations', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('run_microsoft_365_tool', {
      toolName: 'create-event',
      arguments: {
        subject: 'Team meeting',
      },
    });

    expect(requirement).toBeNull();
  });

  it('does not require approval for non-email tools', () => {
    const service = new ApprovalGateService({} as Firestore);

    const requirement = service.getApprovalRequirement('write_core_identity', {
      userId: 'user-1',
    });

    expect(requirement).toBeNull();
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

  it('persists normalized email attachments in approval requests', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ set }));
    const collection = vi.fn(() => ({ doc }));
    const db = { collection } as unknown as Firestore;
    const service = new ApprovalGateService(db);

    const request = await service.requestApproval({
      operationId: 'op-1',
      taskId: 'inline_chat',
      userId: 'user-1',
      threadId: 'thread-1',
      toolName: 'send_email',
      toolInput: {
        userId: 'user-1',
        toEmail: 'coach@example.com',
        subject: 'Report',
        bodyHtml: '<p>Attached.</p>',
        attachments: [
          {
            id: 'attachment-1',
            name: 'Scout Report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: '12',
            storagePath: 'Users/user-1/threads/thread-1/uploads/scout-report.pdf',
            extraIgnoredField: 'ignored',
          },
        ],
      },
      actionSummary: 'Send report.',
    });

    expect(request.toolInput['attachments']).toEqual([
      {
        id: 'attachment-1',
        name: 'Scout Report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12,
        storagePath: 'Users/user-1/threads/thread-1/uploads/scout-report.pdf',
      },
    ]);
  });

  it('requires approved email attachments to match on resume', async () => {
    const approvedInput = {
      userId: 'user-1',
      toEmail: 'coach@example.com',
      subject: 'Report',
      bodyHtml: '<p>Attached.</p>',
      attachments: [
        {
          name: 'Scout Report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
          storagePath: 'Users/user-1/threads/thread-1/uploads/scout-report.pdf',
        },
      ],
    };
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'approval-1',
        operationId: 'op-1',
        taskId: 'inline_chat',
        userId: 'user-1',
        actionSummary: 'Send report.',
        reasonCode: 'send_email',
        toolName: 'send_email',
        toolInput: approvedInput,
        status: 'approved',
        createdAt: new Date().toISOString(),
        expiresInMs: 86_400_000,
      }),
    });
    const doc = vi.fn(() => ({ get }));
    const collection = vi.fn(() => ({ doc }));
    const service = new ApprovalGateService({ collection } as unknown as Firestore);

    await expect(
      service.isApprovalGranted('approval-1', 'user-1', 'send_email', approvedInput)
    ).resolves.toBe(true);

    await expect(
      service.isApprovalGranted('approval-1', 'user-1', 'send_email', {
        ...approvedInput,
        attachments: [
          {
            name: 'Different.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12,
            storagePath: 'Users/user-1/threads/thread-1/uploads/different.pdf',
          },
        ],
      })
    ).resolves.toBe(false);
  });
});
