export type AgentModelRoutingPresetName = 'production-current' | 'staging-current';

export interface AgentModelRoutingPreset {
  readonly label: string;
  readonly description: string;
  readonly catalogue: Readonly<Record<string, string>>;
  readonly fallbackChains: Readonly<Record<string, readonly string[]>>;
}

export const AGENT_MODEL_ROUTING_PRESETS: Readonly<
  Record<AgentModelRoutingPresetName, AgentModelRoutingPreset>
> = {
  'production-current': {
    label: 'Production Current',
    description: 'Current production-grade 2026 routing and fallback chains.',
    catalogue: {
      routing: '~anthropic/claude-sonnet-latest',
      extraction: 'anthropic/claude-opus-4.7',
      data_heavy: 'x-ai/grok-4.3',
      evaluator: 'anthropic/claude-opus-4.7',
      compliance: 'openai/o1',
      copywriting: '~anthropic/claude-opus-latest',
      prompt_engineering: '~anthropic/claude-sonnet-latest',
      chat: 'openai/gpt-chat-latest',
      task_automation: 'openai/gpt-5.5-pro',
      image_generation: 'google/gemini-3-pro-image-preview',
      video_generation: 'google/gemini-3-pro-image-preview',
      vision_analysis: '~google/gemini-pro-latest',
      video_analysis: 'google/gemini-3.1-pro-preview',
      audio_analysis: 'openai/gpt-5.5',
      voice_generation: 'openai/gpt-audio-mini',
      music_generation: 'google/lyria-3-pro-preview',
      embedding: 'openai/text-embedding-3-small',
      moderation: 'meta-llama/llama-guard-3-8b',
    },
    fallbackChains: {
      routing: [
        '~anthropic/claude-sonnet-latest',
        'mistralai/mistral-medium-3-5',
        'anthropic/claude-opus-4.7',
        'openai/gpt-5.5-pro',
      ],
      extraction: ['anthropic/claude-opus-4.7', 'openai/o1', 'openai/gpt-4o-mini'],
      data_heavy: ['x-ai/grok-4.3', 'openai/o3-deep-research', 'openai/gpt-5.5-pro'],
      evaluator: ['anthropic/claude-opus-4.7', 'openai/o1', 'anthropic/claude-sonnet-4'],
      compliance: ['openai/o1', 'anthropic/claude-opus-4.7', 'openai/gpt-4o'],
      copywriting: [
        '~anthropic/claude-opus-latest',
        'openai/gpt-5.5-pro',
        'anthropic/claude-opus-4.5',
      ],
      prompt_engineering: [
        '~anthropic/claude-sonnet-latest',
        'openai/o1',
        'anthropic/claude-opus-4.7',
        'openai/gpt-4o',
      ],
      chat: ['openai/gpt-chat-latest', 'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.5'],
      task_automation: [
        'openai/gpt-5.5-pro',
        'mistralai/mistral-medium-3-5',
        'anthropic/claude-opus-4.7',
      ],
      image_generation: ['google/gemini-3-pro-image-preview', 'openai/gpt-5.4-image-2'],
      video_generation: ['google/gemini-3-pro-image-preview'],
      vision_analysis: [
        '~google/gemini-pro-latest',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'openai/gpt-5.5-pro',
        'openai/gpt-4o',
      ],
      video_analysis: [
        'google/gemini-3.1-pro-preview',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
      ],
      audio_analysis: [
        'openai/gpt-5.5',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'openai/gpt-4o',
      ],
      voice_generation: ['openai/gpt-audio-mini', 'openai/gpt-4o-mini-tts-2025-12-15'],
      music_generation: ['google/lyria-3-pro-preview', 'google/lyria-3-clip-preview'],
      embedding: ['openai/text-embedding-3-small'],
      moderation: ['meta-llama/llama-guard-3-8b', 'openai/gpt-4o-mini'],
    },
  },
  'staging-current': {
    label: 'Staging Current',
    description: 'Current staging/dev routing and fallback chains.',
    catalogue: {
      routing: '~google/gemini-pro-latest',
      extraction: 'anthropic/claude-haiku-4-5',
      data_heavy: 'qwen/qwen3.6-plus',
      evaluator: 'minimax/minimax-m2.7',
      compliance: 'openai/gpt-4o',
      copywriting: 'anthropic/claude-sonnet-4-5',
      prompt_engineering: '~anthropic/claude-sonnet-latest',
      chat: 'anthropic/claude-haiku-4-5',
      task_automation: 'anthropic/claude-sonnet-4-5',
      image_generation: 'google/gemini-3-pro-image-preview',
      video_generation: 'google/gemini-3-pro-image-preview',
      vision_analysis: 'openai/gpt-4o',
      video_analysis: 'google/gemini-2.5-flash',
      audio_analysis: 'openai/gpt-4o',
      voice_generation: 'openai/gpt-4o-mini',
      music_generation: 'openai/gpt-4o-mini',
      embedding: 'openai/text-embedding-3-small',
      moderation: 'meta-llama/llama-guard-3-8b',
    },
    fallbackChains: {
      routing: [
        '~google/gemini-pro-latest',
        'openai/gpt-4o',
        'anthropic/claude-haiku-4-5',
        'deepseek/deepseek-v3.2',
      ],
      extraction: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'qwen/qwen3.6-plus'],
      data_heavy: ['qwen/qwen3.6-plus', 'anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini'],
      evaluator: ['minimax/minimax-m2.7', 'anthropic/claude-sonnet-4', 'openai/gpt-4o'],
      compliance: [
        'openai/gpt-4o',
        'anthropic/claude-sonnet-4',
        'anthropic/claude-haiku-4-5',
        'deepseek/deepseek-v3.2',
      ],
      copywriting: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'qwen/qwen3.6-plus'],
      prompt_engineering: [
        '~anthropic/claude-sonnet-latest',
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'anthropic/claude-haiku-4-5',
        'deepseek/deepseek-v3.2',
      ],
      chat: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'deepseek/deepseek-v3.2'],
      task_automation: [
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'anthropic/claude-haiku-4-5',
        'deepseek/deepseek-v3.2',
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
    },
  },
} as const;

export function getAgentModelRoutingPreset(
  presetName: AgentModelRoutingPresetName
): AgentModelRoutingPreset {
  return AGENT_MODEL_ROUTING_PRESETS[presetName];
}
