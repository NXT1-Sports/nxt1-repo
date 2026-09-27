import type { Signal } from '@angular/core';

export interface AgentXVoiceInputStartOptions {
  readonly language?: string;
}

export interface AgentXVoiceInputAdapter {
  readonly available: Signal<boolean>;
  readonly listening: Signal<boolean>;
  readonly levels: Signal<readonly number[]>;
  readonly partialTranscript: Signal<string>;
  readonly finalTranscript: Signal<string>;
  initialize(): void;
  start(options?: AgentXVoiceInputStartOptions): void | Promise<void>;
  stop(options?: { readonly abort?: boolean }): void;
  destroy(): void;
}

export const AGENT_X_VOICE_WAVE_BAR_COUNT = 7;
export const AGENT_X_VOICE_WAVE_IDLE_LEVEL = 0.12;

export function createIdleVoiceLevels(): number[] {
  return Array.from({ length: AGENT_X_VOICE_WAVE_BAR_COUNT }, () => AGENT_X_VOICE_WAVE_IDLE_LEVEL);
}

export function joinVoicePromptParts(...parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function calculateVoiceWaveLevel(data: Uint8Array<ArrayBuffer>): number {
  let sumSquares = 0;

  for (const sample of data) {
    const centered = (sample - 128) / 128;
    sumSquares += centered * centered;
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
  return Math.min(1, Math.max(AGENT_X_VOICE_WAVE_IDLE_LEVEL, rms * 4.8));
}
