/**
 * @fileoverview Dynamic Export Tool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Fully unconstrained Agent X tool for generating PDF, CSV, XLSX, or PPTX documents
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
 *   ExportService generates Buffer (PDF, CSV, XLSX, or PPTX)
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

const EXPORT_DOWNLOAD_URL_TTL_MS_NO_EXPIRE = 100 * 365 * 24 * 60 * 60 * 1000;

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
    'Generates a downloadable PDF, CSV, XLSX, or PPTX document from structured data when no more specialized artifact path is a better fit. ' +
    'Use this tool primarily for Gamma-backed PPTX decks and flexible multi-section reports, for CSV flat-table exports, and as the fallback path for PDF/XLSX when render_html_pdf or execute_python_code/native spreadsheet/document tools are not the right choice. ' +
    'You supply the columns, rows, and/or body text — the tool handles formatting, ' +
    'branding, and cloud hosting.\n\n' +
    'HOW TO FORMAT LIKE A PRO:\n' +
    '- ROUTING FIRST: Do NOT use this as the default for every export. Use `render_html_pdf` first for one-page/fixed-layout PDFs such as callsheets, wristbands, practice scripts, depth charts, staff sheets, or any sample-matched printable layout. Use `execute_python_code` first for editable spreadsheets and workbook-style artifacts. Use this tool as the PDF/XLSX fallback when those dedicated paths are unavailable or not appropriate.\n' +
    '- NEVER use emojis in the data or titles. They break the PDF and Excel generators. Use text only.\n' +
    '- If this export represents a saved Files document, pass `relatedDocumentId` with the UniversalFiles document id so the PDF/XLSX/PPTX/CSV is attached back to that document in Files. When creating both a saved document and an export, create or update the Files document first whenever possible, then export with `relatedDocumentId`.\n' +
    '- For Practice Scripts/Schedules: Divide the schedule into multiple `sections` (e.g. "Period 1: Flex", "Period 2: 7on7") instead of one massive table. Prefer render_html_pdf for printable one-pagers and execute_python_code for editable sheets. Use this tool only if those dedicated routes are not the chosen artifact path.\n' +
    '- For Callsheets / Rosters / Multi-Panel Boards: these are usually NOT this tool first. Prefer `render_html_pdf` for printable/fixed-layout delivery and execute_python_code for editable matrices. Use this tool only as a fallback export path when those dedicated routes are unavailable or explicitly not desired.\n' +
    '- HARD FORMAT RULE: If the user explicitly asks for PowerPoint, PPT, PPTX, slides, slide deck, presentation deck, flash cards, flashcards, card deck, or a file to open in PowerPoint, call this tool with `format: "pptx"` unless you are using a connected native Microsoft PowerPoint tool. Do not substitute PDF or XLSX for an explicit PowerPoint/PPTX/card-deck request.\n' +
    '- For Presentation Decks / Scout Cards / Flash Cards: Use PPTX when the output is meant to be presented slide-by-slide, used in a staff meeting, shared as flash cards, player cards, scout cards, recruiting pitch deck, opponent briefing deck, parent meeting deck, or visual packet. This is the Gamma-style export lane. Build one logical card/section per slide with `sections[]`; use `imageUrls` for charts, diagrams, logos, or player visuals.\n' +
    '- For multi-page narrative reports that benefit from Gamma styling rather than fixed-layout print composition, use PDF or PPTX through this tool with structured sections and presentation-aware instructions.\n\n' +
    'Works for: recruiting lists, scout reports, workout plans, compliance checklists, ' +
    'comparison tables, analytics summaries, team rosters, film breakdowns, budgets, ' +
    'schedules, or literally anything the user asks for.';

  readonly parameters = z.object({
    format: z.enum(['pdf', 'csv', 'xlsx', 'pptx']),
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
    brandSecondaryColor: z
      .string()
      .trim()
      .optional()
      .describe(
        'Optional team/organization secondary color (hex like #D9A441) for richer branded backgrounds and accents.'
      ),
    brandBackgroundMode: z
      .enum(['auto', 'neutral', 'balanced', 'alternating', 'bold'])
      .optional()
      .describe(
        'Optional background styling mode for Gamma-backed decks. Auto prefers balanced branded backgrounds when both org colors are available.'
      ),
    organizationName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional organization/team display name for PDF header branding.'),
    themeId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional Gamma theme ID for branded PPTX or visual PDF exports.'),
    gammaPdfFormat: z
      .enum(['auto', 'document', 'presentation'])
      .optional()
      .describe(
        'Optional Gamma PDF rendering mode. Defaults to auto, which prefers document pages unless slide/deck output is explicitly requested.'
      ),
    templateGammaId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional Gamma template file ID for preserving an existing PPTX or PDF layout.'),
    additionalInstructions: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional visual/style instructions for Gamma-generated PPTX or PDF exports.'),
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
      .describe('Deprecated and ignored. PDF watermarks are disabled.'),
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
      return {
        success: false,
        error: 'Parameter "format" must be "pdf", "csv", "xlsx", or "pptx".',
      };
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
    const brandSecondaryColor = this.str(input, 'brandSecondaryColor') ?? undefined;
    const brandBackgroundMode = this.resolveBrandBackgroundMode(input['brandBackgroundMode']);
    const organizationName = this.str(input, 'organizationName') ?? undefined;
    const themeId = this.str(input, 'themeId') ?? undefined;
    const gammaPdfFormat = this.resolveGammaPdfFormat(input['gammaPdfFormat']);
    const templateGammaId = this.str(input, 'templateGammaId') ?? undefined;
    const additionalInstructions = this.str(input, 'additionalInstructions') ?? undefined;
    const watermarkText = undefined;
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

    if (format === 'pdf' || format === 'pptx') {
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
          error: `${format.toUpperCase()} exports require at least one of: columns+rows (table), bodyParagraphs, bulletPoints, or description.`,
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
      } else if (format === 'pptx') {
        const rowCount = this.resolveRowCount(rows, sections);
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount,
          format: 'pptx',
          phase: 'build_presentation_deck',
        });
        buffer = await this.exportService.generatePptx({
          title,
          description,
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
          brandSecondaryColor,
          brandBackgroundMode,
          organizationName,
          themeId,
          templateGammaId,
          additionalInstructions,
          logoUrl,
        });
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        extension = 'pptx';
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
          brandSecondaryColor,
          brandBackgroundMode,
          organizationName,
          gammaPdfFormat,
          themeId,
          templateGammaId,
          additionalInstructions,
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
      ttlMs: EXPORT_DOWNLOAD_URL_TTL_MS_NO_EXPIRE,
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

  private resolveFormat(raw: unknown): 'pdf' | 'csv' | 'xlsx' | 'pptx' | null {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'csv') return 'csv';
    if (normalized === 'xlsx') return 'xlsx';
    if (normalized === 'pptx') return 'pptx';
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

  private resolveGammaPdfFormat(raw: unknown): 'auto' | 'document' | 'presentation' | undefined {
    if (raw === 'auto' || raw === 'document' || raw === 'presentation') {
      return raw;
    }

    return undefined;
  }

  private resolveBrandBackgroundMode(
    raw: unknown
  ): 'auto' | 'neutral' | 'balanced' | 'alternating' | 'bold' | undefined {
    return raw === 'auto' ||
      raw === 'neutral' ||
      raw === 'balanced' ||
      raw === 'alternating' ||
      raw === 'bold'
      ? raw
      : undefined;
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
