import { signal } from '@angular/core';
import type { AgentYieldState } from '@nxt1/core';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentXOperationChatComponent,
  resolveDockedExecutionPlanCard,
  resolveVisibleDockedExecutionPlanCard,
  shouldShowApprovedExecutionPlanDockFromMessages,
} from './agent-x-operation-chat.component';
import type { FilmTimestampSeekRequest, OperationMessage } from './agent-x-operation-chat.models';

type StripHelper = {
  messageAttachmentsForStrip(
    msg: OperationMessage
  ): readonly NonNullable<OperationMessage['attachments']>[number][];
  isRenderableAttachmentThumbnailUrl(url: string | null | undefined): boolean;
};

type TimestampSeekHelper = {
  messages: () => readonly OperationMessage[];
  filmTimestampSeekRequested: { emit: (request: FilmTimestampSeekRequest) => void };
  onBubbleTimestampClicked(timeMs: number, messageIndex: number): void;
};

type ScrollJumpHelper = {
  messagesArea: () => { nativeElement: HTMLElement } | undefined;
  showScrollToBottomButton: ReturnType<typeof signal<boolean>>;
  pendingScrollFrame: number | null;
  pendingScrollBehavior: ScrollBehavior;
  onMessagesAreaScroll(): void;
  scrollToLatestMessages(): void;
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

  it('accepts Firebase Storage image URLs for sent-message thumbnails', () => {
    expect(
      component.isRenderableAttachmentThumbnailUrl(
        'https://firebasestorage.googleapis.com/v0/b/nxt1-test.appspot.com/o/team-files%2Fthumbs%2Fabc123?alt=media&token=test-token'
      )
    ).toBe(true);
  });
});

describe('AgentXOperationChatComponent timestamp seek routing', () => {
  it('ignores assistant timestamps when the turn has no film context', () => {
    const emit = vi.fn();
    const component = Object.create(AgentXOperationChatComponent.prototype) as TimestampSeekHelper;
    component.messages = () => [
      {
        id: 'user-1',
        role: 'user',
        content: 'What should I do at 8:30 tomorrow?',
        timestamp: new Date('2026-06-20T12:00:00.000Z'),
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Start warmups at 0:30.',
        timestamp: new Date('2026-06-20T12:00:01.000Z'),
      },
    ];
    component.filmTimestampSeekRequested = { emit };

    component.onBubbleTimestampClicked(30000, 1);

    expect(emit).not.toHaveBeenCalled();
  });

  it('emits source-aware seek requests for film-context turns', () => {
    const emit = vi.fn();
    const component = Object.create(AgentXOperationChatComponent.prototype) as TimestampSeekHelper;
    component.messages = () => [
      {
        id: 'user-1',
        role: 'user',
        content: 'Break down this source clip.',
        timestamp: new Date('2026-06-20T12:00:00.000Z'),
        attachments: [
          {
            url: 'context://film-source%3Areview-1%3Asource-2',
            type: 'context',
            name: 'Source 2',
            contextKind: 'film_play',
            filmReviewId: 'review-1',
            sourceId: 'source-2',
          },
        ],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Key moment at 0:30.',
        timestamp: new Date('2026-06-20T12:00:01.000Z'),
      },
    ];
    component.filmTimestampSeekRequested = { emit };

    component.onBubbleTimestampClicked(30000, 1);

    expect(emit).toHaveBeenCalledWith({
      timeMs: 30000,
      filmReviewId: 'review-1',
      sourceId: 'source-2',
    });
  });
});

describe('AgentXOperationChatComponent jump-to-latest control', () => {
  it('shows the jump button when the user scrolls away from the latest messages', () => {
    const component = Object.create(AgentXOperationChatComponent.prototype) as ScrollJumpHelper;
    const element = {
      scrollHeight: 1600,
      scrollTop: 900,
      clientHeight: 400,
    } as HTMLElement;

    component.messagesArea = () => ({ nativeElement: element });
    component.showScrollToBottomButton = signal(false);
    component.pendingScrollFrame = null;
    component.pendingScrollBehavior = 'auto';

    component.onMessagesAreaScroll();

    expect(component.showScrollToBottomButton()).toBe(true);
  });

  it('hides the jump button again after returning to the bottom', () => {
    const element = {
      scrollHeight: 1600,
      scrollTop: 900,
      clientHeight: 400,
      scrollTo: vi.fn(({ top }: { top: number }) => {
        element.scrollTop = top;
      }),
    } as unknown as HTMLElement;
    const component = Object.create(AgentXOperationChatComponent.prototype) as ScrollJumpHelper;

    component.messagesArea = () => ({ nativeElement: element });
    component.showScrollToBottomButton = signal(true);
    component.pendingScrollFrame = null;
    component.pendingScrollBehavior = 'auto';

    component.scrollToLatestMessages();

    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: 'smooth' });
    expect(component.showScrollToBottomButton()).toBe(false);
  });
});

