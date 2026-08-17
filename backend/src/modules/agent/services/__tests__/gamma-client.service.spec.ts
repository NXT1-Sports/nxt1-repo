import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { GammaClient } from '../gamma-client.service.js';

const PPTX_BYTES = Buffer.from('PK\x03\x04pptx');

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe('GammaClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses environment-scoped staging configuration by default', async () => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('STAGING_GAMMA_ENABLED', 'true');
    vi.stubEnv('STAGING_GAMMA_API_KEY', 'staging-gamma-key');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_123' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ status: 'completed', exportUrl: 'https://gamma.app/export/deck.pptx' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        response(PPTX_BYTES, {
          status: 200,
          headers: { 'content-length': String(PPTX_BYTES.length) },
        })
      );

    const client = new GammaClient({ fetchImpl });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).resolves.toEqual(PPTX_BYTES);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      new URL('https://public-api.gamma.app/v1.0/generations'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'staging-gamma-key' }),
        method: 'POST',
      })
    );

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.themeId).toBe('ash');
    expect(requestBody.imageOptions).toEqual({ source: 'noImages' });
    expect(requestBody.cardOptions?.headerFooter?.bottomRight).toEqual({ type: 'cardNumber' });
    expect(String(requestBody.additionalInstructions)).toContain(
      'mostly white or light-neutral slides'
    );
  });

  it('uses balanced branded background guidance for presentations when both brand colors are available', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_456' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            status: 'completed',
            exportUrl: 'https://gamma.app/export/deck-2.pptx',
          }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        response(PPTX_BYTES, {
          status: 200,
          headers: { 'content-length': String(PPTX_BYTES.length) },
        })
      );

    const client = new GammaClient({ enabled: true, apiKey: 'gamma-key', fetchImpl });

    await expect(
      client.generatePptx({
        title: 'Falcons Prospect Deck',
        brandPrimaryColor: '#C8102E',
        brandSecondaryColor: '#111111',
      })
    ).resolves.toEqual(PPTX_BYTES);

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(requestInit.body));
    expect(String(requestBody.additionalInstructions)).toContain(
      'Alternate between neutral slides and brand-colored section bands'
    );
  });

  it('builds document-style branding controls for PDF exports', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(JSON.stringify({ generationId: 'gen_pdf_123' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ status: 'completed', exportUrl: 'https://gamma.app/export/doc.pdf' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        response(pdfBytes, {
          status: 200,
          headers: { 'content-length': String(pdfBytes.length) },
        })
      );

    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(
      client.generatePdf({
        title: 'Self-Scout Report',
        organizationName: 'Falcons Football',
        logoUrl: 'https://cdn.example.com/logo.png',
        brandPrimaryColor: '#C8102E',
        brandSecondaryColor: '#111111',
      })
    ).resolves.toEqual(pdfBytes);

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.format).toBe('document');
    expect(requestBody.themeId).toBe('ash');
    expect(requestBody.cardOptions?.dimensions).toBe('fluid');
    expect(requestBody.cardOptions?.headerFooter?.topLeft).toEqual(
      expect.objectContaining({
        type: 'image',
        source: 'custom',
        src: 'https://cdn.example.com/logo.png',
      })
    );
    expect(requestBody.cardOptions?.headerFooter?.bottomLeft).toEqual(
      expect.objectContaining({
        type: 'text',
        value: 'Generated by NXT1 - nxt1sports.com',
      })
    );
    expect(String(requestBody.additionalInstructions)).toContain(
      'Use #111111 as the secondary brand color'
    );
    expect(String(requestBody.additionalInstructions)).toContain(
      'Do not introduce unrelated purple'
    );
  });

  it('rejects missing API key configuration when generation is enabled', async () => {
    const client = new GammaClient({
      enabled: true,
      apiKey: '',
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_CONFIG_MISSING_API_KEY',
    } satisfies Partial<AgentEngineError>);
  });

  it('wraps generation request network failures', async () => {
    const networkError = new Error('connect ECONNREFUSED');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(networkError);
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_REQUEST_FAILED',
      cause: networkError,
    } satisfies Partial<AgentEngineError>);
  });

  it('rejects non-success generation responses without polling', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(JSON.stringify({ message: 'upstream error' }), { status: 502 })
      );
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_REQUEST_FAILED',
      metadata: { status: 502 },
    } satisfies Partial<AgentEngineError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('generates and downloads a PPTX export with the configured API key', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_123' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ status: 'completed', exportUrl: 'https://gamma.app/export/deck.pptx' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        response(PPTX_BYTES, {
          status: 200,
          headers: { 'content-length': String(PPTX_BYTES.length) },
        })
      );
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).resolves.toEqual(PPTX_BYTES);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      new URL('https://public-api.gamma.app/v1.0/generations/gen_123'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'gamma-key' }),
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      new URL('https://gamma.app/export/deck.pptx'),
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }),
      })
    );
  });

  it('rejects failed generation statuses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_123' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(JSON.stringify({ status: 'failed', error: 'Credits exceeded' }), { status: 200 })
      );
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_GENERATION_FAILED',
      message: 'Credits exceeded',
    } satisfies Partial<AgentEngineError>);
  });

  it('rejects non-PPTX response bytes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_123' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ status: 'completed', exportUrl: 'https://gamma.app/export/deck.pptx' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(response('not-a-pptx', { status: 200 }));
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_DOWNLOAD_FAILED',
    } satisfies Partial<AgentEngineError>);
  });

  it('stops reading a chunked artifact that exceeds the configured size limit', async () => {
    const oversizedPptx = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('PK\x03\x04first'));
        controller.enqueue(Buffer.from('second-chunk'));
        controller.close();
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(JSON.stringify({ generationId: 'gen_123' }), { status: 200 }))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ status: 'completed', exportUrl: 'https://gamma.app/export/deck.pptx' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(response(oversizedPptx, { status: 200 }));
    const client = new GammaClient({
      enabled: true,
      apiKey: 'gamma-key',
      maxResponseBytes: 10,
      fetchImpl,
    });

    await expect(client.generatePptx({ title: 'Weekly Briefing' })).rejects.toMatchObject({
      code: 'GAMMA_DOWNLOAD_FAILED',
    } satisfies Partial<AgentEngineError>);
  });
});
