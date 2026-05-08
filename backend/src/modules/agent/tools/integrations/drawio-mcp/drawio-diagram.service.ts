/**
 * @fileoverview DrawioDiagramService
 *
 * Generates sports play diagrams end-to-end:
 *   1. OpenRouter LLM → mxGraphModel XML (sport-aware system prompt)
 *   2. POST https://exp-pdf.draw.io/ImageExport4/export → PNG buffer
 *   3. Upload PNG to Firebase Storage → public URL
 *   4. Build draw.io editor URL (compressed XML fragment) for coach fine-tuning
 *
 * No Cloud Run sidecar. No MCP SDK. Pure HTTP — works immediately everywhere.
 *
 * The raw XML is returned alongside the image URL so callers can persist it
 * in Firestore and reload it into the draw.io iframe editor on demand.
 */

import { deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../../../../utils/logger.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import type { CreatePlayDiagramInput, DrawioDiagramResult } from './schemas.js';

const deflateRawAsync = promisify(deflateRaw);

const DEFAULT_DRAWIO_EXPORT_URLS = ['https://convert.diagrams.net/node/export'] as const;
const DRAWIO_EDITOR_BASE = 'https://app.diagrams.net/';
const EXPORT_TIMEOUT_MS = 30_000;
const LLM_TIMEOUT_MS = 60_000;
const EXPORT_MAX_ATTEMPTS_PER_ENDPOINT = 2;

// ─── XML Generation System Prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert sports diagram generator. Your sole job is to produce valid draw.io XML for sports play diagrams.

CRITICAL RULES:
1. Output ONLY raw XML — no markdown fences, no explanations, no preamble.
2. The output MUST start with <mxfile> and contain a single <diagram> child wrapping the <mxGraphModel>.
3. Keep the XML concise — use minimal inline styles, no redundant attributes. Target under 4000 characters total.
4. Use mxCell elements for shapes and connectors. Each cell needs only: id, value, style, vertex/edge, parent, geometry.
5. Limit to 15-20 cells maximum (field + players + routes only — no decorative extras).
6. Offensive players: style="ellipse;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=10;"
7. Defensive players: style="ellipse;fillColor=#f8cecc;strokeColor=#b85450;fontStyle=1;fontSize=10;"
8. Routes: style="edgeStyle=elbowEdgeStyle;curved=1;" edge="1"
9. Field: style="fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1"
10. Fit everything in a 600x400 canvas.

REQUIRED OUTPUT FORMAT (copy this structure exactly):
<mxfile><diagram><mxGraphModel dx="600" dy="400" grid="0" page="0" pageWidth="600" pageHeight="400">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="2" value="" style="fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="600" height="400" as="geometry"/></mxCell>
    <!-- add player cells and route edges here -->
  </root>
</mxGraphModel></diagram></mxfile>

Do NOT use compression, encoding, or <mxCodec>. The <diagram> tag must NOT have a name attribute.`;

function buildUserPrompt(input: CreatePlayDiagramInput): string {
  const sport = input.sport ?? 'football';
  const title = input.title ?? 'Play Diagram';
  let prompt = `Sport: ${sport}\nTitle: ${title}\nDiagram description: ${input.description}`;

  if (input.xmlTemplate) {
    prompt += `\n\nModify this existing XML to match the description. Return the full <mxfile> structure:\n${input.xmlTemplate}`;
  } else {
    prompt += `\n\nGenerate the diagram XML. Use the REQUIRED OUTPUT FORMAT from your instructions. Keep it under 4000 characters.`;
  }

  return prompt;
}

/**
 * Normalize LLM output to ensure it is wrapped in <mxfile><diagram>...</diagram></mxfile>.
 * The convert.diagrams.net export server requires the mxfile wrapper; bare <mxGraphModel> is rejected.
 */
function normalizeDiagramXml(raw: string): string {
  const trimmed = raw.trim();

  // Already properly wrapped — return as-is.
  if (trimmed.startsWith('<mxfile')) return trimmed;

  // LLM returned bare <mxGraphModel> — wrap it.
  if (trimmed.startsWith('<mxGraphModel')) {
    return `<mxfile><diagram>${trimmed}</diagram></mxfile>`;
  }

  // Unexpected format — return as-is and let the server reject it with a meaningful error.
  return trimmed;
}

/**
 * Lightweight structural validation: confirms the XML has the required mxfile > diagram > mxGraphModel shape.
 * Returns a description of the problem, or null if the structure looks acceptable.
 */
function validateDiagramXmlStructure(xml: string): string | null {
  if (!xml.startsWith('<mxfile')) return 'XML does not start with <mxfile>';
  if (!xml.includes('<diagram')) return 'XML missing <diagram> element';
  if (!xml.includes('<mxGraphModel')) return 'XML missing <mxGraphModel> element';
  if (!xml.includes('<root>') && !xml.includes('<root/>')) return 'XML missing <root> element';
  return null;
}

// ─── URL Builder ──────────────────────────────────────────────────────────

/**
 * Build a draw.io editor URL that pre-loads the diagram XML.
 * Uses pako-compatible deflateRaw + base64 encoding so the #create= fragment
 * is accepted by app.diagrams.net — same algorithm used by @drawio/mcp.
 */
async function buildEditUrl(xml: string): Promise<string> {
  const compressed = await deflateRawAsync(Buffer.from(xml, 'utf-8'));
  const encoded = compressed.toString('base64');
  return `${DRAWIO_EDITOR_BASE}#create=${encoded}`;
}

