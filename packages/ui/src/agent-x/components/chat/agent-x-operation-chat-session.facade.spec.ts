import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@nxt1/core';
import { AgentXOperationChatSessionFacade } from './agent-x-operation-chat-session.facade';

type Canonicalizer = {
  resolveCanonicalAssistantRows(items: readonly AgentMessage[]): readonly AgentMessage[];
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
});
