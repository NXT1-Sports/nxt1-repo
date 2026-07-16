import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  providerSendMock,
  getMarketingEmailProviderMock,
  buildTrackedEmailHtmlWithRecipientHashMock,
  createMarketingEmailDispatchMock,
  markMarketingEmailDispatchSentMock,
  markMarketingEmailDispatchFailedMock,
} = vi.hoisted(() => ({
  providerSendMock: vi.fn(),
  getMarketingEmailProviderMock: vi.fn(),
  buildTrackedEmailHtmlWithRecipientHashMock: vi.fn(),
  createMarketingEmailDispatchMock: vi.fn(),
  markMarketingEmailDispatchSentMock: vi.fn(),
  markMarketingEmailDispatchFailedMock: vi.fn(),
}));

vi.mock('../providers/provider-registry.js', () => ({
  getMarketingEmailProvider: getMarketingEmailProviderMock,
}));

vi.mock('../../../communications/connected-mail.service.js', () => ({
  buildTrackedEmailHtmlWithRecipientHash: buildTrackedEmailHtmlWithRecipientHashMock,
}));

vi.mock('../marketing-email-dispatch.service.js', () => ({
  createMarketingEmailDispatch: createMarketingEmailDispatchMock,
  hashMarketingRecipientEmail: (email: string) => `hash:${email}`,
  markMarketingEmailDispatchFailed: markMarketingEmailDispatchFailedMock,
  markMarketingEmailDispatchSent: markMarketingEmailDispatchSentMock,
  readMarketingRecipientDomain: (email: string) => email.split('@')[1] ?? null,
}));

import { sendOutboundMarketingEmail } from '../outbound-email.service.js';

describe('sendOutboundMarketingEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildTrackedEmailHtmlWithRecipientHashMock.mockImplementation(
      (html: string) => `tracked:${html}`
    );
    getMarketingEmailProviderMock.mockReturnValue({
      key: 'brevo',
      send: providerSendMock,
    });
    providerSendMock.mockResolvedValue({
      provider: 'brevo',
      accepted: true,
      providerMessageId: 'msg_123',
    });
  });

  it('creates a dispatch record, sends tracked html, and marks the dispatch sent', async () => {
    const result = await sendOutboundMarketingEmail({
      to: 'User@Example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      campaignKey: 'welcome_intro_athlete',
      userId: 'user-1',
      replyTo: 'support@nxt1sports.com',
    });

    expect(buildTrackedEmailHtmlWithRecipientHashMock).toHaveBeenCalledWith(
      '<p>Hi</p>',
      expect.objectContaining({
        subjectId: 'marketing:welcome_intro_athlete',
        subjectType: 'organization',
        recipientEmailHash: 'hash:user@example.com',
        extraTrackingParams: expect.objectContaining({
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          provider: 'brevo',
          emailOrigin: 'marketing',
        }),
      })
    );

    expect(createMarketingEmailDispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: 'welcome_intro_athlete',
        campaignFamily: 'welcome',
        provider: 'brevo',
        to: 'user@example.com',
      })
    );

    expect(providerSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: 'tracked:<p>Hi</p>',
        campaignFamily: 'welcome',
        recipientEmailHash: 'hash:user@example.com',
        recipientDomain: 'example.com',
      })
    );

    expect(markMarketingEmailDispatchSentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: 'msg_123',
      })
    );
    expect(markMarketingEmailDispatchFailedMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'brevo',
        accepted: true,
        providerMessageId: 'msg_123',
      })
    );
  });

  it('marks the dispatch failed when the provider send throws', async () => {
    providerSendMock.mockRejectedValueOnce(new Error('provider down'));

    await expect(
      sendOutboundMarketingEmail({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        campaignKey: 'monthly_campaign_01_athlete',
      })
    ).rejects.toThrow('provider down');

    expect(markMarketingEmailDispatchSentMock).not.toHaveBeenCalled();
    expect(markMarketingEmailDispatchFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReason: 'provider down',
      })
    );
  });
});
