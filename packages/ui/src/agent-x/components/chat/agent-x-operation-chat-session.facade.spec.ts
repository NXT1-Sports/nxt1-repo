import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@nxt1/core';
import { AgentXOperationChatSessionFacade } from './agent-x-operation-chat-session.facade';

type Canonicalizer = {
  resolveCanonicalAssistantRows(items: readonly AgentMessage[]): readonly AgentMessage[];
  coercePersistedYieldStateFromMessage(
    message: AgentMessage,
    persistedCards: readonly AgentMessage['cards']
  ): unknown;
  hasYieldedAssistantRowForOperation(
    messages: readonly Array<{
      role: string;
      operationId?: string;
      yieldState?: AgentMessage['resultData'];
      cards?: AgentMessage['cards'];
      parts?: AgentMessage['parts'];
    }>,
    operationId: string
  ): boolean;
  hasMongoFinalForOperation(items: readonly AgentMessage[], operationId: string | null): boolean;
  collectMessageMedia(message: AgentMessage): {
    imageUrl?: string;
    videoUrl?: string;
    attachments?: Array<{ url: string; type: 'image' | 'video' | 'doc' | 'app'; name: string }>;
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

  it('keeps only the latest assistant_partial while a final row does not exist yet', () => {
    const items: readonly AgentMessage[] = [
      assistantMessage('partial-1', 'assistant_partial'),
      assistantMessage('partial-2', 'assistant_partial'),
    ];

    const canonical = facade.resolveCanonicalAssistantRows(items);

    expect(canonical.map((message) => message.id)).toEqual(['partial-2']);
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

  it('promotes persisted graphic URLs into image media and strips the raw URL from prose', () => {
    const content = [
      'Your Crown Point Football stat graphic is complete featuring:',
      '',
      'Graphic URL:',
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/users/demo/graphic.png',
      '',
      'Want me to post this to your timeline or make any adjustments?',
    ].join('\n');

    const media = facade.collectMessageMedia(
      assistantMessage('final-graphic', 'assistant_final', {
        content,
      })
    );
    const displayContent = facade.stripDisplayedMediaUrlsFromContent(content, media);

    expect(media.imageUrl).toBe(
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/users/demo/graphic.png'
    );
    expect(media.attachments).toEqual([
      {
        url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/users/demo/graphic.png',
        type: 'image',
        name: 'media-image-1.jpg',
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

  it('keeps user-uploaded video as a single attachment without promoting assistant media fields', () => {
    const uploadedVideoUrl = 'https://cdn.example.com/uploads/highlight.mp4';
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
          name: 'highlight.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 4096,
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
        type: 'video',
        name: 'highlight.mp4',
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
