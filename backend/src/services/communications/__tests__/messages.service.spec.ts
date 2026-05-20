import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversationFindOneMock = vi.fn();
const conversationUpdateOneMock = vi.fn().mockResolvedValue({ acknowledged: true });
const messageFindByIdMock = vi.fn();
const messageCreateMock = vi.fn();
const messageUpdateOneMock = vi.fn().mockResolvedValue({ acknowledged: true });
const sendEmailViaProviderMock = vi.fn();

vi.mock('../../../models/communications/conversation.model.js', () => ({
  ConversationModel: {
    findOne: conversationFindOneMock,
    updateOne: conversationUpdateOneMock,
  },
}));

vi.mock('../../../models/communications/message.model.js', () => ({
  MessageModel: {
    findById: messageFindByIdMock,
    create: messageCreateMock,
    updateOne: messageUpdateOneMock,
  },
}));

vi.mock('../connected-mail.service.js', () => ({
  sendEmailViaProvider: sendEmailViaProviderMock,
}));

const { sendMessage } = await import('../messages.service.js');

describe('messages.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    conversationFindOneMock.mockResolvedValue({
      _id: 'conversation-1',
      title: 'Coach Thread',
      emailSubject: 'Coach Thread',
      emailProvider: 'gmail',
      participants: [
        { userId: 'user-1', name: 'You', role: 'athlete', email: 'athlete@example.com' },
        { userId: 'coach-1', name: 'Coach Carter', role: 'coach', email: 'coach@example.com' },
      ],
    });
    messageFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    messageCreateMock.mockResolvedValue({
      _id: 'message-1',
      conversationId: 'conversation-1',
      sender: {
        userId: 'user-1',
        name: 'You',
        role: 'athlete',
      },
      body: 'Checking in',
      status: 'sent',
      createdAt: '2026-05-19T00:00:00.000Z',
      toObject() {
        return this;
      },
    });
    sendEmailViaProviderMock.mockResolvedValue({
      success: true,
      externalMessageId: 'ext-1',
      trackingId: 'tracking-1',
    });
  });

  it('passes the recipient name into tracked provider email sends', async () => {
    await sendMessage('user-1', 'conversation-1', 'Checking in');

    expect(sendEmailViaProviderMock).toHaveBeenCalledWith(
      'user-1',
      'gmail',
      'coach@example.com',
      'Coach Thread',
      'Checking in',
      undefined,
      expect.objectContaining({
        recipientName: 'Coach Carter',
      })
    );
  });
});
