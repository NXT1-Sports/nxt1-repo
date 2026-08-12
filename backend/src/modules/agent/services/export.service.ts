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
  /** Optional hex color (e.g. #FF0000) for section styling visually separating groups */
  readonly themeColor?: string;
  /** For multi-column layouts, the explicit column to place this section in (1, 2, or 3). */
  readonly gridColumn?: number;
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
  /** Optional workbook layout mode. Defaults to standard stacking. */
  readonly layoutMode?: 'standard' | 'multi_column_grid';
  /** Optional page orientation for printing. Defaults to 'landscape'. */
  readonly pageOrientation?: 'portrait' | 'landscape';
  /** Optional paper size. Defaults to 'LETTER'. */
  readonly pageSize?: 'LETTER' | 'LEGAL' | 'TABLOID';
  /** Column definitions (order determines output column order). */
  readonly columns: readonly ExportColumn[];
  /** Row data — each inner array matches column order. */
  readonly rows: readonly ExportRow[];
  /** Optional document-level image URLs rendered into the worksheet. */
  readonly imageUrls?: readonly string[];
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
  /** Optional PDF layout mode. Defaults to standard vertical sections. */
  readonly layoutMode?: 'standard' | 'multi_column_grid';
  /** Deprecated and ignored. Watermarks are disabled for PDF exports. */
  readonly watermarkText?: string;
  /** Optional paper size. Defaults to 'LETTER'. */
  readonly pageSize?: 'LETTER' | 'LEGAL' | 'TABLOID';
  /** Optional page orientation. Defaults to 'portrait'. */
  readonly pageOrientation?: 'portrait' | 'landscape';
  /** Optional multi-section document content for advanced exports. */
  readonly sections?: readonly ExportSection[];
}

// ─── NXT1 Brand Colours ────────────────────────────────────────────────────

const NEUTRAL_PRIMARY = '#111111';
const NEUTRAL_ON_PRIMARY = '#FFFFFF';

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

const PDF_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

interface CallsheetPanelSectionPlacement {
  readonly section: ExportSection;
  readonly sectionIndex: number;
}

interface CallsheetPanelSpec {
  readonly startColumn: number;
  readonly endColumn: number;
  readonly dataColumns: readonly number[];
}

type CallsheetRowRenderModel =
  | {
      readonly kind: 'full_width';
      readonly text: string;
    }
  | {
      readonly kind: 'label_value';
      readonly label: string;
      readonly value: string;
    }
  | {
      readonly kind: 'tabular';
      readonly values: readonly (string | number | boolean | null | undefined)[];
    };

interface PdfRichTextFragment {
  readonly text: string;
  readonly bold?: boolean;
  readonly link?: string;
  readonly color?: string;
  readonly decoration?: 'underline';
}

interface LoadedImageAsset {
  readonly sourceUrl: string;
  readonly buffer: Buffer;
  readonly extension: 'png' | 'jpeg' | 'gif';
}

/** Light theme — white page, dark text, neutral accents for readable default exports */
const LIGHT_PALETTE = {
  background: '#FFFFFF', // white page
  surface: '#F8F8F8', // near-white card surface (odd rows)
  surfaceAlt: '#F0F0F0', // light grey alternate (even rows)
  border: '#DADADA', // subtle grey border
  text: '#0A0A0A', // near-black body text (text-inverse)
  textMuted: '#555555', // mid-grey muted text
  primary: NEUTRAL_PRIMARY,
  onPrimary: NEUTRAL_ON_PRIMARY,
} as const;

const XLSX_PAPER_SIZES: Record<
  NonNullable<XlsxExportOptions['pageSize']>,
  ExcelJS.PageSetup['paperSize']
> = {
  LETTER: 1 as ExcelJS.PageSetup['paperSize'],
  LEGAL: 5 as ExcelJS.PageSetup['paperSize'],
  TABLOID: 3 as ExcelJS.PageSetup['paperSize'],
};

