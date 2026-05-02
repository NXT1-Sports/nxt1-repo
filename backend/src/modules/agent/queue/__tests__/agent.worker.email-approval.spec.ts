/**
 * @fileoverview Approval Card Tests
 * @description Tests that all approval yields render as generic confirmation cards.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      expect(card.payload.variant).toBeUndefined();
      expect(card.payload.emailData).toBeUndefined();
      expect(card.title).toBe('Approval Required');
      expect(card.payload.actions[1].label).toBe('Approve');
    });
  });
});
