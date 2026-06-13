import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';

const { sendEmailViaProviderMock, resolveConnectedEmailProviderMock } = vi.hoisted(() => ({
  sendEmailViaProviderMock: vi.fn(),
  resolveConnectedEmailProviderMock: vi.fn(),
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
});