function getConfiguredExportUrls(): string[] {
  const primary = process.env['DRAWIO_EXPORT_URL']?.trim();
  const list = process.env['DRAWIO_EXPORT_URLS']
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const configured = [
    ...(primary ? [primary] : []),
    ...(list ?? []),
    ...DEFAULT_DRAWIO_EXPORT_URLS,
  ];

  const unique = new Set<string>();
  for (const value of configured) {
    unique.add(value);
  }

  return [...unique];
}

function sanitizeFileName(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  const cleaned = value.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned : 'play-diagram';
}

function normalizeFetchError(error: unknown): string {
  if (error instanceof Error) {
    const withCause = error as Error & { cause?: unknown };
    if (withCause.cause instanceof Error) {
      const causeWithCode = withCause.cause as Error & { code?: string };
      return `${error.message} (cause=${causeWithCode.code ?? causeWithCode.message})`;
    }

    const withCode = error as Error & { code?: string };
    if (typeof withCode.code === 'string') {
      return `${error.message} (code=${withCode.code})`;
    }

    return error.message;
  }

  return String(error);
}

function isLikelyPng(buffer: Buffer): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 8) return false;
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function tryDecodeBase64PngPayload(text: string): Buffer | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const dataUriPrefix = 'data:image/png;base64,';
  const candidate = trimmed.startsWith(dataUriPrefix)
    ? trimmed.slice(dataUriPrefix.length)
    : trimmed;

  // Fast reject for obvious non-base64 payloads (HTML/JSON/error text).
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(candidate)) {
    return null;
  }

  try {
    const decoded = Buffer.from(candidate.replace(/\s+/g, ''), 'base64');
    return isLikelyPng(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function readExportPayload(
  response: Response
): Promise<{ png: Buffer | null; debug: string }> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const raw = Buffer.from(await response.arrayBuffer());

  if (raw.length === 0) {
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    logger.warn('[DrawioDiagramService] Empty body from export server', {
      contentType: contentType || 'unknown',
      status: response.status,
      headers: responseHeaders,
    });
    return { png: null, debug: `empty_body contentType=${contentType || 'unknown'}` };
  }

  if (isLikelyPng(raw)) {
    return { png: raw, debug: `binary_png bytes=${raw.length}` };
  }

  // Some draw.io export hosts return base64 text (or data URI) instead of raw bytes.
  if (contentType.includes('text') || contentType.includes('json') || contentType === '') {
    const decoded = tryDecodeBase64PngPayload(raw.toString('utf-8'));
    if (decoded) {
      return { png: decoded, debug: `base64_png bytes=${decoded.length}` };
    }
  }

  // Also try base64 decode even for octet-stream as a defensive fallback.
  const decoded = tryDecodeBase64PngPayload(raw.toString('utf-8'));
  if (decoded) {
    return { png: decoded, debug: `fallback_base64_png bytes=${decoded.length}` };
  }

  const textPreview = raw
    .toString('utf-8', 0, Math.min(raw.length, 220))
    .replace(/\s+/g, ' ')
    .trim();
  return {
    png: null,
    debug: `unrecognized_payload bytes=${raw.length} contentType=${contentType || 'unknown'} preview=${textPreview || '<binary-or-empty>'}`,
  };
}

function buildRequestSignal(
  contextSignal: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!contextSignal) return timeoutSignal;

  const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal })
    .any;
  if (typeof anySignal === 'function') {
    return anySignal([contextSignal, timeoutSignal]);
  }

  return contextSignal;
}

