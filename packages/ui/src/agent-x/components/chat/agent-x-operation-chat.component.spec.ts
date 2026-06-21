import { describe, expect, it } from 'vitest';
import { AgentXOperationChatComponent } from './agent-x-operation-chat.component';
import type { OperationMessage } from './agent-x-operation-chat.models';

type StripHelper = {
  messageAttachmentsForStrip(
    msg: OperationMessage
  ): readonly NonNullable<OperationMessage['attachments']>[number][];
  messageContentForBubble(msg: OperationMessage): string;
  messagePartsForBubble(
    msg: OperationMessage
  ): readonly import('@nxt1/core/ai').AgentXMessagePart[];
  isAskUserYield(msg: OperationMessage): boolean;
  suppressedToolStepIdsForMessage(msg: OperationMessage): ReadonlySet<string>;
  textRenderedMediaUrlsForMessage(msg: OperationMessage): ReadonlySet<string>;
  isApprovalConfirmationCard(card: unknown): boolean;
};

describe('AgentXOperationChatComponent messageAttachmentsForStrip', () => {
  const component = Object.create(AgentXOperationChatComponent.prototype) as StripHelper;

  it('returns user attachments unchanged for the sent-message strip', () => {
    const attachments = [
      {
        url: 'https://cdn.nxt1.test/uploads/play.jpg',
        type: 'image' as const,
        name: 'play.jpg',
      },
      {
        url: 'https://cdn.nxt1.test/uploads/scout-report.pdf',
        type: 'doc' as const,
        name: 'scout-report.pdf',
      },
    ];

    const message: OperationMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Review these files.',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
      attachments,
    };

    expect(component.messageAttachmentsForStrip(message)).toEqual(attachments);
  });

  it('suppresses assistant attachments from the message strip on reload', () => {
    const message: OperationMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Here are the latest images I used while working.',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
      attachments: [
        {
          url: 'https://cdn.nxt1.test/generated/graphic-1.jpg',
          type: 'image',
          name: 'graphic-1.jpg',
        },
        {
          url: 'https://cdn.nxt1.test/generated/clip.mp4',
          type: 'video',
          name: 'clip.mp4',
          thumbnailUrl: 'https://cdn.nxt1.test/generated/clip-thumb.jpg',
        },
      ],
    };

    expect(component.messageAttachmentsForStrip(message)).toEqual([]);
  });
});

describe('AgentXOperationChatComponent messageContentForBubble', () => {
  const component = Object.create(AgentXOperationChatComponent.prototype) as StripHelper;

  component.isAskUserYield = () => false;
  component.suppressedToolStepIdsForMessage = () => new Set<string>();
  component.textRenderedMediaUrlsForMessage = () => new Set<string>();
  component.isApprovalConfirmationCard = () => false;

  it('collapses incomplete signed markdown download links on the typing bubble', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content:
        "Done! Here's your athlete profile PDF:\n\n[Athlete Profile PDF](https://storage.googleapis.com/nxt1-exports/Users%2Fuid%2Fthreads%2Fthread%2Fexports%2Fprofile.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123",
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
    };

    expect(component.messageContentForBubble(message)).toBe(
      "Done! Here's your athlete profile PDF:\n\nAthlete Profile PDF (preparing link...)"
    );
  });

  it('replaces bare signed storage urls with a compact loading label while typing', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content:
        "Done! Here's your athlete profile PDF:\n\nhttps://storage.googleapis.com/nxt1-exports/Users%2Fuid%2Fthreads%2Fthread%2Fexports%2Fprofile.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123",
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
    };

    expect(component.messageContentForBubble(message)).toBe(
      "Done! Here's your athlete profile PDF:\n\nPreparing link..."
    );
  });

  it('leaves normal non-storage links unchanged while typing', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content: 'Review the summary here: https://example.com/summary',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
    };

    expect(component.messageContentForBubble(message)).toBe(
      'Review the summary here: https://example.com/summary'
    );
  });

  it('compacts incomplete markdown image tags gracefully during stream', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content:
        'Here is the result:\n\n![Generated Image](https://storage.googleapis.com/nxt1-artifacts/Users%2Fuid%2F123',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
    };

    expect(component.messageContentForBubble(message)).toBe(
      'Here is the result:\n\nGenerated Image (preparing link...)'
    );
  });

  it('sanitizes streaming text parts because the bubble renders parts before content', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
      parts: [
        {
          type: 'text',
          content:
            '📄 **Download:** [Test_Test_Recruiting_Profile_2027.pdf](https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/1ca9a3d6b6784c23fe/exports/1782012977540-610be6e1',
        },
      ],
    };

    expect(component.messagePartsForBubble(message)).toEqual([
      {
        type: 'text',
        content: '📄 **Download:** Test_Test_Recruiting_Profile_2027.pdf (preparing link...)',
      },
    ]);
  });

  it('keeps later prose visible after a completed storage markdown link while typing', () => {
    const message: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      content:
        'Here is your file: [Test_Test_Recruiting_Profile_2027.pdf](https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/1ca9a3d6b6784c23fe/exports/1782012977540-610be6e1.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123) You can also review the summary below.',
      timestamp: new Date('2026-06-20T12:00:00.000Z'),
    };

    expect(component.messageContentForBubble(message)).toBe(
      'Here is your file: Test_Test_Recruiting_Profile_2027.pdf You can also review the summary below.'
    );
  });
});
