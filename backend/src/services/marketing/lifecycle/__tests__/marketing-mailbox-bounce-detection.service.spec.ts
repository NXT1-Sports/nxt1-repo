import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findOneMock,
  findMock,
  updateOneMock,
  hashMarketingRecipientEmailMock,
  markMarketingEmailDispatchBouncedMock,
} = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  findMock: vi.fn(),
  updateOneMock: vi.fn(),
  hashMarketingRecipientEmailMock: vi.fn(),
  markMarketingEmailDispatchBouncedMock: vi.fn(),
}));

vi.mock('../../../../models/marketing/marketing-email-dispatch.model.js', () => ({
  MarketingEmailDispatchModel: {
    findOne: findOneMock,
    find: findMock,
    updateOne: updateOneMock,
  },
}));

vi.mock('../../email/marketing-email-dispatch.service.js', () => ({
  hashMarketingRecipientEmail: hashMarketingRecipientEmailMock,
  markMarketingEmailDispatchBounced: markMarketingEmailDispatchBouncedMock,
}));

import { processMarketingBounceForInboundMessage } from '../marketing-mailbox-bounce-detection.service.js';

describe('processMarketingBounceForInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashMarketingRecipientEmailMock.mockImplementation((email: string) => `hash:${email}`);
  });

  it('marks a dispatch bounced when Gmail sync receives a DSN with the original message id', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          dispatchId: 'dispatch-1',
          sendStatus: 'sent',
        }),
      }),
    });

    const result = await processMarketingBounceForInboundMessage({
      mailboxEmail: 'support@nxt1sports.com',
      senderEmail: 'mailer-daemon@googlemail.com',
      subject: 'Delivery Status Notification (Failure)',
      bodyText:
        'Final-Recipient: rfc822; badlead@example.com\nDiagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.\nMessage-ID: <abc123@nxt1sports.com>',
      headers: {
        'In-Reply-To': '<abc123@nxt1sports.com>',
        'Auto-Submitted': 'auto-generated',
      },
      receivedAt: new Date('2026-07-14T22:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'processed',
      matchedBy: 'provider_message_id',
      dispatchId: 'dispatch-1',
    });
    expect(markMarketingEmailDispatchBouncedMock).toHaveBeenCalledWith({
      dispatchId: 'dispatch-1',
      bouncedAt: new Date('2026-07-14T22:00:00.000Z'),
      failureReason: 'smtp; 550-5.1.1 The email account that you tried to reach does not exist.',
    });
    expect(findMock).not.toHaveBeenCalled();
  });

  it('falls back to a unique recent recipient match when no original message id is present', async () => {
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });
    findMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              dispatchId: 'dispatch-2',
              sendStatus: 'delivered',
            },
          ]),
        }),
      }),
    });

    const result = await processMarketingBounceForInboundMessage({
      mailboxEmail: 'support@nxt1sports.com',
      senderEmail: 'postmaster@mail.example.com',
      subject: 'Undeliverable: NXT1 intro',
      bodyText:
        'The following address failed: badlead@example.com\nDiagnostic-Code: smtp; 552 5.2.2 mailbox full',
      headers: {
        'X-Failed-Recipients': 'badlead@example.com',
      },
    });

    expect(result).toEqual({
      status: 'processed',
      matchedBy: 'recipient_fallback',
      dispatchId: 'dispatch-2',
    });
    expect(hashMarketingRecipientEmailMock).toHaveBeenCalledWith('badlead@example.com');
  });

  it('skips normal human replies', async () => {
    const result = await processMarketingBounceForInboundMessage({
      mailboxEmail: 'support@nxt1sports.com',
      senderEmail: 'coach@example.com',
      subject: 'Re: Quick intro',
      bodyText: 'Happy to chat next week.',
      headers: {
        From: 'Coach <coach@example.com>',
      },
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'not-bounce',
    });
    expect(markMarketingEmailDispatchBouncedMock).not.toHaveBeenCalled();
  });
});