// ─── PNG Export ───────────────────────────────────────────────────────────

async function exportToPng(
  xml: string,
  title: string,
  contextSignal?: AbortSignal
): Promise<Buffer> {
  const filename = `${sanitizeFileName(title)}.png`;

  // Normalize and validate XML before hitting the export server.
  const normalizedXml = normalizeDiagramXml(xml);
  const xmlError = validateDiagramXmlStructure(normalizedXml);
  if (xmlError) {
    throw new AgentEngineError(
      'DRAWIO_LLM_INVALID_XML',
      `LLM-generated XML failed structural validation: ${xmlError}. xmlPreview=${normalizedXml.slice(0, 200)}`
    );
  }

  const endpoints = getConfiguredExportUrls();
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= EXPORT_MAX_ATTEMPTS_PER_ENDPOINT; attempt += 1) {
      const base64Mode = attempt % 2 === 0 ? '1' : '0';
      // Omit w/h/dpi — let the server determine natural canvas size from mxGraphModel.
      // Oversized explicit dimensions cause Cloudflare/Puppeteer to return 0-byte bodies.
      const body = new URLSearchParams({
        format: 'png',
        base64: base64Mode,
        filename,
        bg: '#ffffff',
        xml: normalizedXml,
      });

      const signal = buildRequestSignal(contextSignal, EXPORT_TIMEOUT_MS);
      const bodyStr = body.toString();

      try {
        logger.info('[DrawioDiagramService] Attempting draw.io export', {
          endpoint,
          attempt,
          maxAttempts: EXPORT_MAX_ATTEMPTS_PER_ENDPOINT,
          base64Mode,
          bodyPreview: bodyStr.slice(0, 120),
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'image/png,*/*;q=0.8',
            // Must be a real browser UA — convert.diagrams.net is behind Cloudflare which
            // silently drops POST bodies from requests that look like automated scripts.
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: bodyStr,
          signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown error');
          errors.push(
            `endpoint=${endpoint} attempt=${attempt} status=${response.status} body=${errorText.slice(0, 300)}`
          );
          continue;
        }

        const payload = await readExportPayload(response);
        const pngBuffer = payload.png;

        if (!pngBuffer || pngBuffer.length < 100) {
          errors.push(
            `endpoint=${endpoint} attempt=${attempt} base64=${base64Mode} invalid_png ${payload.debug}`
          );
          continue;
        }

        return pngBuffer;
      } catch (error) {
        const normalized = normalizeFetchError(error);
        errors.push(`endpoint=${endpoint} attempt=${attempt} fetch_error=${normalized}`);
      }
    }
  }

  throw new AgentEngineError(
    'DRAWIO_EXPORT_FAILED',
    `draw.io export failed after ${endpoints.length * EXPORT_MAX_ATTEMPTS_PER_ENDPOINT} attempts. ${errors.join(' | ')}`
  );
}

