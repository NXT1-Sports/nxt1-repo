/**
 * @fileoverview Export Service — PDF, CSV & XLSX Document Generation
 * @module @nxt1/backend/modules/agent/services
 *
 * Centralised service for generating PDF, CSV, and XLSX documents from structured data.
 * Used by both the Agent X DynamicExportTool and the REST analytics/export endpoint.
 *
 * Design decisions:
 * - Uses `pdfmake` for PDF generation (declarative JSON → PDF, no coordinate math).
 * - Uses `csv-stringify/sync` for CSV generation (fast, synchronous, Buffer-native).
 * - Uses `exceljs` for XLSX generation (native workbook output with lightweight styling).
 * - All output is returned as a `Buffer` — callers handle storage/upload.
 * - CSVs include a UTF-8 BOM so they open correctly in Excel/Sheets/Numbers.
 * - PDFs include NXT1 branding header, page numbers, and professional formatting.
 *
 * Architecture:
 *   Caller (Tool / Route)
 *        ↓
 *   ExportService.generatePdf(opts)   → Buffer (PDF)
 *   ExportService.generateCsv(opts)   → Buffer (CSV)
 *   ExportService.generateXlsx(opts)  → Buffer (XLSX)
 *        ↓
 *   Caller uploads Buffer → Firebase Storage → signed URL
 */

import pdfmakeModule from 'pdfmake';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import type { Content, TableCell } from 'pdfmake';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, realpathSync } from 'node:fs';

// pdfmake 0.3.x is CJS — handle ESM interop (singleton API)
const pdfmake =
  (pdfmakeModule as unknown as { default?: typeof pdfmakeModule }).default ?? pdfmakeModule;

// Extract TDocumentDefinitions from createPdf signature (not re-exported by @types/pdfmake root)
type TDocumentDefinitions = Parameters<typeof pdfmakeModule.createPdf>[0];

// Resolve font paths relative to the pdfmake package (works from any cwd)
const _require = createRequire(import.meta.url);
const pdfmakePkgDir = dirname(_require.resolve('pdfmake/package.json'));
const fontsDir = resolve(pdfmakePkgDir, 'build/fonts/Roboto');
const robotoFontPaths = {
  normal: resolve(fontsDir, 'Roboto-Regular.ttf'),
  bold: resolve(fontsDir, 'Roboto-Medium.ttf'),
  italics: resolve(fontsDir, 'Roboto-Italic.ttf'),
  bolditalics: resolve(fontsDir, 'Roboto-MediumItalic.ttf'),
} as const;

function normalizeLocalResourcePath(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('file://')) {
    try {
      return resolve(fileURLToPath(raw));
    } catch {
      return '';
    }
  }
  return resolve(raw);
}

function withCanonicalPathVariants(pathValue: string): string[] {
  const normalized = normalizeLocalResourcePath(pathValue);
  if (!normalized) return [];
  try {
    const canonical = realpathSync(normalized);
    return canonical === normalized ? [normalized] : [normalized, canonical];
  } catch {
    return [normalized];
  }
}

const allowedLocalFontPaths = new Set<string>(
  Object.values(robotoFontPaths).flatMap((fontPath) => withCanonicalPathVariants(fontPath))
);

// Populate pdfmake VFS with base64-encoded font data at module init.
// The singleton API (createPdf / getBuffer) is the browser-compatible API — it requires fonts to
// be registered via the VFS (virtual file system), NOT as Buffer objects passed to addFonts().
// Passing Buffers to addFonts() only works with the server PdfPrinter class; with the singleton
// it silently falls back for 'normal' but fails to load bold/italic variants at render time.
// Reading once here (readFileSync + base64) means zero FS access during PDF generation.
(pdfmake as unknown as { vfs: Record<string, string> }).vfs = {
  'Roboto-Regular.ttf': readFileSync(resolve(fontsDir, 'Roboto-Regular.ttf')).toString('base64'),
  'Roboto-Medium.ttf': readFileSync(resolve(fontsDir, 'Roboto-Medium.ttf')).toString('base64'),
  'Roboto-Italic.ttf': readFileSync(resolve(fontsDir, 'Roboto-Italic.ttf')).toString('base64'),
  'Roboto-MediumItalic.ttf': readFileSync(resolve(fontsDir, 'Roboto-MediumItalic.ttf')).toString(
    'base64'
  ),
};

// Map font family variants to VFS keys (plain filenames, not paths).
// addFonts merges into pdfmake.fonts; with VFS loaded, pdfmake resolves each key from vfs memory.
pdfmake.addFonts({
  Roboto: {
    normal: resolve(fontsDir, 'Roboto-Regular.ttf'),
    bold: resolve(fontsDir, 'Roboto-Medium.ttf'),
    italics: resolve(fontsDir, 'Roboto-Italic.ttf'),
    bolditalics: resolve(fontsDir, 'Roboto-MediumItalic.ttf'),
  },
});

// Deny external URL access — images are pre-fetched as data URLs by loadPdfImages() before generation.
// setUrlAccessPolicy and setLocalAccessPolicy exist in pdfmake 0.3.x but are missing from @types/pdfmake
(
  pdfmake as unknown as { setUrlAccessPolicy: (fn: (url: string) => boolean) => void }
).setUrlAccessPolicy(() => false);

