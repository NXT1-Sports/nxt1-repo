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
import {
  ExportService,
  type ExportColumn,
  type ExportRow,
  type ExportSection,
} from '../../services/export.service.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { AgentEphemeralStateService } from '../../services/agent-ephemeral-state.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { z } from 'zod';

const EXPORT_DOWNLOAD_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ExportSectionSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  themeColor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Optional hex color (e.g., #0055AA) to cleanly filter/style this section distinctly. If omitted, uses default dark branding.'
    ),
  gridColumn: z
    .number()
    .min(1)
    .max(4)
    .optional()
    .describe(
      'For multi_column_grid layouts, explicitly assign this section to column 1, 2, 3, or 4. If omitted, it waterfalls automatically.'
    ),
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
  imageUrls: z.array(z.string().trim().min(1)).optional(),
});

export class DynamicExportTool extends BaseTool {
  readonly name = 'dynamic_export';
  readonly description =
    'Generates a downloadable PDF, CSV, or XLSX document from any structured data. ' +
    'Use this tool whenever the user asks to export, download, save, create a spreadsheet, ' +
    'create a report, produce a document, or needs data in a portable file format. ' +
    'You supply the columns, rows, and/or body text — the tool handles formatting, ' +
    'branding, and cloud hosting.\n\n' +
    'HOW TO FORMAT LIKE A PRO:\n' +
    '- NEVER use emojis in the data or titles. They break the PDF and Excel generators. Use text only.\n' +
    '- If this export represents a saved Files document, pass `relatedDocumentId` with the UniversalFiles document id so the PDF/XLSX/CSV is attached back to that document in Files. When creating both a saved document and an export, create or update the Files document first whenever possible, then export with `relatedDocumentId`.\n' +
    '- For Practice Scripts/Schedules: Divide the schedule into multiple `sections` (e.g. "Period 1: Flex", "Period 2: 7on7") instead of one massive table. Default these to XLSX or native saved documents unless the user explicitly asks for PDF/print-ready delivery. Pass `pageOrientation: "landscape"` so it prints well in Excel/PDF.\n' +
    '- For Callsheets / Rosters / Multi-Panel Boards: Pass `layoutMode: "multi_column_grid"`, `pageSize: "LEGAL"`, and `pageOrientation: "landscape"`. Default coaching sheets like callsheets to XLSX or native saved documents unless the user explicitly asks for PDF, printing, or share-ready output. You can optionally set `gridColumn: 1` or `2` etc on each section so it builds a perfect side-by-side coach board instead of a vertical stack. Use section.themeColor to visually separate different types of plays (e.g., Red Zone, Run Game).\n' +
    '- For Scout Reports: Use `pageSize: "LETTER"`, `pageOrientation: "portrait"`, and break down the opponent into `sections` with paragraphs and bullet points.\n\n' +
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
    sections: z.array(ExportSectionSchema).optional(),
    bodyParagraphs: z.array(z.string()).optional(),
    bulletPoints: z.array(z.string()).optional(),
    imageUrls: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Optional diagram/chart/image URLs to embed directly inside PDF and XLSX exports.'),
    layoutMode: z
      .enum(['standard', 'multi_column_grid'])
      .optional()
      .describe(
        'Use multi_column_grid and section.gridColumn to place tables side-by-side like a coach callsheet. Defaults to standard (vertical stack).'
      ),
    pageSize: z
      .enum(['LETTER', 'LEGAL', 'TABLOID'])
      .optional()
      .describe('Prefer LEGAL for callsheets and massive rosters. Defaults to LETTER.'),
    pageOrientation: z
      .enum(['portrait', 'landscape'])
      .optional()
      .describe('Prefer landscape for callsheets, wide tables, or practice scripts.'),
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
    watermarkText: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional PDF watermark text such as DRAFT or CONFIDENTIAL.'),
    relatedDocumentId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('UniversalFiles document ID this export should be attached to.'),
    sourceDocumentIds: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('UniversalFiles source document IDs used to build this export.'),
    sourceAttachmentIds: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Chat/file attachment IDs used to build this export.'),
    artifactGroupId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Stable group ID shared by related artifacts from the same task.'),
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
    const sections = this.parseSections(input);
    const title = requestedTitle ?? safeName;
    const description = this.str(input, 'description') ?? undefined;
    const bodyParagraphs = this.parseStringArray(input, 'bodyParagraphs');
    const bulletPoints = this.parseStringArray(input, 'bulletPoints');
    const imageUrls = this.resolveImageUrls(input, description, bodyParagraphs, bulletPoints);
    const layoutMode = this.resolveLayoutMode(input['layoutMode']);
    const pageSize = this.resolvePageSize(input['pageSize']);
    const pageOrientation = this.resolvePageOrientation(input['pageOrientation']);
    const brandPrimaryColor = this.str(input, 'brandPrimaryColor') ?? undefined;
    const organizationName = this.str(input, 'organizationName') ?? undefined;
    const watermarkText = this.str(input, 'watermarkText') ?? undefined;
    const relatedDocumentId = this.str(input, 'relatedDocumentId') ?? undefined;
    const sourceDocumentIds = this.parseStringArray(input, 'sourceDocumentIds');
    const sourceAttachmentIds = this.parseStringArray(input, 'sourceAttachmentIds');
    const artifactGroupId = this.str(input, 'artifactGroupId') ?? context?.operationId ?? undefined;
    const logoUrl =
      this.resolveOptionalImageUrl(this.str(input, 'logoUrl')) ??
      this.resolveOptionalImageUrl(this.str(input, 'url'));

