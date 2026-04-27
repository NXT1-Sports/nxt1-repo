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
});
