/**
 * @fileoverview Create Support Ticket Tool
 * @module @nxt1/backend/modules/agent/tools/support
 *
 * Creates a support ticket and dispatches a support email for the NXT1 support team.
 */

import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { AgentIdentifier, TicketCategory, TicketPriority } from '@nxt1/core';
import { submitSupportTicket } from '../../../../services/platform/help-center.service.js';

const CreateSupportTicketInputSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2),
  subject: z.string().trim().min(5).max(100),
  category: z.enum(['account', 'billing', 'technical', 'feature-request', 'bug-report', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  description: z.string().trim().min(20).max(5000),
  attachments: z.array(z.string().trim().url()).max(5).optional(),
  relatedArticleId: z.string().trim().min(1).optional(),
  deviceInfo: z.string().trim().max(1000).optional(),
});

export class CreateSupportTicketTool extends BaseTool {
  readonly name = 'create_support_ticket';
  readonly description =
    'Create a support ticket for the user and send it to the NXT1 support team. ' +
    'Use this whenever a user asks to contact support, report a technical issue, request account help, or escalate a platform problem.';
  readonly parameters = CreateSupportTicketInputSchema;
  readonly isMutation = true;
  readonly category = 'communication' as const;

  readonly entityGroup = 'system_tools' as const;
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = ['*'];

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateSupportTicketInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const ticket = parsed.data;

    context?.emitStage?.('submitting_job', {
      icon: 'email',
      phase: 'create_support_ticket',
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority ?? 'medium',
    });

    try {
      const created = await submitSupportTicket({
        userId: context?.userId,
        email: ticket.email,
        name: ticket.name,
        subject: ticket.subject,
        category: ticket.category as TicketCategory,
        priority: (ticket.priority ?? 'medium') as TicketPriority,
        description: ticket.description,
        attachments: ticket.attachments,
        relatedArticleId: ticket.relatedArticleId,
        deviceInfo: ticket.deviceInfo,
      });

      return {
        success: true,
        data: {
          ticketId: created.id,
          ticketNumber: created.ticketNumber,
          status: created.status,
          estimatedResponseTime: created.estimatedResponseTime,
          message: `Support ticket ${created.ticketNumber} created successfully.`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create support ticket.',
      };
    }
  }
}
