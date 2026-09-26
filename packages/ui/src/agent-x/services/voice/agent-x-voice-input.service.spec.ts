import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentXVoiceInputService } from './agent-x-voice-input.service';
import { AGENT_X_VOICE_INPUT_ADAPTER } from './agent-x-voice-input.token';
import { createIdleVoiceLevels, type AgentXVoiceInputAdapter } from './agent-x-voice-input.types';

function createAdapterMock(): AgentXVoiceInputAdapter {
  return {
    available: signal(true),
    listening: signal(false),
    levels: signal(createIdleVoiceLevels()),
    partialTranscript: signal(''),
    finalTranscript: signal(''),
    initialize: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('AgentXVoiceInputService', () => {
  it('delegates lifecycle calls to the configured adapter', () => {
    const adapter = createAdapterMock();
    TestBed.configureTestingModule({
      providers: [{ provide: AGENT_X_VOICE_INPUT_ADAPTER, useValue: adapter }],
    });

    const service = TestBed.inject(AgentXVoiceInputService);

    service.initialize();
    service.start({ basePrompt: 'Build a practice plan', language: 'en-US' });
    service.stop();
    service.destroy();

    expect(adapter.initialize).toHaveBeenCalledOnce();
    expect(adapter.start).toHaveBeenCalledWith({
      basePrompt: 'Build a practice plan',
      language: 'en-US',
    });
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.destroy).toHaveBeenCalledOnce();
  });

  it('composes base prompt with final and partial transcripts', () => {
    const adapter = createAdapterMock();
    TestBed.configureTestingModule({
      providers: [{ provide: AGENT_X_VOICE_INPUT_ADAPTER, useValue: adapter }],
    });

    const service = TestBed.inject(AgentXVoiceInputService);
    service.start({ basePrompt: 'Build a practice plan' });
    (adapter.finalTranscript as ReturnType<typeof signal<string>>).set('for varsity receivers');
    (adapter.partialTranscript as ReturnType<typeof signal<string>>).set('with releases');

    expect(service.composedPrompt()).toBe(
      'Build a practice plan for varsity receivers with releases'
    );
  });
});
