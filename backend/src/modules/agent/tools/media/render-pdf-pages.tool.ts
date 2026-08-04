import { createRequire } from 'node:module';
import type { Canvas, SKRSContext2D } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { AgentMediaLifecycleService } from './agent-media-lifecycle.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

const MAX_INLINE_PDF_BYTES = 24 * 1024 * 1024;
const MAX_RENDER_PAGES = 8;
const DEFAULT_RENDER_SCALE = 2;
const MAX_AUTO_RENDER_PAGES = 5;
const SIGNED_URL_TTL_HOURS =
  AgentMediaLifecycleService.DEFAULT_SIGNED_URL_TTL_MS / (60 * 60 * 1000);

type StorageResolver = (environment?: ToolExecutionContext['environment']) => {
  bucket: () => Parameters<typeof AgentMediaLifecycleService.saveBufferAndSignRead>[0]['bucket'];
};

type DownloadableStorageFile = {
  download: () => Promise<[Buffer]>;
};

type CanvasLike = Canvas;
type CanvasContextLike = SKRSContext2D;

type CanvasBindings = Pick<
  typeof import('@napi-rs/canvas'),
  'createCanvas' | 'DOMMatrix' | 'ImageData' | 'Path2D'
>;

type RenderedPageArtifact = {
  readonly pageNumber: number;
  readonly url: string;
  readonly imageUrl: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
  readonly expiresAt: string;
};

type FailedRenderedPage = {
  readonly pageNumber: number;
  readonly error: string;
};

type PdfRecoverySource = {
  readonly storagePath?: string;
  readonly url?: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes?: number;
};

const RenderPdfPagesInputSchema = z
  .object({
    url: z.string().trim().url('url must be a valid URL').optional(),
    storagePath: z.string().trim().min(1).max(1024).optional(),
    fileName: z.string().trim().min(1).max(256).optional(),
    mimeType: z.string().trim().min(1).max(128).optional(),
    pages: z.array(z.number().int().min(1).max(10_000)).min(1).max(MAX_RENDER_PAGES).optional(),
  })
  .refine((value) => Boolean(value.url || value.storagePath), {
    message: 'Either url or storagePath is required.',
    path: ['url'],
  });

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

function buildLargePdfRecoveryResult(params: {
  readonly reason: string;
  readonly source: PdfRecoverySource;
}): ToolResult {
  const sourceFile = {
    ...(params.source.storagePath ? { storagePath: params.source.storagePath } : {}),
    ...(params.source.url ? { url: params.source.url } : {}),
    fileName: params.source.fileName,
    mimeType: params.source.mimeType || 'application/pdf',
    origin: 'agent_chat_input',
    ...(typeof params.source.sizeBytes === 'number' ? { sizeBytes: params.source.sizeBytes } : {}),
  };

  return {
    success: false,
    isValidationError: true,
    error: `${params.reason} Save the PDF to Files and run enrich_document_notes instead of inline rendering.`,
    data: {
      recovery: {
        reason: params.reason,
        workflow: 'save_to_files_then_enrich_document_notes',
        userMessage:
          'This PDF is too large for inline page rendering, so save it to Files and run deep page-by-page notes from the saved record.',
        sourceFile,
        createUniversalTeamDocumentInput: {
          title: params.source.fileName,
          summary: `Uploaded PDF source file for Agent X analysis: ${params.source.fileName}`,
          classification: {
            primary: 'source_file',
            route: 'document_ingestion',
            labels: ['agent-chat-upload', 'pdf', 'large-pdf'],
          },
          sourceFile,
        },
        nextTool: 'create_universal_team_document',
        afterCreateNextTool: 'enrich_document_notes',
        instructions:
          'Do not retry render_pdf_pages for this unsaved large PDF. Create a UniversalFiles record with create_universal_team_document using sourceFile, then immediately call enrich_document_notes with the new document id and answer from artifactSummary/artifactNotes.',
      },
    },
    markdown: `${params.reason}\n\nRecovery: save this PDF to Files with \`create_universal_team_document\`, then run \`enrich_document_notes\` on the new document id.`,
  };
}

function inferFileName(url: string, fallback = 'document.pdf'): string {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();
    if (!lastSegment) return fallback;
    return decodeURIComponent(lastSegment);
  } catch {
    return fallback;
  }
}

function isPdfDocument(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
}