// Allowlist only bundled Roboto font files needed by pdfmake runtime fallback.
// Deny all other local file access.
(
  pdfmake as unknown as { setLocalAccessPolicy: (fn: (path: string) => boolean) => void }
).setLocalAccessPolicy((path) => {
  const normalized = normalizeLocalResourcePath(path);
  if (!normalized) return false;
  if (allowedLocalFontPaths.has(normalized)) return true;

  try {
    return allowedLocalFontPaths.has(realpathSync(normalized));
  } catch {
    return false;
  }
});

// ─── Public Types ──────────────────────────────────────────────────────────

/** A single column definition for tabular exports. */
export interface ExportColumn {
  /** Machine key (used for CSV header row and data lookup). */
  readonly key: string;
  /** Human-readable label (used for PDF table headers and CSV header row). */
  readonly label: string;
  /** Optional column width for PDF ('auto' | '*' | number). Defaults to '*'. */
  readonly width?: string | number;
}

/** Row data — each row is an array of cell values matching column order. */
export type ExportRow = readonly (string | number | boolean | null | undefined)[];

/** Options for CSV generation. */
export interface CsvExportOptions {
  /** Optional document title rendered above sectioned CSV exports. */
  readonly title?: string;
  /** Optional document description rendered above sectioned CSV exports. */
  readonly description?: string;
  /** Column definitions (order determines output column order). */
  readonly columns: readonly ExportColumn[];
  /** Row data — each inner array matches column order. */
  readonly rows: readonly ExportRow[];
  /** Optional multi-section document content for advanced exports. */
  readonly sections?: readonly ExportSection[];
}

/** A single export section for multi-block documents. */
export interface ExportSection {
  /** Optional section heading. */
  readonly title?: string;
  /** Optional section description/subheading. */
  readonly description?: string;
  /** Optional column definitions for a section table. */
  readonly columns?: readonly ExportColumn[];
  /** Optional row data for a section table. */
  readonly rows?: readonly ExportRow[];
  /** Optional free-form section paragraphs. */
  readonly bodyParagraphs?: readonly string[];
  /** Optional section bullet points. */
  readonly bulletPoints?: readonly string[];
  /** Optional section image URLs. */
  readonly imageUrls?: readonly string[];
}

/** Options for XLSX generation. */
export interface XlsxExportOptions {
  /** Optional workbook title rendered above the header row. */
  readonly title?: string;
  /** Optional subtitle/description rendered below the title. */
  readonly description?: string;
  /** Optional worksheet name. Defaults to title or `Export`. */
  readonly sheetName?: string;
  /** Column definitions (order determines output column order). */
  readonly columns: readonly ExportColumn[];
  /** Row data — each inner array matches column order. */
  readonly rows: readonly ExportRow[];
  /** Optional multi-section document content for advanced exports. */
  readonly sections?: readonly ExportSection[];
}

/** Options for PDF generation. */
export interface PdfExportOptions {
  /** Document title (rendered as the main heading). */
  readonly title: string;
  /** Optional subtitle or description below the title. */
  readonly description?: string;
  /** When true, render a data table. Requires columns + rows. */
  readonly includeTable?: boolean;
  /** Column definitions for the table. */
  readonly columns?: readonly ExportColumn[];
  /** Row data for the table. */
  readonly rows?: readonly ExportRow[];
  /** Optional free-form body paragraphs rendered before the table. */
  readonly bodyParagraphs?: readonly string[];
  /** Optional list of bullet points. */
  readonly bulletPoints?: readonly string[];
  /**
   * Optional image URLs (diagram screenshots, play art, charts) to embed in the PDF.
   * Supports HTTPS URLs and data:image/* URLs.
   */
  readonly imageUrls?: readonly string[];
  /** Footer text (defaults to 'Generated by NXT1 — nxt1sports.com'). */
  readonly footerText?: string;
  /** Optional team/org display name for branded exports (header). */
  readonly organizationName?: string;
  /** Optional team/org logo URL (HTTPS or data:image/*) rendered in header. */
  readonly logoUrl?: string;
  /** Optional primary accent color (hex, e.g. #0055AA). */
  readonly brandPrimaryColor?: string;
  /**
   * Visual theme for the PDF.
   * - `'dark'` (default) — near-black page with white text and Volt green accent.
   * - `'light'` — white page with dark text and Volt green accent.
   */
  readonly theme?: 'dark' | 'light';
  /** Optional multi-section document content for advanced exports. */
  readonly sections?: readonly ExportSection[];
}

// ─── NXT1 Brand Colours ────────────────────────────────────────────────────

/** NXT1 Volt neon green — the primary accent in every theme */
const VOLT = '#CCFF00';
/** Text printed ON a volt background — always black (design token: text-onPrimary) */
const VOLT_TEXT = '#000000';

/** Internal palette type — used by generatePdf and buildPdfContent. */
interface PdfPalette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly onPrimary: string;
}

/** Dark theme (default) — near-black page, white text */
const DARK_PALETTE = {
  background: '#0A0A0A', // bg-primary
  surface: '#161616', // surface-100 (odd rows)
  surfaceAlt: '#1A1A1A', // surface-200 (even rows)
  border: '#2A2A2A', // surface-400
  text: '#FFFFFF', // text-primary
  textMuted: '#B3B3B3', // ≈ rgba(255,255,255,0.7)
  primary: VOLT,
  onPrimary: VOLT_TEXT,
} as const;

