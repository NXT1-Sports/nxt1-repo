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

  it('keeps answered assistant_yield rows and suppresses the matching user reply bubble', () => {
    // Answered ask_user cards render as resolved card bubbles showing the
    // reply inline. The assistant_yield row is KEPT (rendered as resolved card).
    // The user reply message is SUPPRESSED (its text surfaces inside the card).
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

    // yield row is KEPT (renders as resolved ask_user card); user reply is suppressed
    expect(canonical.map((message) => message.id)).toEqual(['yield-1']);
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

  // ── Regression: Bug A ─────────────────────────────────────────────────────
  // When an approval card opens, it must NOT suppress the assistant_tool_call
  // rows that precede it. Only needs_input (ask_user) ops hide prior trajectory.
  // ── Regression: Bug A ─────────────────────────────────────────────────────
  // When an approval card opens, it must NOT suppress the assistant_tool_call
  // rows that precede it. Only needs_input (ask_user) ops hide prior trajectory.
  it('keeps prior tool_call rows visible when a needs_approval yield is pending (Bug A)', () => {
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

    // Both the tool_call row and the approval partial must survive — the tool
    // steps above the card must not disappear when the card renders.
    const ids = canonical.map((m) => m.id);
    expect(ids).toContain('tool-1');
    expect(ids).toContain('partial-1');
  });

  // ── Regression: Bug B ─────────────────────────────────────────────────────
  // After an approval flow completes (assistant_final exists), reloading the
  // session must show both the pre-approval tool_call context AND the final
  // completion message — not just the final.
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

    // assistant_yield is always suppressed (not user-facing)
    expect(ids).not.toContain('yield-1');
    // Pre-approval tool context must survive reload
    expect(ids).toContain('tool-1');
    // Completion message must survive reload
    expect(ids).toContain('final-1');
  });

  // ── Regression: Bug B (old sessions — no stored reason) ───────────────────
  // assistant_yield rows written before resultData.yieldState.reason was stored
  // must still keep pre-approval tool_call rows visible after completion. The
  // yieldedOperationIds set (populated by semanticPhase) is the fallback signal.
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

    expect(ids).not.toContain('yield-old-1'); // always suppressed
    expect(ids).toContain('tool-old-1'); // must survive (fallback via semanticPhase)
    expect(ids).toContain('final-old-1');
  });
});