describe('AgentXOperationChatComponent approval card state', () => {
  it('marks approval rows as resolved once their expiry time has passed', () => {
    const component = Object.create(
      AgentXOperationChatComponent.prototype
    ) as AgentXOperationChatComponent & {
      messages: () => readonly OperationMessage[];
      approvalCardStateForMessage(
        msg: OperationMessage,
        idx: number
      ): 'idle' | 'submitting' | 'resolved' | null;
    };

    const expiredYield: AgentYieldState = {
      reason: 'needs_approval',
      promptToUser: 'Send this email?',
      pendingToolCall: {
        toolName: 'send_email',
        toolInput: { toEmail: 'person@example.com', subject: 'Hi', bodyHtml: '<p>Hi</p>' },
      },
      expiresAt: '2020-01-01T00:00:00.000Z',
    };

    const msg: OperationMessage = {
      id: 'approval-1',
      role: 'assistant',
      content: '',
      timestamp: new Date('2026-06-25T12:00:00.000Z'),
      yieldState: expiredYield,
    };

    component.messages = () => [msg];

    expect(component.approvalCardStateForMessage(msg, 0)).toBe('resolved');
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

  it('hides the docked planner card in execute mode', () => {
    const message: OperationMessage = {
      id: 'assistant-3',
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

    expect(resolveVisibleDockedExecutionPlanCard([message], 'execute')).toBeNull();
    expect(resolveVisibleDockedExecutionPlanCard([message], 'plan')?.title).toBe('Execution Plan');
  });

  it('shows the docked planner card in execute mode only when approved-plan execution is active', () => {
    const message: OperationMessage = {
      id: 'assistant-4',
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

    expect(resolveVisibleDockedExecutionPlanCard([message], 'execute', false)).toBeNull();
    expect(resolveVisibleDockedExecutionPlanCard([message], 'execute', true)?.title).toBe(
      'Execution Plan'
    );
  });
});

describe('shouldShowApprovedExecutionPlanDockFromMessages', () => {
  it('restores execute-plan docking from a persisted approval timeline after remount', () => {
    const messages: OperationMessage[] = [
      {
        id: 'assistant-plan',
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
      },
      {
        id: 'approval-message',
        role: 'user',
        content: 'Approve',
        timestamp: new Date('2026-06-25T12:01:00.000Z'),
        idempotencyKey: 'thread-1:user_approved_action',
      },
      {
        id: 'assistant-executing',
        role: 'assistant',
        content: 'Executing approved plan',
        timestamp: new Date('2026-06-25T12:02:00.000Z'),
        steps: [
          {
            id: 'step-execute-plan',
            label: 'Executing approved plan',
            status: 'active',
            metadata: {
              toolName: 'execute_saved_plan',
            },
          },
        ],
      },
    ];

    expect(shouldShowApprovedExecutionPlanDockFromMessages(messages)).toBe(true);
  });

  it('hides execute-plan docking once a later normal user message starts a new job', () => {
    const messages: OperationMessage[] = [
      {
        id: 'approval-message',
        role: 'user',
        content: 'Approve',
        timestamp: new Date('2026-06-25T12:01:00.000Z'),
        idempotencyKey: 'thread-1:user_approved_action',
      },
      {
        id: 'assistant-executing',
        role: 'assistant',
        content: 'Executing approved plan',
        timestamp: new Date('2026-06-25T12:02:00.000Z'),
        steps: [
          {
            id: 'step-execute-plan',
            label: 'Executing approved plan',
            status: 'success',
            metadata: {
              toolName: 'execute_saved_plan',
            },
          },
        ],
      },
      {
        id: 'user-new-job',
        role: 'user',
        content: 'Do something else now',
        timestamp: new Date('2026-06-25T12:03:00.000Z'),
      },
    ];

    expect(shouldShowApprovedExecutionPlanDockFromMessages(messages)).toBe(false);
  });
});