const CALLSHEET_AUTO_COLORS = [
  '#1F4ED8',
  '#7C3AED',
  '#E11D48',
  '#F97316',
  '#EAB308',
  '#059669',
  '#0891B2',
  '#4338CA',
] as const;

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
        orientation: opts.pageOrientation ?? 'landscape',
        paperSize: XLSX_PAPER_SIZES[opts.pageSize ?? 'LETTER'],
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      },
    });

    if (opts.layoutMode === 'multi_column_grid') {
      this.renderCallsheetClassicWorksheet({
        worksheet,
        title: opts.title,
        description: opts.description,
        sections: normalizedSections,
      });

      await this.appendWorksheetImages({
        workbook,
        worksheet,
        sections: normalizedSections,
        startRowNumber: (worksheet.lastRow?.number ?? 1) + 2,
        mergeColumnCount: Math.max(1, worksheet.columnCount),
      });

      const rawBuffer = await workbook.xlsx.writeBuffer();
      if (Buffer.isBuffer(rawBuffer)) {
        return rawBuffer;
      }

      return Buffer.from(rawBuffer);
    }

    let currentRowNumber = 1;
    const lastColumnIndex = this.resolveMaxSectionColumnCount(normalizedSections);
    worksheet.columns = this.buildWorksheetColumns(normalizedSections);

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
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        titleCell.value,
        worksheet,
        lastColumnIndex,
        24,
        36
      );
      currentRowNumber += 1;
    }

    if (opts.description?.trim()) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, lastColumnIndex);
      const descriptionCell = worksheet.getCell(currentRowNumber, 1);
      descriptionCell.value = opts.description.trim();
      descriptionCell.font = { name: 'Arial', size: 11, color: { argb: 'FF5A5A5A' } };
      descriptionCell.alignment = { wrapText: true, vertical: 'middle' };
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        descriptionCell.value,
        worksheet,
        lastColumnIndex,
        20,
        42
      );
      currentRowNumber += 1;
    }

    let firstTableHeaderRowNumber: number | null = null;
    for (let sectionIndex = 0; sectionIndex < normalizedSections.length; sectionIndex += 1) {
      const section = normalizedSections[sectionIndex]!;
      const sectionHeaderRowNumber: number | null =
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

      currentRowNumber = await this.appendWorksheetImages({
        workbook,
        worksheet,
        sections: [section],
        startRowNumber: currentRowNumber,
        mergeColumnCount: lastColumnIndex,
      });

      if (sectionIndex < normalizedSections.length - 1) {
        worksheet.addRow([]);
        currentRowNumber += 1;
      }
    }

    if (!hasMultiSectionLayout && firstTableHeaderRowNumber != null && opts.columns.length > 0) {
      worksheet.autoFilter = {
        from: { row: firstTableHeaderRowNumber, column: 1 },
        to: { row: firstTableHeaderRowNumber, column: opts.columns.length },
      };
      worksheet.views = [{ state: 'frozen', ySplit: firstTableHeaderRowNumber }];
      worksheet.pageSetup.printTitlesRow = `1:${firstTableHeaderRowNumber}`;
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
    // PDFs are hard-locked to a light print-friendly palette.
    const basePalette: PdfPalette = LIGHT_PALETTE;
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
      pageSize: opts.pageSize ?? 'LETTER',
      pageOrientation: opts.pageOrientation ?? 'portrait',
      pageMargins: [40, 70, 40, 60],
      background: (_currentPage: number, pageSize: { width: number; height: number }) => ({
        absolutePosition: { x: 0, y: 0 },
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: pageSize.width,
            h: pageSize.height,
            color: palette.background,
          },
        ],
      }),
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
          fontSize: 21,
          bold: true,
          color: palette.primary,
          margin: [0, 0, 0, PDF_SPACING.xs],
          lineHeight: 1.05,
        },
        description: {
          fontSize: 10,
          color: palette.textMuted,
          margin: [0, 0, 0, PDF_SPACING.md],
          lineHeight: 1.4,
        },
        sectionBody: {
          fontSize: 10,
          color: palette.text,
          lineHeight: 1.4,
          margin: [0, 0, 0, PDF_SPACING.sm],
        },
        sectionTitle: {
          fontSize: 12,
          bold: true,
          color: palette.primary,
          margin: [0, 0, 0, PDF_SPACING.sm],
          lineHeight: 1.15,
        },
        sectionEyebrow: {
          fontSize: 8,
          bold: true,
          color: palette.textMuted,
          characterSpacing: 0.6,
          margin: [0, 0, 0, PDF_SPACING.xs],
        },
        tableHeader: {
          fontSize: 9,
          bold: true,
          color: palette.onPrimary,
          fillColor: palette.primary,
          margin: [4, 5, 4, 5],
          alignment: 'left',
        },
        tableCell: { fontSize: 9, color: palette.text, margin: [4, 5, 4, 5], lineHeight: 1.25 },
        bullet: { fontSize: 10, color: palette.text, lineHeight: 1.3, margin: [0, 0, 0, 2] },
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
    }

    // Horizontal rule with brand color
    content.push({
      canvas: [
        { type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: palette.primary },
      ],
      margin: [0, 0, 0, PDF_SPACING.lg] as [number, number, number, number],
    });

    if (opts.layoutMode === 'multi_column_grid' && sectionBlocks.length > 1) {
      content.push({
        columns: this.buildPdfSectionGridColumns({
          sections: sectionBlocks,
          imageMap,
          renderedImageUrls,
          palette,
          columnCount: opts.pageOrientation === 'landscape' ? 3 : 2,
        }),
        columnGap: 10,
        margin: [0, 0, 0, PDF_SPACING.sm] as [number, number, number, number],
      });
    } else {
      sectionBlocks.forEach((section, sectionIndex) => {
        const sectionStack: Content[] = [];
        this.appendPdfSectionContent({
          content: sectionStack,
          section,
          imageMap,
          renderedImageUrls,
          palette,
        });

        content.push(
          this.buildPdfSectionContainer(sectionStack, palette, section.themeColor, sectionIndex > 0)
        );
      });
    }

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
    const documentImageUrls = this.normalizeImageUrls(opts.imageUrls);

    if (normalizedSections.length > 0) {
      if (documentImageUrls.length === 0) {
        return normalizedSections;
      }

      return [
        ...normalizedSections,
        this.normalizeSection({
          title: 'Charts & Visuals',
          imageUrls: documentImageUrls,
        }),
      ];
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
    const themeColor = this.normalizeHexColor(section.themeColor) ?? undefined;
    const gridColumn = Number.isInteger(section.gridColumn) ? section.gridColumn : undefined;

    return {
      title: title || undefined,
      description: description || undefined,
      themeColor,
      gridColumn,
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
      titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      titleCell.border = {
        top: { style: 'thin', color: { argb: 'FF2A2A2A' } },
        left: { style: 'thin', color: { argb: 'FF2A2A2A' } },
        bottom: { style: 'thin', color: { argb: 'FF2A2A2A' } },
        right: { style: 'thin', color: { argb: 'FF2A2A2A' } },
      };
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        titleCell.value,
        worksheet,
        mergeColumnCount,
        20,
        32
      );
      currentRowNumber += 1;
    }

    if (section.description) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const descriptionCell = worksheet.getCell(currentRowNumber, 1);
      descriptionCell.value = section.description;
      descriptionCell.font = { name: 'Arial', size: 10, color: { argb: 'FF5A5A5A' } };
      descriptionCell.alignment = { wrapText: true, vertical: 'middle' };
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        descriptionCell.value,
        worksheet,
        mergeColumnCount,
        18,
        36
      );
      currentRowNumber += 1;
    }

    for (const paragraph of section.bodyParagraphs ?? []) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const paragraphCell = worksheet.getCell(currentRowNumber, 1);
      paragraphCell.value = paragraph;
      paragraphCell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      paragraphCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        paragraphCell.value,
        worksheet,
        mergeColumnCount,
        18,
        54
      );
      currentRowNumber += 1;
    }

    for (const bullet of section.bulletPoints ?? []) {
      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
      const bulletCell = worksheet.getCell(currentRowNumber, 1);
      bulletCell.value = `• ${bullet}`;
      bulletCell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      bulletCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      worksheet.getRow(currentRowNumber).height = this.estimateMergedWorksheetRowHeight(
        bulletCell.value,
        worksheet,
        mergeColumnCount,
        18,
        48
      );
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
        worksheetRow.height = this.estimateWorksheetTableRowHeight(
          section.columns?.map((_, columnIndex) => row[columnIndex]) ?? [],
          section.columns?.map(
            (_, columnIndex) => worksheet.getColumn(columnIndex + 1).width ?? 12
          ) ?? []
        );
        currentRowNumber += 1;
      });
    }

    return currentRowNumber;
  }

  private async appendWorksheetImages(params: {
    readonly workbook: ExcelJS.Workbook;
    readonly worksheet: ExcelJS.Worksheet;
    readonly sections: readonly ExportSection[];
    readonly startRowNumber: number;
    readonly mergeColumnCount: number;
  }): Promise<number> {
    const { workbook, worksheet, sections, mergeColumnCount } = params;
    let currentRowNumber = params.startRowNumber;

    for (const section of sections) {
      const imageUrls = this.normalizeImageUrls(section.imageUrls);
      if (imageUrls.length === 0) continue;

      const loadedImages = await this.loadImageAssets(imageUrls);
      if (loadedImages.length === 0) continue;

      if (section.title) {
        worksheet.mergeCells(currentRowNumber, 1, currentRowNumber, mergeColumnCount);
        const chartLabelCell = worksheet.getCell(currentRowNumber, 1);
        chartLabelCell.value = `${section.title} Charts`;
        chartLabelCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
        chartLabelCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCFF00' },
        };
        chartLabelCell.alignment = { vertical: 'middle', horizontal: 'left' };
        worksheet.getRow(currentRowNumber).height = 22;
        currentRowNumber += 1;
      }

      for (const image of loadedImages) {
        const workbookImage = {
          buffer: Buffer.from(image.buffer),
          extension: image.extension,
        } as unknown as Parameters<ExcelJS.Workbook['addImage']>[0];
        const imageId = workbook.addImage(workbookImage);
        const startRow = currentRowNumber;
        const imageWidth = Math.min(760, Math.max(420, mergeColumnCount * 120));
        const imageHeight = 300;

        worksheet.addImage(imageId, {
          tl: { col: 0, row: startRow - 1 },
          ext: { width: imageWidth, height: imageHeight },
          editAs: 'oneCell',
        });

        worksheet.getRow(currentRowNumber).height = 225;
        currentRowNumber += 12;
      }
    }

    return currentRowNumber;
  }

  private renderCallsheetClassicWorksheet(params: {
    readonly worksheet: ExcelJS.Worksheet;
    readonly title?: string;
    readonly description?: string;
    readonly sections: readonly ExportSection[];
  }): void {
    const { worksheet, title, description, sections } = params;
    const panelPlacements = this.buildCallsheetPanelPlacements(sections);
    const panelSpecs = this.buildCallsheetPanelSpecs(panelPlacements);
    const totalColumns = panelSpecs.at(-1)?.endColumn ?? 1;
    const titleColor = this.resolveCallsheetAccentColor(sections[0], 0);
    const titleTextColor = this.getWorksheetContrastTextColor(titleColor);
    let nextHeaderRow = 1;

    worksheet.columns = this.buildCallsheetWorksheetColumns(panelPlacements, panelSpecs);

    if (title?.trim()) {
      worksheet.mergeCells(nextHeaderRow, 1, nextHeaderRow, totalColumns);
      const titleCell = worksheet.getCell(nextHeaderRow, 1);
      titleCell.value = title.trim();
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: titleTextColor } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: titleColor },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getRow(1).height = this.estimateMergedWorksheetRowHeight(
        titleCell.value,
        worksheet,
        totalColumns,
        24,
        36
      );
      nextHeaderRow += 1;
    }

    if (description?.trim()) {
      worksheet.mergeCells(nextHeaderRow, 1, nextHeaderRow, totalColumns);
      const descriptionCell = worksheet.getCell(nextHeaderRow, 1);
      descriptionCell.value = description.trim();
      descriptionCell.font = { name: 'Arial', size: 10, color: { argb: 'FF3A3A3A' } };
      descriptionCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      worksheet.getRow(nextHeaderRow).height = this.estimateMergedWorksheetRowHeight(
        descriptionCell.value,
        worksheet,
        totalColumns,
        18,
        36
      );
      nextHeaderRow += 1;
    }

    const firstPanelRow = nextHeaderRow + 1;
    const panelRowPointers = panelPlacements.map(() => firstPanelRow);
    panelPlacements.forEach((placements, panelIndex) => {
      const panelSpec = panelSpecs[panelIndex]!;
      placements.forEach(({ section, sectionIndex }) => {
        panelRowPointers[panelIndex] = this.renderCallsheetPanel({
          worksheet,
          section: {
            ...section,
            themeColor: this.resolveCallsheetAccentColor(section, sectionIndex),
          },
          rowNumber: panelRowPointers[panelIndex]!,
          panelSpec,
        });
      });
    });

    const frozenRows = Math.max(1, firstPanelRow - 1);
    worksheet.views = [{ state: 'frozen', ySplit: frozenRows }];
    worksheet.pageSetup.printTitlesRow = `1:${frozenRows}`;
    worksheet.pageSetup.fitToWidth = 1;
    worksheet.pageSetup.fitToHeight = 0;
  }

  private renderCallsheetPanel(params: {
    readonly worksheet: ExcelJS.Worksheet;
    readonly section: ExportSection;
    readonly rowNumber: number;
    readonly panelSpec: CallsheetPanelSpec;
  }): number {
    const { worksheet, section, panelSpec } = params;
    let rowNumber = params.rowNumber;
    const headerLabels = this.resolveCallsheetHeaderLabels(section, panelSpec.dataColumns.length);
    const usedColumns = panelSpec.dataColumns.slice(0, headerLabels.length);
    const rowModels = (section.rows ?? []).map((row) =>
      this.resolveCallsheetRowRenderModel(row, usedColumns.length)
    );
    const hasTabularRows = rowModels.some((row) => row.kind === 'tabular');

    const bgColor = this.toWorksheetArgb(section.themeColor ?? '#111111');
    const bgTextColor = this.getWorksheetContrastTextColor(bgColor);
    const headerColor = this.mixWorksheetColor(bgColor, 'FFFFFFFF', 0.2);
    const headerTextColor = this.getWorksheetContrastTextColor(headerColor);

    worksheet.mergeCells(rowNumber, panelSpec.startColumn, rowNumber, panelSpec.endColumn);
    const titleCell = worksheet.getCell(rowNumber, panelSpec.startColumn);
    titleCell.value = (section.title ?? 'Section').toUpperCase();
    titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: bgTextColor } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    this.applyWorksheetRangeBorder(
      worksheet,
      rowNumber,
      panelSpec.startColumn,
      rowNumber,
      panelSpec.endColumn,
      bgColor
    );
    worksheet.getRow(rowNumber).height = 20;
    rowNumber += 1;

    if (section.description) {
      worksheet.mergeCells(rowNumber, panelSpec.startColumn, rowNumber, panelSpec.endColumn);
      const descriptionCell = worksheet.getCell(rowNumber, panelSpec.startColumn);
      descriptionCell.value = section.description;
      descriptionCell.font = { name: 'Arial', size: 9, color: { argb: 'FF4A4A4A' }, italic: true };
      descriptionCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      worksheet.getRow(rowNumber).height = this.estimateMergedWorksheetRowHeight(
        descriptionCell.value,
        worksheet,
        panelSpec.endColumn - panelSpec.startColumn + 1,
        18,
        32,
        panelSpec.startColumn
      );
      rowNumber += 1;
    }

    if (hasTabularRows) {
      const headerRow = worksheet.getRow(rowNumber);
      usedColumns.forEach((columnIndex, labelIndex) => {
        const cell = headerRow.getCell(columnIndex);
        cell.value = headerLabels[labelIndex] ?? '';
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: headerTextColor } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: headerColor },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: bgColor } },
          left: { style: 'thin', color: { argb: bgColor } },
          bottom: { style: 'thin', color: { argb: bgColor } },
          right: { style: 'thin', color: { argb: bgColor } },
        };
      });
      worksheet.getRow(rowNumber).height = 18;
      rowNumber += 1;
    }

    rowModels.forEach((rowModel, index) => {
      rowNumber = this.renderCallsheetPanelRow({
        worksheet,
        rowModel,
        rowNumber,
        panelSpec,
        usedColumns,
        zebraIndex: index,
        bgColor,
      });
    });

    for (const bullet of section.bulletPoints ?? []) {
      worksheet.mergeCells(rowNumber, panelSpec.startColumn, rowNumber, panelSpec.endColumn);
      const bulletCell = worksheet.getCell(rowNumber, panelSpec.startColumn);
      bulletCell.value = `• ${bullet}`;
      bulletCell.font = { name: 'Arial', size: 9, color: { argb: 'FF303030' } };
      bulletCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      worksheet.getRow(rowNumber).height = this.estimateMergedWorksheetRowHeight(
        bulletCell.value,
        worksheet,
        panelSpec.endColumn - panelSpec.startColumn + 1,
        16,
        40,
        panelSpec.startColumn
      );
      rowNumber += 1;
    }

    return rowNumber + 1;
  }

  private buildCallsheetPanelPlacements(
    sections: readonly ExportSection[]
  ): readonly (readonly CallsheetPanelSectionPlacement[])[] {
    const panelPlacements: CallsheetPanelSectionPlacement[][] = [[], [], []];
    const panelRowPointers = [5, 5, 5];

    sections.forEach((section, sectionIndex) => {
      let targetPanelIndex: number;
      if (section.gridColumn !== undefined && section.gridColumn >= 1 && section.gridColumn <= 3) {
        targetPanelIndex = section.gridColumn - 1;
      } else {
        targetPanelIndex = panelRowPointers.reduce(
          (bestIndex, rowPointer, index, all) => (rowPointer < all[bestIndex] ? index : bestIndex),
          0
        );
      }

      panelPlacements[targetPanelIndex]!.push({ section, sectionIndex });
      panelRowPointers[targetPanelIndex] += this.estimateCallsheetSectionHeight(section);
    });

    return panelPlacements;
  }

  private buildCallsheetPanelSpecs(
    panelPlacements: readonly (readonly CallsheetPanelSectionPlacement[])[]
  ): readonly CallsheetPanelSpec[] {
    const specs: CallsheetPanelSpec[] = [];
    let currentColumn = 1;

    panelPlacements.forEach((placements, panelIndex) => {
      const logicalColumnCount = Math.max(
        1,
        ...placements.map(({ section }) => this.resolveCallsheetLogicalColumnCount(section))
      );
      const dataColumns = Array.from(
        { length: logicalColumnCount },
        (_, index) => currentColumn + index
      );
      const startColumn = dataColumns[0]!;
      const endColumn = dataColumns[dataColumns.length - 1]!;

      specs.push({ startColumn, endColumn, dataColumns });
      currentColumn = endColumn + 1;

      if (panelIndex < panelPlacements.length - 1) {
        currentColumn += 1;
      }
    });

    return specs;
  }

  private buildCallsheetWorksheetColumns(
    panelPlacements: readonly (readonly CallsheetPanelSectionPlacement[])[],
    panelSpecs: readonly CallsheetPanelSpec[]
  ): Array<Partial<ExcelJS.Column>> {
    const totalColumns = panelSpecs.at(-1)?.endColumn ?? 1;
    const widths = new Map<number, number>();

    panelSpecs.forEach((panelSpec, panelIndex) => {
      const panelWidths = this.buildCallsheetPanelWidths(
        panelPlacements[panelIndex]?.map((placement) => placement.section) ?? [],
        panelSpec.dataColumns.length
      );
      panelSpec.dataColumns.forEach((columnIndex, widthIndex) => {
        widths.set(columnIndex, panelWidths[widthIndex] ?? 12);
      });

      const spacerColumn = panelSpec.endColumn + 1;
      if (spacerColumn <= totalColumns && !widths.has(spacerColumn)) {
        widths.set(spacerColumn, 2.5);
      }
    });

    return Array.from({ length: totalColumns }, (_, index) => ({
      width: widths.get(index + 1) ?? 12,
    }));
  }

  private buildCallsheetPanelWidths(
    sections: readonly ExportSection[],
    columnCount: number
  ): readonly number[] {
    if (columnCount <= 0) return [];

    const targetTotal =
      columnCount <= 1
        ? 36
        : columnCount === 2
          ? 36
          : columnCount === 3
            ? 40
            : Math.min(48, 8 + columnCount * 8);

    const estimated = Array.from({ length: columnCount }, (_, index) => {
      const maxWidth = sections.reduce<number>((currentMax, section) => {
        const label = section.columns?.[index]?.label ?? `Column ${index + 1}`;
        const rowMax = (section.rows ?? []).reduce<number>((rowCurrentMax, row) => {
          const cellText = row[index] == null ? '' : String(row[index]);
          return Math.max(rowCurrentMax, this.estimateWorksheetTextWidth(cellText));
        }, 0);
        return Math.max(currentMax, this.estimateWorksheetTextWidth(label), rowMax);
      }, 0);

      const minWidth = index === 0 ? 11 : 10;
      const maxAllowedWidth = index === columnCount - 1 ? 20 : 16;
      return Math.min(maxAllowedWidth, Math.max(minWidth, Math.ceil(maxWidth + 2)));
    });

    const currentTotal = estimated.reduce((sum, width) => sum + width, 0);
    if (currentTotal <= targetTotal) {
      const extra = targetTotal - currentTotal;
      if (extra > 0) {
        estimated[columnCount - 1] = (estimated[columnCount - 1] ?? 10) + extra;
      }
      return estimated;
    }

    const scale = targetTotal / currentTotal;
    return estimated.map((width, index) => {
      const minWidth = index === 0 ? 10 : 9;
      return Math.max(minWidth, Number((width * scale).toFixed(1)));
    });
  }

  private resolveCallsheetHeaderLabels(
    section: ExportSection,
    maxColumns: number
  ): readonly string[] {
    const explicitLabels =
      section.columns
        ?.slice(0, maxColumns)
        .map((column) => column.label.trim())
        .filter((label) => label.length > 0) ?? [];

    if (explicitLabels.length > 0) {
      return explicitLabels;
    }

    return Array.from({ length: maxColumns }, (_, index) => `Column ${index + 1}`);
  }

  private resolveCallsheetLogicalColumnCount(section: ExportSection): number {
    return Math.max(1, section.columns?.length ?? section.rows?.[0]?.length ?? 1);
  }

  private estimateCallsheetSectionHeight(section: ExportSection): number {
    const descriptionRows = section.description ? 1 : 0;
    const rowModels = (section.rows ?? []).map((row) =>
      this.resolveCallsheetRowRenderModel(row, this.resolveCallsheetLogicalColumnCount(section))
    );
    const headerRows = rowModels.some((row) => row.kind === 'tabular') ? 1 : 0;
    const dataRows = rowModels.length;
    const bulletRows = section.bulletPoints?.length ?? 0;
    const paddingRows = 1;
    return 1 + descriptionRows + headerRows + dataRows + bulletRows + paddingRows;
  }

  private resolveCallsheetRowRenderModel(
    row: ExportRow,
    logicalColumnCount: number
  ): CallsheetRowRenderModel {
    const nonEmptyEntries = row
      .slice(0, logicalColumnCount)
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => !this.isWorksheetCellEmpty(value));

    if (nonEmptyEntries.length === 0) {
      return { kind: 'full_width', text: '' };
    }

    if (nonEmptyEntries.length === 1) {
      return {
        kind: 'full_width',
        text: String(nonEmptyEntries[0]!.value ?? ''),
      };
    }

    const [firstEntry, secondEntry] = nonEmptyEntries;
    if (
      nonEmptyEntries.length === 2 &&
      firstEntry?.index === 0 &&
      secondEntry?.index === 1 &&
      this.estimateWorksheetTextWidth(String(firstEntry.value ?? '')) <= 18 &&
      logicalColumnCount >= 2
    ) {
      return {
        kind: 'label_value',
        label: String(firstEntry.value ?? ''),
        value: String(secondEntry.value ?? ''),
      };
    }

    return { kind: 'tabular', values: row };
  }

  private renderCallsheetPanelRow(params: {
    readonly worksheet: ExcelJS.Worksheet;
    readonly rowModel: CallsheetRowRenderModel;
    readonly rowNumber: number;
    readonly panelSpec: CallsheetPanelSpec;
    readonly usedColumns: readonly number[];
    readonly zebraIndex: number;
    readonly bgColor: string;
  }): number {
    const { worksheet, rowModel, rowNumber, panelSpec, usedColumns, zebraIndex, bgColor } = params;
    const zebraFill = zebraIndex % 2 === 1 ? { argb: 'FFF7F7F7' } : undefined;

    if (rowModel.kind === 'full_width') {
      worksheet.mergeCells(rowNumber, panelSpec.startColumn, rowNumber, panelSpec.endColumn);
      const cell = worksheet.getCell(rowNumber, panelSpec.startColumn);
      cell.value = rowModel.text;
      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF161616' }, italic: true };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (zebraFill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: zebraFill };
      }
      worksheet.getRow(rowNumber).height = this.estimateMergedWorksheetRowHeight(
        cell.value,
        worksheet,
        panelSpec.endColumn - panelSpec.startColumn + 1,
        18,
        52,
        panelSpec.startColumn
      );
      return rowNumber + 1;
    }

    if (rowModel.kind === 'label_value') {
      const labelColumn = usedColumns[0] ?? panelSpec.startColumn;
      const valueStartColumn = usedColumns[1] ?? panelSpec.endColumn;
      const labelCell = worksheet.getCell(rowNumber, labelColumn);
      labelCell.value = rowModel.label;
      labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF161616' } };
      labelCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      labelCell.border = {
        top: { style: 'thin', color: { argb: bgColor } },
        left: { style: 'thin', color: { argb: bgColor } },
        bottom: { style: 'thin', color: { argb: bgColor } },
        right: { style: 'thin', color: { argb: bgColor } },
      };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.mixWorksheetColor(bgColor, 'FFFFFFFF', 0.82) },
      };

      worksheet.mergeCells(rowNumber, valueStartColumn, rowNumber, panelSpec.endColumn);
      const valueCell = worksheet.getCell(rowNumber, valueStartColumn);
      valueCell.value = rowModel.value;
      valueCell.font = { name: 'Arial', size: 9, color: { argb: 'FF161616' } };
      valueCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      valueCell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (zebraFill) {
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: zebraFill };
      }

      worksheet.getRow(rowNumber).height = Math.max(
        this.estimateMergedWorksheetRowHeight(labelCell.value, worksheet, 1, 18, 40, labelColumn),
        this.estimateMergedWorksheetRowHeight(
          valueCell.value,
          worksheet,
          panelSpec.endColumn - valueStartColumn + 1,
          18,
          52,
          valueStartColumn
        )
      );
      return rowNumber + 1;
    }

    const worksheetRow = worksheet.getRow(rowNumber);
    usedColumns.forEach((columnIndex, valueIndex) => {
      worksheetRow.getCell(columnIndex).value = this.normalizeWorksheetCellValue(
        rowModel.values[valueIndex]
      );
    });

    usedColumns.forEach((columnIndex, valueIndex) => {
      const cell = worksheetRow.getCell(columnIndex);
      cell.alignment = {
        vertical: 'top',
        horizontal: 'left',
        wrapText: true,
      };
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: valueIndex === 0,
        color: { argb: 'FF161616' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
      if (zebraFill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: zebraFill,
        };
      }
    });

    worksheet.getRow(rowNumber).height = this.estimateWorksheetTableRowHeight(
      usedColumns.map(
        (columnIndex) =>
          worksheetRow.getCell(columnIndex).value as string | number | boolean | null | undefined
      ),
      usedColumns.map((columnIndex) => worksheet.getColumn(columnIndex).width ?? 12)
    );
    return rowNumber + 1;
  }

  private isWorksheetCellEmpty(value: string | number | boolean | null | undefined): boolean {
    return value == null || String(value).trim().length === 0;
  }

  private resolveCallsheetAccentColor(
    section: ExportSection | undefined,
    sectionIndex: number
  ): string {
    return (
      section?.themeColor ?? CALLSHEET_AUTO_COLORS[sectionIndex % CALLSHEET_AUTO_COLORS.length]!
    );
  }

  private toWorksheetArgb(hex: string): string {
    const clean = hex.replace('#', '').toUpperCase();
    if (clean.length === 8) return clean;
    if (clean.length === 6) return `FF${clean}`;
    return 'FF111111';
  }

  private getWorksheetContrastTextColor(argb: string): string {
    const clean = argb.slice(-6);
    const contrast = this.getContrastTextColor(`#${clean}`);
    return this.toWorksheetArgb(contrast);
  }

  private mixWorksheetColor(primaryArgb: string, secondaryArgb: string, ratio: number): string {
    const mix = (primary: number, secondary: number): number =>
      Math.round(primary * (1 - ratio) + secondary * ratio);
    const primary = primaryArgb.slice(-6);
    const secondary = secondaryArgb.slice(-6);
    const r = mix(parseInt(primary.slice(0, 2), 16), parseInt(secondary.slice(0, 2), 16));
    const g = mix(parseInt(primary.slice(2, 4), 16), parseInt(secondary.slice(2, 4), 16));
    const b = mix(parseInt(primary.slice(4, 6), 16), parseInt(secondary.slice(4, 6), 16));
    return this.toWorksheetArgb(
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
        .toString(16)
        .padStart(2, '0')}`
    );
  }

  private applyWorksheetRangeBorder(
    worksheet: ExcelJS.Worksheet,
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    color: string
  ): void {
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
        worksheet.getCell(rowIndex, columnIndex).border = {
          top: { style: 'thin', color: { argb: color } },
          left: { style: 'thin', color: { argb: color } },
          bottom: { style: 'thin', color: { argb: color } },
          right: { style: 'thin', color: { argb: color } },
        };
      }
    }
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
    readonly themeColor?: string;
    readonly gridColumn?: number;
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
      themeColor: section.themeColor,
      gridColumn: section.gridColumn,
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

  private buildPdfSectionGridColumns(params: {
    readonly sections: readonly ReturnType<ExportService['buildPdfSectionBlocks']>[];
    readonly imageMap: ReadonlyMap<string, string>;
    readonly renderedImageUrls: Set<string>;
    readonly palette: PdfPalette;
    readonly columnCount: number;
  }): Array<{ width: string; stack: Content[] }> {
    const { sections, imageMap, renderedImageUrls, palette } = params;
    const columnCount = Math.max(1, Math.min(params.columnCount, 3));
    const columns = Array.from({ length: columnCount }, () => ({
      height: 0,
      stack: [] as Content[],
    }));

    sections.forEach((section) => {
      const explicitColumn =
        typeof section.gridColumn === 'number' &&
        section.gridColumn >= 1 &&
        section.gridColumn <= columnCount
          ? section.gridColumn - 1
          : null;
      const targetColumnIndex =
        explicitColumn ??
        columns.reduce(
          (bestIndex, column, index, all) =>
            column.height < all[bestIndex]!.height ? index : bestIndex,
          0
        );
      const sectionStack: Content[] = [];

      this.appendPdfSectionContent({
        content: sectionStack,
        section,
        imageMap,
        renderedImageUrls,
        palette,
      });

      columns[targetColumnIndex]!.stack.push(
        this.buildPdfSectionContainer(sectionStack, palette, section.themeColor)
      );
      columns[targetColumnIndex]!.height += this.estimatePdfSectionWeight(section);
    });

    return columns.map((column) => ({
      width: '*',
      stack: column.stack.length > 0 ? column.stack : [{ text: '' } as Content],
    }));
  }

  private estimatePdfSectionWeight(
    section: ReturnType<ExportService['buildPdfSectionBlocks']>
  ): number {
    return (
      2 +
      section.paragraphBlocks.length +
      section.bulletBlocks.length +
      (section.rows?.length ?? 0) +
      section.inlineImageUrls.length * 4 +
      section.explicitImageUrls.length * 4
    );
  }

  private buildPdfSectionContainer(
    sectionStack: readonly Content[],
    palette: PdfPalette,
    themeColor?: string,
    addTopDivider = false
  ): Content {
    const sectionPrimary = this.normalizeHexColor(themeColor) ?? palette.primary;

    return {
      stack: [
        ...(addTopDivider
          ? [
              {
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 0,
                    x2: 515,
                    y2: 0,
                    lineWidth: 0.75,
                    lineColor: palette.border,
                  },
                ],
                margin: [0, 0, 0, PDF_SPACING.md] as [number, number, number, number],
              } as Content,
            ]
          : []),
        {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: 6,
              h: 20,
              color: sectionPrimary,
            },
          ],
          margin: [0, 0, 0, PDF_SPACING.sm] as [number, number, number, number],
        } as Content,
        {
          stack: [...sectionStack],
          margin: [12, 0, 0, 0] as [number, number, number, number],
        } as Content,
      ],
      margin: [0, 0, 0, PDF_SPACING.md] as [number, number, number, number],
      unbreakable: false,
    } as Content;
  }

  private appendPdfSectionContent(params: {
    readonly content: Content[];
    readonly section: ReturnType<ExportService['buildPdfSectionBlocks']>;
    readonly imageMap: ReadonlyMap<string, string>;
    readonly renderedImageUrls: Set<string>;
    readonly palette: PdfPalette;
  }): void {
    const { content, section, imageMap, renderedImageUrls, palette } = params;
    const sectionPrimary = this.normalizeHexColor(section.themeColor) ?? palette.primary;
    const sectionOnPrimary = this.getContrastTextColor(sectionPrimary);

    if (section.title) {
      content.push({ text: 'SECTION', style: 'sectionEyebrow' });
      content.push({
        text: this.normalizePdfText(section.title),
        style: 'sectionTitle',
        color: sectionPrimary,
      });
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
              content.push({ text: heading, style: 'sectionTitle', color: sectionPrimary });
              continue;
            }

            const orderedListItems = this.extractOrderedListItems(paragraph);
            if (orderedListItems) {
              content.push({
                ol: orderedListItems.map((item) => ({
                  text: this.toPdfRichText(item, palette.primary),
                  style: 'bullet',
                })),
                margin: [0, 0, 0, PDF_SPACING.sm] as [number, number, number, number],
              });
              continue;
            }

            content.push({
              text: this.toPdfRichText(paragraph, palette.primary),
              style: 'sectionBody',
            });
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
            margin: [0, 0, 0, PDF_SPACING.sm] as [number, number, number, number],
          });
        }
      }
    }

    if (section.bulletBlocks.length > 0) {
      let groupedBullets: string[] = [];
      const flushGroupedBullets = (): void => {
        if (groupedBullets.length === 0) return;
        content.push({
          ul: groupedBullets.map((bp) => ({
            text: this.toPdfRichText(bp, palette.primary),
            style: 'bullet',
          })),
          margin: [0, PDF_SPACING.xs, 0, PDF_SPACING.sm] as [number, number, number, number],
        });
        groupedBullets = [];
      };

      for (const block of section.bulletBlocks) {
        if (block.text.length > 0) {
          const heading = this.parseSectionHeading(block.text);
          if (heading) {
            flushGroupedBullets();
            content.push({ text: heading, style: 'sectionTitle', color: sectionPrimary });
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
            margin: [0, 0, 0, PDF_SPACING.sm] as [number, number, number, number],
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
        color: sectionOnPrimary,
        fillColor: sectionPrimary,
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

      content.push({
        table: {
          headerRows: 1,
          widths,
          body: [headerRow, ...bodyRows],
          dontBreakRows: true,
        },
        layout: {
          hLineWidth: (i: number, node: unknown) =>
            i === 0 || i === getBodyLength(node) ? 1 : 0.5,
          vLineWidth: () => 0.5,
          hLineColor: (i: number, node: unknown) =>
            i === 0 || i === getBodyLength(node) ? sectionPrimary : palette.border,
          vLineColor: () => palette.border,
          fillColor: (rowIndex: number) =>
            rowIndex === 0
              ? sectionPrimary
              : rowIndex % 2 === 0
                ? palette.surfaceAlt
                : palette.surface,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: (rowIndex: number) => (rowIndex === 0 ? 6 : 5),
          paddingBottom: (rowIndex: number) => (rowIndex === 0 ? 6 : 5),
        },
        margin: [0, PDF_SPACING.xs, 0, PDF_SPACING.md] as [number, number, number, number],
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
          margin: [0, PDF_SPACING.xs, 0, PDF_SPACING.sm] as [number, number, number, number],
        });
        content.push({ text: 'Diagrams', style: 'sectionTitle', color: sectionPrimary });
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
      this.estimateWorksheetTextWidth(label),
      ...sampleValues.map((value) =>
        this.estimateWorksheetTextWidth(value == null ? '' : String(value))
      )
    );

    return Math.min(Math.max(Math.ceil(maxLength + 3), 12), 40);
  }

  private estimateWorksheetTextWidth(text: string): number {
    return [...text].reduce((width, char) => {
      if (char === '\n') return width;
      if (char === ' ' || char === '\t') return width + 0.45;
      if ('il.:,;|!'.includes(char)) return width + 0.55;
      if ('MW@#%&'.includes(char)) return width + 1.35;
      if (/[A-Z]/.test(char)) return width + 1.05;
      return width + 0.95;
    }, 0);
  }

  private estimateTextLineCount(text: string, width: number): number {
    const effectiveWidth = Math.max(8, width - 1);
    return Math.max(
      1,
      ...String(text)
        .split(/\r?\n/)
        .map((line) =>
          Math.max(1, Math.ceil(this.estimateWorksheetTextWidth(line) / effectiveWidth))
        )
    );
  }

  private estimateWorksheetTableRowHeight(
    values: readonly (string | number | boolean | null | undefined)[],
    widths: readonly number[]
  ): number {
    const lineCount = values.reduce<number>((maxLines, value, index) => {
      const width = widths[index] ?? 12;
      const text = value == null ? '' : String(value);
      return Math.max(maxLines, this.estimateTextLineCount(text, width));
    }, 1);

    return Math.min(18 + (lineCount - 1) * 12, 72);
  }

  private estimateMergedWorksheetRowHeight(
    value: ExcelJS.CellValue,
    worksheet: ExcelJS.Worksheet,
    columnSpan: number,
    baseHeight: number,
    maxHeight: number,
    startColumn = 1
  ): number {
    const text = value == null ? '' : String(value);
    const mergedWidth = Array.from(
      { length: columnSpan },
      (_, index) => worksheet.getColumn(startColumn + index).width ?? 12
    ).reduce((sum, width) => sum + width, 0);
    const lineCount = this.estimateTextLineCount(text, mergedWidth);
    return Math.min(baseHeight + (lineCount - 1) * 10, maxHeight);
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
    const withoutUrls = normalizedEscapes.replace(/https?:\/\/\S+/gi, (url) =>
      this.isLikelyImageUrl(url.replace(/[),.;!?]+$/, '')) ? '' : url
    );
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

  private toPdfRichText(text: string, linkColor = '#2563EB'): string | PdfRichTextFragment[] {
    const normalized = this.normalizePdfText(text);
    if (!normalized) return '';
    if (!/(\*\*|__|https?:\/\/)/.test(normalized)) return normalized;

    const fragments: PdfRichTextFragment[] = [];
    const pattern = /(\*\*|__)(.+?)\1/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(normalized);

    const pushLinkedFragments = (value: string, bold?: boolean): void => {
      if (!value) return;
      const urlPattern = /https?:\/\/\S+/gi;
      let urlLastIndex = 0;
      let urlMatch: RegExpExecArray | null = urlPattern.exec(value);

      while (urlMatch) {
        const rawUrl = urlMatch[0];
        const matchIndex = urlMatch.index;
        const displayUrl = rawUrl.replace(/[),.;!?]+$/, '');
        const trailing = rawUrl.slice(displayUrl.length);

        if (matchIndex > urlLastIndex) {
          fragments.push({ text: value.slice(urlLastIndex, matchIndex), bold });
        }

        fragments.push({
          text: displayUrl,
          bold,
          link: displayUrl,
          color: linkColor,
          decoration: 'underline',
        });

        if (trailing) {
          fragments.push({ text: trailing, bold });
        }

        urlLastIndex = matchIndex + rawUrl.length;
        urlMatch = urlPattern.exec(value);
      }

      if (urlLastIndex < value.length) {
        fragments.push({ text: value.slice(urlLastIndex), bold });
      }
    };

    while (match) {
      const fullMatch = match[0];
      const content = match[2] ?? '';
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        pushLinkedFragments(normalized.slice(lastIndex, matchIndex));
      }

      if (content.trim().length > 0) {
        pushLinkedFragments(content, true);
      } else {
        pushLinkedFragments(fullMatch);
      }

      lastIndex = matchIndex + fullMatch.length;
      match = pattern.exec(normalized);
    }

    if (lastIndex < normalized.length) {
      pushLinkedFragments(normalized.slice(lastIndex));
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

  private async loadImageAssets(
    imageUrls: readonly string[]
  ): Promise<readonly LoadedImageAsset[]> {
    const results: LoadedImageAsset[] = [];
    for (const sourceUrl of imageUrls) {
      try {
        if (sourceUrl.startsWith('data:image/')) {
          const parsed = this.parseImageDataUrl(sourceUrl);
          if (parsed) {
            results.push({ sourceUrl, buffer: parsed.buffer, extension: parsed.extension });
          }
          continue;
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') ?? 'image/png';
        if (!contentType.startsWith('image/')) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) continue;
        const extension = this.resolveExcelImageExtension(contentType, sourceUrl);
        if (!extension) continue;
        results.push({
          sourceUrl,
          buffer: bytes,
          extension,
        });
      } catch {
        // Skip invalid/inaccessible image URLs so document generation still succeeds.
      }
    }
    return results;
  }

  private async loadPdfImages(
    imageUrls: readonly string[]
  ): Promise<readonly { sourceUrl: string; dataUrl: string }[]> {
    const images = await this.loadImageAssets(imageUrls);
    return images.map((image) => ({
      sourceUrl: image.sourceUrl,
      dataUrl: `data:image/${image.extension};base64,${image.buffer.toString('base64')}`,
    }));
  }

  private parseImageDataUrl(value: string): LoadedImageAsset | null {
    const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (!match?.[1] || !match[2]) return null;

    const extension = this.resolveExcelImageExtension(match[1], value);
    if (!extension) return null;

    try {
      const buffer = Buffer.from(match[2], 'base64');
      return buffer.length > 0 ? { sourceUrl: value, buffer, extension } : null;
    } catch {
      return null;
    }
  }

  private resolveExcelImageExtension(
    contentType: string,
    sourceUrl: string
  ): LoadedImageAsset['extension'] | null {
    const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
    if (normalized === 'image/png' || /\.png(?:[?#]|$)/i.test(sourceUrl)) return 'png';
    if (
      normalized === 'image/jpeg' ||
      normalized === 'image/jpg' ||
      /\.jpe?g(?:[?#]|$)/i.test(sourceUrl)
    ) {
      return 'jpeg';
    }
    if (normalized === 'image/gif' || /\.gif(?:[?#]|$)/i.test(sourceUrl)) return 'gif';
    return null;
  }

  private async renderPdfToBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    const pdf = pdfmake.createPdf(docDefinition);
    return pdf.getBuffer();
  }
}
