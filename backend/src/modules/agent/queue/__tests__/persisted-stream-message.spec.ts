import { describe, expect, it } from 'vitest';
import { PersistedAssistantStreamBuilder } from '../persisted-stream-message.js';

describe('PersistedAssistantStreamBuilder', () => {
  it('reuses explicit step ids and ignores tool_call placeholder events', () => {
    const builder = new PersistedAssistantStreamBuilder();

    builder.process({ type: 'delta', agentId: 'router', text: 'Let me search these programs. ' });
    builder.process({
      type: 'tool_call',
      agentId: 'router',
      toolName: 'search_college_coaches',
      message: 'Search College Coaches: placeholder',
    });
    builder.process({
      type: 'step_active',
      agentId: 'router',
      stepId: 'call_ohio_state',
      toolName: 'search_college_coaches',
      message: 'Search College Coaches: Ohio State',
    });
    builder.process({
      type: 'step_active',
      agentId: 'router',
      stepId: 'call_michigan',
      toolName: 'search_college_coaches',
      message: 'Search College Coaches: Michigan',
    });
    builder.process({
      type: 'tool_result',
      agentId: 'router',
      stepId: 'call_michigan',
      toolName: 'search_college_coaches',
      toolSuccess: true,
      toolResult: { count: 1 },
      message: 'Search College Coaches: Michigan',
    });
    builder.process({
      type: 'tool_result',
      agentId: 'router',
      stepId: 'call_ohio_state',
      toolName: 'search_college_coaches',
      toolSuccess: true,
      toolResult: { count: 2 },
      message: 'Search College Coaches: Ohio State',
    });

    const snapshot = builder.snapshot();

    expect(snapshot.steps).toEqual([
      expect.objectContaining({
        id: 'call_ohio_state',
        label: 'Search College Coaches: Ohio State',
        status: 'success',
        detail: '2 result(s)',
      }),
      expect.objectContaining({
        id: 'call_michigan',
        label: 'Search College Coaches: Michigan',
        status: 'success',
        detail: '1 result(s)',
      }),
    ]);

    expect(snapshot.parts).toEqual([
      {
        type: 'text',
        content: 'Let me search these programs. ',
      },
      {
        type: 'tool-steps',
        steps: [
          expect.objectContaining({ id: 'call_ohio_state', status: 'success' }),
          expect.objectContaining({ id: 'call_michigan', status: 'success' }),
        ],
      },
    ]);
  });

  it('omits failed coordinator draft deltas from persisted assistant content', () => {
    const builder = new PersistedAssistantStreamBuilder();

    builder.process({
      type: 'delta',
      agentId: 'router',
      text: 'Routing this to Brand Coordinator. ',
    });
    builder.process({
      type: 'delta',
      agentId: 'brand_coordinator',
      text: 'STEP 1: Add text overlay. Calling ffmpeg_add_text_overlay: { "name": "ffmpeg_add_text_overlay" }',
    });
    builder.process({
      type: 'thinking',
      agentId: 'brand_coordinator',
      thinkingText: 'I will fake a tool call as text.',
    });
    builder.process({
      type: 'tool_result',
      agentId: 'router',
      toolName: 'delegate_to_coordinator',
      toolSuccess: false,
      toolResult: {
        success: false,
        data: {
          coordinator_id: 'brand_coordinator',
          user_already_received_response: false,
          follow_up_required: true,
        },
      },
      message: 'Routing to specialist coordinator: Brand & Media Coordinator',
    });
    builder.process({
      type: 'delta',
      agentId: 'router',
      text: 'Let me recover this directly.',
    });

    const snapshot = builder.snapshot();

    expect(snapshot.content).toBe(
      'Routing this to Brand Coordinator. Let me recover this directly.'
    );
    expect(snapshot.content).not.toContain('STEP 1');
    expect(snapshot.content).not.toContain('ffmpeg_add_text_overlay');
    expect(snapshot.parts).toEqual([
      {
        type: 'text',
        content: 'Routing this to Brand Coordinator. ',
      },
      {
        type: 'tool-steps',
        steps: [
          expect.objectContaining({
            label: 'Routing to specialist coordinator: Brand & Media Coordinator',
            status: 'error',
          }),
        ],
      },
      {
        type: 'text',
        content: 'Let me recover this directly.',
      },
    ]);
  });
});
