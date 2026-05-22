/**
 * @fileoverview Export Service — PDF & CSV Document Generation
 * @module @nxt1/backend/modules/agent/services
 *
 * Centralised service for generating PDF and CSV documents from structured data.
 * Used by both the Agent X DynamicExportTool and the REST analytics/export endpoint.
 *
 * Design decisions:
 * - Uses `pdfmake` for PDF generation (declarative JSON → PDF, no coordinate math).
 * - Uses `csv-stringify/sync` for CSV generation (fast, synchronous, Buffer-native).
 * - All output is returned as a `Buffer` — callers handle storage/upload.
 * - CSVs include a UTF-8 BOM so they open correctly in Excel/Sheets/Numbers.
 * - PDFs include NXT1 branding header, page numbers, and professional formatting.
 *
 * Architecture:
 *   Caller (Tool / Route)
 *        ↓
 *   ExportService.generatePdf(opts)  → Buffer (PDF)
 *   ExportService.generateCsv(opts)  → Buffer (CSV)
 *        ↓
 *   Caller uploads Buffer → Firebase Storage → signed URL
 */

import pdfmakeModule from 'pdfmake';
import { stringify } from 'csv-stringify/sync';
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
  /** Column definitions (order determines output column order). */
  readonly columns: readonly ExportColumn[];
  /** Row data — each inner array matches column order. */
  readonly rows: readonly ExportRow[];
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
    const renderedImageUrls = new Set<string>();

    const paragraphBlocks = (opts.bodyParagraphs ?? []).map((paragraph) => {
      const imageUrls = this.extractImageUrlsFromText(paragraph);
      const text = this.stripUrlsAndDiagramLabels(paragraph);
      return { text, imageUrls };
    });

    const bulletBlocks = (opts.bulletPoints ?? []).map((bullet) => {
      const imageUrls = this.extractImageUrlsFromText(bullet);
      const text = this.stripUrlsAndDiagramLabels(bullet);
      return { text, imageUrls };
    });

    const allInlineImageUrls = [
      ...paragraphBlocks.flatMap((block) => block.imageUrls),
      ...bulletBlocks.flatMap((block) => block.imageUrls),
    ];
    const explicitImageUrls = this.normalizeImageUrls(opts.imageUrls);
    const normalizedAllImageUrls = this.normalizeImageUrls([
      ...allInlineImageUrls,
      ...explicitImageUrls,
    ]);
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

    // Body paragraphs
    if (paragraphBlocks.length > 0) {
      for (let blockIdx = 0; blockIdx < paragraphBlocks.length; blockIdx++) {
        const block = paragraphBlocks[blockIdx];
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
        if (blockIdx < paragraphBlocks.length - 1) {
          content.push({ text: '', margin: [0, 0, 0, 2] });
        }
      }
    }

    // Bullet points
    if (bulletBlocks.length > 0) {
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

      for (const block of bulletBlocks) {
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

    // Data table
    if (opts.includeTable && opts.columns?.length && opts.rows?.length) {
      const widths = opts.columns.map((c) => c.width ?? '*');
      const headerRow: TableCell[] = opts.columns.map((c) => ({
        text: this.normalizePdfText(c.label),
        style: 'tableHeader',
      }));
      const bodyRows: TableCell[][] = opts.rows.map((row) =>
        row.map((cell) => ({
          text: this.normalizePdfText(cell == null ? '' : String(cell)),
          style: 'tableCell',
        }))
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

    const remainingImageUrls = explicitImageUrls.filter((url) => !renderedImageUrls.has(url));
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

    return content;
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
