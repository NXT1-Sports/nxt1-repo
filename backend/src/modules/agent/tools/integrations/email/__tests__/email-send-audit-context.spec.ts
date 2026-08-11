import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';

const {
  sendEmailViaProviderMock,
  resolveConnectedEmailProviderMock,
  resolveProviderEmailAttachmentsMock,
} = vi.hoisted(() => ({
  sendEmailViaProviderMock: vi.fn(),
  resolveConnectedEmailProviderMock: vi.fn(),
  resolveProviderEmailAttachmentsMock: vi.fn(),
}));

vi.mock('../../../../../../services/communications/connected-mail.service.js', () => ({
  sendEmailViaProvider: sendEmailViaProviderMock,
}));

vi.mock('../email-tool.utils.js', async () => {
  const actual =
    await vi.importActual<typeof import('../email-tool.utils.js')>('../email-tool.utils.js');
  return {
    ...actual,
    resolveConnectedEmailProvider: resolveConnectedEmailProviderMock,
  };
});

vi.mock('../email-attachment-resolver.js', async () => {
  const actual = await vi.importActual<typeof import('../email-attachment-resolver.js')>(
    '../email-attachment-resolver.js'
  );
  return {
    ...actual,
    resolveProviderEmailAttachments: resolveProviderEmailAttachmentsMock,
  };
});

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { SendEmailTool } from '../send-email.tool.js';
import { BatchSendEmailTool } from '../batch-send-email.tool.js';

function createContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    userId: 'user-123',
    environment: 'staging',
    sessionId: 'session-123',
    threadId: 'thread-123',
    operationId: 'op-123',
    approvalId: 'approval-123',
    ...overrides,
  };
}

