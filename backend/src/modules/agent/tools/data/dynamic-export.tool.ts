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

  readonly parameters = {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['pdf', 'csv'],
        description:
          'Output file format. Use "csv" for tabular/spreadsheet data (opens in Excel/Sheets). ' +
          'Use "pdf" for formatted reports with headings, paragraphs, and tables.',
      },
      fileName: {
        type: 'string',
        description:
          'Human-readable file name without extension (e.g. "Top 50 QB Prospects Texas 2026"). ' +
          'The correct extension (.pdf or .csv) is appended automatically.',
      },
      title: {
        type: 'string',
        description: 'Document title (rendered as the main heading in PDFs, ignored for CSVs).',
      },
      description: {
        type: 'string',
        description: 'Optional subtitle or summary paragraph below the PDF title.',
      },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique column identifier.' },
            label: { type: 'string', description: 'Human-readable column header.' },
          },
          required: ['key', 'label'],
        },
        description:
          'Column definitions for tabular data. Required for CSV exports. ' +
          'For PDFs, include columns only if the document contains a data table.',
      },
      rows: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean', 'null'] },
        },
        description:
          'Row data — each inner array must match column order. ' +
          'For CSV: this is the entire spreadsheet body. ' +
          'For PDF: this populates the embedded data table.',
      },
      bodyParagraphs: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Free-form paragraphs rendered in the PDF body above the table. ' +
          'Use for executive summaries, analysis narrative, recommendations, etc.',
      },
      bulletPoints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bullet-point list rendered in the PDF body.',
      },
    },
    required: ['format', 'fileName'],
  } as const;

  readonly isMutation = true;
  readonly category = 'data' as const;

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
      const progress = context?.onProgress;
      let buffer: Buffer;
      let mimeType: string;
      let extension: string;

      if (format === 'csv') {
        progress?.(`Formatting ${rows!.length.toLocaleString()} rows as CSV…`);
        buffer = this.exportService.generateCsv({ columns: columns!, rows: rows! });
        mimeType = 'text/csv';
        extension = 'csv';
      } else {
        const rowCount = rows?.length ?? 0;
        progress?.(
          rowCount > 0
            ? `Building PDF with ${rowCount.toLocaleString()} rows…`
            : 'Generating PDF document…'
        );
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
      progress?.('Uploading to secure storage…');
      const userId = context?.userId ?? 'anonymous';
      const threadId = context?.threadId;
      const timestamp = Date.now();
      const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);

      // Thread-scoped path (auto-cleanup on thread deletion).
      // Falls back to user-scoped exports/ when no thread context is available.
      const storagePath = threadId
        ? `users/${userId}/threads/${threadId}/exports/${timestamp}-${hash}.${extension}`
        : `users/${userId}/exports/${timestamp}-${hash}.${extension}`;

      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${safeName}.${extension}"`,
        },
      });

      // 7-year signed URL (consistent with other tools)
      progress?.('Creating secure download link…');
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 7);
      const [downloadUrl] = await file.getSignedUrl({ action: 'read', expires });

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
