/**
 * @fileoverview Dynamic Export Tool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Fully unconstrained Agent X tool for generating PDF, CSV, or XLSX documents
 * from any structured data the LLM assembles on-the-fly.
 *
 * Unlike fixed-schema tools, this tool accepts dynamic columns/rows/body
 * content — enabling Agent X to produce exports for *any* user request:
 * workout plans, recruiting lists, film breakdowns, compliance checklists,
 * comparison tables, team rosters, budget reports, etc.
 *
 * Architecture:
 *   LLM assembles structured JSON payload (columns, rows, paragraphs)
 *       ↓
 *   DynamicExportTool validates & delegates to ExportService
 *       ↓
 *   ExportService generates Buffer (PDF, CSV, or XLSX)
 *       ↓
 *   Tool uploads Buffer to Firebase Storage (thread-scoped)
 *       ↓
 *   Returns signed backend download URL as AgentXAttachment-compatible result
 *
 * For massive datasets that exceed LLM output limits, the tool also accepts
 * a `query` object. When present, the tool bypasses the LLM-provided rows
 * and fetches data directly from MongoDB, assembling the document natively.
 */

import type { Storage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ExportService, type ExportColumn, type ExportRow } from '../../services/export.service.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { AgentEphemeralStateService } from '../../services/agent-ephemeral-state.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { z } from 'zod';

