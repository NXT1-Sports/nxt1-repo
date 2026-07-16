import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { ApprovalGateService } from '../../services/approval-gate.service.js';
import { buildInlineYieldCard } from '../agent.worker.js';

const approvalGate = new ApprovalGateService({} as Firestore);

const CASES = [
  {
    label: 'send_email',
    toolName: 'send_email',
    toolInput: {
      toEmail: 'coach@example.com',
      subject: 'Direct email update',
      bodyHtml: '<p>Latest update.</p>',
    },
    expectedTitle: 'Review and Approve Email',
    expectedVariant: 'email',
  },
  {
    label: 'batch_send_email',
    toolName: 'batch_send_email',
    toolInput: {
      recipients: [
        { toEmail: 'coach1@example.com', variables: { firstName: 'Alex' } },
        { toEmail: 'coach2@example.com', variables: { firstName: 'Blair' } },
      ],
      subjectTemplate: 'Hello {{firstName}}',
      bodyHtmlTemplate: '<p>Hello {{firstName}}</p>',
    },
    expectedTitle: 'Review and Approve Emails (2 recipients)',
    expectedVariant: 'email-batch',
  },
  {
    label: 'gmail_send_email',
    toolName: 'gmail_send_email',
    toolInput: {
      to: ['coach@example.com'],
      subject: 'Gmail update',
      body: '<p>Gmail body</p>',
    },
    expectedTitle: 'Review and Approve Email',
    expectedVariant: 'email',
  },
  {
    label: 'run_google_workspace_tool',
    toolName: 'run_google_workspace_tool',
    toolInput: {
      toolName: 'gmail_send_email',
      arguments: {
        to: ['coach1@example.com', 'coach2@example.com'],
        subject: 'Wrapped Gmail update',
        body: '<p>Wrapped Gmail body</p>',
      },
    },
    expectedTitle: 'Review and Approve Emails (2 recipients)',
    expectedVariant: 'email-batch',
  },
  {
    label: 'run_microsoft_365_tool',
    toolName: 'run_microsoft_365_tool',
    toolInput: {
      toolName: 'send-mail',
      arguments: {
        message: {
          subject: 'Wrapped Outlook update',
          body: { content: '<p>Wrapped Outlook body</p>' },
          toRecipients: [
            { emailAddress: { address: 'coach1@example.com' } },
            { emailAddress: { address: 'coach2@example.com' } },
          ],
        },
      },
    },
    expectedTitle: 'Review and Approve Emails (2 recipients)',
    expectedVariant: 'email-batch',
  },
] as const;

describe('agent email approval paths smoke', () => {
  it.each(CASES)('requires approval and renders the expected card for $label', (testCase) => {
    const requirement = approvalGate.getApprovalRequirement(testCase.toolName, testCase.toolInput);

    expect(requirement).not.toBeNull();
    expect(requirement?.reasonCode).toBe('send_email');

    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: 'needs_approval',
        promptToUser: 'Review this email action',
        agentId: 'primary',
        approvalId: 'approval-123',
        pendingToolCall: {
          toolName: testCase.toolName,
          toolInput: testCase.toolInput,
          toolCallId: 'tool-call-123',
        },
      },
      operationId: 'op-123',
      threadId: 'thread-123',
    });

    expect(card).not.toBeNull();
    expect(card?.type).toBe('confirmation');
    expect(card?.title).toBe(testCase.expectedTitle);
    expect(card?.payload.variant).toBe(testCase.expectedVariant);
    expect(card?.payload.approvalId).toBe('approval-123');
  });
});
