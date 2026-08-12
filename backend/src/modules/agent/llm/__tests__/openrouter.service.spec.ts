/**
 * @fileoverview OpenRouter Service — Unit Tests
 * @module @nxt1/backend/modules/agent/llm
 *
 * Tests the LLM service layer in isolation by mocking the HTTP fetch call.
 * No real API calls are made — these are fast, deterministic unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { OpenRouterService } from '../openrouter.service.js';
import { IMAGE_MODEL, MODEL_CATALOGUE, resolveSafeImageGenerationModel } from '../llm.types.js';
import {
  DEFAULT_AGENT_APP_CONFIG,
  setCachedAgentAppConfig,
} from '../../config/agent-app-config.js';

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const MOCK_RESPONSE = {
  id: 'gen-test-001',
  model: 'openai/gpt-chat-latest',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello from the mock LLM.',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 10,
    total_tokens: 60,
  },
};

const MOCK_TOOL_RESPONSE = {
  id: 'gen-test-002',
  model: 'anthropic/claude-sonnet-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_001',
            type: 'function',
            function: {
              name: 'fetch_player_stats',
              arguments: '{"userId":"user-123","sport":"football"}',
            },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 30,
    total_tokens: 130,
  },
};

function createSseResponse(events: readonly string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`${event}\n`));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Set required env vars
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key-123');
    vi.stubEnv('OPENROUTER_SITE_URL', 'https://test.nxt1.com');
    vi.stubEnv('OPENROUTER_SITE_NAME', 'NXT1 Test');

    // Mock global fetch
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    service = new OpenRouterService({
      hydrateAgentConfig: async () => undefined,
    });
  });

  afterEach(() => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ─── Constructor ────────────────────────────────────────────────────────

  it('should throw if OPENROUTER_API_KEY is missing', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(() => new OpenRouterService()).toThrow('OPENROUTER_API_KEY is not set');
  });

  it('should construct successfully with valid env vars', () => {
    expect(service).toBeInstanceOf(OpenRouterService);
  });

  // ─── complete() ─────────────────────────────────────────────────────────

  it('should send a properly formatted request to OpenRouter', async () => {
    const result = await service.complete(
      [
        { role: 'system', content: 'You are a test agent.' },
        { role: 'user', content: 'Hello' },
      ],
      { tier: 'text', maxTokens: 512, temperature: 0.5 }
    );

    // Verify fetch was called with correct URL and headers
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key-123');
    expect(headers['HTTP-Referer']).toBe('https://test.nxt1.com');
    expect(headers['X-Title']).toBe('NXT1 Test');
    expect(headers['Content-Type']).toBe('application/json');

    // Verify the request body
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe(MODEL_CATALOGUE['text']);
    expect(body.messages).toHaveLength(2);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.5);

    // Verify the parsed result
    expect(result.content).toBe('Hello from the mock LLM.');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.model).toBe('openai/gpt-chat-latest');
    expect(result.usage.inputTokens).toBe(50);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.usage.totalTokens).toBe(60);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.finishReason).toBe('stop');
  });

  it('should resolve model tier to correct slug', async () => {
    await service.complete([{ role: 'user', content: 'test' }], { tier: 'text' });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe(MODEL_CATALOGUE['text']);
  });

  it('should allow modelOverride to bypass tier resolution', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: 'openai/gpt-4o',
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-4o');
  });

  it('should use Anthropic max-token reasoning when thinking mode is enabled', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: '~anthropic/claude-sonnet-latest',
      maxTokens: 12000,
      enableThinking: true,
      reasoningEffort: 'high',
      thinkingBudgetTokens: 8000,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('~anthropic/claude-sonnet-latest');
    expect(body.reasoning).toEqual({ max_tokens: 8000 });
  });

  it('should cap Anthropic thinking tokens below the completion budget', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: '~anthropic/claude-sonnet-latest',
      maxTokens: 8192,
      enableThinking: true,
      reasoningEffort: 'high',
      thinkingBudgetTokens: 10000,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('~anthropic/claude-sonnet-latest');
    expect(body.max_tokens).toBe(8192);
    expect(body.reasoning).toEqual({ max_tokens: 6144 });
  });

  it('should use effort-only reasoning for non-Anthropic thinking models', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: 'google/gemini-3.6-flash',
      enableThinking: true,
      reasoningEffort: 'low',
      thinkingBudgetTokens: 2048,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('google/gemini-3.6-flash');
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it('should keep explicit free model overrides at zero estimated cost', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...MOCK_RESPONSE,
          model: 'nvidia/nemotron-3-super-120b-a12b-20230311:free',
          usage: {
            prompt_tokens: 438,
            completion_tokens: 700,
            total_tokens: 1138,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: 'nvidia/nemotron-3-super-120b-a12b:free',
    });

    expect(result.model).toBe('nvidia/nemotron-3-super-120b-a12b-20230311:free');
    expect(result.costUsd).toBe(0);
  });

  it('should trust API-reported zero cost', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...MOCK_RESPONSE,
          usage: {
            prompt_tokens: 438,
            completion_tokens: 700,
            total_tokens: 1138,
            cost: 0,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      modelOverride: 'openai/gpt-4o',
    });

    expect(result.costUsd).toBe(0);
  });

  it('should honor runtime model routing from cached agent config', async () => {
    setCachedAgentAppConfig({
      ...DEFAULT_AGENT_APP_CONFIG,
      modelRouting: {
        ...DEFAULT_AGENT_APP_CONFIG.modelRouting,
        catalogue: {
          ...DEFAULT_AGENT_APP_CONFIG.modelRouting.catalogue,
          text: 'openai/gpt-4o-mini',
        },
        fallbackChains: {
          ...DEFAULT_AGENT_APP_CONFIG.modelRouting.fallbackChains,
          text: ['openai/gpt-4o-mini', 'openai/gpt-chat-latest'],
        },
      },
    });

    await service.complete([{ role: 'user', content: 'test' }], { tier: 'text' });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-4o-mini');
  });

  it('should hydrate model routing from Firestore-backed agent config before tier resolution', async () => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);

    const hydrateAgentConfig = vi.fn(async () => {
      const hydratedConfig = {
        ...DEFAULT_AGENT_APP_CONFIG,
        modelRouting: {
          ...DEFAULT_AGENT_APP_CONFIG.modelRouting,
          catalogue: {
            ...DEFAULT_AGENT_APP_CONFIG.modelRouting.catalogue,
            text: 'openai/gpt-4o-mini',
          },
          fallbackChains: {
            ...DEFAULT_AGENT_APP_CONFIG.modelRouting.fallbackChains,
            text: ['openai/gpt-4o-mini', 'openai/gpt-chat-latest'],
          },
        },
      };
      setCachedAgentAppConfig(hydratedConfig);
      return hydratedConfig;
    });

    const hydratedService = new OpenRouterService({ hydrateAgentConfig });

    await hydratedService.complete([{ role: 'user', content: 'test' }], { tier: 'text' });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(hydrateAgentConfig).toHaveBeenCalledTimes(1);
  });

  it('should fall back to the dedicated image model when image_generation is misconfigured', () => {
    expect(resolveSafeImageGenerationModel('~google/gemini-pro-latest')).toBe(IMAGE_MODEL);
    expect(resolveSafeImageGenerationModel('google/gemini-3-pro-image-preview')).toBe(
      'google/gemini-3-pro-image-preview'
    );
  });

  it.skip('should inline reference images before sending image generation requests', async () => {
    const imageUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Colleges/174862.png';

    fetchSpy.mockResolvedValueOnce(
      new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    );

    const result = await (
      service as unknown as {
        resolveImageInputUrl(url: string): Promise<string>;
      }
    ).resolveImageInputUrl(imageUrl);

    expect(result).toBe('data:image/png;base64,' + Buffer.from('image-bytes').toString('base64'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(imageUrl, {
      signal: undefined,
    });
  });

  it('should prefer direct OpenAI image generation when OPENAI_API_KEY is present', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-key-456');
    vi.stubEnv('HELICONE_API_KEY', 'helicone-key-789');
    const openAiService = new OpenRouterService({
      hydrateAgentConfig: async () => undefined,
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-5.5',
          output: [
            {
              type: 'image_generation_call',
              result: 'ZmFrZS1pbWFnZS1iYXNlNjQ=',
              revised_prompt: 'A tiny cat sitting in studio light.',
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 34,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const result = await openAiService.generateImage({
      prompt: 'A tiny cat',
      referenceImageUrl: 'https://example.com/ref.png',
      additionalImageUrls: ['https://example.com/logo.png'],
      telemetryContext: {
        operationId: 'op-image-123',
        userId: 'user-123',
        agentId: 'brand_coordinator',
        feature: 'generate-graphic',
      },
    });

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer openai-key-456'
    );
    expect((options.headers as Record<string, string>)['Helicone-Session-Id']).toBeUndefined();
    expect(
      (options.headers as Record<string, string>)['Helicone-Property-feature']
    ).toBeUndefined();

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('gpt-5.5');
    expect(body.tools).toEqual([{ type: 'image_generation', action: 'edit' }]);
    expect(body.input[0].content).toEqual([
      { type: 'input_text', text: 'A tiny cat' },
      { type: 'input_image', image_url: 'https://example.com/ref.png' },
      { type: 'input_image', image_url: 'https://example.com/logo.png' },
    ]);

    expect(result.imageBase64).toBe('ZmFrZS1pbWFnZS1iYXNlNjQ=');
    expect(result.textContent).toBe('A tiny cat sitting in studio light.');
    expect(result.model).toBe('openai/gpt-5.5');
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(34);
    expect(result.costUsd).toBeCloseTo(0.000546, 8);
  });

  it('should fall back to Gemini via OpenRouter when direct OpenAI image generation fails', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-key-456');
    setCachedAgentAppConfig({
      ...DEFAULT_AGENT_APP_CONFIG,
      modelRouting: {
        ...DEFAULT_AGENT_APP_CONFIG.modelRouting,
        catalogue: {
          ...DEFAULT_AGENT_APP_CONFIG.modelRouting.catalogue,
          image_generation: 'openai/gpt-5.4-image-2',
        },
        fallbackChains: {
          ...DEFAULT_AGENT_APP_CONFIG.modelRouting.fallbackChains,
          image_generation: ['google/gemini-3-pro-image-preview'],
        },
      },
    });

    const openAiService = new OpenRouterService({
      hydrateAgentConfig: async () => undefined,
    });

    fetchSpy
      .mockResolvedValueOnce(
        new Response('upstream image model unavailable', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'google/gemini-3-pro-image-preview',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Fallback image result',
                  images: [
                    {
                      image_url: {
                        url: 'data:image/png;base64,ZmFrZS1nZW1pbmktaW1hZ2U=',
                      },
                    },
                  ],
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 21,
              completion_tokens: 9,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const result = await openAiService.generateImage({
      prompt: 'Create an athlete commitment graphic',
      referenceImageUrl: 'https://example.com/athlete.png',
      additionalImageUrls: ['https://example.com/logo.png'],
    });

    const [firstUrl, firstOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe('https://api.openai.com/v1/responses');
    const firstBody = JSON.parse(firstOptions.body as string);
    expect(firstBody.tools).toEqual([{ type: 'image_generation', action: 'edit' }]);
    expect(firstBody.input[0].content).toEqual([
      { type: 'input_text', text: 'Create an athlete commitment graphic' },
      { type: 'input_image', image_url: 'https://example.com/athlete.png' },
      { type: 'input_image', image_url: 'https://example.com/logo.png' },
    ]);

    const [secondUrl, secondOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    const secondBody = JSON.parse(secondOptions.body as string);
    expect(secondBody.model).toBe('google/gemini-3-pro-image-preview');
    expect(secondBody.modalities).toEqual(['text', 'image']);
    expect(secondBody.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'https://example.com/athlete.png' } },
          { type: 'image_url', image_url: { url: 'https://example.com/logo.png' } },
          { type: 'text', text: 'Create an athlete commitment graphic' },
        ],
      },
    ]);

    expect(result.model).toBe('google/gemini-3-pro-image-preview');
    expect(result.imageBase64).toBe('ZmFrZS1nZW1pbmktaW1hZ2U=');
    expect(result.textContent).toBe('Fallback image result');
    expect(result.usage.inputTokens).toBe(21);
    expect(result.usage.outputTokens).toBe(9);
  });

  // ─── Tool Calls ─────────────────────────────────────────────────────────

  it('should parse tool calls from the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TOOL_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await service.complete([{ role: 'user', content: 'Get player stats' }], {
      tools: [
        {
          type: 'function',
          function: {
            name: 'fetch_player_stats',
            description: 'Get stats for a player',
            parameters: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                sport: { type: 'string' },
              },
            },
          },
        },
      ],
    });

    expect(result.content).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe('call_001');
    expect(result.toolCalls[0].function.name).toBe('fetch_player_stats');
    expect(JSON.parse(result.toolCalls[0].function.arguments)).toEqual({
      userId: 'user-123',
      sport: 'football',
    });
    expect(result.finishReason).toBe('tool_calls');
  });

  it('should include tools and tool_choice in the request body', async () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];

    await service.complete([{ role: 'user', content: 'test' }], { tier: 'text', tools });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({
            name: expect.any(String),
          }),
        }),
      ])
    );
    expect(body.tool_choice).toBe('auto');
  });

  // ─── JSON Mode ──────────────────────────────────────────────────────────

  it('should set response_format when jsonMode is true', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      jsonMode: true,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('should emit native json_schema response_format when outputSchema is provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...MOCK_RESPONSE,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({ summary: 'Ready', items: ['a', 'b'] }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await service.complete([{ role: 'user', content: 'test' }], {
      outputSchema: {
        name: 'test_payload',
        schema: z.object({ summary: z.string(), items: z.array(z.string()) }),
      },
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('test_payload');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.type).toBe('object');
  });

  it('should mark nullable schema fields as required in native json_schema output', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...MOCK_RESPONSE,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  route: 'text',
                  directResponse: 'Hi',
                  planSummary: null,
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await service.complete([{ role: 'user', content: 'test' }], {
      outputSchema: {
        name: 'conversation_route_decision',
        schema: z.object({
          route: z.enum(['text', 'plan']),
          directResponse: z.string().nullable(),
          planSummary: z.string().nullable(),
        }),
      },
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.response_format.json_schema.schema.required).toEqual([
      'route',
      'directResponse',
      'planSummary',
    ]);
  });

  it('should return parsedOutput when outputSchema is provided and content matches the schema', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'gen-123',
          model: 'openai/gpt-chat-latest',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({ summary: 'Ready', items: ['a', 'b'] }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 12 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      outputSchema: {
        name: 'test_payload',
        schema: z.object({ summary: z.string(), items: z.array(z.string()) }),
      },
    });

    expect(result.parsedOutput).toEqual({ summary: 'Ready', items: ['a', 'b'] });
  });

  // ─── prompt() Convenience Method ────────────────────────────────────────

  it('should send system + user messages via prompt()', async () => {
    const result = await service.prompt('You are a planner.', 'Analyze my highlight tape.', {});

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are a planner.');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('Analyze my highlight tape.');
    expect(result.content).toBe('Hello from the mock LLM.');
  });

  // ─── Error Handling ─────────────────────────────────────────────────────

  it('should throw OpenRouterError when ALL models in fallback chain fail', async () => {
    // With fallback, the extraction tier tries haiku then gpt-4o-mini then qwen.
    // fetchWithRetry does MAX_RETRIES=2 per model → 3 calls each.
    // Smart 429 retry adds one extra attempt per model with ~4.5s backoff.
    // Mock enough 429 responses for all models in the chain.
    const totalCalls = 40; // generous buffer for all models × retries × smart 429
    for (let i = 0; i < totalCalls; i++) {
      fetchSpy.mockResolvedValueOnce(new Response('Rate limit exceeded', { status: 429 }));
    }

    await expect(
      service.complete([{ role: 'user', content: 'test' }], { tier: 'text' })
    ).rejects.toThrow('OpenRouter API error 429');
  }, 120_000);

  it('should fallback to next model on non-200 response', async () => {
    // Override default mock: return 429 for all calls
    fetchSpy.mockResolvedValue(new Response('Rate limit exceeded', { status: 429 }));

    // After haiku exhausts retries, gpt-4o-mini gets a success response.
    // Use mockImplementation to serve success after N failures.
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      // Let the last model succeed on its first try
      // (haiku makes 3 calls with retries, then gpt-4o-mini starts)
      if (callCount >= 4) {
        return new Response(JSON.stringify(MOCK_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Rate limit exceeded', { status: 429 });
    });

    const result = await service.complete([{ role: 'user', content: 'test' }], {});
    expect(result.content).toBe('Hello from the mock LLM.');
  }, 30_000);

  it('should throw when ALL models return no choices', async () => {
    // Override default mock: every call returns a fresh empty-choices Response
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(
      service.complete([{ role: 'user', content: 'test' }], { tier: 'text' })
    ).rejects.toThrow('OpenRouter returned no choices');
  });

  // ─── Retry Logic ────────────────────────────────────────────────────────

  it('should retry on 500 and succeed on second attempt', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Internal server error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await service.complete([{ role: 'user', content: 'test' }], {});

    expect(result.content).toBe('Hello from the mock LLM.');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should fallback on 400 (non-retryable) and succeed with next model', async () => {
    // 400 is non-retryable — fetchWithRetry throws immediately.
    // Fallback chain catches it and tries the next model.
    fetchSpy
      .mockResolvedValueOnce(new Response('Bad request', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await service.complete([{ role: 'user', content: 'test' }], {});
    expect(result.content).toBe('Hello from the mock LLM.');
    // 1 call for haiku (400, no retry) + 1 for gpt-4o-mini (success)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sanitizes streamed provider errors that contain source URLs', async () => {
    const providerBody = JSON.stringify({
      error: {
        message: 'Unable to download the file from https://example.com/private-source.jpg',
        metadata: { request_id: 'provider-request-id' },
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(providerBody, { status: 400 }));

    const error = await service
      .completeStream(
        [{ role: 'user', content: 'Create a graphic.' }],
        { tier: 'text', modelOverride: 'openai/gpt-4o' },
        vi.fn()
      )
      .then(
        () => null,
        (reason: unknown) => reason
      );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'The AI provider could not access one of the supplied files. Verify the file URL and try again.'
    );
    expect((error as Error).message).not.toContain('private-source.jpg');
  });

  it('should surface streamed reasoning_details as thinking content', async () => {
    fetchSpy.mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({
          model: '~anthropic/claude-sonnet-latest',
          choices: [
            {
              index: 0,
              delta: {
                reasoning_details: [
                  {
                    type: 'reasoning.summary',
                    summary: 'Planning the response.',
                  },
                ],
              },
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { content: 'Hello from the stream.' },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.001 },
        })}`,
        'data: [DONE]',
      ])
    );

    const deltas: Array<{ content: string; done: boolean; thinkingContent?: string }> = [];

    const result = await service.completeStream(
      [{ role: 'user', content: 'test' }],
      {
        modelOverride: '~anthropic/claude-sonnet-latest',
        enableThinking: true,
        thinkingBudgetTokens: 8000,
      },
      (delta) => {
        deltas.push(delta);
      }
    );

    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: '',
          done: false,
          thinkingContent: 'Planning the response.',
        }),
        expect.objectContaining({
          content: 'Hello from the stream.',
          done: false,
        }),
        expect.objectContaining({
          content: '',
          done: true,
        }),
      ])
    );
    expect(result.content).toBe('Hello from the stream.');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('strips provider-emitted DSML tool markup from streamed assistant content', async () => {
    fetchSpy.mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({
          model: 'deepseek/deepseek-v4-pro',
          choices: [
            {
              index: 0,
              delta: { content: 'Your PDF is ready. <｜DSM' },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                content:
                  'L｜tool_calls>\n<｜DSML｜invoke name="dynamic_export">\n<｜DSML｜parameter name="format" string="true">pdf</｜DSML｜parameter>',
              },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { content: ' Download it from https://nxt1sports.com/team/demo.' },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.001 },
        })}`,
        'data: [DONE]',
      ])
    );

    const streamedText: string[] = [];

    const result = await service.completeStream(
      [{ role: 'user', content: 'Create a PDF.' }],
      { modelOverride: 'deepseek/deepseek-v4-pro' },
      (delta) => {
        if (delta.content) streamedText.push(delta.content);
      }
    );

    const streamed = streamedText.join('');
    expect(streamed).toContain('Your PDF is ready.');
    expect(streamed).toContain('Download it from https://nxt1sports.com/team/demo.');
    expect(streamed).not.toContain('<｜DSML｜');
    expect(streamed).not.toContain('dynamic_export');
    expect(result.content).toBe(streamed);
    expect(result.content).not.toContain('<｜DSML｜');
    expect(result.content).not.toContain('dynamic_export');
  });

  it('should not double emit reasoning_details when reasoning is present in the same stream chunk', async () => {
    fetchSpy.mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({
          model: '~anthropic/claude-sonnet-latest',
          choices: [
            {
              index: 0,
              delta: {
                reasoning: 'The user is Derek Director.',
                reasoning_details: [
                  {
                    type: 'reasoning.summary',
                    summary: 'The user is Derek Director.',
                  },
                ],
              },
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { content: 'Hello from the stream.' },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.001 },
        })}`,
        'data: [DONE]',
      ])
    );

    const thinkingDeltas: string[] = [];

    await service.completeStream(
      [{ role: 'user', content: 'test' }],
      {
        modelOverride: '~anthropic/claude-sonnet-latest',
        enableThinking: true,
        thinkingBudgetTokens: 8000,
      },
      (delta) => {
        if (delta.thinkingContent) thinkingDeltas.push(delta.thinkingContent);
      }
    );

    expect(thinkingDeltas.join('')).toBe('The user is Derek Director.');
  });

  it('should trim overlapping streamed reasoning fragments before emitting thinking content', async () => {
    fetchSpy.mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({
          model: '~anthropic/claude-sonnet-latest',
          choices: [
            {
              index: 0,
              delta: { reasoning: 'The user is ' },
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { reasoning: 'is Derek ' },
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { reasoning: 'Derek Director.' },
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: { content: 'Hello from the stream.' },
              finish_reason: null,
            },
          ],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.001 },
        })}`,
        'data: [DONE]',
      ])
    );

    const thinkingDeltas: string[] = [];

    await service.completeStream(
      [{ role: 'user', content: 'test' }],
      {
        modelOverride: '~anthropic/claude-sonnet-latest',
        enableThinking: true,
        thinkingBudgetTokens: 8000,
      },
      (delta) => {
        if (delta.thinkingContent) thinkingDeltas.push(delta.thinkingContent);
      }
    );

    expect(thinkingDeltas.join('')).toBe('The user is Derek Director.');
  });

  it('should NOT fallback when modelOverride is specified', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad request', { status: 400 }));

    await expect(
      service.complete([{ role: 'user', content: 'test' }], {
        modelOverride: 'openai/gpt-chat-latest',
      })
    ).rejects.toThrow('OpenRouter API error 400');

    // Only 1 call — modelOverride skips fallback chain
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should fallback across candidateModels when provided', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Bad request', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      candidateModels: ['google/gemini-3.6-flash', '~anthropic/claude-sonnet-latest'],
    });

    const firstBody = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string
    );
    const secondBody = JSON.parse(
      (fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string
    );

    expect(firstBody.model).toBe('google/gemini-3.6-flash');
    expect(secondBody.model).toBe('~anthropic/claude-sonnet-latest');
    expect(result.content).toBe('Hello from the mock LLM.');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should stop fallback chain when abort signal is triggered after first model failure', async () => {
    const controller = new AbortController();

    fetchSpy.mockImplementationOnce(async () => {
      controller.abort();
      return new Response('Bad request', { status: 400 });
    });

    await expect(
      service.complete([{ role: 'user', content: 'test' }], {
        signal: controller.signal,
      })
    ).rejects.toThrow('OpenRouter API error 400');

    // Must not attempt the next fallback model once aborted
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should skip an open-circuit model and use the next fallback model', async () => {
    fetchSpy.mockImplementation(async (_url, options) => {
      const body = JSON.parse((options as RequestInit).body as string) as { model: string };
      if (body.model === '~moonshotai/kimi-latest') {
        return new Response('Bad request', { status: 400 });
      }
      return new Response(JSON.stringify(MOCK_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // Trip circuit for first text model via repeated non-retryable failures.
    await service.complete([{ role: 'user', content: 'test-1' }], { tier: 'text' });
    await service.complete([{ role: 'user', content: 'test-2' }], { tier: 'text' });
    await service.complete([{ role: 'user', content: 'test-3' }], { tier: 'text' });

    const callsBeforeOpenSkip = fetchSpy.mock.calls.length;
    await service.complete([{ role: 'user', content: 'test-4' }], { tier: 'text' });

    // With open circuit, only one request is needed (next model succeeds immediately).
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeOpenSkip + 1);
  });

  it('should allow a half-open probe after cool-down and close circuit on success', async () => {
    const mockNow = vi.spyOn(Date, 'now');
    let nowMs = 1_000_000;
    mockNow.mockImplementation(() => nowMs);

    fetchSpy.mockImplementation(async (_url, options) => {
      const body = JSON.parse((options as RequestInit).body as string) as { model: string };
      if (body.model === '~moonshotai/kimi-latest') {
        // Initial period: fail the first text fallback to open circuit.
        if (nowMs < 1_070_000) {
          return new Response('Bad request', { status: 400 });
        }
        // After cool-down, probe succeeds.
        return new Response(
          JSON.stringify({
            ...MOCK_RESPONSE,
            model: '~moonshotai/kimi-latest',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify(MOCK_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await service.complete([{ role: 'user', content: 'trip-1' }], { tier: 'text' });
    await service.complete([{ role: 'user', content: 'trip-2' }], { tier: 'text' });
    await service.complete([{ role: 'user', content: 'trip-3' }], { tier: 'text' });

    // Immediately after open, the first text model should be skipped.
    await service.complete([{ role: 'user', content: 'skip-while-open' }], { tier: 'text' });

    // Move beyond open window so the next attempt is a half-open probe.
    nowMs = 1_070_001;
    const callsBeforeProbe = fetchSpy.mock.calls.length;

    const result = await service.complete([{ role: 'user', content: 'probe-success' }], {});

    expect(result.model).toBe('~moonshotai/kimi-latest');
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeProbe + 1);
  });

  // ─── Telemetry ──────────────────────────────────────────────────────────

  it('should emit telemetry callback after each call', async () => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
    vi.stubEnv('OPENROUTER_API_KEY', 'key-for-telemetry');
    const telemetrySpy = vi.fn();
    const serviceWithTelemetry = new OpenRouterService({
      onTelemetry: telemetrySpy,
      hydrateAgentConfig: async () => undefined,
    });

    await serviceWithTelemetry.complete([{ role: 'user', content: 'test' }], {
      telemetryContext: {
        operationId: 'op-telemetry-1',
        userId: 'user-123',
        agentId: 'router',
      },
    });

    expect(telemetrySpy).toHaveBeenCalledTimes(1);
    const record = telemetrySpy.mock.calls[0][0];
    expect(record.model).toBe('openai/gpt-chat-latest');
    expect(record.inputTokens).toBe(50);
    expect(record.outputTokens).toBe(10);
    expect(record.costUsd).toBeGreaterThan(0);
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(record.hadToolCall).toBe(false);
  });

  // ─── Cost Estimation ───────────────────────────────────────────────────

  it('should estimate cost based on known pricing', async () => {
    const result = await service.complete([{ role: 'user', content: 'test' }], {});

    // Current pricing map for openai/gpt-chat-latest in this workspace.
    const expectedCost = 0.0003;
    expect(result.costUsd).toBeCloseTo(expectedCost, 10);
  });

  // ─── Message Serialization ─────────────────────────────────────────────

  it('should strip undefined fields from messages', async () => {
    await service.complete(
      [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function' as const,
              function: { name: 'test', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: '{"result":"ok"}', tool_call_id: 'call_1' },
      ],
      { tier: 'text' }
    );

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    const messages = body.messages;

    // System message — no tool_calls or tool_call_id
    expect(messages[0]).toEqual({ role: 'system', content: 'System prompt' });
    expect(messages[0]).not.toHaveProperty('tool_calls');
    expect(messages[0]).not.toHaveProperty('tool_call_id');

    // Assistant with tool calls
    expect(messages[2].tool_calls).toHaveLength(1);

    // Tool result message
    expect(messages[3].tool_call_id).toBe('call_1');
  });
});