function buildAutoSelectedPages(pageCount: number): number[] {
  if (pageCount <= MAX_RENDER_PAGES) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  return Array.from(new Set([1, 2, Math.ceil(pageCount / 2), pageCount - 1, pageCount]))
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    .slice(0, MAX_AUTO_RENDER_PAGES);
}

function buildRenderedPageFileName(fileName: string, pageNumber: number): string {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '') || 'document';
  return `${stem}-page-${String(pageNumber).padStart(3, '0')}.png`;
}

class NodeCanvasFactory {
  constructor(private readonly canvasBindings: CanvasBindings) {}

  create(width: number, height: number): { canvas: CanvasLike; context: CanvasContextLike } {
    const canvas = this.canvasBindings.createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(
    target: { canvas: CanvasLike; context: CanvasContextLike },
    width: number,
    height: number
  ): void {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: { canvas: CanvasLike; context: CanvasContextLike }): void {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
}

export class RenderPdfPagesTool extends BaseTool {
  readonly name = 'render_pdf_pages';
  readonly description =
    'Render one or more pages from a PDF attachment into signed image URLs for vision analysis. ' +
    'Use this after parse_document when a PDF is diagram-heavy but no embedded image assets were extracted.';

  readonly parameters = RenderPdfPagesInputSchema;
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

  constructor(
    private readonly resolveStorage: StorageResolver = (environment) =>
      environment === 'staging' ? stagingStorage : defaultStorage,
    private readonly canvasBindings: CanvasBindings = resolvePdfJsCanvasBindings()
  ) {
    super();
    ensurePdfJsNodeGlobals(this.canvasBindings);
  }

  private async loadPdfBuffer(
    url: string | undefined,
    storagePath: string | undefined,
    context?: ToolExecutionContext
  ): Promise<{ buffer: Buffer } | { error: string }> {
    const normalizedStoragePath = storagePath?.trim();
    if (normalizedStoragePath) {
      const file = this.resolveStorage(context?.environment)
        .bucket()
        .file(normalizedStoragePath) as DownloadableStorageFile;
      const [buffer] = await file.download();

      if (buffer.byteLength > MAX_INLINE_PDF_BYTES) {
        return { error: `PDF exceeds the ${MAX_INLINE_PDF_BYTES} byte render limit.` };
      }

      return { buffer };
    }

    const directUrl = url?.trim();
    if (!directUrl) {
      return { error: 'render_pdf_pages requires a PDF URL or storagePath.' };
    }

    const response = await fetch(directUrl, { signal: context?.signal });
    if (!response.ok) {
      return { error: `Failed to download PDF: ${response.status} ${response.statusText}` };
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_INLINE_PDF_BYTES) {
      return { error: `PDF exceeds the ${MAX_INLINE_PDF_BYTES} byte render limit.` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_INLINE_PDF_BYTES) {
      return { error: `PDF exceeds the ${MAX_INLINE_PDF_BYTES} byte render limit.` };
    }

    return { buffer };
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RenderPdfPagesInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = context?.userId ?? null;
    const threadId = context?.threadId ?? null;
    if (!userId || !threadId) {
      return {
        success: false,
        error: 'render_pdf_pages requires active user and thread context to stage rendered pages.',
      };
    }

    const fileName =
      parsed.data.fileName ?? inferFileName(parsed.data.url ?? parsed.data.storagePath ?? '');
    const mimeType = (parsed.data.mimeType ?? '').trim().toLowerCase();
    if (!isPdfDocument(mimeType, fileName)) {
      return {
        success: false,
        error: 'render_pdf_pages only supports PDF attachments.',
      };
    }

    context?.emitStage?.('processing_media', {
      icon: 'document',
      phase: 'render_pdf_pages',
      target: fileName,
    });

    try {
      const pdfSource = await this.loadPdfBuffer(parsed.data.url, parsed.data.storagePath, context);
      if ('error' in pdfSource) {
        if (pdfSource.error.includes('byte render limit')) {
          return buildLargePdfRecoveryResult({
            reason: pdfSource.error,
            source: {
              storagePath: parsed.data.storagePath,
              url: parsed.data.url,
              fileName,
              mimeType,
            },
          });
        }

        return {
          success: false,
          error: pdfSource.error,
        };
      }

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfSource.buffer),
        useWorkerFetch: false,
        disableFontFace: true,
        useSystemFonts: true,
      });
      const pdfDocument = await loadingTask.promise;

      try {
        const selectedPages = parsed.data.pages
          ? Array.from(new Set(parsed.data.pages)).sort((left, right) => left - right)
          : buildAutoSelectedPages(pdfDocument.numPages);
        const invalidPages = selectedPages.filter(
          (pageNumber) => pageNumber < 1 || pageNumber > pdfDocument.numPages
        );
        if (invalidPages.length > 0) {
          return {
            success: false,
            error: `Requested PDF pages are out of range: ${invalidPages.join(', ')}.`,
          };
        }

        const bucket = this.resolveStorage(context?.environment).bucket();
        const renderedPages: RenderedPageArtifact[] = [];
        const failedPages: FailedRenderedPage[] = [];

        for (const pageNumber of selectedPages) {
          try {
            const page = await pdfDocument.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const longestEdge = Math.max(baseViewport.width, baseViewport.height, 1);
            const scale = Math.max(1.4, Math.min(DEFAULT_RENDER_SCALE, 1800 / longestEdge));
            const viewport = page.getViewport({ scale });
            const canvasFactory = new NodeCanvasFactory(this.canvasBindings);
            const { canvas, context: canvasContext } = canvasFactory.create(
              Math.ceil(viewport.width),
              Math.ceil(viewport.height)
            );

            canvasContext.fillStyle = '#ffffff';
            canvasContext.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
              canvas: canvas as unknown as HTMLCanvasElement,
              canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
              viewport,
            }).promise;

            const pageBuffer = canvas.toBuffer('image/png');
            const renderedFileName = buildRenderedPageFileName(fileName, pageNumber);
            const storagePath = AgentMediaLifecycleService.buildStoragePath({
              userId,
              threadId,
              zone: 'tmp',
              mimeType: 'image/png',
              fileName: renderedFileName,
            });
            const signed = await AgentMediaLifecycleService.saveBufferAndSignRead({
              bucket,
              storagePath,
              buffer: pageBuffer,
              mimeType: 'image/png',
              cacheControl: 'private, max-age=0',
            });

            renderedPages.push({
              pageNumber,
              url: signed.url,
              imageUrl: signed.url,
              storagePath,
              fileName: renderedFileName,
              mimeType: 'image/png',
              width: canvas.width,
              height: canvas.height,
              expiresAt: new Date(signed.expiresAt).toISOString(),
            });

            page.cleanup();
            canvasFactory.destroy({ canvas, context: canvasContext });
          } catch (error) {
            failedPages.push({
              pageNumber,
              error: error instanceof Error ? error.message : 'Failed to render PDF page.',
            });
          }
        }

        if (renderedPages.length === 0) {
          return {
            success: false,
            error: failedPages[0]?.error ?? 'Failed to render PDF pages.',
          };
        }

        const selectionMode = parsed.data.pages
          ? 'explicit'
          : pdfDocument.numPages <= MAX_RENDER_PAGES
            ? 'auto_all'
            : 'auto_subset';
        const visionCoverage = renderedPages.length === pdfDocument.numPages ? 'full' : 'partial';

        return {
          success: true,
          data: {
            fileName,
            mimeType: 'application/pdf',
            pageCount: pdfDocument.numPages,
            selectedPages,
            renderedPages,
            imageUrls: renderedPages.map((page) => page.imageUrl),
            failedPages,
            renderedPageCount: renderedPages.length,
            selectionMode,
            visionCoverage,
            signedUrlTtlHours: SIGNED_URL_TTL_HOURS,
            recommendedNextAction: 'analyze_image',
            failureCode: failedPages.length > 0 ? 'partial_render' : null,
            recoverable: failedPages.length > 0,
          },
          markdown:
            `Rendered ${renderedPages.length} PDF page image${renderedPages.length === 1 ? '' : 's'} ` +
            `from ${fileName} (pages ${selectedPages.join(', ')}). ` +
            `The returned imageUrls are signed links that expire in about ${SIGNED_URL_TTL_HOURS} hours; ` +
            'if they expire, rerun render_pdf_pages or refresh from the storagePath. ' +
            'Use analyze_image on the returned imageUrls for visual diagram review.',
        };
      } finally {
        await loadingTask.destroy();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to render PDF pages.',
      };
    }
  }
}
