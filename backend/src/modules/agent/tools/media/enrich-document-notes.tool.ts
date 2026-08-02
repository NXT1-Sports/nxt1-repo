import { createRequire } from 'node:module';
import type { Canvas, SKRSContext2D } from '@napi-rs/canvas';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';
import { getUniversalBinaryFilePayload, UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import { db as defaultDb, storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingDb, stagingStorage } from '../../../../utils/firebase-staging.js';
import { logger } from '../../../../utils/logger.js';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  resolveFileAccessContext,
} from '../../../../services/team/file-access-keys.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMContentPart, LLMMessage } from '../../llm/llm.types.js';

const MAX_REMOTE_PDF_BYTES = 96 * 1024 * 1024;
const DEFAULT_RENDER_SCALE = 1.8;
const MAX_LONG_EDGE_PIXELS = 1800;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 6;
const PAGE_ANALYSIS_TIMEOUT_MS = 90_000;
const SUMMARY_TIMEOUT_MS = 90_000;
const MAX_PAGE_NOTE_CHARS = 4_000;
const MAX_ARTIFACT_NOTES_CHARS = 900_000;
const SUMMARY_SOURCE_CHAR_LIMIT = 80_000;

type StorageResolver = (environment?: ToolExecutionContext['environment']) => Storage;
type FirestoreResolver = (environment?: ToolExecutionContext['environment']) => Firestore;

type DownloadableStorageFile = {
  download: () => Promise<[Buffer]>;
};

type CanvasLike = Canvas;
type CanvasContextLike = SKRSContext2D;

type CanvasBindings = Pick<
  typeof import('@napi-rs/canvas'),
  'createCanvas' | 'DOMMatrix' | 'ImageData' | 'Path2D'
>;

type ResolvedDocumentTransport = {
  readonly url?: string;
  readonly storagePath?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
};

type PageAnalysis = {
  readonly pageNumber: number;
  readonly status: 'analyzed' | 'failed';
  readonly notes: string;
  readonly width?: number;
  readonly height?: number;
  readonly error?: string;
};

const EnrichDocumentNotesInputSchema = z
  .object({
    documentId: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .describe('UniversalFiles document ID for the selected Team Files item.'),
    promptOverride: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .optional()
      .describe('Optional user-specific instructions for page-by-page note generation.'),
    concurrency: z
      .number()
      .int()
      .min(1)
      .max(MAX_CONCURRENCY)
      .optional()
      .describe(`Optional page analysis concurrency. Defaults to ${DEFAULT_CONCURRENCY}.`),
  })
  .strict();

const moduleRequire = createRequire(import.meta.url);
const pdfJsModuleRequire = createRequire(moduleRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs'));

function resolvePdfJsCanvasBindings(): CanvasBindings {
  return pdfJsModuleRequire('@napi-rs/canvas') as CanvasBindings;
}

function ensurePdfJsNodeGlobals(canvasBindings: CanvasBindings): void {
  const globalScope = globalThis as Record<string, unknown>;

  if (typeof globalScope['DOMMatrix'] === 'undefined') {
    globalScope['DOMMatrix'] = canvasBindings.DOMMatrix as unknown;
  }
  if (typeof globalScope['ImageData'] === 'undefined') {
    globalScope['ImageData'] = canvasBindings.ImageData as unknown;
  }
  if (typeof globalScope['Path2D'] === 'undefined') {
    globalScope['Path2D'] = canvasBindings.Path2D as unknown;
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => normalizeOptionalString(item))
    .filter((item): item is string => Boolean(item));

  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function normalizeUniversalDocumentId(value: string): string {
  return value.replace(/^team-file:/i, '').trim();
}

function isPdfDocument(mimeType: string | undefined, fileName: string | undefined): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName ?? '');
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 18).trimEnd()}\n...[truncated]`;
}

function buildPagePrompt(fileName: string, pageNumber: number, promptOverride?: string): string {
  const customInstruction = promptOverride
    ? `\n\nAdditional user instruction:\n${promptOverride}`
    : '';

  return (
    `Analyze page ${pageNumber} of ${fileName} and write precise page notes for a coaching/staff file record. ` +
    'Describe only what is visible on this page. Capture headings, labels, diagrams, formations, routes, player spacing, assignments, rules, callouts, teaching points, tables, and any action items. ' +
    'If it is not a sports playbook page, still extract the page structure, important facts, decisions, dates, names, tables, and operational takeaways. ' +
    'Use concise markdown bullets. If a diagram is visible, include enough spatial detail that a coach can understand the alignment without seeing the image. ' +
    'Do not invent missing text or unstated assignments.' +
    customInstruction
  );
}

function buildArtifactNotes(fileName: string, analyses: readonly PageAnalysis[]): string {
  const analyzedCount = analyses.filter((analysis) => analysis.status === 'analyzed').length;
  const failedCount = analyses.length - analyzedCount;
  const lines = [
    `# AI Notes: ${fileName}`,
    '',
    `Processed pages: ${analyses.length}`,
    `Analyzed pages: ${analyzedCount}`,
    `Failed pages: ${failedCount}`,
    '',
    '## Page-by-page notes',
    '',
  ];

  for (const analysis of analyses) {
    lines.push(`### Page ${analysis.pageNumber}`);
    if (analysis.status === 'failed') {
      lines.push(`Unable to analyze this page: ${analysis.error ?? 'Unknown error.'}`);
    } else {
      lines.push(analysis.notes);
    }
    lines.push('');
  }

  return truncateText(lines.join('\n'), MAX_ARTIFACT_NOTES_CHARS);
}