describe('agent email tool audit context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConnectedEmailProviderMock.mockResolvedValue('gmail');
    resolveProviderEmailAttachmentsMock.mockResolvedValue([]);
    sendEmailViaProviderMock.mockResolvedValue({
      success: true,
      externalMessageId: 'message-123',
      externalThreadId: 'thread-ext-123',
      trackingId: 'tracking-123',
    });
  });

  it('passes approval metadata through send_email', async () => {
    const tool = new SendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        toEmail: 'coach@example.com',
        subject: 'Subject',
        bodyHtml: '<p>Hello coach</p>',
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Subject',
      '<p>Hello coach</p>',
      expect.anything(),
      expect.objectContaining({
        auditContext: {
          toolName: 'send_email',
          approvalId: 'approval-123',
          operationId: 'op-123',
          threadId: 'thread-123',
          sessionId: 'session-123',
        },
      })
    );
  });

  it('passes resolved attachments through send_email', async () => {
    const tool = new SendEmailTool({} as never);
    const providerAttachments = [
      {
        filename: 'scout-report.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('pdf'),
        sizeBytes: 3,
      },
    ];
    resolveProviderEmailAttachmentsMock.mockResolvedValueOnce(providerAttachments);

    const result = await tool.execute(
      {
        userId: 'user-123',
        toEmail: 'coach@example.com',
        subject: 'Subject',
        bodyHtml: '<p>Hello coach</p>',
        attachments: [
          {
            id: 'attachment-1',
            name: 'scout-report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 3,
            storagePath: 'Users/user-123/threads/thread-123/uploads/scout-report.pdf',
          },
        ],
      },
      createContext({ environment: 'staging' })
    );

    expect(result.success).toBe(true);
    expect(resolveProviderEmailAttachmentsMock).toHaveBeenCalledWith({
      userId: 'user-123',
      attachments: [
        {
          id: 'attachment-1',
          name: 'scout-report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 3,
          storagePath: 'Users/user-123/threads/thread-123/uploads/scout-report.pdf',
        },
      ],
      environment: 'staging',
    });
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Subject',
      '<p>Hello coach</p>',
      expect.anything(),
      expect.objectContaining({ attachments: providerAttachments })
    );
  });

  it('strips Agent X attachment labels from send_email body before provider send', async () => {
    const tool = new SendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        toEmail: 'coach@example.com',
        subject: 'Subject',
        bodyHtml:
          '<p>Hello coach,</p><p>[Attached document (already visible to user — do not re-embed): https://storage.example.com/report.pdf | name: Report.pdf | mimeType: application/pdf | storagePath: Users/user-123/report.pdf]</p><p>Best,</p>',
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Subject',
      '<p>Hello coach,</p><p>Best,</p>',
      expect.anything(),
      expect.anything()
    );
  });

  it('rejects send_email when tool input userId does not match context user', async () => {
    const tool = new SendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'other-user',
        toEmail: 'coach@example.com',
        subject: 'Subject',
        bodyHtml: '<p>Hello coach</p>',
      },
      createContext({ userId: 'user-123' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('authenticated session');
    expect(resolveConnectedEmailProviderMock).not.toHaveBeenCalled();
    expect(sendEmailViaProviderMock).not.toHaveBeenCalled();
  });

  it('passes approval metadata through batch_send_email', async () => {
    const tool = new BatchSendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        recipients: [
          {
            toEmail: 'coach@example.com',
            variables: { firstName: 'Alex' },
          },
        ],
        subjectTemplate: 'Hello {{firstName}}',
        bodyHtmlTemplate: '<p>Hello {{firstName}}</p>',
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Hello Alex',
      '<p>Hello Alex</p>',
      expect.anything(),
      expect.objectContaining({
        auditContext: {
          toolName: 'batch_send_email',
          approvalId: 'approval-123',
          operationId: 'op-123',
          threadId: 'thread-123',
          sessionId: 'session-123',
        },
      })
    );
  });

  it('passes resolved attachments through batch_send_email', async () => {
    const tool = new BatchSendEmailTool({} as never);
    const providerAttachments = [
      {
        filename: 'intro-card.png',
        contentType: 'image/png',
        contentBytes: Buffer.from('png'),
        sizeBytes: 3,
      },
    ];
    resolveProviderEmailAttachmentsMock.mockResolvedValueOnce(providerAttachments);

    const result = await tool.execute(
      {
        userId: 'user-123',
        recipients: [{ toEmail: 'coach@example.com', variables: { firstName: 'Alex' } }],
        subjectTemplate: 'Hello {{firstName}}',
        bodyHtmlTemplate: '<p>Hello {{firstName}}</p>',
        attachments: [
          {
            name: 'intro-card.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            storagePath: 'Users/user-123/threads/thread-123/uploads/intro-card.png',
          },
        ],
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Hello Alex',
      '<p>Hello Alex</p>',
      expect.anything(),
      expect.objectContaining({ attachments: providerAttachments })
    );
  });

  it('strips Agent X attachment labels from batch_send_email body before provider send', async () => {
    const tool = new BatchSendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        recipients: [{ toEmail: 'coach@example.com', variables: { firstName: 'Alex' } }],
        subjectTemplate: 'Hello {{firstName}}',
        bodyHtmlTemplate:
          '<p>Hello {{firstName}}</p><p>[Attached file (already visible to user — do not re-embed): Report.pdf — https://storage.example.com/report.pdf]</p><p>Best</p>',
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-123',
      'gmail',
      'coach@example.com',
      'Hello Alex',
      '<p>Hello Alex</p><p>Best</p>',
      expect.anything(),
      expect.anything()
    );
  });

  it('rejects batch_send_email when tool input userId does not match context user', async () => {
    const tool = new BatchSendEmailTool({} as never);

    const result = await tool.execute(
      {
        userId: 'other-user',
        recipients: [{ toEmail: 'coach@example.com', variables: { firstName: 'Alex' } }],
        subjectTemplate: 'Hello {{firstName}}',
        bodyHtmlTemplate: '<p>Hello {{firstName}}</p>',
      },
      createContext({ userId: 'user-123' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('authenticated session');
    expect(resolveConnectedEmailProviderMock).not.toHaveBeenCalled();
    expect(sendEmailViaProviderMock).not.toHaveBeenCalled();
  });
});