const EXPORT_DOWNLOAD_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class DynamicExportTool extends BaseTool {
  readonly name = 'dynamic_export';
  readonly description =
    'Generates a downloadable PDF, CSV, or XLSX document from any structured data. ' +
    'Use this tool whenever the user asks to export, download, save, create a spreadsheet, ' +
    'create a report, produce a document, or needs data in a portable file format. ' +
    'You supply the columns, rows, and/or body text — the tool handles formatting, ' +
    'branding, and cloud hosting. The generated file opens cleanly in Excel, Google Sheets, ' +
    'Numbers, Word, Preview, and all standard desktop/mobile viewers. ' +
    'Works for: recruiting lists, scout reports, workout plans, compliance checklists, ' +
    'comparison tables, analytics summaries, team rosters, film breakdowns, budgets, ' +
    'schedules, or literally anything the user asks for.';

  readonly parameters = z.object({
    format: z.enum(['pdf', 'csv', 'xlsx']),
    fileName: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    columns: z
      .array(
        z.object({
          key: z.string().trim().min(1),
          label: z.string().trim().min(1),
        })
      )
      .optional(),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
    bodyParagraphs: z.array(z.string()).optional(),
    bulletPoints: z.array(z.string()).optional(),
    imageUrls: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Optional diagram/image URLs to embed directly inside PDF exports.'),
    theme: z.enum(['dark', 'light']).optional(),
    brandPrimaryColor: z
      .string()
      .trim()
      .optional()
      .describe('Optional team/organization primary color (hex like #0055AA).'),
    organizationName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional organization/team display name for PDF header branding.'),
    logoUrl: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional logo URL (https or data:image/*) rendered in PDF header.'),
  });

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  /** All agents can generate exports. */
  override readonly allowedAgents = ['*'] as const;

  private readonly exportService: ExportService;

  constructor(exportService?: ExportService) {
    super();
    this.exportService = exportService ?? new ExportService();
  }

  private resolveStorage(context?: ToolExecutionContext): Storage {
    return context?.environment === 'staging' ? stagingStorage : defaultStorage;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Validate required params ──────────────────────────────────────
    const format = this.resolveFormat(input['format']);
    if (!format) {
      return { success: false, error: 'Parameter "format" must be "pdf", "csv", or "xlsx".' };
    }

    const requestedTitle = this.str(input, 'title');
    const fileName = this.str(input, 'fileName') ?? requestedTitle ?? 'export';

    // Sanitize fileName to prevent path traversal
    const safeName =
      fileName
        .replace(/[^\w\s\-().]/g, '')
        .replace(/\.{2,}/g, '.') // collapse runs of dots (prevents traversal artefacts)
        .trim() || 'export';

    // ── Extract optional structured data ──────────────────────────────
    const columns = this.parseColumns(input);
    const rows = this.parseRows(input);
    const title = requestedTitle ?? safeName;
    const description = this.str(input, 'description') ?? undefined;
    const bodyParagraphs = this.parseStringArray(input, 'bodyParagraphs');
    const bulletPoints = this.parseStringArray(input, 'bulletPoints');
    const imageUrls = this.resolvePdfImageUrls(input, description, bodyParagraphs, bulletPoints);
    const theme = this.str(input, 'theme');
    const brandPrimaryColor = this.str(input, 'brandPrimaryColor') ?? undefined;
    const organizationName = this.str(input, 'organizationName') ?? undefined;
    const logoUrl =
      this.resolveOptionalImageUrl(this.str(input, 'logoUrl')) ??
      this.resolveOptionalImageUrl(this.str(input, 'url'));

    // ── Format-specific validation ────────────────────────────────────
    if (format === 'csv' || format === 'xlsx') {
      if (!columns?.length || !rows?.length) {
        return {
          success: false,
          error: `${format.toUpperCase()} exports require non-empty "columns" and "rows" arrays.`,
        };
      }
    }

    if (format === 'pdf') {
      const hasTable = columns?.length && rows?.length;
      const hasBody =
        bodyParagraphs?.length || bulletPoints?.length || description || imageUrls.length > 0;
      if (!hasTable && !hasBody) {
        return {
          success: false,
          error:
            'PDF exports require at least one of: columns+rows (table), bodyParagraphs, bulletPoints, or description.',
        };
      }
    }

    // ── Generate document ─────────────────────────────────────────────
    try {
      const emitStage = context?.emitStage;
      let buffer: Buffer;
      let mimeType: string;
      let extension: string;

      if (format === 'csv') {
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount: rows!.length,
          format: 'csv',
          phase: 'format_export',
        });
        buffer = this.exportService.generateCsv({ columns: columns!, rows: rows! });
        mimeType = 'text/csv';
        extension = 'csv';
      } else if (format === 'xlsx') {
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount: rows!.length,
          format: 'xlsx',
          phase: 'build_xlsx_workbook',
        });
        buffer = await this.exportService.generateXlsx({
          title,
          description,
          columns: columns!,
          rows: rows!,
          sheetName: safeName,
        });
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        extension = 'xlsx';
      } else {
        const rowCount = rows?.length ?? 0;
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount,
          format: 'pdf',
          phase: rowCount > 0 ? 'build_pdf_table' : 'build_pdf_document',
        });
        buffer = await this.exportService.generatePdf({
          title,
          description,
          includeTable: !!(columns?.length && rows?.length),
          columns: columns ?? undefined,
          rows: rows ?? undefined,
          bodyParagraphs: bodyParagraphs ?? undefined,
          bulletPoints: bulletPoints ?? undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          theme: theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : undefined,
          brandPrimaryColor,
          organizationName,
          logoUrl,
        });
        mimeType = 'application/pdf';
        extension = 'pdf';
      }

      const outputBaseName = safeName.replace(new RegExp(`\\.${extension}$`, 'i'), '') || 'export';

      // ── Upload to Firebase Storage ────────────────────────────────
      emitStage?.('uploading_assets', {
        icon: 'upload',
        format,
        phase: 'upload_export',
      });
      const userId = context?.userId ?? 'anonymous';
      const threadId = context?.threadId;
      const timestamp = Date.now();
      const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);

      // Thread-scoped path (auto-cleanup on thread deletion). threadId required.
      if (!threadId) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          'Export cannot be saved — no threadId in context'
        );
      }
      const storagePath = `Users/${userId}/threads/${threadId}/exports/${timestamp}-${hash}.${extension}`;
      const downloadToken = randomUUID();

      const bucket = this.resolveStorage(context).bucket();
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${outputBaseName}.${extension}"`,
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      // Verify the object exists before returning a download URL.
      emitStage?.('persisting_result', {
        icon: 'document',
        format,
        phase: 'create_download_link',
      });
      const [exists] = await file.exists();
      if (!exists) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          'Export upload verification failed — file was not found in storage'
        );
      }

      const downloadUrl = this.buildExportDownloadUrl(
        {
          storagePath,
          fileName: `${outputBaseName}.${extension}`,
          mimeType,
        },
        context
      );

      return {
        success: true,
        data: {
          downloadUrl,
          storagePath,
          fileName: `${outputBaseName}.${extension}`,
          mimeType,
          format: extension,
          sizeBytes: buffer.length,
          rowCount: rows?.length ?? 0,
          columnCount: columns?.length ?? 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document generation failed';
      return { success: false, error: message };
    }
  }

  // ── Input Parsing Helpers ───────────────────────────────────────────

  private parseColumns(input: Record<string, unknown>): ExportColumn[] | null {
    const raw = input['columns'];
    if (!Array.isArray(raw) || raw.length === 0) return null;

    return raw
      .filter(
        (c): c is { key: string; label: string } =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>)['key'] === 'string' &&
          typeof (c as Record<string, unknown>)['label'] === 'string'
      )
      .map((c) => ({ key: c.key, label: c.label }));
  }

  private parseRows(input: Record<string, unknown>): ExportRow[] | null {
    const raw = input['rows'];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.filter(Array.isArray) as ExportRow[];
  }

  private parseStringArray(input: Record<string, unknown>, key: string): string[] | null {
    const raw = input[key];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private buildExportDownloadUrl(
    params: {
      readonly storagePath: string;
      readonly fileName: string;
      readonly mimeType: string;
    },
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
      ttlMs: EXPORT_DOWNLOAD_URL_TTL_MS,
    }).url;
  }

  private resolvePdfImageUrls(
    input: Record<string, unknown>,
    description?: string,
    bodyParagraphs?: readonly string[] | null,
    bulletPoints?: readonly string[] | null
  ): string[] {
    const urls = new Set<string>();

    const explicitSingleUrls = [
      this.resolveOptionalImageUrl(this.str(input, 'imageUrl')),
      this.resolveOptionalImageUrl(this.str(input, 'url')),
    ].filter((value): value is string => typeof value === 'string');

    for (const url of explicitSingleUrls) {
      urls.add(url);
    }

    const explicit = this.parseStringArray(input, 'imageUrls') ?? [];
    for (const url of explicit) {
      if (this.isSupportedImageUrl(url)) urls.add(url.trim());
    }

    const textCandidates: string[] = [];
    if (description) textCandidates.push(description);
    if (bodyParagraphs?.length) textCandidates.push(...bodyParagraphs);
    if (bulletPoints?.length) textCandidates.push(...bulletPoints);

    for (const text of textCandidates) {
      for (const url of this.extractHttpUrls(text)) {
        if (this.isSupportedImageUrl(url)) {
          urls.add(url);
        }
      }
    }

    return [...urls];
  }

  private resolveFormat(raw: unknown): 'pdf' | 'csv' | 'xlsx' | null {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'csv') return 'csv';
    if (normalized === 'xlsx') return 'xlsx';
    return null;
  }

  private resolveOptionalImageUrl(raw: string | null): string | undefined {
    if (!raw) return undefined;
    const value = raw.trim();
    if (!value) return undefined;
    return this.isSupportedImageUrl(value) ? value : undefined;
  }

  private extractHttpUrls(text: string): string[] {
    const match = text.match(/https?:\/\/\S+/gi);
    if (!match) return [];
    return match.map((url) => url.replace(/[),.;!?]+$/, ''));
  }

  private isSupportedImageUrl(url: string): boolean {
    const value = url.trim();
    if (value.startsWith('data:image/')) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || /\/media\//i.test(value);
  }
}