function buildFallbackSummary(fileName: string, analyses: readonly PageAnalysis[]): string {
  const analyzedCount = analyses.filter((analysis) => analysis.status === 'analyzed').length;
  const failedCount = analyses.length - analyzedCount;
  return `${fileName}: generated page-by-page AI notes for ${analyzedCount} of ${analyses.length} page${analyses.length === 1 ? '' : 's'}${failedCount ? `; ${failedCount} page${failedCount === 1 ? '' : 's'} failed analysis` : ''}.`;
}

function buildTags(fileName: string, pageCount: number): string[] {
  const tags = ['ai-notes', 'page-by-page'];
  if (/playbook/i.test(fileName)) tags.push('playbook');
  if (pageCount >= 50) tags.push('large-document');
  return tags;
}

class NodeCanvasFactory {
  constructor(private readonly canvasBindings: CanvasBindings) {}

  create(width: number, height: number): { canvas: CanvasLike; context: CanvasContextLike } {
    const canvas = this.canvasBindings.createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  destroy(target: { canvas: CanvasLike; context: CanvasContextLike }): void {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
}

export class EnrichDocumentNotesTool extends BaseTool {
  readonly name = 'enrich_document_notes';
  readonly description =
    'Generate page-by-page AI notes for an uploaded Team Files PDF and save them back onto the same UniversalFiles record. ' +
    'Use this for Generate Notes actions on large PDFs, playbooks, scout packets, reports, decks, or any document where every page needs review.';

  readonly parameters = EnrichDocumentNotesInputSchema;
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  override readonly allowedAgents = ['router', 'data_coordinator', 'strategy_coordinator'] as const;

  constructor(
    private readonly llm: OpenRouterService,
    private readonly resolveStorage: StorageResolver = (environment) =>
      environment === 'staging' ? stagingStorage : defaultStorage,
    private readonly resolveDb: FirestoreResolver = (environment) =>
      environment === 'staging' ? stagingDb : defaultDb,
    private readonly canvasBindings: CanvasBindings = resolvePdfJsCanvasBindings()
  ) {
    super();
    ensurePdfJsNodeGlobals(this.canvasBindings);
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = EnrichDocumentNotesInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = context?.userId ?? null;
    if (!userId) {
      return {
        success: false,
        error: 'enrich_document_notes requires an authenticated user context.',
      };
    }

    const documentId = normalizeUniversalDocumentId(parsed.data.documentId);
    const db = this.resolveDb(context?.environment);
    const documentRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(documentId);
    const snapshot = await documentRef.get();

    if (!snapshot.exists) {
      return {
        success: false,
        error: `Team Files document ${documentId} was not found.`,
      };
    }

    const record = (snapshot.data() ?? {}) as Record<string, unknown>;
    const canWrite = await this.canWriteDocument(db, record, userId);
    if (!canWrite) {
      return {
        success: false,
        error: 'You do not have permission to generate notes on this Team Files record.',
      };
    }

    const resolvedTransport = await this.resolveDocumentTransport(record, context);
    const fileName =
      resolvedTransport.fileName ?? normalizeOptionalString(record['title']) ?? 'document.pdf';
    const mimeType = resolvedTransport.mimeType?.toLowerCase();

    if (!isPdfDocument(mimeType, fileName)) {
      return {
        success: false,
        error: 'enrich_document_notes currently supports PDF files only.',
      };
    }

    context?.emitStage?.('processing_media', {
      icon: 'document',
      phase: 'enrich_document_notes',
      target: fileName,
    });

    try {
      const pdfSource = await this.loadPdfBuffer(resolvedTransport, context);
      if ('error' in pdfSource) {
        return { success: false, error: pdfSource.error };
      }

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfSource.buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: true,
      });
      const pdfDocument = await loadingTask.promise;

      try {
        const pageNumbers = Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1);
        const concurrency = parsed.data.concurrency ?? DEFAULT_CONCURRENCY;
        const analyses = await this.analyzePages({
          pageNumbers,
          fileName,
          pdfDocument,
          concurrency,
          promptOverride: parsed.data.promptOverride,
          context,
        });
        const artifactNotes = buildArtifactNotes(fileName, analyses);
        const artifactSummary = await this.summarizeDocumentNotes(fileName, analyses, context);
        const analyzedCount = analyses.filter((analysis) => analysis.status === 'analyzed').length;
        const failedCount = analyses.length - analyzedCount;
        const generatedAt = new Date().toISOString();

        await documentRef.update({
          artifactSummary,
          artifactNotes,
          artifactTags: buildTags(fileName, analyses.length),
          artifactStatus: failedCount > 0 ? 'partial' : 'ready',
          artifactGeneratedAt: generatedAt,
          artifactClassification: {
            kind: 'ai_page_notes',
            source: 'enrich_document_notes',
            pageCount: analyses.length,
            analyzedPageCount: analyzedCount,
            failedPageCount: failedCount,
          },
          updatedAt: generatedAt,
        });

        logger.info('[EnrichDocumentNotesTool] Document notes generated', {
          documentId,
          fileName,
          pageCount: analyses.length,
          analyzedCount,
          failedCount,
        });

        return {
          success: true,
          data: {
            documentId,
            fileName,
            pageCount: analyses.length,
            analyzedPageCount: analyzedCount,
            failedPageCount: failedCount,
            artifactStatus: failedCount > 0 ? 'partial' : 'ready',
          },
          markdown:
            `Generated page-by-page AI notes for ${analyzedCount} of ${analyses.length} page` +
            `${analyses.length === 1 ? '' : 's'} in ${fileName} and saved them back to the same Team Files record.` +
            (failedCount
              ? ` ${failedCount} page${failedCount === 1 ? '' : 's'} could not be analyzed.`
              : ''),
        };
      } finally {
        await loadingTask.destroy();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate document notes.';
      logger.error('[EnrichDocumentNotesTool] Failed to enrich document notes', {
        documentId,
        fileName,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private async resolveDocumentTransport(
    record: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ResolvedDocumentTransport> {
    const documentTitle = normalizeOptionalString(record['title']);
    const payloadKind = normalizeOptionalString(record['payloadKind']);

    if (payloadKind === 'pointer') {
      const payload =
        record['payload'] && typeof record['payload'] === 'object'
          ? (record['payload'] as Record<string, unknown>)
          : null;
      const collectionName = normalizeOptionalString(payload?.['collectionName']);
      const sourceDocumentId = normalizeOptionalString(payload?.['documentId']);

      if (collectionName && sourceDocumentId) {
        const referencedSnapshot = await this.resolveDb(context?.environment)
          .collection(collectionName)
          .doc(sourceDocumentId)
          .get();

        if (referencedSnapshot.exists) {
          const referencedRecord = (referencedSnapshot.data() ?? {}) as Record<string, unknown>;
          const binaryPayload =
            getUniversalBinaryFilePayload(referencedRecord['payload']) ??
            getUniversalBinaryFilePayload(referencedRecord);

          if (binaryPayload) {
            return {
              storagePath: normalizeOptionalString(binaryPayload.storagePath),
              url: normalizeOptionalString(binaryPayload.url),
              mimeType: normalizeOptionalString(binaryPayload.mimeType),
              fileName: documentTitle,
            };
          }
        }
      }
    }

    const binaryPayload =
      getUniversalBinaryFilePayload(record['payload']) ?? getUniversalBinaryFilePayload(record);

    return {
      storagePath: normalizeOptionalString(binaryPayload?.storagePath),
      url: normalizeOptionalString(binaryPayload?.url),
      mimeType: normalizeOptionalString(binaryPayload?.mimeType),
      fileName: documentTitle,
    };
  }

  private async canWriteDocument(
    db: Firestore,
    record: Record<string, unknown>,
    userId: string
  ): Promise<boolean> {
    const ownerUserId =
      normalizeOptionalString(record['ownerUserId']) ??
      normalizeOptionalString(record['createdByUserId']);
    if (ownerUserId === userId) {
      return true;
    }

    const writeAccessKeys = normalizeStringArray(record['writeAccessKeys']);
    if (!writeAccessKeys?.length) {
      return false;
    }

    const accessContext = await resolveFileAccessContext(db, userId);
    return canAccessByKeys(writeAccessKeys, buildGrantedAccessKeys(accessContext));
  }

  private async loadPdfBuffer(
    transport: ResolvedDocumentTransport,
    context?: ToolExecutionContext
  ): Promise<{ buffer: Buffer } | { error: string }> {
    const normalizedStoragePath = transport.storagePath?.trim();
    if (normalizedStoragePath) {
      const file = this.resolveStorage(context?.environment)
        .bucket()
        .file(normalizedStoragePath) as DownloadableStorageFile;
      const [buffer] = await file.download();

      if (buffer.byteLength > MAX_REMOTE_PDF_BYTES) {
        return { error: `PDF exceeds the ${MAX_REMOTE_PDF_BYTES} byte enrichment limit.` };
      }

      return { buffer };
    }

    const directUrl = transport.url?.trim();
    if (!directUrl) {
      return { error: 'Could not resolve a downloadable PDF URL or storagePath for this file.' };
    }

    const response = await fetch(directUrl, { signal: context?.signal });
    if (!response.ok) {
      return { error: `Failed to download PDF: ${response.status} ${response.statusText}` };
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_PDF_BYTES) {
      return { error: `PDF exceeds the ${MAX_REMOTE_PDF_BYTES} byte enrichment limit.` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_REMOTE_PDF_BYTES) {
      return { error: `PDF exceeds the ${MAX_REMOTE_PDF_BYTES} byte enrichment limit.` };
    }

    return { buffer };
  }

  private async analyzePages(options: {
    readonly pageNumbers: readonly number[];
    readonly fileName: string;
    readonly pdfDocument: pdfjs.PDFDocumentProxy;
    readonly concurrency: number;
    readonly promptOverride?: string;
    readonly context?: ToolExecutionContext;
  }): Promise<PageAnalysis[]> {
    const analyses: PageAnalysis[] = [];

    for (let start = 0; start < options.pageNumbers.length; start += options.concurrency) {
      const batch = options.pageNumbers.slice(start, start + options.concurrency);
      options.context?.emitStage?.('processing_media', {
        icon: 'document',
        phase: 'enrich_document_notes_batch',
        target: options.fileName,
        startPage: batch[0],
        endPage: batch[batch.length - 1],
        pageCount: options.pageNumbers.length,
      });

      logger.info('[EnrichDocumentNotesTool] Processing PDF page batch', {
        fileName: options.fileName,
        startPage: batch[0],
        endPage: batch[batch.length - 1],
        pageCount: options.pageNumbers.length,
      });

      const batchResults = await Promise.all(
        batch.map((pageNumber) =>
          this.analyzePage({
            pageNumber,
            fileName: options.fileName,
            pdfDocument: options.pdfDocument,
            promptOverride: options.promptOverride,
            context: options.context,
          })
        )
      );
      analyses.push(...batchResults);
    }

    return analyses.sort((left, right) => left.pageNumber - right.pageNumber);
  }

  private async analyzePage(options: {
    readonly pageNumber: number;
    readonly fileName: string;
    readonly pdfDocument: pdfjs.PDFDocumentProxy;
    readonly promptOverride?: string;
    readonly context?: ToolExecutionContext;
  }): Promise<PageAnalysis> {
    const canvasFactory = new NodeCanvasFactory(this.canvasBindings);
    let canvasTarget: { canvas: CanvasLike; context: CanvasContextLike } | null = null;

    try {
      const page = await options.pdfDocument.getPage(options.pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const longestEdge = Math.max(baseViewport.width, baseViewport.height, 1);
      const scale = Math.max(
        1.25,
        Math.min(DEFAULT_RENDER_SCALE, MAX_LONG_EDGE_PIXELS / longestEdge)
      );
      const viewport = page.getViewport({ scale });
      canvasTarget = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));

      canvasTarget.context.fillStyle = '#ffffff';
      canvasTarget.context.fillRect(0, 0, canvasTarget.canvas.width, canvasTarget.canvas.height);

      await page.render({
        canvas: canvasTarget.canvas as unknown as HTMLCanvasElement,
        canvasContext: canvasTarget.context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const imageDataUrl = `data:image/jpeg;base64,${canvasTarget.canvas
        .toBuffer('image/jpeg', 86)
        .toString('base64')}`;
      const notes = await this.generatePageNotes({
        fileName: options.fileName,
        pageNumber: options.pageNumber,
        imageDataUrl,
        promptOverride: options.promptOverride,
        context: options.context,
      });

      page.cleanup();

      return {
        pageNumber: options.pageNumber,
        status: 'analyzed',
        notes: truncateText(notes, MAX_PAGE_NOTE_CHARS),
        width: canvasTarget.canvas.width,
        height: canvasTarget.canvas.height,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Page analysis failed.';
      logger.warn('[EnrichDocumentNotesTool] PDF page analysis failed', {
        fileName: options.fileName,
        pageNumber: options.pageNumber,
        error: message,
      });
      return {
        pageNumber: options.pageNumber,
        status: 'failed',
        notes: '',
        error: message,
      };
    } finally {
      if (canvasTarget) {
        canvasFactory.destroy(canvasTarget);
      }
    }
  }

  private async generatePageNotes(options: {
    readonly fileName: string;
    readonly pageNumber: number;
    readonly imageDataUrl: string;
    readonly promptOverride?: string;
    readonly context?: ToolExecutionContext;
  }): Promise<string> {
    const contentParts: LLMContentPart[] = [
      {
        type: 'image_url',
        image_url: { url: options.imageDataUrl, detail: 'high' },
      },
      {
        type: 'text',
        text: buildPagePrompt(options.fileName, options.pageNumber, options.promptOverride),
      },
    ];
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          'You are an elite sports operations document analyst for NXT1. ' +
          'You convert document pages into precise, evidence-grounded notes for coaches, scouts, staff, and operators. ' +
          'Never hallucinate. If something is unclear, say it is unclear.',
      },
      { role: 'user', content: contentParts },
    ];

    const result = await this.llm.complete(messages, {
      tier: 'vision_analysis',
      maxTokens: 1400,
      temperature: 0.1,
      signal: AbortSignal.timeout(PAGE_ANALYSIS_TIMEOUT_MS),
      ...(options.context?.operationId && options.context.userId
        ? {
            telemetryContext: {
              operationId: options.context.operationId,
              userId: options.context.userId,
              agentId: 'data_coordinator',
              feature: 'document-notes-enrichment',
            },
          }
        : {}),
    });

    return typeof result.content === 'string' && result.content.trim()
      ? result.content.trim()
      : 'No reliable page notes were returned.';
  }

  private async summarizeDocumentNotes(
    fileName: string,
    analyses: readonly PageAnalysis[],
    context?: ToolExecutionContext
  ): Promise<string> {
    const source = analyses
      .filter((analysis) => analysis.status === 'analyzed')
      .map((analysis) => `Page ${analysis.pageNumber}: ${analysis.notes}`)
      .join('\n\n');

    if (!source.trim()) {
      return buildFallbackSummary(fileName, analyses);
    }

    try {
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content:
            'You write concise artifact summaries for Team Files records. Summarize only what the page notes support.',
        },
        {
          role: 'user',
          content:
            `Write a 2-4 sentence summary for the generated notes on ${fileName}. ` +
            'Include overall document purpose and the most important coaching/staff takeaways.\n\n' +
            truncateText(source, SUMMARY_SOURCE_CHAR_LIMIT),
        },
      ];
      const result = await this.llm.complete(messages, {
        maxTokens: 320,
        temperature: 0.1,
        signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
        ...(context?.operationId && context.userId
          ? {
              telemetryContext: {
                operationId: context.operationId,
                userId: context.userId,
                agentId: 'data_coordinator',
                feature: 'document-notes-summary',
              },
            }
          : {}),
      });

      return typeof result.content === 'string' && result.content.trim()
        ? truncateText(result.content.trim(), 1_500)
        : buildFallbackSummary(fileName, analyses);
    } catch (error) {
      logger.warn('[EnrichDocumentNotesTool] Summary generation failed; using fallback', {
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFallbackSummary(fileName, analyses);
    }
  }
}
