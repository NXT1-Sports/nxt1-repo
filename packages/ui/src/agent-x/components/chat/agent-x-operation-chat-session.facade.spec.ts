import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@nxt1/core';
import type { AgentXToolStep } from '@nxt1/core/ai';
import { AgentXOperationChatSessionFacade } from './agent-x-operation-chat-session.facade';
import type { OperationMessage } from './agent-x-operation-chat.models';

type Canonicalizer = {
  resolveCanonicalAssistantRows(items: readonly AgentMessage[]): readonly AgentMessage[];
  reorderTurnsByPairing(messages: readonly OperationMessage[]): OperationMessage[];
  dedupeConsecutiveAssistantMessages(messages: readonly OperationMessage[]): OperationMessage[];
  shouldPreserveInlineYieldRowDuringReload(params: {
    readonly message: OperationMessage;
    readonly messageIndex: number;
    readonly allExistingMessages: readonly OperationMessage[];
    readonly reorderedMapped: readonly OperationMessage[];
    readonly answeredYieldOperationIdsInPersisted: ReadonlySet<string>;
  }): boolean;
  mergePreservedInlineYieldRows(
    persistedRows: readonly OperationMessage[],
    preservedInlineYieldRows: readonly OperationMessage[]
  ): OperationMessage[];
  shouldAppendContentAsTextPart(
    cleanContent: string,
    persistedParts: NonNullable<AgentMessage['parts']>
  ): boolean;
  resolveSupplementalContentTextPart(
    cleanContent: string,
    persistedParts: NonNullable<AgentMessage['parts']>
  ): string | null;
  isPauseYieldSupersededByLaterTurn(
    yieldState: NonNullable<AgentMessage['resultData']>['yieldState'],
    items: readonly AgentMessage[]
  ): boolean;
  coercePersistedYieldStateFromMessage(
    message: AgentMessage,
    persistedCards: AgentMessage['cards']
  ): unknown;
  hasYieldedAssistantRowForOperation(
    messages: ReadonlyArray<{
      role: string;
      operationId?: string;
      yieldState?: AgentMessage['resultData'];
      cards?: AgentMessage['cards'];
      parts?: AgentMessage['parts'];
    }>,
    operationId: string
  ): boolean;
  shouldDropLiveReplayAssistantRow(
    message: OperationMessage,
    replay: {
      readonly operationIds: ReadonlySet<string>;
      readonly content: string;
      readonly steps: readonly AgentXToolStep[];
    }
  ): boolean;
  shouldDropPersistedRowForActiveTyping(
    message: OperationMessage,
    params: {
      readonly liveOperationId: string;
      readonly existingTyping: OperationMessage;
      readonly replayOperationIds: ReadonlySet<string>;
    }
  ): boolean;
  shouldPreserveTypingAfterThreadReload(
    existingTyping: OperationMessage,
    persistedRows: readonly OperationMessage[],
    liveOperationId: string | null
  ): boolean;
  hasMongoFinalForOperation(items: readonly AgentMessage[], operationId: string | null): boolean;
  collectMessageMedia(message: AgentMessage): {
    imageUrl?: string;
    videoUrl?: string;
    attachments?: Array<{
      url: string;
      type: 'image' | 'video' | 'doc' | 'app' | 'context';
      name: string;
      contextKind?: string;
      contextSource?: string;
    }>;
  };
  stripDisplayedMediaUrlsFromContent(
    content: string,
    media: { imageUrl?: string; videoUrl?: string }
  ): string;
};

