import Firecrawl from '@mendable/firecrawl-js';
import { parse as parseCsv } from 'csv-parse/sync';
import * as pdfParseModule from 'pdf-parse';
import { z } from 'zod';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

type PdfParseRuntimeModule = {
  PDFParse: new (options: { data: Uint8Array | Buffer }) => {
    getText(): Promise<{ text?: string }>;
    destroy(): Promise<void>;
  };
};

type ParseCacheEntry = {
  readonly markdown: string;
  readonly source: 'firecrawl' | 'fallback';
  readonly metadata: ParseDocumentMetadata;
};

type ParseDocumentMetadata = {
  readonly title: string | null;
  readonly contentType: string | null;
  readonly pageCount: number | null;
  readonly pageCountSource: 'firecrawl' | 'unknown';
  readonly parseMode: 'auto' | 'ocr' | 'fallback';
  readonly extractedImages: readonly string[];
  readonly extractedImageCount: number | null;
  readonly containsImages: boolean | null;
  readonly imageDetectionSource: 'firecrawl' | 'unknown';
  readonly visionAssetSource: 'firecrawl_images' | 'rendered_pages_required' | 'none';
  readonly requiresVisionReview: boolean;
  readonly visionReviewReason: string | null;
  readonly recommendedNextAction: 'analyze_image' | 'render_pdf_pages' | null;
  readonly suggestedVisionPages: readonly number[] | null;
};

const pdfParseRuntime = pdfParseModule as unknown as PdfParseRuntimeModule;

const MAX_INLINE_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 30_000;
const SUPPORTED_PARSE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/html',
  'application/xhtml+xml',
]);

const ParseDocumentInputSchema = z
  .object({
    url: z.string().trim().url('url must be a valid URL').optional(),
    storagePath: z.string().trim().min(1).max(1024).optional(),
    fileName: z.string().trim().min(1).max(256).optional(),
    mimeType: z.string().trim().min(1).max(128).optional(),
  })
  .refine((value) => Boolean(value.url || value.storagePath), {
    message: 'Either url or storagePath is required.',
    path: ['url'],
  });

const parseCache = new Map<string, ParseCacheEntry>();

function buildUnknownMetadata(): ParseDocumentMetadata {
  return {
    title: null,
    contentType: null,
    pageCount: null,
    pageCountSource: 'unknown',
    parseMode: 'fallback',
    extractedImages: [],
    extractedImageCount: null,
    containsImages: null,
    imageDetectionSource: 'unknown',
    visionAssetSource: 'none',
    requiresVisionReview: false,
    visionReviewReason: null,
    recommendedNextAction: null,
    suggestedVisionPages: null,
  };
}

function isPdfDocument(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
}

function inferFileName(url: string, fallback = 'document'): string {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();
    if (!lastSegment) return fallback;
    return decodeURIComponent(lastSegment);
  } catch {
    return fallback;
  }
}

