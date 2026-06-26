import { describe, expect, it } from 'vitest';
import {
  AgentXOperationChatComponent,
  resolveDockedExecutionPlanCard,
} from './agent-x-operation-chat.component';
import type { OperationMessage } from './agent-x-operation-chat.models';

type StripHelper = {
  messageAttachmentsForStrip(
    msg: OperationMessage
  ): readonly NonNullable<OperationMessage['attachments']>[number][];
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

describe('resolveDockedExecutionPlanCard', () => {
  it('returns an active single-step planner card for execute-plan docking', () => {
    const message: OperationMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-25T12:00:00.000Z'),
      cards: [
        {
          type: 'planner',
          title: 'Execution Plan',
          payload: {
            items: [{ id: '1', label: 'Create highlight reel', done: false, active: true }],
          },
        },
      ],
    };

    const card = resolveDockedExecutionPlanCard([message]);

    expect(card?.type).toBe('planner');
    expect(card?.title).toBe('Execution Plan');
  });

  it('keeps pending-only planner review cards out of the dock', () => {
    const message: OperationMessage = {
      id: 'assistant-2',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-25T12:00:00.000Z'),
      cards: [
        {
          type: 'planner',
          title: 'Review Execution Plan',
          payload: {
            items: [{ id: '1', label: 'Create highlight reel', done: false, active: false }],
          },
        },
      ],
    };

    expect(resolveDockedExecutionPlanCard([message])).toBeNull();
  });
});
