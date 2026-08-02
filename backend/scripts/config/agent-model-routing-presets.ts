export type AgentModelRoutingPresetName = 'production-current' | 'staging-current';

export interface AgentModelRoutingPreset {
  readonly label: string;
  readonly description: string;
  readonly catalogue: Readonly<Record<string, string>>;
  readonly fallbackChains: Readonly<Record<string, readonly string[]>>;
  readonly defaultEffortLevel: 'high' | 'medium' | 'low';
  readonly effortProfiles: Readonly<
    Record<
      'high' | 'medium' | 'low',
      {
        readonly model: string;
        readonly reasoningEffort: 'high' | 'medium' | 'low';
        readonly maxTokens: number;
        readonly temperature: number;
        readonly thinkingBudgetTokens: number;
      }
    >
  >;
}

const AGENT_X_EFFORT_PROFILES: AgentModelRoutingPreset['effortProfiles'] = {
  high: {
    model: '~anthropic/claude-sonnet-latest',
    reasoningEffort: 'high',
    maxTokens: 16000,
    temperature: 0.4,
    thinkingBudgetTokens: 8000,
  },
  medium: {
    model: 'deepseek/deepseek-v4-pro',
    reasoningEffort: 'medium',
    maxTokens: 8192,
    temperature: 0.4,
    thinkingBudgetTokens: 4000,
  },
  low: {
    model: 'google/gemini-3.6-flash',
    reasoningEffort: 'low',
    maxTokens: 4096,
    temperature: 0.5,
    thinkingBudgetTokens: 2048,
  },
} as const;

const EFFORT_ROUTED_CATALOGUE = {
  text: '~moonshotai/kimi-latest',
  image_generation: 'google/gemini-3-pro-image-preview',
  video_generation: 'google/gemini-3-pro-image-preview',
  vision_analysis: 'openai/gpt-4o',
  video_analysis: 'google/gemini-2.5-flash',
  audio_analysis: 'openai/gpt-4o',
  voice_generation: 'openai/gpt-4o-mini',
  music_generation: 'openai/gpt-4o-mini',
  embedding: 'openai/text-embedding-3-small',
  moderation: 'meta-llama/llama-guard-3-8b',
} as const;

const EFFORT_ROUTED_FALLBACK_CHAINS = {
  text: [
    '~moonshotai/kimi-latest',
    'openai/gpt-chat-latest',
    '~google/gemini-pro-latest',
    '~anthropic/claude-opus-latest',
  ],
  image_generation: ['google/gemini-3-pro-image-preview', 'openai/gpt-4o-mini'],
  video_generation: ['google/gemini-3-pro-image-preview'],
  vision_analysis: ['openai/gpt-4o', 'anthropic/claude-sonnet-4'],
  video_analysis: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro'],
  audio_analysis: ['openai/gpt-4o', 'anthropic/claude-sonnet-4'],
  voice_generation: ['openai/gpt-4o-mini'],
  music_generation: ['openai/gpt-4o-mini'],
  embedding: ['openai/text-embedding-3-small'],
  moderation: ['meta-llama/llama-guard-3-8b', 'openai/gpt-4o-mini'],
} as const;

export const AGENT_MODEL_ROUTING_PRESETS: Readonly<
  Record<AgentModelRoutingPresetName, AgentModelRoutingPreset>
> = {
  'production-current': {
    label: 'Production Current',
    description:
      'Production effort-level routing aligned with the staging-proven text and multimodal fallback chains.',
    defaultEffortLevel: 'medium',
    effortProfiles: AGENT_X_EFFORT_PROFILES,
    catalogue: EFFORT_ROUTED_CATALOGUE,
    fallbackChains: EFFORT_ROUTED_FALLBACK_CHAINS,
  },
  'staging-current': {
    label: 'Staging Current',
    description: 'Current staging/dev routing and fallback chains.',
    defaultEffortLevel: 'medium',
    effortProfiles: AGENT_X_EFFORT_PROFILES,
    catalogue: EFFORT_ROUTED_CATALOGUE,
    fallbackChains: EFFORT_ROUTED_FALLBACK_CHAINS,
  },
} as const;

export function getAgentModelRoutingPreset(
  presetName: AgentModelRoutingPresetName
): AgentModelRoutingPreset {
  return AGENT_MODEL_ROUTING_PRESETS[presetName];
}
