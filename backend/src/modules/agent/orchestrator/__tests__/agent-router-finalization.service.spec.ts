import { describe, expect, it, vi } from 'vitest';
import type { AgentExecutionPlan, AgentOperationResult } from '@nxt1/core';
import { AgentRouterFinalizationService } from '../agent-router-finalization.service.js';

describe('AgentRouterFinalizationService', () => {
  function createService() {
    const semanticCache = {
      store: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      appendAssistantMessage: vi.fn(),
    };
    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    return {
      service: new AgentRouterFinalizationService(semanticCache as never, context, telemetry),
      context,
    };
  }

  it('appends artifact deliverable URLs to the aggregated summary', () => {
    const { service, context } = createService();

    const resultWithDeliverables: AgentOperationResult = {
      summary: 'Created your game plan and diagrams.',
      artifacts: {
        pdfUrl: 'https://cdn.example.com/playsheet.pdf',
        imageUrl: 'https://cdn.example.com/diagram-1.png',
      },
      data: {
        diagramUrl: 'https://cdn.example.com/diagram-2.png',
        chartUrl: 'https://cdn.example.com/chart-1.png',
        sourceImageUrl: 'https://upstream.example.com/source-chart.png',
        files: [
          {
            url: 'https://cdn.example.com/board-diagram.png',
            downloadUrl: 'https://cdn.example.com/board-diagram-download.png',
          },
        ],
        attachments: [
          {
            url: 'https://cdn.example.com/final-graphic.png',
          },
        ],
        mediaArtifact: {
          url: 'https://cdn.example.com/final-video.mp4',
        },
        sourceUrl: 'https://origin.example.com/raw-video.mp4',
      },
    };

    const taskResults = new Map<string, AgentOperationResult>([['task-1', resultWithDeliverables]]);

    const aggregated = service.finalize({
      operationId: 'op-1',
      userId: 'user-1',
      threadId: 'thread-1',
      plan: { summary: 'Plan summary', tasks: [] } as unknown as AgentExecutionPlan,
      taskResults,
      mutableTasks: [],
      scopedIntent: 'Build a 7-on-7 game plan',
    });

    expect(aggregated.summary).toContain('Deliverables:');
    expect(aggregated.summary).toContain('https://cdn.example.com/playsheet.pdf');
    expect(aggregated.summary).toContain('https://cdn.example.com/diagram-1.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/diagram-2.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/chart-1.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/board-diagram.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/board-diagram-download.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/final-graphic.png');
    expect(aggregated.summary).toContain('https://cdn.example.com/final-video.mp4');
    expect(aggregated.summary).not.toContain('https://upstream.example.com/source-chart.png');
    expect(aggregated.summary).not.toContain('https://origin.example.com/raw-video.mp4');
    expect(context.appendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      aggregated.summary
    );
  });

  it('attaches video thumbnails as poster fragments in deliverable links', () => {
    const { service } = createService();
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed.mp4?alt=media&token=video';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed-thumbnail.jpg?alt=media&token=thumb';
    const resultWithTrimmedVideo: AgentOperationResult = {
      summary: 'Trimmed the first 5 seconds from your clip.',
      data: {
        outputUrl: videoUrl,
        videoUrl,
        thumbnailUrl,
      },
    };

    const aggregated = service.finalize({
      operationId: 'op-1',
      userId: 'user-1',
      threadId: 'thread-1',
      plan: { summary: 'Plan summary', tasks: [] } as unknown as AgentExecutionPlan,
      taskResults: new Map<string, AgentOperationResult>([['task-1', resultWithTrimmedVideo]]),
      mutableTasks: [],
      scopedIntent: 'trim first 5 seconds',
    });

    const expectedPosterFragment = `#poster=${encodeURIComponent(thumbnailUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )}`;
    expect(aggregated.summary).toContain(
      `[▶ Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed.mp4](${videoUrl}${expectedPosterFragment})`
    );
    expect(aggregated.summary).not.toContain(`![](${thumbnailUrl})`);
  });

  it('uses signed GCS posterUrl fields as video poster fragments', () => {
    const { service } = createService();
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed.mp4?alt=media&token=video';
    const posterUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-1/media/staged/video/trimmed-poster.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc';
    const resultWithTrimmedVideo: AgentOperationResult = {
      summary: 'Done. Trimmed Video:',
      data: {
        outputUrl: videoUrl,
        posterUrl,
      },
    };

    const aggregated = service.finalize({
      operationId: 'op-1',
      userId: 'user-1',
      threadId: 'thread-1',
      plan: { summary: 'Plan summary', tasks: [] } as unknown as AgentExecutionPlan,
      taskResults: new Map<string, AgentOperationResult>([['task-1', resultWithTrimmedVideo]]),
      mutableTasks: [],
      scopedIntent: 'trim first 5 seconds',
    });

    const expectedPosterFragment = `#poster=${encodeURIComponent(posterUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )}`;
    expect(aggregated.summary).toContain(`${videoUrl}${expectedPosterFragment}`);
    expect(aggregated.summary).not.toContain(`![](${posterUrl})`);
  });

  it('enriches existing video links in the assistant summary with poster fragments', () => {
    const { service } = createService();
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed.mp4?alt=media&token=video';
    const thumbnailUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-1/media/staged/video/trimmed-thumbnail.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc';
    const resultWithTrimmedVideo: AgentOperationResult = {
      summary: `✅ **Done!** The first 5 seconds have been removed.\n\n**📹 Trimmed Video:**\n[View Video](${videoUrl})`,
      data: {
        outputUrl: videoUrl,
        thumbnailUrl,
      },
    };

    const aggregated = service.finalize({
      operationId: 'op-1',
      userId: 'user-1',
      threadId: 'thread-1',
      plan: { summary: 'Plan summary', tasks: [] } as unknown as AgentExecutionPlan,
      taskResults: new Map<string, AgentOperationResult>([['task-1', resultWithTrimmedVideo]]),
      mutableTasks: [],
      scopedIntent: 'trim first 5 seconds',
    });

    const expectedPosterFragment = `#poster=${encodeURIComponent(thumbnailUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )}`;
    expect(aggregated.summary).toContain(`[View Video](${videoUrl}${expectedPosterFragment})`);
    expect(aggregated.summary).not.toContain(`[View Video](${videoUrl})`);
    expect(aggregated.summary).not.toContain('Deliverables:');
  });

  it('uses a generated graphic deliverable as the poster for a single video deliverable', () => {
    const { service } = createService();
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=video';
    const graphicUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fimage%2Fsuperhero-graphic.png?alt=media&token=graphic';
    const resultWithGraphicAndVideo: AgentOperationResult = {
      summary: `Highlight video ready:\n[View Video](${videoUrl})`,
      data: {
        imageUrl: graphicUrl,
        videoUrl,
      },
    };

    const aggregated = service.finalize({
      operationId: 'op-1',
      userId: 'user-1',
      threadId: 'thread-1',
      plan: { summary: 'Plan summary', tasks: [] } as unknown as AgentExecutionPlan,
      taskResults: new Map<string, AgentOperationResult>([['task-1', resultWithGraphicAndVideo]]),
      mutableTasks: [],
      scopedIntent: 'create highlight video with superhero graphic',
    });

    const expectedPosterFragment = `#poster=${encodeURIComponent(graphicUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )}`;
    expect(aggregated.summary).toContain(`[View Video](${videoUrl}${expectedPosterFragment})`);
    expect(aggregated.summary).not.toContain(`[View Video](${videoUrl})`);
  });
});
