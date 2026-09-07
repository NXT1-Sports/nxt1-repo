/**
 * @fileoverview Approval Card Tests
 * @description Tests that all approval yields render as generic confirmation cards.
 */

import { describe, it, expect } from 'vitest';
import { buildInlineYieldCard } from '../agent.worker';
import type { AgentYieldReason } from '@nxt1/core';

describe('AgentWorker :: Approval Cards', () => {
  const baseYieldArgs = {
    agentId: 'primary',
    reason: 'needs_approval' as AgentYieldReason,
    promptToUser: 'Please review this email',
    approvalId: 'approval-123',
    operationId: 'op-456',
    expiresAt: new Date(Date.now() + 3600000),
  };

  function renderApprovalCard(pendingToolCall: {
    toolName: string;
    toolInput: Record<string, unknown>;
  }) {
    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: baseYieldArgs.reason,
        promptToUser: baseYieldArgs.promptToUser,
        agentId: baseYieldArgs.agentId,
        approvalId: baseYieldArgs.approvalId,
        pendingToolCall: {
          toolName: pendingToolCall.toolName,
          toolInput: pendingToolCall.toolInput,
          toolCallId: 'tool-call-1',
        },
      },
      operationId: baseYieldArgs.operationId,
      threadId: 'thread-1',
    });

    expect(card).not.toBeNull();
    return card!;
  }

  describe('single email (send_email)', () => {
    it('should render email approval card for send_email tool', () => {
      const card = renderApprovalCard({
        toolName: 'send_email',
        toolInput: {
          toEmail: 'coach@example.com',
          subject: 'Schedule Update',
          bodyHtml: '<p>Please review the updated schedule.</p>',
          body: 'Please review the updated schedule.',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Email');
      expect(card.payload.variant).toBe('email');
      expect(card.payload.emailData).toBeDefined();
      expect(card.payload.emailData.toEmail).toBe('coach@example.com');
      expect(card.payload.emailData.subject).toBe('Schedule Update');
      expect(card.payload.actions[0].label).toBe('Reject');
      expect(card.payload.actions[1].label).toBe('Send');
    });

    it('should handle missing optional email fields gracefully', () => {
      const card = renderApprovalCard({
        toolName: 'send_email',
        toolInput: {
          toEmail: 'athlete@example.com',
          subject: '',
          body: '',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Email');
      expect(card.payload.emailData.toEmail).toBe('athlete@example.com');
      expect(card.payload.emailData.subject).toBe('');
    });

    it('should include email metadata in the payload', () => {
      const card = renderApprovalCard({
        toolName: 'send_email',
        toolInput: {
          toEmail: 'user@example.com',
          subject: 'Test',
          bodyHtml: '<b>HTML Body</b>',
          body: 'Plain Body',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.payload.emailData).toBeDefined();
      expect(card.payload.emailData.body).toBe('<b>HTML Body</b>');
    });
  });

  describe('Gmail email approvals', () => {
    it('should render email approval card for direct gmail_send_email tool', () => {
      const card = renderApprovalCard({
        toolName: 'gmail_send_email',
        toolInput: {
          to: ['coach@example.com'],
          subject: 'Gmail Schedule Update',
          body: '<p>Please review the updated schedule.</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Email');
      expect(card.payload.variant).toBe('email');
      expect(card.payload.emailData.toEmail).toBe('coach@example.com');
      expect(card.payload.emailData.recipients).toEqual(['coach@example.com']);
      expect(card.payload.emailData.subject).toBe('Gmail Schedule Update');
      expect(card.payload.actions[1].label).toBe('Send');
    });
  });

  describe('batch email (batch_send_email)', () => {
    it('should render batch email approval card with structured recipients', () => {
      const card = renderApprovalCard({
        toolName: 'batch_send_email',
        toolInput: {
          recipients: [
            {
              toEmail: 'coach1@example.com',
              variables: { firstName: 'Alice', collegeName: 'State U' },
            },
            {
              toEmail: 'coach2@example.com',
              variables: { firstName: 'Bob', collegeName: 'Tech U' },
            },
            {
              toEmail: 'coach3@example.com',
              variables: { firstName: 'Carol', collegeName: 'Metro U' },
            },
          ],
          subjectTemplate: 'Recruiting Update — {{collegeName}}',
          bodyHtmlTemplate: '<p>Hi {{firstName}},</p><p>Following up on your program.</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Emails (3 recipients)');
      expect(card.payload.variant).toBe('email-batch');
      expect(card.payload.emailData).toBeDefined();
      expect(card.payload.emailData.recipients).toHaveLength(3);
      // Recipients must preserve the full structured object with toEmail + variables
      expect(card.payload.emailData.recipients[0]).toEqual({
        toEmail: 'coach1@example.com',
        variables: { firstName: 'Alice', collegeName: 'State U' },
      });
      expect(card.payload.actions[1].label).toBe('Send All');
    });

    it('should normalize legacy recipients using email key to toEmail', () => {
      const card = renderApprovalCard({
        toolName: 'batch_send_email',
        toolInput: {
          recipients: [
            { email: 'coach1@example.com', name: 'Coach One' },
            { email: 'coach2@example.com', name: 'Coach Two' },
          ],
          subjectTemplate: 'Hello',
          bodyHtmlTemplate: '<p>Hi there.</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Emails (2 recipients)');
      expect(card.payload.emailData.recipients[0]).toEqual({
        toEmail: 'coach1@example.com',
        variables: {},
      });
      expect(card.payload.emailData.recipients[1]).toEqual({
        toEmail: 'coach2@example.com',
        variables: {},
      });
    });

    it('should normalize plain string recipients to structured objects', () => {
      const card = renderApprovalCard({
        toolName: 'batch_send_email',
        toolInput: {
          recipients: ['athlete1@example.com', 'athlete2@example.com'],
          subjectTemplate: 'Results Posted',
          bodyHtmlTemplate: '<p>Your results are posted.</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Emails (2 recipients)');
      expect(card.payload.emailData.recipients).toHaveLength(2);
      expect(card.payload.emailData.recipients[0]).toEqual({
        toEmail: 'athlete1@example.com',
        variables: {},
      });
    });

    it('should filter out recipients with no resolvable email', () => {
      const card = renderApprovalCard({
        toolName: 'batch_send_email',
        toolInput: {
          recipients: [
            { toEmail: 'valid@example.com', variables: {} },
            { toEmail: '', variables: {} },
            { toEmail: 'another@example.com', variables: { firstName: 'Dana' } },
            undefined,
          ],
          subjectTemplate: 'Test',
          bodyHtmlTemplate: '<p>Test message</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.payload.emailData.recipients).toHaveLength(2);
      expect(card.payload.emailData.recipients.every((r: { toEmail: string }) => r.toEmail)).toBe(
        true
      );
    });

    it('should use singular title for a single recipient', () => {
      const card = renderApprovalCard({
        toolName: 'batch_send_email',
        toolInput: {
          recipients: [{ toEmail: 'solo@example.com', variables: { firstName: 'Solo' } }],
          subjectTemplate: 'Solo',
          bodyHtmlTemplate: '<p>Solo message</p>',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.title).toBe('Review and Approve Emails (1 recipient)');
    });
  });

  describe('non-email tools', () => {
    it('should not add email metadata for other tools', () => {
      const card = renderApprovalCard({
        toolName: 'search_college_coaches',
        toolInput: {
          collegeName: 'State U',
          sport: 'football',
        },
      });

      expect(card.type).toBe('confirmation');
      expect(card.payload.variant).toBe('generic_approval');
      expect(card.payload.emailData).toBeUndefined();
      expect(card.title).toBe('Approval Required');
      expect(card.payload.actions[1].label).toBe('Approve');
    });
  });
});

describe('AgentWorker :: Output Selection Cards', () => {
  it('maps ask_user allowCustomText to the output-selection payload', () => {
    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: 'needs_input',
        promptToUser: 'Pick how you want the report delivered.',
        agentId: 'primary',
        pendingToolCall: {
          toolName: 'ask_user',
          toolCallId: 'tool-call-output-choice',
          toolInput: {
            question: 'Choose report output',
            prompt: 'How should I deliver this report?',
            inputMode: 'single_select',
            allowCustomText: false,
            options: [
              {
                id: 'pdf',
                title: 'Printable PDF',
                description: 'Best for sharing with staff.',
                formatTag: 'PDF',
                icon: 'pdf',
              },
            ],
          },
        },
      },
      operationId: 'op-output-choice',
      threadId: 'thread-output-choice',
    });

    expect(card).not.toBeNull();
    expect(card?.type).toBe('output-selection');
    expect(card?.title).toBe('Choose Output Format');
    expect(card?.payload.allowCustomOption).toBe(false);
  });

  it('prefers normalized allowCustomOption over legacy allowCustomText', () => {
    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: 'needs_input',
        promptToUser: 'Pick how you want the report delivered.',
        agentId: 'primary',
        pendingToolCall: {
          toolName: 'ask_user',
          toolCallId: 'tool-call-output-choice',
          toolInput: {
            question: 'Choose report output',
            prompt: 'How should I deliver this report?',
            inputMode: 'single_select',
            allowCustomText: false,
            allowCustomOption: true,
            options: [
              {
                id: 'pdf',
                title: 'Printable PDF',
                description: 'Best for sharing with staff.',
                formatTag: 'PDF',
                icon: 'pdf',
              },
            ],
          },
        },
      },
      operationId: 'op-output-choice',
      threadId: 'thread-output-choice',
    });

    expect(card).not.toBeNull();
    expect(card?.type).toBe('output-selection');
    expect(card?.payload.allowCustomOption).toBe(true);
  });

  it('uses the ask_user prompt as the title for non-format structured choices', () => {
    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: 'needs_input',
        promptToUser: 'Confirm how the film breakdown is keyed.',
        agentId: 'primary',
        pendingToolCall: {
          toolName: 'ask_user',
          toolCallId: 'tool-call-film-ownership',
          toolInput: {
            question: 'Confirm ODK ownership',
            prompt: 'How is this film breakdown keyed to the Falcons?',
            inputMode: 'single_select',
            category: 'film_review',
            options: [
              {
                id: 'd_us_o_them',
                title: 'D rows are Falcons defense, O rows are opponent offense',
                description: 'Build this as a Falcons defensive self-scout.',
                formatTag: 'CHOICE',
                icon: 'choice',
              },
            ],
          },
        },
      },
      operationId: 'op-film-ownership',
      threadId: 'thread-film-ownership',
    });

    expect(card).not.toBeNull();
    expect(card?.type).toBe('output-selection');
    expect(card?.title).toBe('How is this film breakdown keyed to the Falcons?');
  });

  it('renders plain ask_user prompts with the same structured card family via a text step', () => {
    const card = buildInlineYieldCard({
      yieldPayload: {
        reason: 'needs_input',
        promptToUser: 'Which opponent should I build this for?',
        agentId: 'primary',
        pendingToolCall: {
          toolName: 'ask_user',
          toolCallId: 'tool-call-plain-ask-user',
          toolInput: {
            question: 'Which opponent should I build this for?',
            prompt: 'Which opponent should I build this for?',
            steps: [
              {
                id: 'response',
                prompt: 'Which opponent should I build this for?',
                inputMode: 'text',
                allowCustomOption: true,
                customPlaceholder: 'Type your answer...',
              },
            ],
          },
        },
      },
      operationId: 'op-plain-ask-user',
      threadId: 'thread-plain-ask-user',
    });

    expect(card).not.toBeNull();
    expect(card?.type).toBe('output-selection');
    expect(card?.title).toBe('Which opponent should I build this for?');
    expect(card?.payload.steps).toEqual([
      expect.objectContaining({
        id: 'response',
        prompt: 'Which opponent should I build this for?',
        inputMode: 'text',
        allowCustomOption: true,
        customPlaceholder: 'Type your answer...',
      }),
    ]);
  });
});