// ─── Firebase Storage Upload ──────────────────────────────────────────────

async function uploadToStorage(
  pngBuffer: Buffer,
  context: ToolExecutionContext | undefined
): Promise<{ publicUrl: string; storagePath: string }> {
  const timestamp = Date.now();
  const id = randomUUID().slice(0, 8);
  const storagePath =
    context?.userId && context?.threadId
      ? `Users/${context.userId}/threads/${context.threadId}/media/play-diagrams/${timestamp}-${id}.png`
      : `agent-play-diagrams/${timestamp}-${id}.png`;

  const storage = context?.environment === 'staging' ? getStorage() : getStorage();
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  await file.save(pngBuffer, {
    contentType: 'image/png',
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });

  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  return { publicUrl, storagePath };
}

// ─── Service ──────────────────────────────────────────────────────────────

export class DrawioDiagramService {
  constructor(private readonly llm: OpenRouterService) {}

  /**
   * Generate a play diagram from a plain-language description.
   *
   * Returns:
   * - imageUrl:   Public Firebase Storage PNG URL (for display in chat/playbook)
   * - xmlContent: Raw mxGraphModel XML (persist in Firestore for editor reload)
   * - editUrl:    draw.io editor URL with pre-loaded XML (open in iframe)
   * - title:      Human-readable diagram title
   * - storagePath: Firebase path (optional, for reference)
   */
  async createDiagram(
    input: CreatePlayDiagramInput,
    context?: ToolExecutionContext
  ): Promise<DrawioDiagramResult> {
    const title = input.title ?? `${input.sport ?? 'Play'} Diagram`;
    const telemetry = context
      ? {
          operationId: randomUUID(),
          userId: context.userId ?? 'unknown',
          agentId: 'strategy_coordinator' as const,
          feature: 'play-diagrams',
        }
      : undefined;

    // ── Step 1: Generate mxGraphModel XML via LLM ────────────────────────
    logger.info('[DrawioDiagramService] Generating XML via LLM', {
      sport: input.sport,
      title,
      hasTemplate: !!input.xmlTemplate,
    });

    const completionResult = await this.llm.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      {
        tier: 'prompt_engineering',
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs: LLM_TIMEOUT_MS,
        telemetryContext: telemetry,
        signal: context?.signal,
      }
    );

    const rawXml = completionResult.content?.trim() ?? '';
    if (!rawXml || !rawXml.includes('<mxGraphModel')) {
      throw new AgentEngineError(
        'DRAWIO_LLM_INVALID_XML',
        `LLM did not produce valid mxGraphModel XML. Response: ${rawXml.slice(0, 200)}`
      );
    }

    // Strip any markdown fences a model might accidentally include
    const xmlContent = rawXml
      .replace(/^```[a-z]*\n?/im, '')
      .replace(/\n?```$/im, '')
      .trim();

    logger.info('[DrawioDiagramService] XML generated', {
      xmlLength: xmlContent.length,
    });

    // ── Step 2: Export PNG via diagrams.net ──────────────────────────────
    logger.info('[DrawioDiagramService] Exporting PNG via diagrams.net');
    const pngBuffer = await exportToPng(xmlContent, title, context?.signal);
    logger.info('[DrawioDiagramService] PNG exported', { sizeBytes: pngBuffer.length });

    // ── Step 3: Upload to Firebase Storage ──────────────────────────────
    const { publicUrl, storagePath } = await uploadToStorage(pngBuffer, context);
    logger.info('[DrawioDiagramService] PNG uploaded', { publicUrl, storagePath });

    // ── Step 4: Build draw.io editor URL ─────────────────────────────────
    const editUrl = await buildEditUrl(xmlContent);

    return {
      imageUrl: publicUrl,
      xmlContent,
      editUrl,
      title,
      storagePath,
    };
  }
}
