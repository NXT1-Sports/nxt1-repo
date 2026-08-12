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

  it('does not persist DSML tool-call markup as assistant text', () => {
    const builder = new PersistedAssistantStreamBuilder();

    builder.process({
      type: 'delta',
      agentId: 'performance_coordinator',
      text: 'Your PDF is ready. <｜DSML｜tool_calls>\n<｜DSML｜invoke name="dynamic_export">\n<｜DSML｜parameter name="format" string="true">pdf</｜DSML｜parameter>',
    });
    builder.process({
      type: 'delta',
      agentId: 'performance_coordinator',
      text: ' Clean summary after the export.',
    });

    const snapshot = builder.snapshot();

    expect(snapshot.content).toContain('Your PDF is ready.');
    expect(snapshot.content).toContain('Clean summary after the export.');
    expect(snapshot.content).not.toContain('<｜DSML｜');
    expect(snapshot.content).not.toContain('dynamic_export');
    expect(JSON.stringify(snapshot.parts)).not.toContain('<｜DSML｜');
    expect(JSON.stringify(snapshot.parts)).not.toContain('dynamic_export');
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

  it('preserves yield state embedded in confirmation cards', () => {
    const builder = new PersistedAssistantStreamBuilder();

    builder.process({
      type: 'card',
      agentId: 'recruiting_coordinator',
      cardData: {
        type: 'confirmation',
        agentId: 'recruiting_coordinator',
        title: 'Review and Approve Email',
        payload: {
          message: 'Review this email before sending.',
          variant: 'email',
          actions: [
            { id: 'reject', label: 'Reject', variant: 'secondary' },
            { id: 'approve', label: 'Send', variant: 'primary' },
          ],
          approvalId: 'approval-123',
          toolCallId: 'tool-call-1',
          operationId: 'op-456',
          yieldState: {
            reason: 'needs_approval',
            promptToUser: 'Review this email before sending.',
            agentId: 'recruiting_coordinator',
            messages: [],
            pendingToolCall: {
              toolName: 'send_email',
              toolInput: { toEmail: 'coach@example.com', subject: 'Hello' },
              toolCallId: 'tool-call-1',
            },
            approvalId: 'approval-123',
            yieldedAt: '2026-06-12T00:00:00.000Z',
            expiresAt: '2026-06-13T00:00:00.000Z',
          },
        },
      },
    });

    const snapshot = builder.snapshot();
    const cardPart = snapshot.parts.find((part) => part.type === 'card');

    expect(cardPart).toEqual(
      expect.objectContaining({
        type: 'card',
        card: expect.objectContaining({
          type: 'confirmation',
          payload: expect.objectContaining({
            approvalId: 'approval-123',
            yieldState: expect.objectContaining({
              reason: 'needs_approval',
              approvalId: 'approval-123',
              pendingToolCall: expect.objectContaining({
                toolName: 'send_email',
                toolCallId: 'tool-call-1',
              }),
            }),
          }),
        }),
      })
    );
  });

  it('drops a re-emitted final answer body when the same agent restates it after a card', () => {
    const builder = new PersistedAssistantStreamBuilder();

    const answerBody =
      "Crown Point Bulldogs — Highlight Clip COMPLETE.\n\nHere's the breakdown of every cut, overlay, and transition I stitched together so you can play it back from the link below.";

    // Router prelude (different agent — must be preserved).
    builder.process({
      type: 'delta',
      agentId: 'router',
      text: 'Routing your clip to Brand Coordinator to turn it into an elite highlight video right now.',
    });

    // Brand coordinator emits its full final answer once.
    builder.process({
      type: 'delta',
      agentId: 'brand_coordinator',
      text: answerBody,
    });

    // ffmpeg tool runs and yields a video card.
    builder.process({
      type: 'card',
      agentId: 'brand_coordinator',
      cardData: {
        type: 'video',
        agentId: 'brand_coordinator',
        title: 'Crown Point Bulldogs — Highlight Clip',
        payload: {
          videoUrl: 'https://storage.googleapis.com/example/highlight.mp4',
          posterUrl: 'https://storage.googleapis.com/example/poster.jpg',
        },
      },
    });

    // LLM restates the same answer in the next streaming pass (the bug).
    builder.process({
      type: 'delta',
      agentId: 'brand_coordinator',
      text: answerBody,
    });

    const snapshot = builder.snapshot();

    // The answer body must appear exactly once in the persisted content.
    const occurrences = snapshot.content.split(answerBody).length - 1;
    expect(occurrences).toBe(1);

    // Router prelude survives; only the duplicate brand_coordinator body is dropped.
    expect(snapshot.content).toContain(
      'Routing your clip to Brand Coordinator to turn it into an elite highlight video right now.'
    );

    // Parts collapse to: router prelude, card, single coordinator body.
    const textParts = snapshot.parts.filter((part) => part.type === 'text');
    expect(textParts).toHaveLength(2);
    const coordinatorBodies = textParts.filter((part) => part.content === answerBody);
    expect(coordinatorBodies).toHaveLength(1);
  });

  it('keeps the most-complete restated answer when the second pass adds detail', () => {
    const builder = new PersistedAssistantStreamBuilder();

    const draft = 'Highlight ready. Watch it now and let me know what to tweak.';
    const refined =
      'Highlight ready. Watch it now and let me know what to tweak. Full breakdown below — overlays, transitions, and timing notes for each cut.';

    builder.process({ type: 'delta', agentId: 'brand_coordinator', text: draft });
    builder.process({
      type: 'card',
      agentId: 'brand_coordinator',
      cardData: {
        type: 'video',
        agentId: 'brand_coordinator',
        title: 'Highlight',
        payload: { videoUrl: 'https://example.com/h.mp4' },
      },
    });
    builder.process({ type: 'delta', agentId: 'brand_coordinator', text: refined });

    const snapshot = builder.snapshot();
    const textParts = snapshot.parts.filter((part) => part.type === 'text');

    expect(textParts).toHaveLength(1);
    expect((textParts[0] as { content: string }).content).toBe(refined);
    expect(snapshot.content).toBe(refined);
  });

  it('does not dedupe text parts emitted by different agents', () => {
    const builder = new PersistedAssistantStreamBuilder();

    const sharedText =
      'On it — kicking off the full Crown Point Bulldogs highlight build right now.';

    builder.process({ type: 'delta', agentId: 'router', text: sharedText });
    builder.process({ type: 'delta', agentId: 'brand_coordinator', text: sharedText });

    const snapshot = builder.snapshot();
    const textParts = snapshot.parts.filter((part) => part.type === 'text');

    // Different agents — keep both even though content matches.
    expect(textParts).toHaveLength(2);
  });
});
