import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { buildSseStreamCallback, type SseStreamRef } from '../agent/sse-stream-adapter.js';

function createResponseRecorder(): {
  readonly writes: string[];
  readonly response: Response & { flush: ReturnType<typeof vi.fn> };
} {
  const writes: string[] = [];
  const response = {
    writableEnded: false,
    write: vi.fn((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }),
    flush: vi.fn(),
  } as unknown as Response & { flush: ReturnType<typeof vi.fn> };

  return { writes, response };
}

function parseStepPayloads(writes: readonly string[]): Array<Record<string, unknown>> {
  return writes
    .filter((chunk) => chunk.startsWith('event: step\n'))
    .map(
      (chunk) =>
        JSON.parse(chunk.slice('event: step\ndata: '.length).trim()) as Record<string, unknown>
    );
}

function parseMediaPayloads(writes: readonly string[]): Array<Record<string, unknown>> {
  return writes
    .filter((chunk) => chunk.startsWith('event: media\n'))
    .map(
      (chunk) =>
        JSON.parse(chunk.slice('event: media\ndata: '.length).trim()) as Record<string, unknown>
    );
}

describe('buildSseStreamCallback', () => {
  it('renders canonical step ids and labels while ignoring tool_call placeholder events', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({ type: 'tool_call', toolName: 'search_college_coaches' });
    onStreamEvent({
      type: 'step_active',
      stepId: 'call_ohio_state',
      toolName: 'search_college_coaches',
      message: 'Search College Coaches: Ohio State',
    });
    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_ohio_state',
      toolName: 'search_college_coaches',
      toolSuccess: true,
      message: 'Search College Coaches: Ohio State',
    });

    expect(parseStepPayloads(writes)).toEqual([
      expect.objectContaining({
        id: 'call_ohio_state',
        label: 'Search College Coaches: Ohio State',
        status: 'active',
        emittedAt: expect.any(String),
      }),
      expect.objectContaining({
        id: 'call_ohio_state',
        label: 'Search College Coaches: Ohio State',
        status: 'success',
        emittedAt: expect.any(String),
      }),
    ]);

    expect(streamRef.invokedTools).toEqual(['search_college_coaches']);
    expect(streamRef.successfulTools).toEqual(['search_college_coaches']);
  });

  it('keeps repeated tool calls as distinct live steps when step ids are absent', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({
      type: 'step_active',
      toolName: 'read_identity_details',
      message: 'Reading identity details',
    });
    onStreamEvent({
      type: 'tool_result',
      toolName: 'read_identity_details',
      toolSuccess: true,
      // Deliberately omit message to exercise fallback label handling.
    });
    onStreamEvent({
      type: 'step_active',
      toolName: 'read_identity_details',
      message: 'Reading identity details',
    });
    onStreamEvent({
      type: 'tool_result',
      toolName: 'read_identity_details',
      toolSuccess: true,
      message: 'Reading identity details',
    });

    const stepPayloads = parseStepPayloads(writes);
    expect(stepPayloads).toHaveLength(4);

    const firstId = stepPayloads[0]['id'];
    const secondId = stepPayloads[2]['id'];

    expect(firstId).toBeTypeOf('string');
    expect(secondId).toBeTypeOf('string');
    expect(firstId).not.toBe(secondId);

    expect(stepPayloads[0]).toEqual(
      expect.objectContaining({
        id: firstId,
        label: 'Reading identity details',
        status: 'active',
      })
    );
    expect(stepPayloads[1]).toEqual(
      expect.objectContaining({
        id: firstId,
        label: 'Read Identity Details',
        status: 'success',
      })
    );
    expect(stepPayloads[2]).toEqual(
      expect.objectContaining({
        id: secondId,
        label: 'Reading identity details',
        status: 'active',
      })
    );
    expect(stepPayloads[3]).toEqual(
      expect.objectContaining({
        id: secondId,
        label: 'Reading identity details',
        status: 'success',
      })
    );
  });

  it('includes thumbnailUrl on media events for generated videos', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_video',
      toolName: 'ffmpeg_merge_videos',
      toolSuccess: true,
      message: 'Merge Videos',
      toolResult: {
        outputUrl: 'https://cdn.example.com/generated/highlight.mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/highlight-thumb.jpg',
        mimeType: 'video/mp4',
      },
    });

    expect(parseMediaPayloads(writes)).toEqual([
      {
        type: 'video',
        url: 'https://cdn.example.com/generated/highlight.mp4',
        mimeType: 'video/mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/highlight-thumb.jpg',
      },
    ]);
  });

  it('includes nested data.thumbnailUrl on media events for trimmed videos', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_trim_video',
      toolName: 'ffmpeg_trim_video',
      toolSuccess: true,
      message: 'Trim Video',
      toolResult: {
        success: true,
        data: {
          outputUrl: 'https://cdn.example.com/generated/trimmed.mp4',
          videoUrl: 'https://cdn.example.com/generated/trimmed.mp4',
          thumbnailUrl: 'https://cdn.example.com/generated/trimmed-thumbnail.jpg',
        },
      },
    });

    expect(parseMediaPayloads(writes)).toEqual([
      {
        type: 'video',
        url: 'https://cdn.example.com/generated/trimmed.mp4',
        thumbnailUrl: 'https://cdn.example.com/generated/trimmed-thumbnail.jpg',
      },
    ]);
  });

  it('uses nested MCP result output_path images as generated video thumbnails', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser%2Fthreads%2Fthread%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=video';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser%2Fthreads%2Fthread%2Fmedia%2Fstaged%2Fvideo%2Fhighlight-frame.jpg?alt=media&token=thumb';

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_highlight',
      toolName: 'create_highlight_video',
      toolSuccess: true,
      message: 'Create Highlight Video',
      toolResult: {
        data: {
          videoUrl,
          result: {
            output_path: thumbnailUrl,
          },
        },
      },
    });

    expect(parseMediaPayloads(writes)).toContainEqual({
      type: 'video',
      url: videoUrl,
      thumbnailUrl,
    });
  });

  it('uses hash-named staged video images as media thumbnails without emitting image events', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3aa6402766724d2f9c5c1e%2Fmedia%2Fstaged%2Fvideo%2F0ada21afec7f458492107e7adfd6af68.mp4?alt=media&token=-WsmAs8l3CrNGb9L8mcVKQKtz2bkv4N94CqdvzAwfm8';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3aa6402766724d2f9c5c1e%2Fmedia%2Fstaged%2Fvideo%2F24cf3ab58a9c4d8db48f9cd20b392e76.jpg?alt=media&token=XHGW1DdEKqjDnBo_A9TDZTJ4SHhzJA3FrjnBT57n14s';
    const secondThumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2FMxQHGSNx8CbRJU1cMkB29YFN7Jo1%2Fthreads%2F6a3aa6402766724d2f9c5c1e%2Fmedia%2Fstaged%2Fvideo%2F4b61320cbbcd425c9ad71215ab760202.jpg?alt=media&token=dz-j3J-WNEo43iA2txKNJUZqD1RAwb_CrUycoLmwbv0';

    const onStreamEvent = buildSseStreamCallback(response, streamRef);

    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_stage_media',
      toolName: 'stage_media',
      toolSuccess: true,
      message: 'Stage Media',
      toolResult: {
        persistedMediaUrls: [thumbnailUrl, secondThumbnailUrl, videoUrl],
      },
    });

    expect(parseMediaPayloads(writes)).toEqual([
      {
        type: 'video',
        url: videoUrl,
        thumbnailUrl,
      },
    ]);
  });

  it('suppresses media events that echo the user uploaded attachment URL', () => {
    const { writes, response } = createResponseRecorder();
    const streamRef: SseStreamRef = {
      invokedTools: [],
      successfulTools: [],
      model: '',
      tokenUsage: undefined,
      pendingAutoOpenPanel: null,
    };
    const userVideoUrl = 'https://cdn.example.com/user/source-clip.mp4';

    const onStreamEvent = buildSseStreamCallback(response, streamRef, {
      userAttachmentUrls: new Set([userVideoUrl]),
    });

    onStreamEvent({
      type: 'tool_result',
      stepId: 'call_stage_media',
      toolName: 'stage_media',
      toolSuccess: true,
      message: 'Stage Media',
      toolResult: {
        videoUrl: `${userVideoUrl}#poster=${encodeURIComponent('https://cdn.example.com/thumb.jpg')}`,
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        mimeType: 'video/mp4',
      },
    });

    expect(parseMediaPayloads(writes)).toEqual([]);
  });
});
