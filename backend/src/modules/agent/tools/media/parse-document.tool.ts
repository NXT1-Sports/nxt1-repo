import Firecrawl from '@mendable/firecrawl-js';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import * as pdfParseModule from 'pdf-parse';
import { z } from 'zod';
import { getUniversalBinaryFilePayload, UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import { db, storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingDb, stagingStorage } from '../../../../utils/firebase-staging.js';
import { getSignedUrlWithTimeout } from '../../../../utils/gcs-signed-url.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

type PdfParseRuntimeModule = {
  PDFParse: new (options: { data: Uint8Array | Buffer }) => {
    getText(): Promise<{ text?: string }>;
    destroy(): Promise<void>;
  };
};

type StorageResolver = (environment?: ToolExecutionContext['environment']) => Storage;
type FirestoreResolver = (environment?: ToolExecutionContext['environment']) => Firestore;

type ResolvedDocumentTransport = {
  readonly url?: string;
  readonly storagePath?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
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

const MAX_ATTACHMENT_TEXT_CHARS = 300_000;
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isUniversalDocumentReference(value: string | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }

  if (/^team-file:/i.test(normalized)) {
    return true;
  }

  if (/^(https?:|gs:\/\/)/i.test(normalized)) {
    return false;
  }

  return !normalized.includes('/');
}

function normalizeUniversalDocumentId(value: string): string {
  return value.replace(/^team-file:/i, '').trim();
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

  constructor(
    apiKey?: string,
    private readonly resolveStorage: StorageResolver = (environment) =>
      environment === 'staging' ? stagingStorage : defaultStorage,
    private readonly resolveDb: FirestoreResolver = (environment) =>
      environment === 'staging' ? stagingDb : db
  ) {
    super();
    this.apiKey = apiKey ?? process.env['FIRECRAWL_API_KEY'] ?? null;
  }

  private async resolveUniversalDocumentTransport(
    candidate: string | undefined,
    context?: ToolExecutionContext
  ): Promise<ResolvedDocumentTransport | null> {
    if (!isUniversalDocumentReference(candidate)) {
      return null;
    }

    const documentId = normalizeUniversalDocumentId(candidate!);
    if (!documentId) {
      return null;
    }

    const snapshot = await this.resolveDb(context?.environment)
      .collection(UNIVERSAL_FILES_COLLECTION)
      .doc(documentId)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const record = (snapshot.data() ?? {}) as Record<string, unknown>;
    const documentTitle = normalizeOptionalString(record['title']);
    const payloadKind = normalizeOptionalString(record['payloadKind']);

    if (payloadKind === 'pointer') {
      const payload =
        record['payload'] && typeof record['payload'] === 'object'
          ? (record['payload'] as Record<string, unknown>)
          : null;
      const collectionName = normalizeOptionalString(payload?.['collectionName']);
      const sourceDocumentId = normalizeOptionalString(payload?.['documentId']);

      if (!collectionName || !sourceDocumentId) {
        return null;
      }

      const referencedSnapshot = await this.resolveDb(context?.environment)
        .collection(collectionName)
        .doc(sourceDocumentId)
        .get();

      if (!referencedSnapshot.exists) {
        return null;
      }

      const referencedRecord = (referencedSnapshot.data() ?? {}) as Record<string, unknown>;
      const binaryPayload =
        getUniversalBinaryFilePayload(referencedRecord['payload']) ??
        getUniversalBinaryFilePayload(referencedRecord);

      if (!binaryPayload) {
        return null;
      }

      return {
        storagePath: normalizeOptionalString(binaryPayload.storagePath),
        url: normalizeOptionalString(binaryPayload.url),
        mimeType: normalizeOptionalString(binaryPayload.mimeType)?.toLowerCase(),
        fileName: documentTitle,
      };
    }

    const binaryPayload = getUniversalBinaryFilePayload(record['payload']);
    if (!binaryPayload) {
      return null;
    }

    return {
      storagePath: normalizeOptionalString(binaryPayload.storagePath),
      url: normalizeOptionalString(binaryPayload.url),
      mimeType: normalizeOptionalString(binaryPayload.mimeType)?.toLowerCase(),
      fileName: documentTitle,
    };
  }

  private async resolveDocumentUrl(
    url: string | undefined,
    storagePath: string | undefined,
    context?: ToolExecutionContext
  ): Promise<string | null> {
    const directUrl = url?.trim();
    const normalizedStoragePath = storagePath?.trim();
    if (normalizedStoragePath) {
      try {
        const file = this.resolveStorage(context?.environment)
          .bucket()
          .file(normalizedStoragePath) as {
          getSignedUrl: (options: {
            version: 'v4';
            action: 'read';
            expires: number;
          }) => Promise<[string]>;
        };

        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        const [signedUrl] = await getSignedUrlWithTimeout(() =>
          file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt })
        );

        return signedUrl;
      } catch (error) {
        if (!directUrl) {
          throw error;
        }
      }
    }

    return directUrl || null;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ParseDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const resolvedUniversalTransport = await this.resolveUniversalDocumentTransport(
      parsed.data.storagePath,
      context
    );
    const resolvedUrl = resolvedUniversalTransport?.url ?? parsed.data.url;
    const resolvedStoragePath = resolvedUniversalTransport?.storagePath ?? parsed.data.storagePath;
    const url = await this.resolveDocumentUrl(resolvedUrl, resolvedStoragePath, context);
    if (!url) {
      return {
        success: false,
        error: 'parse_document currently requires a signed document URL.',
      };
    }

    const fileName =
      parsed.data.fileName ?? resolvedUniversalTransport?.fileName ?? inferFileName(url);
    const mimeType = (resolvedUniversalTransport?.mimeType ?? parsed.data.mimeType ?? '')
      .trim()
      .toLowerCase();
    const cacheKey = resolvedStoragePath ?? `${url}:${fileName}:${mimeType}`;
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

      const buffer = Buffer.from(await response.arrayBuffer());

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