function trimAttachmentText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').split(String.fromCharCode(0)).join('').trim();
  if (!normalized) return '';
  if (normalized.length <= MAX_ATTACHMENT_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n... [truncated]`;
}

function buildSuggestedVisionPages(pageCount: number | null): readonly number[] | null {
  if (!pageCount || pageCount < 1) return null;
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function renderCsvPreview(rawText: string): string {
  const parsed = parseCsv(rawText, {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as unknown[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return trimAttachmentText(rawText);
  }

  const rows = parsed
    .filter((row): row is unknown[] => Array.isArray(row) && row.length > 0)
    .slice(0, 60)
    .map((row) => row.slice(0, 20).map((cell) => String(cell ?? '').replace(/\|/g, '\\|')));

  if (rows.length === 0) {
    return trimAttachmentText(rawText);
  }

  const [header, ...body] = rows;
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];

  return trimAttachmentText(lines.join('\n'));
}

function shouldUseFirecrawl(mimeType: string, fileName: string): boolean {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (SUPPORTED_PARSE_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  return /\.(pdf|docx?|odt|rtf|xlsx?|html?)$/i.test(normalizedFileName);
}

function isLikelyDiagramHeavy(markdown: string): boolean {
  const normalized = markdown.toLowerCase();
  return (
    /[○◯●□■△→←↑↓]/.test(markdown) ||
    /\b(playbook|diagram|formation|formations|alignment|spacing|rotation|motion|scheme|set play|set plays|drill|drills|tactic|tactics|pattern|patterns|coverage|press|screen|screens|pick and roll|route|routes|line change|power play|faceoff|corner kick|serve receive|defensive shape|offensive shape|infield|outfield)\b/i.test(
      normalized
    )
  );
}

export class ParseDocumentTool extends BaseTool {
  readonly name = 'parse_document';
  readonly description =
    'Read an uploaded document attachment such as a PDF, spreadsheet, Word document, or HTML file. ' +
    'Downloads the attachment, parses it with Firecrawl when supported, and returns prompt-ready markdown.';

  readonly parameters = ParseDocumentInputSchema;
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  override readonly allowedAgents = [
    'router',
    'brand_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
  ] as const;

  private readonly apiKey: string | null;
  private client: Firecrawl | null = null;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env['FIRECRAWL_API_KEY'] ?? null;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ParseDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const url = parsed.data.url ?? null;
    if (!url) {
      return {
        success: false,
        error: 'parse_document currently requires a signed document URL.',
      };
    }

    const fileName = parsed.data.fileName ?? inferFileName(url);
    const mimeType = (parsed.data.mimeType ?? '').trim().toLowerCase();
    const cacheKey = parsed.data.storagePath ?? `${url}:${fileName}:${mimeType}`;
    const cached = parseCache.get(cacheKey);
    if (cached) {
      context?.emitStage?.('processing_media', {
        icon: 'document',
        phase: 'parse_document',
        target: fileName,
        source: cached.source,
        cacheHit: true,
      });
      return {
        success: true,
        data: {
          fileName,
          mimeType,
          markdown: cached.markdown,
          metadata: cached.metadata,
          cacheHit: true,
          source: cached.source,
        },
        markdown: cached.markdown,
      };
    }

    context?.emitStage?.('processing_media', {
      icon: 'document',
      phase: 'parse_document',
      target: fileName,
    });

    try {
      const response = await fetch(url, { signal: context?.signal });
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to download document: ${response.status} ${response.statusText}`,
        };
      }

      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_INLINE_DOCUMENT_BYTES) {
        return {
          success: false,
          error: `Document exceeds the ${MAX_INLINE_DOCUMENT_BYTES} byte inline parsing limit.`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_INLINE_DOCUMENT_BYTES) {
        return {
          success: false,
          error: `Document exceeds the ${MAX_INLINE_DOCUMENT_BYTES} byte inline parsing limit.`,
        };
      }

      const parsedResult = shouldUseFirecrawl(mimeType, fileName)
        ? await this.parseWithFirecrawl(buffer, fileName, mimeType)
        : await this.parseWithFallback(buffer, fileName, mimeType);

      if (!parsedResult.markdown) {
        return {
          success: false,
          error: `No readable content was extracted from ${fileName}.`,
        };
      }

      parseCache.set(cacheKey, parsedResult);

      return {
        success: true,
        data: {
          fileName,
          mimeType,
          markdown: parsedResult.markdown,
          metadata: parsedResult.metadata,
          cacheHit: false,
          source: parsedResult.source,
        },
        markdown: parsedResult.markdown,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse uploaded document.',
      };
    }
  }

  private async parseWithFirecrawl(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ParseCacheEntry> {
    try {
      const isPdf = isPdfDocument(mimeType, fileName);
      if (!isPdf) {
        return this.parseWithFirecrawlMode(buffer, fileName, mimeType, 'auto');
      }

      return this.parseWithFirecrawlMode(buffer, fileName, mimeType, 'ocr');
    } catch {
      // Fall through to local parsing below.
    }

    return this.parseWithFallback(buffer, fileName, mimeType);
  }

  private getClient(): Firecrawl {
    if (!this.apiKey) {
      throw new AgentEngineError(
        'FIRECRAWL_CONFIG_MISSING_API_KEY',
        'FIRECRAWL_API_KEY is required to parse uploaded documents.'
      );
    }

    if (!this.client) {
      this.client = new Firecrawl({ apiKey: this.apiKey });
    }

    return this.client;
  }

  private async parseWithFirecrawlMode(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    mode: 'auto' | 'ocr'
  ): Promise<ParseCacheEntry> {
    const document = await this.getClient().parse(
      {
        data: buffer,
        filename: fileName,
        ...(mimeType ? { contentType: mimeType } : {}),
      },
      {
        formats: ['markdown', 'images'],
        parsers: [{ type: 'pdf' as const, mode }],
        timeout: mode === 'ocr' ? 180_000 : 120_000,
      }
    );

    const extracted = trimAttachmentText(document.markdown ?? '');
    if (!extracted) {
      return {
        markdown: '',
        source: 'firecrawl',
        metadata: {
          ...buildUnknownMetadata(),
          contentType: mimeType || 'application/pdf',
          parseMode: mode,
        },
      };
    }

    const images = Array.isArray(document.images)
      ? document.images.filter((image): image is string => typeof image === 'string')
      : [];
    const diagramHeavy = isLikelyDiagramHeavy(extracted);
    const pageCount =
      typeof document.metadata?.numPages === 'number' && Number.isFinite(document.metadata.numPages)
        ? document.metadata.numPages
        : null;
    const recommendedNextAction = !diagramHeavy
      ? null
      : images.length > 0
        ? 'analyze_image'
        : 'render_pdf_pages';

    return {
      markdown: extracted,
      source: 'firecrawl',
      metadata: {
        title:
          typeof document.metadata?.title === 'string' && document.metadata.title.trim().length > 0
            ? document.metadata.title.trim()
            : null,
        contentType:
          typeof document.metadata?.contentType === 'string' &&
          document.metadata.contentType.trim().length > 0
            ? document.metadata.contentType.trim()
            : mimeType || null,
        pageCount,
        pageCountSource: pageCount !== null ? 'firecrawl' : 'unknown',
        parseMode: mode,
        extractedImages: images,
        extractedImageCount: images.length,
        containsImages: images.length > 0,
        imageDetectionSource: 'firecrawl',
        visionAssetSource:
          images.length > 0
            ? 'firecrawl_images'
            : diagramHeavy
              ? 'rendered_pages_required'
              : 'none',
        requiresVisionReview: diagramHeavy,
        visionReviewReason: !diagramHeavy
          ? null
          : images.length > 0
            ? 'Diagram-heavy PDF with extracted images. Use vision review for exact visual layout or route geometry.'
            : 'Diagram-heavy PDF without extracted image assets. Render relevant PDF pages before making exact visual claims.',
        recommendedNextAction,
        suggestedVisionPages:
          recommendedNextAction === 'render_pdf_pages'
            ? buildSuggestedVisionPages(pageCount)
            : null,
      },
    };
  }

  private async parseWithFallback(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ParseCacheEntry> {
    if (isPdfDocument(mimeType, fileName)) {
      const parser = new pdfParseRuntime.PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        const diagramHeavy = isLikelyDiagramHeavy(parsed.text ?? '');
        return {
          markdown: trimAttachmentText(parsed.text ?? ''),
          source: 'fallback',
          metadata: {
            ...buildUnknownMetadata(),
            contentType: mimeType || 'application/pdf',
            visionAssetSource: diagramHeavy ? 'rendered_pages_required' : 'none',
            requiresVisionReview: diagramHeavy,
            visionReviewReason: diagramHeavy
              ? 'Fallback text suggests a diagram-heavy PDF, but no extracted image assets were available for vision review.'
              : null,
            recommendedNextAction: diagramHeavy ? 'render_pdf_pages' : null,
          },
        };
      } finally {
        await parser.destroy();
      }
    }

    const rawText = buffer.toString('utf-8');
    if (
      mimeType === 'text/csv' ||
      mimeType === 'application/vnd.ms-excel' ||
      /\.csv$/i.test(fileName)
    ) {
      return {
        markdown: renderCsvPreview(rawText),
        source: 'fallback',
        metadata: {
          ...buildUnknownMetadata(),
          contentType: mimeType || 'text/csv',
        },
      };
    }

    return {
      markdown: trimAttachmentText(rawText),
      source: 'fallback',
      metadata: {
        ...buildUnknownMetadata(),
        contentType: mimeType || null,
      },
    };
  }
}
