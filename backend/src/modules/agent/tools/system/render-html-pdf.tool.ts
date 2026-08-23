import type { Storage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { AgentEphemeralStateService } from '../../services/agent-ephemeral-state.service.js';
import {
  HtmlPdfRendererService,
  type HtmlPdfOrientation,
  type HtmlPdfPageSize,
  type HtmlPdfRenderResult,
} from '../../services/html-pdf-renderer.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

const HTML_PDF_DOWNLOAD_URL_TTL_MS_NO_EXPIRE = 100 * 365 * 24 * 60 * 60 * 1000;
const HTML_PDF_REVISION_HINT =
  'You can ask Agent X to adjust this PDF by describing the change. The editable HTML source was saved with the PDF, so Agent X can update that source and rerender the document.';

const RenderHtmlPdfInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .describe(
      'Complete HTML document with inline CSS. For exact_match, use print CSS with @page, a fixed-size page/sheet/canvas container, and coordinate/grid positioned elements rather than generic flowing text. For best_fit_operational, normal document flow, tables, flexbox, and grid layouts are allowed as long as the result is still a printable PDF.'
    ),
  fileName: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  pageSize: z.enum(['LETTER', 'LEGAL', 'TABLOID', 'A4']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  pageWidth: z.number().positive().max(200).optional(),
  pageHeight: z.number().positive().max(200).optional(),
  pageUnit: z.enum(['in', 'mm', 'cm', 'px', 'pt']).optional(),
  expectedPageCount: z.number().int().min(1).max(100).optional(),
  layoutIntent: z
    .enum(['exact_match', 'best_fit_operational'])
    .optional()
    .describe(
      'Use exact_match only when matching a sample/reference layout closely or when physical geometry is critical (wristbands, fixed cards, paper inserts). Use best_fit_operational for ordinary printable PDFs where the design can adapt more freely to the content.'
    ),
  relatedDocumentId: z.string().trim().min(1).optional(),
  sourceDocumentIds: z.array(z.string().trim().min(1)).optional(),
  sourceAttachmentIds: z.array(z.string().trim().min(1)).optional(),
  artifactGroupId: z.string().trim().min(1).optional(),
});

type RenderHtmlPdfInput = z.infer<typeof RenderHtmlPdfInputSchema>;

export class RenderHtmlPdfTool extends BaseTool {
  readonly name = 'render_html_pdf';
  readonly description =
    'Renders exact-match or best-fit operational PDFs from complete HTML/CSS and persists the editable source HTML alongside the PDF. ' +
    'Use this instead of Gamma or dynamic_export when the user asks to match a sample image/template exactly, ' +
    'make a one-page PDF like a reference, or create printable operational layouts such as depth charts, callsheets, wristbands, roster cards, or sideline sheets. ' +
    'Important: exact_match is for sample-matched/fixed-geometry work; best_fit_operational is for freer printable designs that should still render as PDF.';

