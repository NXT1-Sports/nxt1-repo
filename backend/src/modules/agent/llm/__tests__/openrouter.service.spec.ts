/**
 * @fileoverview OpenRouter Service — Unit Tests
 * @module @nxt1/backend/modules/agent/llm
 *
 * Tests the LLM service layer in isolation by mocking the HTTP fetch call.
 * No real API calls are made — these are fast, deterministic unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterService } from '../openrouter.service.js';
import { MODEL_CATALOGUE } from '../llm.types.js';

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const MOCK_RESPONSE = {
  id: 'gen-test-001',
  model: 'anthropic/claude-haiku-4-5',
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

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Set required env vars
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key-123');
    vi.stubEnv('OPENROUTER_SITE_URL', 'https://test.nxt1.com');
    vi.stubEnv('OPENROUTER_SITE_NAME', 'NXT1 Test');

    // Mock global fetch
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    service = new OpenRouterService();
  });

  afterEach(() => {
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
      { tier: 'extraction', maxTokens: 512, temperature: 0.5 }
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
    expect(body.model).toBe(MODEL_CATALOGUE['extraction']);
    expect(body.messages).toHaveLength(2);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.5);

    // Verify the parsed result
    expect(result.content).toBe('Hello from the mock LLM.');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.model).toBe('anthropic/claude-haiku-4-5');
    expect(result.usage.inputTokens).toBe(50);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.usage.totalTokens).toBe(60);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.finishReason).toBe('stop');
  });

  it('should resolve model tier to correct slug', async () => {
    await service.complete([{ role: 'user', content: 'test' }], { tier: 'chat' });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe(MODEL_CATALOGUE['chat']);
  });

  it('should allow modelOverride to bypass tier resolution', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
      modelOverride: 'openai/gpt-4o',
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe('openai/gpt-4o');
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
      tier: 'chat',
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

    await service.complete([{ role: 'user', content: 'test' }], { tier: 'extraction', tools });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
  });

  // ─── JSON Mode ──────────────────────────────────────────────────────────

  it('should set response_format when jsonMode is true', async () => {
    await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
      jsonMode: true,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  // ─── prompt() Convenience Method ────────────────────────────────────────

  it('should send system + user messages via prompt()', async () => {
    const result = await service.prompt('You are a planner.', 'Analyze my highlight tape.', {
      tier: 'extraction',
    });

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
      service.complete([{ role: 'user', content: 'test' }], { tier: 'extraction' })
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

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
    });
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
      service.complete([{ role: 'user', content: 'test' }], { tier: 'extraction' })
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

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
    });

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

    const result = await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
    });
    expect(result.content).toBe('Hello from the mock LLM.');
    // 1 call for haiku (400, no retry) + 1 for gpt-4o-mini (success)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should NOT fallback when modelOverride is specified', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad request', { status: 400 }));

    await expect(
      service.complete([{ role: 'user', content: 'test' }], {
        tier: 'extraction',
        modelOverride: 'anthropic/claude-haiku-4-5',
      })
    ).rejects.toThrow('OpenRouter API error 400');

    // Only 1 call — modelOverride skips fallback chain
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ─── Telemetry ──────────────────────────────────────────────────────────

  it('should emit telemetry callback after each call', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'key-for-telemetry');
    const telemetrySpy = vi.fn();
    const serviceWithTelemetry = new OpenRouterService({
      onTelemetry: telemetrySpy,
    });

    await serviceWithTelemetry.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
    });

    expect(telemetrySpy).toHaveBeenCalledTimes(1);
    const record = telemetrySpy.mock.calls[0][0];
    expect(record.model).toBe('anthropic/claude-haiku-4-5');
    expect(record.inputTokens).toBe(50);
    expect(record.outputTokens).toBe(10);
    expect(record.costUsd).toBeGreaterThan(0);
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(record.hadToolCall).toBe(false);
  });

  // ─── Cost Estimation ───────────────────────────────────────────────────

  it('should estimate cost based on known pricing', async () => {
    const result = await service.complete([{ role: 'user', content: 'test' }], {
      tier: 'extraction',
    });

    // Haiku: $0.80/M input + $4.00/M output
    // 50 input + 10 output = (50*0.80 + 10*4.00) / 1_000_000
    const expectedCost = (50 * 0.8 + 10 * 4.0) / 1_000_000;
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
      { tier: 'extraction' }
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
