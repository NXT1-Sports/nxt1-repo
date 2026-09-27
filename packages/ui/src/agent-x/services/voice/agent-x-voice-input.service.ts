import { Injectable, computed, inject, signal } from '@angular/core';
import { AGENT_X_VOICE_INPUT_ADAPTER } from './agent-x-voice-input.token';
import {
  joinVoicePromptParts,
  type AgentXVoiceInputStartOptions,
} from './agent-x-voice-input.types';

@Injectable({ providedIn: 'root' })
export class AgentXVoiceInputService {
  private readonly adapter = inject(AGENT_X_VOICE_INPUT_ADAPTER);
  private readonly basePrompt = signal('');

  readonly available = computed(() => this.adapter.available());
  readonly listening = computed(() => this.adapter.listening());
  readonly levels = computed(() => this.adapter.levels());
  readonly partialTranscript = computed(() => this.adapter.partialTranscript());
  readonly finalTranscript = computed(() => this.adapter.finalTranscript());
  readonly composedPrompt = computed(() =>
    joinVoicePromptParts(this.basePrompt(), this.finalTranscript(), this.partialTranscript())
  );

  initialize(): void {
    this.adapter.initialize();
  }

  start(options: AgentXVoiceInputStartOptions & { readonly basePrompt?: string } = {}): void {
    this.basePrompt.set(options.basePrompt?.trim() ?? '');
    void this.adapter.start(options);
  }

  stop(options?: { readonly abort?: boolean }): void {
    this.adapter.stop(options);
  }

  destroy(): void {
    this.adapter.destroy();
    this.basePrompt.set('');
  }
}
