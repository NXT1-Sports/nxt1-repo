/**
 * @fileoverview Dynamic Export Tool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Fully unconstrained Agent X tool for generating PDF or CSV documents
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
 *   ExportService generates Buffer (PDF or CSV)
 *       ↓
 *   Tool uploads Buffer to Firebase Storage (thread-scoped)
 *       ↓
 *   Returns signed URL as AgentXAttachment-compatible result
 *
 * For massive datasets that exceed LLM output limits, the tool also accepts
 * a `query` object. When present, the tool bypasses the LLM-provided rows
 * and fetches data directly from MongoDB, assembling the document natively.
 */

import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ExportService, type ExportColumn, type ExportRow } from '../../services/export.service.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { z } from 'zod';

export class DynamicExportTool extends BaseTool {
  readonly name = 'dynamic_export';
  readonly description =
    'Generates a downloadable PDF or CSV document from any structured data. ' +
    'Use this tool whenever the user asks to export, download, save, create a spreadsheet, ' +
    'create a report, produce a document, or needs data in a portable file format. ' +
    'You supply the columns, rows, and/or body text — the tool handles formatting, ' +
    'branding, and cloud hosting. The generated file opens cleanly in Excel, Google Sheets, ' +
    'Numbers, Word, Preview, and all standard desktop/mobile viewers. ' +
    'Works for: recruiting lists, scout reports, workout plans, compliance checklists, ' +
    'comparison tables, analytics summaries, team rosters, film breakdowns, budgets, ' +
    'schedules, or literally anything the user asks for.';

  readonly parameters = z.object({
    format: z.enum(['pdf', 'csv']),
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

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Validate required params ──────────────────────────────────────
    const format = this.str(input, 'format');
    if (!format || (format !== 'pdf' && format !== 'csv')) {
      return { success: false, error: 'Parameter "format" must be "pdf" or "csv".' };
    }

    const fileName = this.str(input, 'fileName');
    if (!fileName) {
      return this.paramError('fileName');
    }

    // Sanitize fileName to prevent path traversal
    const safeName =
      fileName
        .replace(/[^\w\s\-().]/g, '')
        .replace(/\.{2,}/g, '.') // collapse runs of dots (prevents traversal artefacts)
        .trim() || 'export';

    // ── Extract optional structured data ──────────────────────────────
    const columns = this.parseColumns(input);
    const rows = this.parseRows(input);
    const title = this.str(input, 'title') ?? safeName;
    const description = this.str(input, 'description') ?? undefined;
    const bodyParagraphs = this.parseStringArray(input, 'bodyParagraphs');
    const bulletPoints = this.parseStringArray(input, 'bulletPoints');

    // ── Format-specific validation ────────────────────────────────────
    if (format === 'csv') {
      if (!columns?.length || !rows?.length) {
        return {
          success: false,
          error: 'CSV exports require non-empty "columns" and "rows" arrays.',
        };
      }
    }

    if (format === 'pdf') {
      const hasTable = columns?.length && rows?.length;
      const hasBody = bodyParagraphs?.length || bulletPoints?.length || description;
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
        });
        mimeType = 'application/pdf';
        extension = 'pdf';
      }

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

      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${safeName}.${extension}"`,
        },
      });

      // Make publicly accessible and build direct URL
      emitStage?.('persisting_result', {
        icon: 'document',
        format,
        phase: 'create_download_link',
      });
      await file.makePublic();
      const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      return {
        success: true,
        data: {
          downloadUrl,
          storagePath,
          fileName: `${safeName}.${extension}`,
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
}