/** Light theme — white page, dark text, same Volt green accent */
const LIGHT_PALETTE = {
  background: '#FFFFFF', // white page
  surface: '#F8F8F8', // near-white card surface (odd rows)
  surfaceAlt: '#F0F0F0', // light grey alternate (even rows)
  border: '#DADADA', // subtle grey border
  text: '#0A0A0A', // near-black body text (text-inverse)
  textMuted: '#555555', // mid-grey muted text
  primary: VOLT,
  onPrimary: VOLT_TEXT,
} as const;

// ─── Service ───────────────────────────────────────────────────────────────

export class ExportService {
  // ── CSV ────────────────────────────────────────────────────────────────

  /**
   * Generate a CSV buffer from structured column/row data.
   * Includes a UTF-8 BOM for Excel/Numbers/Sheets compatibility.
   */
  generateCsv(opts: CsvExportOptions): Buffer {
    const normalizedSections = this.normalizeSections(opts);
    if (normalizedSections.length > 1 || this.hasExplicitSections(opts)) {
      const rows = this.buildCsvSectionRows(opts, normalizedSections);
      const csvString = stringify(rows, {
        quoted: true,
        quoted_empty: true,
      });

      const bom = '\uFEFF';
      return Buffer.from(bom + csvString, 'utf-8');
    }

    const { columns, rows } = opts;

    // Build header row from column labels
    const header = columns.map((c) => c.label);

    // Stringify rows (csv-stringify expects array-of-arrays)
    const csvString = stringify([header, ...rows], {
      quoted: true,
      quoted_empty: true,
    });

    // Prepend UTF-8 BOM so Excel auto-detects encoding
    const bom = '\uFEFF';
    return Buffer.from(bom + csvString, 'utf-8');
  }

  // ── XLSX ───────────────────────────────────────────────────────────────