describe('AgentXOperationChatSessionFacade canonical assistant rows', () => {
  const facade = Object.create(AgentXOperationChatSessionFacade.prototype) as Canonicalizer;

  function assistantMessage(
    id: string,
    semanticPhase: AgentMessage['semanticPhase'],
    extras: Partial<AgentMessage> = {}
  ): AgentMessage {
    return {
      id,
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'assistant',
      content: `${id} content`,
      origin: 'agent_chain',
      operationId: 'op-1',
      createdAt: '2026-05-05T12:00:00.000Z',
      semanticPhase,
      ...extras,
    };
  }

  it('keeps a new assistant response attached to the matching user turn after an older pause', () => {
    const pausedUser: OperationMessage = {
      id: 'user-old-paused',
      role: 'user',
      content: 'Make me a graphic with my latest play',
      operationId: 'chat-paused-old',
      timestamp: new Date('2026-05-05T12:00:00.000Z'),
    };
    const newUser: OperationMessage = {
      id: 'user-new',
      role: 'user',
      content: 'Actually write a short caption instead',
      operationId: 'chat-new-turn',
      timestamp: new Date('2026-05-05T12:01:00.000Z'),
    };
    const newAssistant: OperationMessage = {
      id: 'assistant-new',
      role: 'assistant',
      content: 'Here is a tight caption for the post.',
      operationId: 'chat-new-turn',
      timestamp: new Date('2026-05-05T12:01:30.000Z'),
    };

    const reordered = facade.reorderTurnsByPairing([pausedUser, newUser, newAssistant]);

    expect(reordered.map((message) => message.id)).toEqual([
      'user-old-paused',
      'user-new',
      'assistant-new',
    ]);
  });

  it('keeps a new assistant below the later user when the user operationId backfill lags', () => {
    const pausedUser: OperationMessage = {
      id: 'user-old-paused',
      role: 'user',
      content: 'Make me a graphic with my latest play',
      operationId: 'chat-paused-old',
      timestamp: new Date('2026-05-05T12:00:00.000Z'),
    };
    const newUserWithoutOperationId: OperationMessage = {
      id: 'user-new',
      role: 'user',
      content: 'Actually write a short caption instead',
      timestamp: new Date('2026-05-05T12:01:00.000Z'),
    };
    const newAssistant: OperationMessage = {
      id: 'assistant-new',
      role: 'assistant',
      content: 'Here is a tight caption for the post.',
      operationId: 'chat-new-turn',
      timestamp: new Date('2026-05-05T12:01:30.000Z'),
    };

    const reordered = facade.reorderTurnsByPairing([
      pausedUser,
      newUserWithoutOperationId,
      newAssistant,
    ]);

    expect(reordered.map((message) => message.id)).toEqual([
      'user-old-paused',
      'user-new',
      'assistant-new',
    ]);
  });

  it('keeps approval reply above the final assistant result when completion timestamp rehydrates first', () => {
    const initialUser: OperationMessage = {
      id: 'user-initial-email',
      role: 'user',
      content: 'Send a test email in two minutes and wait for approval.',
      operationId: 'op-email-approval',
      timestamp: new Date('2026-06-12T18:00:00.000Z'),
    };
    const preApprovalContext: OperationMessage = {
      id: 'assistant-pre-approval',
      role: 'assistant',
      content: 'I scheduled the email and need your approval before sending.',
      operationId: 'op-email-approval',
      timestamp: new Date('2026-06-12T18:00:15.000Z'),
      semanticPhase: 'assistant_tool_call',
    };
    const finalResult: OperationMessage = {
      id: 'assistant-final-email-sent',
      role: 'assistant',
      content: 'The approved smoke test email was sent successfully.',
      operationId: 'op-email-approval',
      timestamp: new Date('2026-06-12T18:00:20.000Z'),
      semanticPhase: 'assistant_final',
    };
    const approvalReply: OperationMessage = {
      id: 'user-approval-reply',
      role: 'user',
      content: 'Send a test email to john@nxt1sports.com with subject Agent approved smoke test.',
      operationId: 'op-email-approval',
      timestamp: new Date('2026-06-12T18:00:25.000Z'),
    };

    const reordered = facade.reorderTurnsByPairing([
      initialUser,
      preApprovalContext,
      finalResult,
      approvalReply,
    ]);

    expect(reordered.map((message) => message.id)).toEqual([
      'user-initial-email',
      'assistant-pre-approval',
      'user-approval-reply',
      'assistant-final-email-sent',
    ]);
  });

  it('preserves resolved approval yield rows during completion reload until persisted approval history catches up', () => {
    const resolvedApprovalRow: OperationMessage = {
      id: 'yield:approval-email-123',
      role: 'assistant',
      content: '',
      operationId: 'op-email-approval',
      timestamp: new Date('2026-06-12T18:00:15.000Z'),
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'strategy_coordinator',
        messages: [],
        pendingToolCall: {
          toolName: 'send_email',
          toolCallId: 'tool-email-1',
          toolInput: {
            toEmail: 'john@nxt1sports.com',
            subject: 'Agent approved smoke test',
          },
        },
        approvalId: 'approval-email-123',
        yieldedAt: '2026-06-12T18:00:15.000Z',
        expiresAt: '2026-06-13T18:00:15.000Z',
      },
      yieldCardState: 'resolved',
      yieldResolvedText: 'Approved',
    };
    const persistedRows: readonly OperationMessage[] = [
      {
        id: 'user-initial-email',
        role: 'user',
        content: 'Send a test email and wait for approval.',
        operationId: 'op-email-approval',
        timestamp: new Date('2026-06-12T18:00:00.000Z'),
      },
      {
        id: 'assistant-pre-approval',
        role: 'assistant',
        content: 'I need approval before sending this email.',
        operationId: 'op-email-approval',
        timestamp: new Date('2026-06-12T18:00:10.000Z'),
        semanticPhase: 'assistant_tool_call',
      },
      {
        id: 'assistant-final-email-sent',
        role: 'assistant',
        content: 'The approved email was sent successfully.',
        operationId: 'op-email-resumed',
        timestamp: new Date('2026-06-12T18:00:25.000Z'),
        semanticPhase: 'assistant_final',
      },
    ];

    const shouldPreserveBeforeHistoryCatchesUp = facade.shouldPreserveInlineYieldRowDuringReload({
      message: resolvedApprovalRow,
      messageIndex: 1,
      allExistingMessages: [persistedRows[0]!, resolvedApprovalRow],
      reorderedMapped: persistedRows,
      answeredYieldOperationIdsInPersisted: new Set(),
    });
    const shouldDropAfterHistoryCatchesUp = facade.shouldPreserveInlineYieldRowDuringReload({
      message: resolvedApprovalRow,
      messageIndex: 1,
      allExistingMessages: [persistedRows[0]!, resolvedApprovalRow],
      reorderedMapped: persistedRows,
      answeredYieldOperationIdsInPersisted: new Set(['op-email-approval']),
    });
    const merged = facade.mergePreservedInlineYieldRows(persistedRows, [resolvedApprovalRow]);

    expect(shouldPreserveBeforeHistoryCatchesUp).toBe(true);
    expect(shouldDropAfterHistoryCatchesUp).toBe(false);
    expect(merged.map((message) => message.id)).toEqual([
      'user-initial-email',
      'assistant-pre-approval',
      'yield:approval-email-123',
      'assistant-final-email-sent',
    ]);
  });

  it('does not append duplicate content when persisted parts already include the assistant text', () => {
    expect(
      facade.shouldAppendContentAsTextPart('Email sent successfully.', [
        { type: 'tool-steps', steps: [] },
        { type: 'text', content: 'Email sent successfully.' },
      ])
    ).toBe(false);

    expect(
      facade.shouldAppendContentAsTextPart('Email sent successfully.', [
        { type: 'tool-steps', steps: [] },
      ])
    ).toBe(true);
  });

  it('appends persisted content when existing text parts only contain an earlier subset', () => {
    expect(
      facade.shouldAppendContentAsTextPart('Early prose. Later summary.', [
        { type: 'text', content: 'Early prose.' },
        { type: 'tool-steps', steps: [] },
      ])
    ).toBe(true);
  });

  it('only appends the missing trailing summary when persisted parts already contain the leading prose', () => {
    expect(
      facade.resolveSupplementalContentTextPart(
        'I will search first. Got the 5 colleges. Now sending the email.',
        [
          { type: 'text', content: 'I will search first.' },
          {
            type: 'tool-steps',
            steps: [
              {
                id: 'search-football-colleges',
                label: 'Searching college database: football',
                status: 'success',
                stageType: 'tool',
              },
            ],
          },
        ]
      )
    ).toBe('Got the 5 colleges. Now sending the email.');

    expect(
      facade.resolveSupplementalContentTextPart('I will search first.', [
        { type: 'text', content: 'I will search first.' },
      ])
    ).toBeNull();
  });
  it('treats manual pause metadata as stale once a later turn supersedes it', () => {
    const pauseYieldState = {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: 'router',
      messages: [],
      pendingToolCall: {
        toolName: 'resume_paused_operation',
        toolCallId: 'pause_resume_chat-paused-old',
        toolInput: { operationId: 'chat-paused-old' },
      },
      yieldedAt: '2026-05-05T12:00:30.000Z',
      expiresAt: '2026-05-06T12:00:30.000Z',
    } as NonNullable<AgentMessage['resultData']>['yieldState'];

    const items: readonly AgentMessage[] = [
      {
        id: 'user-old-paused',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Make me a graphic with my latest play',
        origin: 'user',
        operationId: 'chat-paused-old',
        createdAt: '2026-05-05T12:00:00.000Z',
      },
      assistantMessage('old-partial', 'assistant_partial', {
        operationId: 'chat-paused-old',
        content: 'I can start that graphic.',
      }),
      {
        id: 'user-new',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Actually write a short caption instead',
        origin: 'user',
        operationId: 'chat-new-turn',
        createdAt: '2026-05-05T12:01:00.000Z',
      },
      assistantMessage('assistant-new', 'assistant_final', {
        operationId: 'chat-new-turn',
        content: 'Here is a tight caption for the post.',
        createdAt: '2026-05-05T12:01:30.000Z',
      }),
    ];

    expect(facade.isPauseYieldSupersededByLaterTurn(pauseYieldState, items)).toBe(true);
  });

  it('keeps only assistant_final when partial media/card snapshots share the same operationId', () => {
    const mediaCard = {
      type: 'data-table' as const,
      agentId: 'router' as const,
      title: 'Generated analytics chart',
      payload: { imageUrl: 'https://cdn.example.com/chart.png' },
    };

    const items: readonly AgentMessage[] = [
      assistantMessage('partial-1', 'assistant_partial', {
        cards: [mediaCard],
        resultData: { imageUrl: 'https://cdn.example.com/chart.png' },
      }),
      assistantMessage('partial-2', 'assistant_partial', {
        cards: [mediaCard],
        resultData: { imageUrl: 'https://cdn.example.com/chart.png' },
      }),
      assistantMessage('final-1', 'assistant_final', {
        cards: [mediaCard],
        resultData: { imageUrl: 'https://cdn.example.com/chart.png' },
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);

    expect(canonical.map((message) => message.id)).toEqual(['final-1']);
  });

  it('rehydrates selected contexts as message attachments on reload', () => {
    const media = facade.collectMessageMedia({
      id: 'user-ctx-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Break this down',
      origin: 'user',
      createdAt: '2026-05-05T12:00:00.000Z',
      selectedContexts: [
        {
          id: 'film-review:123',
          kind: 'film_play',
          title: 'Shotgun rollout @ 00:14',
          summary: 'Film review clip',
          source: {
            type: 'film_review',
            id: '123',
            label: 'State semifinal vs Westview',
          },
          media: {
            videoUrl: 'https://cdn.example.com/film.mp4',
            thumbnailUrl: 'https://cdn.example.com/film.jpg',
          },
        },
      ],
    });

    expect(media.attachments).toEqual([
      {
        url: 'https://cdn.example.com/film.mp4',
        type: 'video',
        name: 'Shotgun rollout @ 00:14',
        thumbnailUrl: 'https://cdn.example.com/film.jpg',
        contextKind: 'film_play',
        contextSource: 'State semifinal vs Westview',
        contextSummary: 'Film review clip',
      },
    ]);
  });

  it('keeps only the latest assistant_partial while a final row does not exist yet', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('partial-1', 'assistant_partial'),
      assistantMessage('partial-2', 'assistant_partial'),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);

    expect(canonical.map((message) => message.id)).toEqual(['partial-2']);
  });

  it('dedupes consecutive assistant replays when chat-prefixed and bare UUID operation ids refer to the same turn', () => {
    const deduped = facade.dedupeConsecutiveAssistantMessages([
      {
        id: 'assistant-local-partial',
        role: 'assistant',
        content: "Here's IMG_0194 2.MOV loaded up for you, Coach.",
        operationId: 'chat-11111111-1111-1111-1111-111111111111',
        timestamp: new Date('2026-06-15T04:00:00.000Z'),
        semanticPhase: 'assistant_partial',
      },
      {
        id: 'assistant-persisted-partial',
        role: 'assistant',
        content: "Here's IMG_0194 2.MOV loaded up for you, Coach.",
        operationId: '11111111-1111-1111-1111-111111111111',
        timestamp: new Date('2026-06-15T04:00:01.000Z'),
        semanticPhase: 'assistant_partial',
      },
    ]);

    expect(deduped.map((message) => message.id)).toEqual(['assistant-local-partial']);
  });

  it('suppresses answered assistant_yield rows and shows the user reply as a standalone bubble', () => {
    // The assistant_yield row is always suppressed (live yields shown via
    // applyPendingYieldState; answered yields no longer need a card because the
    // user reply shows as a normal user bubble in the conversation history).
    const items: readonly AgentMessage[] = [
      assistantMessage('yield-1', 'assistant_yield', {
        content: 'What is your top recruiting priority right now?',
        operationId: 'op-yield-1',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
      {
        id: 'user-reply-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'We need a point guard and more wing depth.',
        origin: 'user',
        operationId: 'op-yield-1',
        createdAt: '2026-05-05T12:01:00.000Z',
      },
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);

    // yield row is suppressed; user reply shows as a standalone user bubble
    expect(canonical.map((message) => message.id)).toEqual(['user-reply-1']);
  });

  // ── Regression: Bug C ─────────────────────────────────────────────────────
  // When an ask_user yield is answered and the resumed operation writes its
  // assistant_final with a NEW operationId (separate BullMQ job), the pre-yield
  // assistant_tool_call row (the prose the agent wrote before calling ask_user —
  // e.g., "Here are 5 colleges…  What is your top priority?") was incorrectly
  // suppressed by the inputYieldedOpIds filter on session reload, leaving the
  // chat history visibly incomplete.
  it('keeps pre-yield assistant_tool_call prose when ask_user is answered and resume uses a new operationId', () => {
    const items: readonly AgentMessage[] = [
      // Initial user prompt
      {
        id: 'user-initial',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Do in each order I say: 1 search up 5 random colleges 2 ask me a question',
        origin: 'user',
        createdAt: '2026-05-05T12:00:00.000Z',
      },
      // Prose written BEFORE ask_user is called (2-step pattern step 1)
      assistantMessage('tool-call-colleges', 'assistant_tool_call', {
        operationId: 'chat-op-1',
        content:
          'Here are 5 random colleges for Football: Abilene Christian… Now, for step 2: What is your top priority when evaluating colleges?',
      }),
      // ask_user yield (2-step pattern step 2)
      assistantMessage('yield-ask-1', 'assistant_yield', {
        operationId: 'chat-op-1',
        content: 'top priority when evaluating colleges',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
      // User's reply (same operationId — will be suppressed, shown inline in card)
      {
        id: 'user-reply-academics',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'academics',
        origin: 'user',
        operationId: 'chat-op-1',
        createdAt: '2026-05-05T12:01:00.000Z',
      },
      // Resumed operation writes assistant_final with a NEW operationId
      assistantMessage('final-resumed', 'assistant_final', {
        operationId: 'new-uuid-resumed',
        content: 'Great choice! Academics should definitely be a top priority…',
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    // Pre-yield prose MUST be shown so the user sees the 5 colleges + question
    expect(ids).toContain('tool-call-colleges');
    // Yield row is suppressed (always — live yields use applyPendingYieldState)
    expect(ids).not.toContain('yield-ask-1');
    // Resumed final MUST be shown
    expect(ids).toContain('final-resumed');
    // User reply is shown as a standalone user bubble (answer is visible)
    expect(ids).toContain('user-reply-academics');
  });

  // ── Regression: Bug C (multiple tool_call rows) ────────────────────────────
  // When multiple assistant_tool_call rows exist for an answered ask_user op,
  // only the LAST one should render (deduplication, same as other ops).
  it('keeps only the last pre-yield tool_call when multiple exist for an answered ask_user op', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('tool-call-early', 'assistant_tool_call', {
        operationId: 'chat-op-multi',
        content: 'Intermediate ReAct step…',
      }),
      assistantMessage('tool-call-last', 'assistant_tool_call', {
        operationId: 'chat-op-multi',
        content: 'Here are 5 colleges… What is your top priority?',
      }),
      assistantMessage('yield-multi', 'assistant_yield', {
        operationId: 'chat-op-multi',
        content: 'top priority',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
      {
        id: 'user-reply-multi',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'athletics',
        origin: 'user',
        operationId: 'chat-op-multi',
        createdAt: '2026-05-05T12:02:00.000Z',
      },
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    // Only the LAST tool_call is kept
    expect(ids).not.toContain('tool-call-early');
    expect(ids).toContain('tool-call-last');
    // Yield row is always suppressed
    expect(ids).not.toContain('yield-multi');
    // User reply shows as a standalone user bubble
    expect(ids).toContain('user-reply-multi');
  });

  // ── Regression: Bug C (2-hop ask_user — real DB scenario) ────────────────
  // Full "Do in each order" scenario:
  //   Op1 (chat-fe48ee83): 2x tool_call + yield + user reply
  //   Op2 (a0f3254f):      1x tool_call + yield + user reply  (resumed from Op1)
  //   Op3 (0dff6a76):      1x tool_call + final              (resumed from Op2)
  //
  // On reload the frontend must show:
  //   • Last tool_call for Op1 (step 2 prose + colleges list)
  //   • User reply for Op1 (shown as a standalone user bubble)
  //   • Tool_call for Op2 ("I just searched 5 random colleges…")
  //   • User reply for Op2 (shown as a standalone user bubble)
  //   • Final for Op3
  //
  // Op1's FIRST tool_call (step 1 only) is deduplicated away; both
  // assistant_yield rows are suppressed (live yields use applyPendingYieldState;
  // answered yields let the user reply show as its own bubble).
  it('restores full 2-hop ask_user conversation on reload (real DB scenario)', () => {
    const items: readonly AgentMessage[] = [
      // ── Op1: initial operation ──────────────────────────────────────────
      // First tool_call: agent announces step 1, calls search_colleges
      assistantMessage('op1-tc-1', 'assistant_tool_call', {
        operationId: 'chat-fe48ee83',
        content: 'Got it — Step 1: Search up 5 random colleges…',
      }),
      // Second (last) tool_call: agent announces step 2, calls ask_user
      // (its parts[] is a cumulative snapshot containing both step 1 + step 2)
      assistantMessage('op1-tc-2', 'assistant_tool_call', {
        operationId: 'chat-fe48ee83',
        content:
          'Step 2: Ask you a question with the ask_user tool\n\nWhich of these 5 colleges would you be most interested in?',
      }),
      // Yield pauses the operation waiting for user input
      assistantMessage('op1-yield', 'assistant_yield', {
        operationId: 'chat-fe48ee83',
        content: 'Which college interests you most?',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
      // User replies (same opId) — should be suppressed (shown in card)
      {
        id: 'op1-user-reply',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'which college ?',
        origin: 'user',
        operationId: 'chat-fe48ee83',
        createdAt: '2026-05-14T19:24:36.199Z',
      },
      // ── Op2: resumed from Op1 ─────────────────────────────────────────
      // Agent re-lists the colleges and asks again with ask_user
      assistantMessage('op2-tc-1', 'assistant_tool_call', {
        operationId: 'a0f3254f',
        content:
          'I just searched 5 random college football programs:\n1. Abilene Christian University (Texas, FCS)\n…',
      }),
      assistantMessage('op2-yield', 'assistant_yield', {
        operationId: 'a0f3254f',
        content: 'Pick a college from the list',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
      {
        id: 'op2-user-reply',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Abilene Christian University (Texas, FCS)',
        origin: 'user',
        operationId: 'a0f3254f',
        createdAt: '2026-05-14T19:25:13.459Z',
      },
      // ── Op3: resumed from Op2, final answer ───────────────────────────
      assistantMessage('op3-tc-1', 'assistant_tool_call', {
        operationId: '0dff6a76',
        content: '',
      }),
      assistantMessage('op3-final', 'assistant_final', {
        operationId: '0dff6a76',
        content: 'Great choice! Abilene Christian University (ACU) is a solid FCS program…',
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    // ── Op1 ──
    // First tool_call deduplicated (last one has cumulative content)
    expect(ids).not.toContain('op1-tc-1');
    // Last tool_call KEPT so user sees the college list + question prose
    expect(ids).toContain('op1-tc-2');
    // Yield row suppressed (always — live yields use applyPendingYieldState)
    expect(ids).not.toContain('op1-yield');
    // User reply shows as a standalone user bubble (answer is visible)
    expect(ids).toContain('op1-user-reply');

    // ── Op2 ──
    // Tool_call KEPT ("I just searched 5 random colleges…")
    expect(ids).toContain('op2-tc-1');
    // Yield row suppressed
    expect(ids).not.toContain('op2-yield');
    // User reply shows as a standalone user bubble
    expect(ids).toContain('op2-user-reply');

    // ── Op3 ──
    // Final KEPT
    expect(ids).toContain('op3-final');
  });

  it('does not coerce approval-style assistant_yield prose into ask-user fallback state', () => {
    const approvalYieldRow = assistantMessage('yield-approval-1', 'assistant_yield', {
      content:
        'Review and approve this email draft before sending. Send an email to john@nxt1sports.com.',
      operationId: 'op-approval-1',
    });

    const coerced = facade.coercePersistedYieldStateFromMessage(approvalYieldRow, []);

    expect(coerced).toBeNull();
  });

  it('detects yielded assistant rows so live typing replay can be suppressed', () => {
    const yielded = facade.hasYieldedAssistantRowForOperation(
      [
        {
          role: 'assistant',
          operationId: 'op-1',
          parts: [
            {
              type: 'card',
              card: {
                type: 'ask_user',
                agentId: 'router',
                title: 'Need your answer',
                payload: { prompt: 'Reply with the school name' },
              },
            },
          ],
        },
      ],
      'op-1'
    );

    expect(yielded).toBe(true);
  });

  it('drops persisted assistant snapshots already represented by live Firestore replay', () => {
    const replay = {
      operationIds: new Set(['parent-op', 'child-op']),
      content:
        'Data coordinator is extracting profile information and reviewing distilled sections sequentially.',
      steps: [] as AgentXToolStep[],
    };

    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'persisted-without-op',
          role: 'assistant',
          content:
            'Data coordinator is extracting profile information and reviewing distilled sections sequentially.',
          timestamp: new Date('2026-06-08T12:25:33.000Z'),
        },
        replay
      )
    ).toBe(true);

    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'persisted-child-op',
          role: 'assistant',
          operationId: 'child-op',
          content: 'Reviewing distilled insights: seasonStats',
          timestamp: new Date('2026-06-08T12:25:34.000Z'),
        },
        replay
      )
    ).toBe(true);

    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'persisted-sibling-op-same-prose',
          role: 'assistant',
          operationId: 'mongo-parent-op',
          content:
            'Data coordinator is extracting profile information and reviewing distilled sections sequentially.',
          timestamp: new Date('2026-06-08T12:25:35.000Z'),
          parts: [
            {
              type: 'tool-steps',
              steps: [
                {
                  id: 'tool-search-colleges',
                  label: 'Searching college database: Football',
                  status: 'success',
                  stageType: 'tool',
                },
              ],
            },
          ],
        },
        {
          operationIds: new Set(['firestore-live-op']),
          content:
            'Data coordinator is extracting profile information and reviewing distilled sections sequentially.',
          steps: [
            {
              id: 'tool-search-colleges',
              label: 'Searching college database: Football',
              status: 'success',
              stageType: 'tool',
            },
          ],
        }
      )
    ).toBe(true);

    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'persisted-sibling-op-with-longer-prose',
          role: 'assistant',
          operationId: 'mongo-parent-op',
          content:
            'Searching 5 football colleges for a QB in the 2028 class now. Got the 5 colleges.',
          timestamp: new Date('2026-06-08T12:25:36.000Z'),
        },
        {
          operationIds: new Set(['firestore-live-op']),
          content: 'Searching 5 football colleges for a QB in the 2028 class now.',
          steps: [] as AgentXToolStep[],
        }
      )
    ).toBe(true);

    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'distinct-pre-approval-context',
          role: 'assistant',
          operationId: 'firestore-live-op',
          content:
            'Found 5 matching college programs with division, conference, GPA averages, acceptance rates, and direct links.',
          timestamp: new Date('2026-06-08T12:25:37.000Z'),
          semanticPhase: 'assistant_tool_call',
        },
        {
          operationIds: new Set(['firestore-live-op']),
          content: 'Sending an email to john@nxt1sports.com.',
          steps: [] as AgentXToolStep[],
        }
      )
    ).toBe(false);
  });

  it('preserves distinct same-operation tool_call context while dropping duplicated active typing rows', () => {
    const existingTyping: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      operationId: 'firestore-live-op',
      content: 'Sending an email to john@nxt1sports.com.',
      timestamp: new Date('2026-06-08T12:26:00.000Z'),
      steps: [
        {
          id: 'tool-send-email',
          label: 'Sending email john@nxt1sports.com',
          status: 'active',
          stageType: 'tool',
        },
      ],
    };

    expect(
      facade.shouldDropPersistedRowForActiveTyping(
        {
          id: 'persisted-distinct-context',
          role: 'assistant',
          operationId: 'firestore-live-op',
          content:
            'Found 5 matching college programs with division, conference, GPA averages, acceptance rates, and direct links.',
          timestamp: new Date('2026-06-08T12:25:58.000Z'),
          semanticPhase: 'assistant_tool_call',
        },
        {
          liveOperationId: 'firestore-live-op',
          existingTyping,
          replayOperationIds: new Set(['firestore-live-op']),
        }
      )
    ).toBe(false);

    expect(
      facade.shouldDropPersistedRowForActiveTyping(
        {
          id: 'persisted-duplicate-partial',
          role: 'assistant',
          operationId: 'firestore-live-op',
          content: 'Sending an email to john@nxt1sports.com.',
          timestamp: new Date('2026-06-08T12:25:59.000Z'),
          semanticPhase: 'assistant_partial',
        },
        {
          liveOperationId: 'firestore-live-op',
          existingTyping,
          replayOperationIds: new Set(['firestore-live-op']),
        }
      )
    ).toBe(true);
  });

  it('drops stale typing bubble when thread reload contains the same-operation final row', () => {
    const existingTyping: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      operationId: 'chat-local-video-op',
      content: 'Crown Point Bulldogs — Highlight Video Complete',
      timestamp: new Date('2026-06-15T18:53:20.000Z'),
    };

    const persistedFinal: OperationMessage = {
      id: 'mongo-final',
      role: 'assistant',
      operationId: 'chat-local-video-op',
      semanticPhase: 'assistant_final',
      content: 'Crown Point Bulldogs — Highlight Video Complete',
      timestamp: new Date('2026-06-15T18:53:25.000Z'),
    };

    expect(
      facade.shouldPreserveTypingAfterThreadReload(
        existingTyping,
        [persistedFinal],
        'chat-local-video-op'
      )
    ).toBe(false);
  });

  it('preserves typing bubble when no same-operation final row exists yet', () => {
    const existingTyping: OperationMessage = {
      id: 'typing',
      role: 'assistant',
      operationId: 'chat-live-op',
      content: 'Still working...',
      timestamp: new Date('2026-06-15T18:53:20.000Z'),
    };

    const persistedToolCall: OperationMessage = {
      id: 'mongo-tool-call',
      role: 'assistant',
      operationId: 'chat-live-op',
      semanticPhase: 'assistant_tool_call',
      content: 'Still working...',
      timestamp: new Date('2026-06-15T18:53:21.000Z'),
    };

    expect(
      facade.shouldPreserveTypingAfterThreadReload(
        existingTyping,
        [persistedToolCall],
        'chat-live-op'
      )
    ).toBe(true);
  });

  it('drops live replay assistant rows when replay uses a bare UUID and the existing row uses the chat-prefixed form', () => {
    expect(
      facade.shouldDropLiveReplayAssistantRow(
        {
          id: 'assistant-chat-prefixed',
          role: 'assistant',
          operationId: 'chat-22222222-2222-2222-2222-222222222222',
          content: "Here's IMG_0194 2.MOV loaded up for you, Coach.",
          timestamp: new Date('2026-06-15T04:00:00.000Z'),
          semanticPhase: 'assistant_partial',
        },
        {
          operationIds: new Set(['22222222-2222-2222-2222-222222222222']),
          content: "Here's IMG_0194 2.MOV loaded up for you, Coach.",
          steps: [],
        }
      )
    ).toBe(true);
  });
  it('promotes persisted graphic URLs into image media and strips the raw URL from prose', () => {
    const graphicUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/users/demo/graphic.png';
    const content = [
      'Your Crown Point Football stat graphic is complete featuring:',
      '',
      'Graphic URL:',
      graphicUrl,
      '',
      'Want me to post this to your timeline or make any adjustments?',
    ].join('\n');

    const media = facade.collectMessageMedia(
      assistantMessage('final-graphic', 'assistant_final', {
        content,
        attachments: [
          {
            id: 'att-graphic-1',
            url: graphicUrl,
            name: 'graphic.png',
            mimeType: 'image/png',
            type: 'image',
            sizeBytes: 1024,
          },
        ],
      })
    );
    const displayContent = facade.stripDisplayedMediaUrlsFromContent(content, media);

    expect(media.attachments).toEqual([
      {
        url: graphicUrl,
        type: 'image',
        name: 'graphic.png',
      },
    ]);
    expect(displayContent).toContain(
      'Your Crown Point Football stat graphic is complete featuring:'
    );
    expect(displayContent).toContain(
      'Want me to post this to your timeline or make any adjustments?'
    );
    expect(displayContent).not.toContain('Graphic URL:');
    expect(displayContent).not.toContain('https://storage.googleapis.com');
  });

  it('keeps external highlight pages as links instead of fake video attachments', () => {
    const highlightPageUrl = 'https://hoopseen.com/videos/atlanta-jam-highlights';
    const content = ['Video URLs Found:', '', 'URL:', highlightPageUrl].join('\n');

    const media = facade.collectMessageMedia(
      assistantMessage('external-highlight-links', 'assistant_final', { content })
    );
    const displayContent = facade.stripDisplayedMediaUrlsFromContent(content, media);

    expect(media.videoUrl).toBeUndefined();
    expect(media.attachments).toBeUndefined();
    expect(displayContent).toContain(highlightPageUrl);
  });

  it('still promotes direct playable video assets into video attachments', () => {
    const playableVideoUrl = 'https://storage.googleapis.com/nxt1-media/reels/final-highlight.mp4';
    const content = ['Generated highlight video:', playableVideoUrl].join('\n');

    const media = facade.collectMessageMedia(
      assistantMessage('direct-video-asset', 'assistant_final', { content })
    );

    expect(media.videoUrl).toBe(playableVideoUrl);
    expect(media.attachments).toEqual([
      {
        url: playableVideoUrl,
        type: 'video',
        name: 'media-video-1.mp4',
      },
    ]);
  });

  it('downgrades persisted non-playable video page attachments to app links', () => {
    const highlightPageUrl = 'https://hoopseen.com/videos/atlanta-jam-highlights';

    const media = facade.collectMessageMedia(
      assistantMessage('persisted-external-video', 'assistant_final', {
        content: `Most recent highlight: ${highlightPageUrl}`,
        attachments: [
          {
            id: 'att-highlight-page-1',
            url: highlightPageUrl,
            name: 'HoopSeen Atlanta Jam Highlights',
            type: 'video',
            mimeType: 'text/html',
            sizeBytes: 0,
          },
        ],
      })
    );

    expect(media.videoUrl).toBeUndefined();
    expect(media.attachments).toEqual([
      {
        url: highlightPageUrl,
        type: 'app',
        name: 'HoopSeen Atlanta Jam Highlights',
      },
    ]);
  });

  it('keeps user-uploaded video as a single attachment without promoting assistant media fields', () => {
    const uploadedVideoUrl = 'https://cdn.example.com/uploads/highlight.mp4';
    const thumbnailUrl = 'https://cdn.example.com/uploads/highlight-thumb.jpg';
    const storagePath = 'Users/user-1/threads/thread-1/media/video/highlight.mp4';
    const userMessage: AgentMessage = {
      id: 'user-upload-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: `Please use this clip\n\n[Attached video: highlight.mp4 — ${uploadedVideoUrl}]`,
      origin: 'user',
      createdAt: '2026-05-06T12:00:00.000Z',
      attachments: [
        {
          id: 'att-video-1',
          url: uploadedVideoUrl,
          storagePath,
          name: 'highlight.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 4096,
          thumbnailUrl,
        },
      ],
      resultData: {
        outputUrl: uploadedVideoUrl,
      },
    };

    const media = facade.collectMessageMedia(userMessage);

    expect(media.videoUrl).toBeUndefined();
    expect(media.imageUrl).toBeUndefined();
    expect(media.attachments).toEqual([
      {
        url: uploadedVideoUrl,
        storagePath,
        type: 'video',
        name: 'highlight.mp4',
        thumbnailUrl,
      },
    ]);
  });

  it('keeps tool_call context when an ask_user card is pending', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('tool-ask-1', 'assistant_tool_call', {
        operationId: 'op-ask-1',
        content: 'I need a few quick answers before I continue.',
      }),
      assistantMessage('partial-ask-1', 'assistant_partial', {
        operationId: 'op-ask-1',
        content: 'Quick Question',
        parts: [
          {
            type: 'card',
            card: {
              type: 'ask_user',
              agentId: 'router' as never,
              title: 'Quick Question',
              payload: {
                prompt: 'What division level are you targeting?',
                yieldState: { reason: 'needs_input', operationId: 'op-ask-1' },
              },
            },
          },
        ],
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    expect(ids).toContain('tool-ask-1');
    expect(ids).toContain('partial-ask-1');
  });

  it('keeps last pre-yield tool_call when ask_user is pending as assistant_yield only', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('ask-pending-tool-1', 'assistant_tool_call', {
        operationId: 'op-ask-pending',
        content: 'Gathering options...',
      }),
      assistantMessage('ask-pending-tool-2', 'assistant_tool_call', {
        operationId: 'op-ask-pending',
        content: 'What is your top priority among these options?',
      }),
      assistantMessage('ask-pending-yield', 'assistant_yield', {
        operationId: 'op-ask-pending',
        content: 'top priority',
        resultData: { yieldState: { reason: 'needs_input' } },
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    expect(ids).not.toContain('ask-pending-tool-1');
    expect(ids).toContain('ask-pending-tool-2');
    expect(ids).not.toContain('ask-pending-yield');
  });

  // ── Regression: Bug A ─────────────────────────────────────────────────────
  // Approval flow should preserve prior tool_call context alongside card.
  it('keeps prior tool_call rows visible when a needs_approval yield is pending', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('tool-1', 'assistant_tool_call', {
        operationId: 'op-approval-2',
        content: 'Step 1: Searched DB. Found 20 colleges.',
      }),
      assistantMessage('partial-1', 'assistant_partial', {
        operationId: 'op-approval-2',
        content: 'Step 2: Drafting email...',
        parts: [
          {
            type: 'card',
            card: {
              type: 'confirmation',
              agentId: 'router' as never,
              title: 'Review and Approve Email',
              payload: {
                yieldState: { reason: 'needs_approval', operationId: 'op-approval-2' },
              },
            },
          },
        ],
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);

    const ids = canonical.map((m) => m.id);
    expect(ids).toContain('tool-1');
    expect(ids).toContain('partial-1');
  });

  // ── Regression: Bug B ─────────────────────────────────────────────────────
  // Completed approval flow should preserve pre-approval tool_call context
  // alongside assistant_final on reload.
  it('shows pre-approval tool_call context alongside assistant_final on reload (Bug B)', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('tool-1', 'assistant_tool_call', {
        operationId: 'op-approval-3',
        content: 'Step 1: Found 20 colleges. Step 2: Sending email...',
      }),
      assistantMessage('yield-1', 'assistant_yield', {
        operationId: 'op-approval-3',
        content: 'Review and approve this email before sending.',
        resultData: { yieldState: { reason: 'needs_approval', operationId: 'op-approval-3' } },
      }),
      assistantMessage('final-1', 'assistant_final', {
        operationId: 'op-approval-3',
        content: 'Both tasks completed: College search found 20. Email sent.',
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    // yield row suppressed (not user-facing); tool_call + final both visible
    expect(ids).not.toContain('yield-1');
    expect(ids).toContain('tool-1');
    expect(ids).toContain('final-1');
  });

  // ── Regression: Bug B (old sessions — no stored reason) ───────────────────
  // Old sessions have assistant_yield rows without stored reason metadata.
  // Yield detection via semanticPhase must still preserve tool_call context.
  it('shows pre-approval tool_call context for old sessions without stored yield reason', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('tool-old-1', 'assistant_tool_call', {
        operationId: 'op-old-approval',
        content: 'Step 1: Searched database.',
      }),
      assistantMessage('yield-old-1', 'assistant_yield', {
        operationId: 'op-old-approval',
        content: 'Please review the draft.',
        // No resultData — old session, written before reason storage was added
      }),
      assistantMessage('final-old-1', 'assistant_final', {
        operationId: 'op-old-approval',
        content: 'Email sent successfully.',
      }),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);
    const ids = canonical.map((m) => m.id);

    expect(ids).not.toContain('yield-old-1');
    expect(ids).toContain('tool-old-1');
    expect(ids).toContain('final-old-1');
  });

  it('only treats assistant_final as completion evidence for the matching operation', () => {
    const finalForPreviousOperation = assistantMessage('final-previous', 'assistant_final', {
      operationId: 'op-previous',
    });
    const finalForCurrentOperation = assistantMessage('final-current', 'assistant_final', {
      operationId: 'op-current',
    });

    expect(facade.hasMongoFinalForOperation([finalForPreviousOperation], 'op-current')).toBe(false);
    expect(facade.hasMongoFinalForOperation([finalForCurrentOperation], 'op-current')).toBe(true);
    expect(facade.hasMongoFinalForOperation([finalForPreviousOperation], null)).toBe(true);
  });
});
