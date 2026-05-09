import { describe, expect, it, vi } from 'vitest';
import type { AgentExecutionPlan, AgentOperationResult } from '@nxt1/core';
import { AgentRouterFinalizationService } from '../agent-router-finalization.service.js';

describe('AgentRouterFinalizationService', () => {
  it('appends artifact deliverable URLs to the aggregated summary', () => {
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

    const service = new AgentRouterFinalizationService(semanticCache as never, context, telemetry);

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
});
