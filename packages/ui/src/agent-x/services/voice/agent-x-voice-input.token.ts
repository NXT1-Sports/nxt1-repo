import { InjectionToken, inject } from '@angular/core';
import { CompositeVoiceInputAdapter } from './composite-voice-input.adapter';
import type { AgentXVoiceInputAdapter } from './agent-x-voice-input.types';

export const AGENT_X_VOICE_INPUT_ADAPTER = new InjectionToken<AgentXVoiceInputAdapter>(
  'AGENT_X_VOICE_INPUT_ADAPTER',
  {
    providedIn: 'root',
    factory: () => inject(CompositeVoiceInputAdapter),
  }
);