    // ── Format-specific validation ────────────────────────────────────
    if (format === 'csv' || format === 'xlsx') {
      if (!this.hasTabularExportContent(columns, rows, sections)) {
        return {
          success: false,
          error: `${format.toUpperCase()} exports require non-empty "columns" and "rows" arrays, either at the top level or within a section.`,
        };
      }
    }

    if (format === 'pdf') {
      const hasTable = this.hasTabularExportContent(columns, rows, sections);
      const hasBody =
        bodyParagraphs?.length ||
        bulletPoints?.length ||
        description ||
        imageUrls.length > 0 ||
        this.sectionsHaveNarrativeContent(sections);
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
        const exportRows = rows ?? this.firstSectionRows(sections) ?? [];
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount: exportRows.length,
          format: 'csv',
          phase: 'format_export',
        });
        if (sections?.length) {
          buffer = this.exportService.generateCsv({
            columns: columns ?? this.firstSectionColumns(sections) ?? [],
            rows: exportRows,
            title,
            description,
            sections,
          });
        } else {
          buffer = this.exportService.generateCsv({ columns: columns!, rows: rows! });
        }
        mimeType = 'text/csv';
        extension = 'csv';
      } else if (format === 'xlsx') {
        const exportRows = rows ?? this.firstSectionRows(sections) ?? [];
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount: exportRows.length,
          format: 'xlsx',
          phase: 'build_xlsx_workbook',
        });
        buffer = await this.exportService.generateXlsx({
          title,
          description,
          columns: columns ?? this.firstSectionColumns(sections) ?? [],
          rows: exportRows,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          sections: sections ?? undefined,
          sheetName: safeName,
          layoutMode,
          pageSize,
          pageOrientation,
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
          sections: sections ?? undefined,
          bodyParagraphs: bodyParagraphs ?? undefined,
          bulletPoints: bulletPoints ?? undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          layoutMode,
          pageSize,
          pageOrientation,
          brandPrimaryColor,
          organizationName,
          watermarkText,
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
          rowCount: this.resolveRowCount(rows, sections),
          columnCount: this.resolveColumnCount(columns, sections),
          artifactRole: 'export',
          ...(relatedDocumentId ? { relatedDocumentId } : {}),
          ...(sourceDocumentIds?.length ? { sourceDocumentIds } : {}),
          ...(sourceAttachmentIds?.length ? { sourceAttachmentIds } : {}),
          ...(artifactGroupId ? { artifactGroupId } : {}),
          attachments: [
            {
              url: downloadUrl,
              storagePath,
              name: `${outputBaseName}.${extension}`,
              mimeType,
              type: 'doc',
              sizeBytes: buffer.length,
              artifactRole: 'export',
              ...(relatedDocumentId ? { relatedDocumentId } : {}),
              ...(sourceDocumentIds?.length ? { sourceDocumentIds } : {}),
              ...(sourceAttachmentIds?.length ? { sourceAttachmentIds } : {}),
              ...(artifactGroupId ? { artifactGroupId } : {}),
            },
          ],
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

  private parseSections(input: Record<string, unknown>): ExportSection[] | null {
    const raw = input['sections'];
    if (!Array.isArray(raw) || raw.length === 0) return null;

    return raw
      .filter(
        (section): section is Record<string, unknown> =>
          typeof section === 'object' && section !== null
      )
      .map((section) => ({
        title: this.str(section, 'title') ?? undefined,
        description: this.str(section, 'description') ?? undefined,
        themeColor: this.str(section, 'themeColor') ?? undefined,
        gridColumn:
          typeof section['gridColumn'] === 'number' && Number.isFinite(section['gridColumn'])
            ? Math.trunc(section['gridColumn'])
            : undefined,
        columns: this.parseColumns(section) ?? undefined,
        rows: this.parseRows(section) ?? undefined,
        bodyParagraphs: this.parseStringArray(section, 'bodyParagraphs') ?? undefined,
        bulletPoints: this.parseStringArray(section, 'bulletPoints') ?? undefined,
        imageUrls: this.parseStringArray(section, 'imageUrls') ?? undefined,
      }))
      .filter((section) => this.sectionHasAnyContent(section));
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

  private resolveImageUrls(
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

  private hasTabularExportContent(
    columns: ExportColumn[] | null,
    rows: ExportRow[] | null,
    sections: ExportSection[] | null
  ): boolean {
    if (columns?.length && rows?.length) return true;
    return Boolean(sections?.some((section) => section.columns?.length && section.rows?.length));
  }

  private sectionsHaveNarrativeContent(sections: ExportSection[] | null): boolean {
    return Boolean(
      sections?.some(
        (section) =>
          section.title ||
          section.description ||
          section.bodyParagraphs?.length ||
          section.bulletPoints?.length ||
          section.imageUrls?.length
      )
    );
  }

  private sectionHasAnyContent(section: ExportSection): boolean {
    return Boolean(
      section.title ||
      section.description ||
      section.bodyParagraphs?.length ||
      section.bulletPoints?.length ||
      section.imageUrls?.length ||
      (section.columns?.length && section.rows?.length)
    );
  }

  private firstSectionColumns(sections: ExportSection[] | null): ExportColumn[] | null {
    const columns = sections?.find((section) => section.columns?.length)?.columns;
    return columns ? [...columns] : null;
  }

  private firstSectionRows(sections: ExportSection[] | null): ExportRow[] | null {
    const rows = sections?.find((section) => section.rows?.length)?.rows;
    return rows ? rows.map((row) => [...row] as ExportRow) : null;
  }

  private resolveRowCount(rows: ExportRow[] | null, sections: ExportSection[] | null): number {
    if (!sections?.length) return rows?.length ?? 0;
    return sections.reduce((total, section) => total + (section.rows?.length ?? 0), 0);
  }

  private resolveColumnCount(
    columns: ExportColumn[] | null,
    sections: ExportSection[] | null
  ): number {
    if (!sections?.length) return columns?.length ?? 0;
    return sections.reduce(
      (maxColumns, section) => Math.max(maxColumns, section.columns?.length ?? 0),
      0
    );
  }

  private resolveFormat(raw: unknown): 'pdf' | 'csv' | 'xlsx' | null {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'csv') return 'csv';
    if (normalized === 'xlsx') return 'xlsx';
    return null;
  }

  private resolvePageSize(raw: unknown): 'LETTER' | 'LEGAL' | 'TABLOID' | undefined {
    if (raw === 'LETTER' || raw === 'LEGAL' || raw === 'TABLOID') {
      return raw;
    }

    return undefined;
  }

  private resolveLayoutMode(raw: unknown): 'standard' | 'multi_column_grid' | undefined {
    if (raw === 'standard' || raw === 'multi_column_grid') {
      return raw;
    }

    return undefined;
  }

  private resolvePageOrientation(raw: unknown): 'portrait' | 'landscape' | undefined {
    if (raw === 'portrait' || raw === 'landscape') {
      return raw;
    }

    return undefined;
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
