import { Injectable, computed, inject, signal } from '@angular/core';
import { BackendVoiceTranscriptionAdapter } from './backend-voice-transcription.adapter';
import { BrowserSpeechVoiceInputAdapter } from './browser-speech-voice-input.adapter';
import {
  createIdleVoiceLevels,
  type AgentXVoiceInputAdapter,
  type AgentXVoiceInputStartOptions,
} from './agent-x-voice-input.types';

@Injectable({ providedIn: 'root' })
export class CompositeVoiceInputAdapter implements AgentXVoiceInputAdapter {
  private readonly browserAdapter = inject(BrowserSpeechVoiceInputAdapter);
  private readonly backendAdapter = inject(BackendVoiceTranscriptionAdapter);
  private readonly activeAdapter = signal<AgentXVoiceInputAdapter | null>(null);

  readonly available = computed(
    () => this.browserAdapter.available() || this.backendAdapter.available()
  );
  readonly listening = computed(() => this.activeAdapter()?.listening() ?? false);
  readonly levels = computed(() => this.activeAdapter()?.levels() ?? createIdleVoiceLevels());
  readonly partialTranscript = computed(() => this.activeAdapter()?.partialTranscript() ?? '');
  readonly finalTranscript = computed(() => this.activeAdapter()?.finalTranscript() ?? '');

  initialize(): void {
    this.browserAdapter.initialize();
    this.backendAdapter.initialize();
  }

  start(options?: AgentXVoiceInputStartOptions): void | Promise<void> {
    const adapter = this.browserAdapter.available() ? this.browserAdapter : this.backendAdapter;

    if (!adapter.available()) {
      return;
    }

    this.activeAdapter.set(adapter);
    return adapter.start(options);
  }

  stop(options?: { readonly abort?: boolean }): void {
    this.activeAdapter()?.stop(options);
  }

  destroy(): void {
    this.browserAdapter.destroy();
    this.backendAdapter.destroy();
    this.activeAdapter.set(null);
  }
}
