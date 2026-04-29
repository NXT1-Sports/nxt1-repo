import { describe, expect, it, vi } from 'vitest';

const { submitSupportTicketMock } = vi.hoisted(() => ({
  submitSupportTicketMock: vi.fn(),
}));

vi.mock('../../../../../services/platform/help-center.service.js', () => ({
  submitSupportTicket: submitSupportTicketMock,
}));

import { CreateSupportTicketTool } from '../create-support-ticket.tool.js';

describe('CreateSupportTicketTool', () => {
  const tool = new CreateSupportTicketTool();

  it('returns validation errors for invalid input', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('email');
  });

  it('creates a support ticket and returns ticket metadata', async () => {
    submitSupportTicketMock.mockResolvedValueOnce({
      id: 'ticket-id-1',
      ticketNumber: 'NXT-20260428-ABC123',
      status: 'open',
      email: 'athlete@nxt1sports.com',
      name: 'Athlete User',
      subject: 'Need help with profile video upload',
      category: 'technical',
      priority: 'high',
      description: 'Uploading a profile video fails on mobile every time after 30%.',
      createdAt: '2026-04-28T20:00:00.000Z',
      updatedAt: '2026-04-28T20:00:00.000Z',
      estimatedResponseTime: '24 hours',
    });

    const result = await tool.execute(
      {
        email: 'athlete@nxt1sports.com',
        name: 'Athlete User',
        subject: 'Need help with profile video upload',
        category: 'technical',
        priority: 'high',
        description: 'Uploading a profile video fails on mobile every time after 30%.',
      },
      {
        userId: 'user_123',
      }
    );

    expect(result.success).toBe(true);
    expect(submitSupportTicketMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        category: 'technical',
        priority: 'high',
      })
    );
    expect((result.data as Record<string, unknown>)['ticketNumber']).toBe('NXT-20260428-ABC123');
  });
});