  /**
   * Generate an XLSX buffer from structured column/row data.
   * Produces a single worksheet with a branded title block and frozen header row.
   */
  async generateXlsx(opts: XlsxExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const now = new Date();
    const normalizedSections = this.normalizeSections(opts);
    const hasMultiSectionLayout = this.hasExplicitSections(opts) || normalizedSections.length > 1;

    workbook.creator = 'NXT1';
    workbook.lastModifiedBy = 'NXT1';
    workbook.created = now;
    workbook.modified = now;
    workbook.title = opts.title ?? 'NXT1 Export';
    workbook.subject = opts.description ?? 'Structured export generated by NXT1';

    const sheetName = this.sanitizeWorksheetName(opts.sheetName ?? opts.title ?? 'Export');
    const worksheet = workbook.addWorksheet(sheetName, {
      properties: { defaultRowHeight: 20 },
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    let currentRowNumber = 1;
    const lastColumnIndex = this.resolveMaxSectionColumnCount(normalizedSections);

    if (opts.title?.trim()) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, lastColumnIndex);
      const titleCell = worksheet.getCell(currentRowNumber, 1);
      titleCell.value = opts.title.trim();
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCFF00' },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = 24;
      currentRowNumber += 1;
    }

    if (opts.description?.trim()) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, lastColumnIndex);
      const descriptionCell = worksheet.getCell(currentRowNumber, 1);
      descriptionCell.value = opts.description.trim();
      descriptionCell.font = { name: 'Arial', size: 11, color: { argb: 'FF5A5A5A' } };
      descriptionCell.alignment = { wrapText: true, vertical: 'middle' };
      worksheet.getRow(currentRowNumber).height = 20;
      currentRowNumber += 1;
    }

    let firstTableHeaderRowNumber: number | null = null;
    normalizedSections.forEach((section, sectionIndex) => {
      const sectionHeaderRowNumber =
        firstTableHeaderRowNumber == null && section.columns?.length && section.rows?.length
          ? this.findWorksheetSectionHeaderRow(section, currentRowNumber)
          : null;

      currentRowNumber = this.renderWorksheetSection({
        worksheet,
        section,
        currentRowNumber,
        mergeColumnCount: lastColumnIndex,
      });

      if (firstTableHeaderRowNumber == null && sectionHeaderRowNumber != null) {
        firstTableHeaderRowNumber = sectionHeaderRowNumber;
      }

      if (sectionIndex < normalizedSections.length - 1) {
        worksheet.addRow([]);
        currentRowNumber += 1;
      }
    });

    worksheet.columns = this.buildWorksheetColumns(normalizedSections);

    if (!hasMultiSectionLayout && firstTableHeaderRowNumber != null && opts.columns.length > 0) {
      worksheet.autoFilter = {
        from: { row: firstTableHeaderRowNumber, column: 1 },
        to: { row: firstTableHeaderRowNumber, column: opts.columns.length },
      };
      worksheet.views = [{ state: 'frozen', ySplit: firstTableHeaderRowNumber }];
    }

    const rawBuffer = await workbook.xlsx.writeBuffer();
    if (Buffer.isBuffer(rawBuffer)) {
      return rawBuffer;
    }

    return Buffer.from(rawBuffer);
  }

  // ── PDF ────────────────────────────────────────────────────────────────

  /**
   * Generate a PDF buffer from structured options.
   * Returns a Promise because pdfmake streams the document.
   */
  async generatePdf(opts: PdfExportOptions): Promise<Buffer> {
    const basePalette: PdfPalette = opts.theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
    const brandPrimary = this.normalizeHexColor(opts.brandPrimaryColor);
    const palette: PdfPalette = brandPrimary
      ? {
          ...basePalette,
          primary: brandPrimary,
          onPrimary: this.getContrastTextColor(brandPrimary),
        }
      : basePalette;
    const content = await this.buildPdfContent(opts, palette);
    const headerLogo = opts.logoUrl
      ? (await this.loadPdfImages([opts.logoUrl])).at(0)?.dataUrl
      : undefined;

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [40, 70, 40, 60],
      background: {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 612, h: 792, color: palette.background }],
      },

      // ── Header (function renders on every page) ──
      header: () => ({
        columns: [
          ...(headerLogo
            ? [
                {
                  image: headerLogo,
                  fit: [28, 28] as [number, number],
                  margin: [42, 12, 10, 0] as [number, number, number, number],
                },
              ]
            : []),
          {
            text: this.normalizePdfText(opts.organizationName?.trim() || 'NXT1'),
            fontSize: 14,
            bold: true,
            color: palette.primary,
            margin: [headerLogo ? 0 : 42, 18, 0, 0] as [number, number, number, number],
          },
          {
            text: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            fontSize: 9,
            color: palette.textMuted,
            alignment: 'right',
            margin: [0, 20, 42, 0] as [number, number, number, number],
          },
        ],
        margin: [0, 0, 0, 12] as [number, number, number, number],
      }),

      // ── Footer with page numbers ──
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: this.normalizePdfText(opts.footerText ?? 'Generated by NXT1 - nxt1sports.com'),
            fontSize: 9,
            color: palette.textMuted,
            margin: [42, 22, 0, 0],
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            fontSize: 9,
            color: palette.textMuted,
            alignment: 'right',
            margin: [0, 22, 42, 0],
          },
        ],
      }),

      content,

      defaultStyle: {
        font: 'Roboto',
        fontSize: 11,
        color: palette.text,
        lineHeight: 1.5,
      },

      styles: {
        title: {
          fontSize: 22,
          bold: true,
          color: palette.primary,
          margin: [0, 0, 0, 4],
          lineHeight: 1.1,
        },
        description: {
          fontSize: 10,
          color: palette.textMuted,
          margin: [0, 0, 0, 10],
          lineHeight: 1.4,
        },
        sectionBody: { fontSize: 10, color: palette.text, lineHeight: 1.4, margin: [0, 0, 0, 6] },
        sectionTitle: {
          fontSize: 12,
          bold: true,
          color: palette.primary,
          margin: [12, 0, 6, 0],
          lineHeight: 1.1,
        },
        tableHeader: {
          fontSize: 9,
          bold: true,
          color: palette.onPrimary,
          fillColor: palette.primary,
          margin: [4, 5, 4, 5],
          alignment: 'left',
        },
        tableCell: { fontSize: 9, color: palette.text, margin: [4, 5, 4, 5], lineHeight: 1.2 },
        bullet: { fontSize: 10, color: palette.text, lineHeight: 1.3, margin: [0, 0, 0, 1] },
      },
    };

    return this.renderPdfToBuffer(docDefinition);
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private async buildPdfContent(opts: PdfExportOptions, palette: PdfPalette): Promise<Content[]> {
    const content: Content[] = [];
    const normalizedSections = this.normalizeSections(opts);
    const renderedImageUrls = new Set<string>();
    const sectionBlocks = normalizedSections.map((section) => this.buildPdfSectionBlocks(section));
    const normalizedAllImageUrls = this.normalizeImageUrls(
      sectionBlocks.flatMap((section) => [...section.inlineImageUrls, ...section.explicitImageUrls])
    );
    const loadedImages = await this.loadPdfImages(normalizedAllImageUrls);
    const imageMap = new Map<string, string>(
      loadedImages.map((img) => [img.sourceUrl, img.dataUrl])
    );

    // Title
    content.push({ text: this.normalizePdfText(opts.title), style: 'title' });

    // Description
    if (opts.description) {
      content.push({ text: this.normalizePdfText(opts.description), style: 'description' });
    } else {
      content.push({ text: '', margin: [0, 0, 0, 12] });
    }

    // Horizontal rule with brand color
    content.push({
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: palette.primary },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });

    sectionBlocks.forEach((section, sectionIndex) => {
      this.appendPdfSectionContent({
        content,
        section,
        imageMap,
        renderedImageUrls,
        palette,
      });

      if (sectionIndex < sectionBlocks.length - 1) {
        content.push({ text: '', margin: [0, 0, 0, 4] });
      }
    });

    return content;
  }

  private hasExplicitSections(opts: { readonly sections?: readonly ExportSection[] }): boolean {
    return Array.isArray(opts.sections) && opts.sections.length > 0;
  }

  private normalizeSections(opts: {
    readonly columns?: readonly ExportColumn[];
    readonly rows?: readonly ExportRow[];
    readonly bodyParagraphs?: readonly string[];
    readonly bulletPoints?: readonly string[];
    readonly imageUrls?: readonly string[];
    readonly sections?: readonly ExportSection[];
  }): ExportSection[] {
    const normalizedSections = (opts.sections ?? [])
      .map((section) => this.normalizeSection(section))
      .filter((section) => this.sectionHasRenderableContent(section));

    if (normalizedSections.length > 0) {
      return normalizedSections;
    }

    const legacySection = this.normalizeSection({
      columns: opts.columns,
      rows: opts.rows,
      bodyParagraphs: opts.bodyParagraphs,
      bulletPoints: opts.bulletPoints,
      imageUrls: opts.imageUrls,
    });

    return this.sectionHasRenderableContent(legacySection) ? [legacySection] : [];
  }

  private normalizeSection(section: ExportSection): ExportSection {
    const columns = section.columns?.filter(
      (column): column is ExportColumn =>
        typeof column?.key === 'string' &&
        column.key.trim().length > 0 &&
        typeof column.label === 'string' &&
        column.label.trim().length > 0
    );
    const rows = section.rows?.map((row) => this.normalizeSectionRow(row, columns?.length ?? 0));
    const bodyParagraphs = section.bodyParagraphs
      ?.filter((paragraph): paragraph is string => typeof paragraph === 'string')
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);
    const bulletPoints = section.bulletPoints
      ?.filter((bullet): bullet is string => typeof bullet === 'string')
      .map((bullet) => bullet.trim())
      .filter((bullet) => bullet.length > 0);
    const imageUrls = this.normalizeImageUrls(section.imageUrls);
    const title = section.title?.trim();
    const description = section.description?.trim();

    return {
      title: title || undefined,
      description: description || undefined,
      columns: columns?.length ? columns : undefined,
      rows: rows?.length ? rows : undefined,
      bodyParagraphs: bodyParagraphs?.length ? bodyParagraphs : undefined,
      bulletPoints: bulletPoints?.length ? bulletPoints : undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
    };
  }

  private normalizeSectionRow(row: ExportRow, columnCount: number): ExportRow {
    if (columnCount <= 0) return [...row];
    const normalized = row.slice(0, columnCount);
    while (normalized.length < columnCount) {
      normalized.push('');
    }
    return normalized;
  }

  private sectionHasRenderableContent(section: ExportSection): boolean {
    return Boolean(
      section.title ||
      section.description ||
      section.bodyParagraphs?.length ||
      section.bulletPoints?.length ||
      section.imageUrls?.length ||
      (section.columns?.length && section.rows?.length)
    );
  }

  private resolveMaxSectionColumnCount(sections: readonly ExportSection[]): number {
    return Math.max(1, ...sections.map((section) => Math.max(section.columns?.length ?? 0, 1)));
  }

  private buildCsvSectionRows(
    opts: CsvExportOptions,
    sections: readonly ExportSection[]
  ): Array<Array<string | number | boolean | null | undefined>> {
    const rows: Array<Array<string | number | boolean | null | undefined>> = [];

    if (opts.title?.trim()) rows.push([opts.title.trim()]);
    if (opts.description?.trim()) rows.push([opts.description.trim()]);
    if (rows.length > 0 && sections.length > 0) rows.push([]);

    sections.forEach((section, sectionIndex) => {
      if (section.title) rows.push([section.title]);
      if (section.description) rows.push([section.description]);
      for (const paragraph of section.bodyParagraphs ?? []) rows.push([paragraph]);
      for (const bullet of section.bulletPoints ?? []) rows.push([`- ${bullet}`]);
      if (section.columns?.length && section.rows?.length) {
        rows.push(section.columns.map((column) => column.label));
        rows.push(...section.rows.map((row) => [...row]));
      }
      if (sectionIndex < sections.length - 1) rows.push([]);
    });

    return rows;
  }

  private renderWorksheetSection(params: {
    readonly worksheet: ExcelJS.Worksheet;
    readonly section: ExportSection;
    readonly currentRowNumber: number;
    readonly mergeColumnCount: number;
  }): number {
    const { worksheet, section, mergeColumnCount } = params;
    let currentRowNumber = params.currentRowNumber;

    if (section.title) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const titleCell = worksheet.getCell(currentRowNumber, 1);
      titleCell.value = section.title;
      titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = 20;
      currentRowNumber += 1;
    }

    if (section.description) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const descriptionCell = worksheet.getCell(currentRowNumber, 1);
      descriptionCell.value = section.description;
      descriptionCell.font = { name: 'Arial', size: 10, color: { argb: 'FF5A5A5A' } };
      descriptionCell.alignment = { wrapText: true, vertical: 'middle' };
      worksheet.getRow(currentRowNumber).height = 18;
      currentRowNumber += 1;
    }

    for (const paragraph of section.bodyParagraphs ?? []) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const paragraphCell = worksheet.getCell(currentRowNumber, 1);
      paragraphCell.value = paragraph;
      paragraphCell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      paragraphCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = 18;
      currentRowNumber += 1;
    }

    for (const bullet of section.bulletPoints ?? []) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const bulletCell = worksheet.getCell(currentRowNumber, 1);
      bulletCell.value = `• ${bullet}`;
      bulletCell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      bulletCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = 18;
      currentRowNumber += 1;
    }

    if (section.columns?.length && section.rows?.length) {
      const headerValues = section.columns.map((column) => column.label);
      const headerRow = worksheet.getRow(currentRowNumber);
      headerRow.values = headerValues;
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCFF00' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        };
      });
      currentRowNumber += 1;

      section.rows.forEach((row, index) => {
        const worksheetRow = worksheet.addRow(
          section.columns?.map((_, columnIndex) =>
            this.normalizeWorksheetCellValue(row[columnIndex])
          ) ?? []
        );

        worksheetRow.eachCell((cell) => {
          cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
            left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
            right: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          };
          if (index % 2 === 1) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF7F7F7' },
            };
          }
        });
        currentRowNumber += 1;
      });
    }

    return currentRowNumber;
  }

  private buildWorksheetColumns(
    sections: readonly ExportSection[]
  ): Array<Partial<ExcelJS.Column>> {
    const maxColumns = this.resolveMaxSectionColumnCount(sections);
    return Array.from({ length: maxColumns }, (_, columnIndex) => {
      const labels = sections
        .map((section) => section.columns?.[columnIndex]?.label)
        .filter((label): label is string => typeof label === 'string');
      const rows = sections.flatMap((section) =>
        section.columns?.[columnIndex] ? (section.rows ?? []).map((row) => row) : []
      );
      const label = labels[0] ?? `Column ${columnIndex + 1}`;
      return {
        key: `column_${columnIndex + 1}`,
        width: this.estimateWorksheetColumnWidth(label, rows, columnIndex),
      };
    });
  }

  private findWorksheetSectionHeaderRow(section: ExportSection, currentRowNumber: number): number {
    let headerRowNumber = currentRowNumber;
    if (section.title) headerRowNumber += 1;
    if (section.description) headerRowNumber += 1;
    headerRowNumber += section.bodyParagraphs?.length ?? 0;
    headerRowNumber += section.bulletPoints?.length ?? 0;
    return headerRowNumber;
  }

  private buildPdfSectionBlocks(section: ExportSection): {
    readonly title?: string;
    readonly description?: string;
    readonly paragraphBlocks: ReadonlyArray<{ text: string; imageUrls: readonly string[] }>;
    readonly bulletBlocks: ReadonlyArray<{ text: string; imageUrls: readonly string[] }>;
    readonly inlineImageUrls: readonly string[];
    readonly explicitImageUrls: readonly string[];
    readonly columns?: readonly ExportColumn[];
    readonly rows?: readonly ExportRow[];
  } {
    const paragraphBlocks = (section.bodyParagraphs ?? []).map((paragraph) => {
      const imageUrls = this.extractImageUrlsFromText(paragraph);
      const text = this.stripUrlsAndDiagramLabels(paragraph);
      return { text, imageUrls };
    });

    const bulletBlocks = (section.bulletPoints ?? []).map((bullet) => {
      const imageUrls = this.extractImageUrlsFromText(bullet);
      const text = this.stripUrlsAndDiagramLabels(bullet);
      return { text, imageUrls };
    });

    return {
      title: section.title,
      description: section.description,
      paragraphBlocks,
      bulletBlocks,
      inlineImageUrls: [
        ...paragraphBlocks.flatMap((block) => block.imageUrls),
        ...bulletBlocks.flatMap((block) => block.imageUrls),
      ],
      explicitImageUrls: this.normalizeImageUrls(section.imageUrls),
      columns: section.columns,
      rows: section.rows,
    };
  }

  private appendPdfSectionContent(params: {
    readonly content: Content[];
    readonly section: ReturnType<ExportService['buildPdfSectionBlocks']>;
    readonly imageMap: ReadonlyMap<string, string>;
    readonly renderedImageUrls: Set<string>;
    readonly palette: PdfPalette;
  }): void {
    const { content, section, imageMap, renderedImageUrls, palette } = params;

    if (section.title) {
      content.push({ text: this.normalizePdfText(section.title), style: 'sectionTitle' });
    }
    if (section.description) {
      content.push({ text: this.normalizePdfText(section.description), style: 'description' });
    }

    if (section.paragraphBlocks.length > 0) {
      for (let blockIdx = 0; blockIdx < section.paragraphBlocks.length; blockIdx++) {
        const block = section.paragraphBlocks[blockIdx];
        if (block.text.length > 0) {
          const paragraphs = this.splitIntoParagraphs(block.text);
          for (const paragraph of paragraphs) {
            const heading = this.parseSectionHeading(paragraph);
            if (heading) {
              content.push({ text: heading, style: 'sectionTitle' });
              continue;
            }

            const orderedListItems = this.extractOrderedListItems(paragraph);
            if (orderedListItems) {
              content.push({
                ol: orderedListItems.map((item) => ({
                  text: this.toPdfRichText(item),
                  style: 'bullet',
                })),
                margin: [0, 0, 0, 8] as [number, number, number, number],
              });
              continue;
            }

            content.push({ text: this.toPdfRichText(paragraph), style: 'sectionBody' });
          }
        }
        for (const imageUrl of block.imageUrls) {
          const dataUrl = imageMap.get(imageUrl);
          if (!dataUrl) continue;
          renderedImageUrls.add(imageUrl);
          content.push({
            image: dataUrl,
            fit: [450, 280],
            alignment: 'center',
            margin: [0, 0, 0, 8] as [number, number, number, number],
          });
        }
        if (blockIdx < section.paragraphBlocks.length - 1) {
          content.push({ text: '', margin: [0, 0, 0, 2] });
        }
      }
    }

    if (section.bulletBlocks.length > 0) {
      let groupedBullets: string[] = [];
      const flushGroupedBullets = (): void => {
        if (groupedBullets.length === 0) return;
        content.push({
          ul: groupedBullets.map((bp) => ({
            text: this.toPdfRichText(bp),
            style: 'bullet',
          })),
          margin: [0, 8, 0, 8] as [number, number, number, number],
        });
        groupedBullets = [];
      };

      for (const block of section.bulletBlocks) {
        if (block.text.length > 0) {
          const heading = this.parseSectionHeading(block.text);
          if (heading) {
            flushGroupedBullets();
            content.push({ text: heading, style: 'sectionTitle' });
          } else {
            groupedBullets.push(block.text);
          }
        }

        for (const imageUrl of block.imageUrls) {
          const dataUrl = imageMap.get(imageUrl);
          if (!dataUrl) continue;
          flushGroupedBullets();
          renderedImageUrls.add(imageUrl);
          content.push({
            image: dataUrl,
            fit: [450, 280],
            alignment: 'center',
            margin: [0, 0, 0, 8] as [number, number, number, number],
          });
        }
      }
      flushGroupedBullets();
    }

    if (section.columns?.length && section.rows?.length) {
      const widths = section.columns.map((c) => c.width ?? '*');
      const headerRow: TableCell[] = section.columns.map((c) => ({
        text: this.normalizePdfText(c.label),
        style: 'tableHeader',
      }));
      const bodyRows: TableCell[][] = section.rows.map(
        (row) =>
          section.columns?.map((_, columnIndex) => ({
            text: this.normalizePdfText(row[columnIndex] == null ? '' : String(row[columnIndex])),
            style: 'tableCell',
          })) ?? []
      );

      type PdfTableNode = { table?: { body?: unknown[] } };
      const getBodyLength = (node: unknown): number => {
        const typedNode = node as PdfTableNode;
        return typedNode.table?.body?.length ?? 0;
      };

      content.push({ text: '', margin: [0, 0, 0, 4] });
      content.push({
        table: {
          headerRows: 1,
          widths,
          body: [headerRow, ...bodyRows],
        },
        layout: {
          hLineWidth: (i: number, node: unknown) =>
            i === 0 || i === getBodyLength(node) ? 1 : 0.5,
          vLineWidth: () => 0.5,
          hLineColor: (i: number, node: unknown) =>
            i === 0 || i === getBodyLength(node) ? palette.primary : palette.border,
          vLineColor: () => palette.border,
          fillColor: (rowIndex: number) =>
            rowIndex === 0
              ? palette.primary
              : rowIndex % 2 === 0
                ? palette.surfaceAlt
                : palette.surface,
          paddingLeft: () => 5,
          paddingRight: () => 5,
        },
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    const remainingImageUrls = section.explicitImageUrls.filter(
      (url) => !renderedImageUrls.has(url)
    );
    if (remainingImageUrls.length > 0) {
      const embeddedImages = remainingImageUrls
        .map((url) => ({ sourceUrl: url, dataUrl: imageMap.get(url) }))
        .filter(
          (img): img is { sourceUrl: string; dataUrl: string } => typeof img.dataUrl === 'string'
        );
      if (embeddedImages.length > 0) {
        content.push({ text: '', margin: [0, 0, 0, 2] });
        content.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 1,
              lineColor: palette.primary,
            },
          ],
          margin: [0, 0, 0, 6] as [number, number, number, number],
        });
        content.push({ text: 'Diagrams', style: 'sectionTitle' });
        for (let imgIdx = 0; imgIdx < embeddedImages.length; imgIdx++) {
          const image = embeddedImages[imgIdx];
          renderedImageUrls.add(image.sourceUrl);
          content.push({
            image: image.dataUrl,
            fit: [450, 280],
            alignment: 'center',
            margin: [0, 0, 0, imgIdx < embeddedImages.length - 1 ? 8 : 0] as [
              number,
              number,
              number,
              number,
            ],
          });
        }
      }
    }
  }

  private sanitizeWorksheetName(value: string): string {
    const sanitized = value.replace(/[\\/*?:[\]]/g, ' ').trim();
    return (sanitized || 'Export').slice(0, 31);
  }

  private normalizeWorksheetCellValue(
    value: string | number | boolean | null | undefined
  ): string | number | boolean {
    if (value == null) return '';
    return value;
  }

  private estimateWorksheetColumnWidth(
    label: string,
    rows: readonly ExportRow[],
    columnIndex: number
  ): number {
    const sampleValues = rows.map((row) => row[columnIndex]);
    const maxLength = Math.max(
      label.length,
      ...sampleValues.map((value) => (value == null ? 0 : String(value).length))
    );

    return Math.min(Math.max(maxLength + 2, 12), 40);
  }

  private normalizeImageUrls(imageUrls?: readonly string[]): string[] {
    if (!imageUrls?.length) return [];
    const deduped = new Set<string>();
    for (const raw of imageUrls) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (!value) continue;
      if (value.startsWith('data:image/')) {
        deduped.add(value);
        continue;
      }
      if (this.isLikelyImageUrl(value)) {
        deduped.add(value);
      }
    }
    return [...deduped];
  }

  private extractImageUrlsFromText(text: string): string[] {
    const urls = this.extractHttpUrls(text).filter((url) => this.isLikelyImageUrl(url));
    return this.normalizeImageUrls(urls);
  }

  private extractHttpUrls(text: string): string[] {
    const match = text.match(/https?:\/\/\S+/gi);
    if (!match) return [];
    return match.map((url) => url.replace(/[),.;!?]+$/, ''));
  }

  private stripUrlsAndDiagramLabels(text: string): string {
    const normalizedEscapes = this.decodeEscapedText(text);
    const withoutUrls = normalizedEscapes.replace(/https?:\/\/\S+/gi, '');
    const withoutLabels = withoutUrls.replace(/\bDIAGRAMS?:\s*/gi, '');
    return this.normalizePdfText(withoutLabels);
  }

  private decodeEscapedText(value: string): string {
    return value
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, ' ');
  }

  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private parseSectionHeading(text: string): string | null {
    const markdownHeading = text.match(/^#{1,3}\s+(.+)$/);
    if (markdownHeading?.[1]) {
      return this.normalizePdfText(markdownHeading[1]);
    }

    if (/^[A-Z][\w\s/-]{2,40}$/.test(text)) {
      return this.normalizePdfText(text);
    }

    return null;
  }

  private toPdfRichText(text: string): string | Array<{ text: string; bold?: boolean }> {
    const normalized = this.normalizePdfText(text);
    if (!normalized) return '';
    if (!/(\*\*|__)/.test(normalized)) return normalized;

    const fragments: Array<{ text: string; bold?: boolean }> = [];
    const pattern = /(\*\*|__)(.+?)\1/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(normalized);

    while (match) {
      const fullMatch = match[0];
      const content = match[2] ?? '';
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        fragments.push({ text: normalized.slice(lastIndex, matchIndex) });
      }

      if (content.trim().length > 0) {
        fragments.push({ text: content, bold: true });
      } else {
        fragments.push({ text: fullMatch });
      }

      lastIndex = matchIndex + fullMatch.length;
      match = pattern.exec(normalized);
    }

    if (lastIndex < normalized.length) {
      fragments.push({ text: normalized.slice(lastIndex) });
    }

    if (fragments.length === 0) return normalized;
    return fragments;
  }

  private extractOrderedListItems(text: string): string[] | null {
    const normalized = this.normalizePdfText(text).replace(/\n+/g, ' ').trim();
    if (!normalized.startsWith('1. ')) return null;

    const pattern = /(\d+)\.\s([^]+?)(?=(?:\s\d+\.\s)|$)/g;
    const matches = [...normalized.matchAll(pattern)];
    if (matches.length < 2) return null;

    const items: string[] = [];
    for (let idx = 0; idx < matches.length; idx++) {
      const match = matches[idx];
      const expectedOrdinal = idx + 1;
      const ordinal = Number(match[1]);
      if (!Number.isFinite(ordinal) || ordinal !== expectedOrdinal) {
        return null;
      }

      const itemText = this.normalizePdfText(match[2] ?? '').trim();
      if (!itemText) continue;
      items.push(itemText);
    }

    return items.length >= 2 ? items : null;
  }

  private normalizePdfText(value: string): string {
    const normalized = value
      .normalize('NFKC')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[•◦▪▫●○◉◌]/g, '-')
      .replace(/[\u2500-\u257F\u2580-\u259F]+/g, '-')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    const lines = normalized.split('\n').map((line) => line.replace(/[ \t]{2,}/g, ' ').trim());
    while (lines.length > 0 && lines[0]?.length === 0) lines.shift();
    while (lines.length > 0 && lines[lines.length - 1]?.length === 0) lines.pop();

    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  private isLikelyImageUrl(value: string): boolean {
    if (value.startsWith('data:image/')) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || /\/media\//i.test(value);
  }

  private normalizeHexColor(value?: string): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
  }

  private getContrastTextColor(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#FFFFFF';
  }

  private async loadPdfImages(
    imageUrls: readonly string[]
  ): Promise<readonly { sourceUrl: string; dataUrl: string }[]> {
    const results: { sourceUrl: string; dataUrl: string }[] = [];
    for (const sourceUrl of imageUrls) {
      try {
        if (sourceUrl.startsWith('data:image/')) {
          results.push({ sourceUrl, dataUrl: sourceUrl });
          continue;
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') ?? 'image/png';
        if (!contentType.startsWith('image/')) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) continue;
        results.push({
          sourceUrl,
          dataUrl: `data:${contentType};base64,${bytes.toString('base64')}`,
        });
      } catch {
        // Skip invalid/inaccessible image URLs so document generation still succeeds.
      }
    }
    return results;
  }

  private async renderPdfToBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    const pdf = pdfmake.createPdf(docDefinition);
    return pdf.getBuffer();
  }
}
