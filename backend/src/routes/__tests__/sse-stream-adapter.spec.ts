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
});