  readonly parameters = RenderHtmlPdfInputSchema;
  readonly isMutation = true;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly renderer: Pick<HtmlPdfRendererService, 'render'> = new HtmlPdfRendererService()
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RenderHtmlPdfInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join('; '),
      };
    }

    try {
      const normalized = this.normalizeInput(parsed.data, context);
      const renderResult = await this.renderer.render({
        html: normalized.html,
        pageSize: normalized.pageSize,
        orientation: normalized.orientation,
        pageWidth: normalized.pageWidth,
        pageHeight: normalized.pageHeight,
        pageUnit: normalized.pageUnit,
        expectedPageCount: normalized.expectedPageCount,
        signal: context?.signal,
      });

      return await this.uploadResult(normalized, renderResult, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'HTML PDF render failed';
      return { success: false, error: message };
    }
  }

  private normalizeInput(input: RenderHtmlPdfInput, context?: ToolExecutionContext) {
    const pageSize: HtmlPdfPageSize = input.pageSize ?? 'LETTER';
    const orientation: HtmlPdfOrientation = input.orientation ?? 'landscape';
    const artifactGroupId = input.artifactGroupId ?? context?.operationId ?? undefined;
    const safeName = this.sanitizeFileName(input.fileName ?? input.title ?? 'html-pdf-export');

    return {
      ...input,
      fileName: safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`,
      pageSize,
      orientation,
      artifactGroupId,
    };
  }

  private async uploadResult(
    input: ReturnType<RenderHtmlPdfTool['normalizeInput']>,
    renderResult: HtmlPdfRenderResult,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = context?.userId ?? 'anonymous';
    const threadId = context?.threadId;
    if (!threadId) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'HTML PDF export cannot be saved — no threadId in context'
      );
    }

    const timestamp = Date.now();
    const hash = createHash('md5').update(renderResult.buffer).digest('hex').slice(0, 8);
    const outputBaseName = `${timestamp}-${hash}`;
    const storagePath = `Users/${userId}/threads/${threadId}/exports/${outputBaseName}.pdf`;
    const sourceStoragePath = `Users/${userId}/threads/${threadId}/exports/${outputBaseName}.html`;
    const bucket = this.resolveStorage(context).bucket();
    const file = bucket.file(storagePath);
    const sourceFile = bucket.file(sourceStoragePath);
    const sourceFileName = input.fileName.replace(/\.pdf$/i, '.html');

    context?.emitStage?.('uploading_assets', {
      icon: 'upload',
      format: 'pdf',
      phase: 'upload_html_pdf_export',
    });

    await Promise.all([
      file.save(renderResult.buffer, {
        contentType: 'application/pdf',
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${input.fileName}"`,
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      }),
      sourceFile.save(input.html, {
        contentType: 'text/html; charset=utf-8',
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'private, max-age=0, no-cache',
          contentDisposition: `attachment; filename="${sourceFileName}"`,
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      }),
    ]);

    context?.emitStage?.('persisting_result', {
      icon: 'document',
      format: 'pdf',
      phase: 'create_html_pdf_download_links',
    });

    const [[exists], [sourceExists]] = await Promise.all([file.exists(), sourceFile.exists()]);
    if (!exists || !sourceExists) {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'HTML PDF upload verification failed — rendered PDF or editable HTML source was not found in storage'
      );
    }

    const downloadUrl = this.buildExportDownloadUrl(
      { storagePath, fileName: input.fileName, mimeType: 'application/pdf' },
      context
    );
    const sourceDownloadUrl = this.buildExportDownloadUrl(
      { storagePath: sourceStoragePath, fileName: sourceFileName, mimeType: 'text/html' },
      context
    );
    const pdfAttachment = {
      url: downloadUrl,
      storagePath,
      name: input.fileName,
      mimeType: 'application/pdf',
      type: 'doc',
      sizeBytes: renderResult.buffer.length,
      artifactRole: 'export',
      ...(input.relatedDocumentId ? { relatedDocumentId: input.relatedDocumentId } : {}),
      ...(input.sourceDocumentIds?.length ? { sourceDocumentIds: input.sourceDocumentIds } : {}),
      ...(input.sourceAttachmentIds?.length
        ? { sourceAttachmentIds: input.sourceAttachmentIds }
        : {}),
      ...(input.artifactGroupId ? { artifactGroupId: input.artifactGroupId } : {}),
    };
    const sourceAttachment = {
      url: sourceDownloadUrl,
      storagePath: sourceStoragePath,
      name: sourceFileName,
      mimeType: 'text/html',
      type: 'doc',
      sizeBytes: Buffer.byteLength(input.html, 'utf8'),
      artifactRole: 'source' as const,
      ...(input.relatedDocumentId ? { relatedDocumentId: input.relatedDocumentId } : {}),
      ...(input.sourceDocumentIds?.length ? { sourceDocumentIds: input.sourceDocumentIds } : {}),
      ...(input.sourceAttachmentIds?.length
        ? { sourceAttachmentIds: input.sourceAttachmentIds }
        : {}),
      ...(input.artifactGroupId ? { artifactGroupId: input.artifactGroupId } : {}),
    };

    return {
      success: true,
      data: {
        downloadUrl,
        storagePath,
        fileName: input.fileName,
        mimeType: 'application/pdf',
        format: 'pdf',
        sizeBytes: renderResult.buffer.length,
        artifactRole: 'export',
        layoutIntent: input.layoutIntent ?? 'best_fit_operational',
        renderMetadata: renderResult.metadata,
        editableSource: sourceAttachment,
        revisionHint: HTML_PDF_REVISION_HINT,
        ...(input.relatedDocumentId ? { relatedDocumentId: input.relatedDocumentId } : {}),
        ...(input.sourceDocumentIds?.length ? { sourceDocumentIds: input.sourceDocumentIds } : {}),
        ...(input.sourceAttachmentIds?.length
          ? { sourceAttachmentIds: input.sourceAttachmentIds }
          : {}),
        ...(input.artifactGroupId ? { artifactGroupId: input.artifactGroupId } : {}),
        attachments: [pdfAttachment, sourceAttachment],
      },
    };
  }

  private sanitizeFileName(fileName: string): string {
    return (
      fileName
        .replace(/[^\w\s\-().]/g, '')
        .replace(/\.{2,}/g, '.')
        .trim() || 'rendered-layout.pdf'
    );
  }

  private resolveStorage(context?: ToolExecutionContext): Storage {
    return context?.environment === 'staging' ? stagingStorage : defaultStorage;
  }

  private buildExportDownloadUrl(
    params: { readonly storagePath: string; readonly fileName: string; readonly mimeType: string },
    context?: ToolExecutionContext
  ): string {
    const agentRouteBase =
      context?.agentRouteBase ??
      `${(process.env['BACKEND_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1${context?.environment === 'staging' ? '/staging' : ''}/agent-x`;

    return AgentEphemeralStateService.buildSignedExportDownloadUrl({
      storagePath: params.storagePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      routeBase: agentRouteBase,
      ttlMs: HTML_PDF_DOWNLOAD_URL_TTL_MS_NO_EXPIRE,
    }).url;
  }
}
