/**
 * @fileoverview Document Preview Service
 * @module @nxt1/backend/modules/document-preview
 *
 * Backend service for negotiating, generating, and querying document previews
 * (PDFs, PPTX presentation decks, XLSX/CSV spreadsheets, Word documents).
 *
 * Enforces:
 * - Zero client-side parsing of untrusted binary files
 * - Immutable derivative manifests
 * - Range-bounded spreadsheet streaming (max 5,000 cells per query)
 * - Safe fallback handling when formats cannot be natively converted
 */

import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  type DocumentPreviewManifest,
  type DocumentSheetMetadata,
  type DocumentSlideMetadata,
  type DocumentSpreadsheetCell,
  type DocumentSpreadsheetCellStyle,
  type DocumentSpreadsheetRangeData,
  type UniversalFileDoc,
  type UniversalFileDocumentType,
  getUniversalBinaryFilePayload,
  resolveUniversalFileDocumentType,
} from '@nxt1/core';
import { extractPptxDocumentContent } from '../agent/tools/media/pptx-text-extractor.js';
import { tryExtractMultipartExportPayload } from '../../utils/export-multipart-payload.js';
import { logger } from '../../utils/logger.js';

const MAX_SPREADSHEET_CELLS_PER_QUERY = 5_000;
const MAX_SPREADSHEET_ROWS_PER_QUERY = 201;
const MAX_SPREADSHEET_COLS_PER_QUERY = 51;
const MAX_PREVIEW_FETCH_BYTES = 50 * 1024 * 1024; // 50MB
const MANIFEST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MANIFEST_CACHE_MAX_ENTRIES = 200;
const CSV_SHEET_ID = 'sheet-1';

/** Default Office theme palette, in the order cell colors reference it (bg1, tx1, bg2, tx2, accent1–6, hlink, folHlink). */
const EXCEL_THEME_COLORS: readonly string[] = [
  'FFFFFF',
  '000000',
  'E7E6E6',
  '44546A',
  '4472C4',
  'ED7D31',
  'A5A5A5',
  'FFC000',
  '5B9BD5',
  '70AD47',
  '0563C1',
  '954F72',
];

/** Legacy indexed palette (indexes 0–63); 64/65 are the system foreground/background. */
const EXCEL_INDEXED_COLORS: readonly string[] = [
  '000000',
  'FFFFFF',
  'FF0000',
  '00FF00',
  '0000FF',
  'FFFF00',
  'FF00FF',
  '00FFFF',
  '000000',
  'FFFFFF',
  'FF0000',
  '00FF00',
  '0000FF',
  'FFFF00',
  'FF00FF',
  '00FFFF',
  '800000',
  '008000',
  '000080',
  '808000',
  '800080',
  '008080',
  'C0C0C0',
  '808080',
  '9999FF',
  '993366',
  'FFFFCC',
  'CCFFFF',
  '660066',
  'FF8080',
  '0066CC',
  'CCCCFF',
  '000080',
  'FF00FF',
  'FFFF00',
  '00FFFF',
  '800080',
  '800000',
  '008080',
  '0000FF',
  '00CCFF',
  'CCFFFF',
  'CCFFCC',
  'FFFF99',
  '99CCFF',
  'FF99CC',
  'CC99FF',
  'FFCC99',
  '3366FF',
  '33CCCC',
  '99CC00',
  'FFCC00',
  'FF9900',
  'FF6600',
  '666699',
  '969696',
  '003366',
  '339966',
  '003300',
  '333300',
  '993300',
  '993366',
  '333399',
  '333333',
  '000000',
  'FFFFFF',
];

/** OOXML parts ExcelJS cannot round-trip; editing such workbooks would silently drop them. */
const EXCEL_UNSAFE_TO_EDIT_PARTS: readonly string[] = [
  'xl/charts/',
  'xl/pivotTables/',
  'xl/pivotCache/',
  'xl/slicers/',
  'xl/vbaProject.bin',
];

const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/tab-separated-values']);
const TRUSTED_STORAGE_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);

/** Failure codes mirror `UniversalFilePreviewMetadata.failureCode` in @nxt1/core. */
export type DocumentPreviewUnavailableReason =
  | 'render_failed'
  | 'unsupported_format'
  | 'file_too_large';

/** Thrown when a document cannot be previewed natively; callers degrade to `available: false`. */
export class DocumentPreviewUnavailableError extends Error {
  constructor(
    readonly reason: DocumentPreviewUnavailableReason,
    message: string
  ) {
    super(message);
    this.name = 'DocumentPreviewUnavailableError';
  }
}

/** Thrown for invalid preview queries; `message` is safe to return to clients. */
export class DocumentPreviewRequestError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = 'DocumentPreviewRequestError';
  }
}

type PreviewBucket = {
  readonly name?: string;
  file(path: string): {
    download(): Promise<[Buffer]>;
  };
};

type EditableStorageFile = {
  download(): Promise<[Buffer]>;
  getMetadata(): Promise<
    readonly [
      {
        generation?: string | number;
        contentType?: string;
        cacheControl?: string;
        metadata?: Record<string, unknown>;
      },
      ...unknown[],
    ]
  >;
  save(
    data: Buffer,
    options: {
      resumable: boolean;
      metadata: Record<string, unknown>;
      preconditionOpts?: { ifGenerationMatch: number };
    }
  ): Promise<unknown>;
};

type EditableBucket = {
  readonly name?: string;
  file(path: string): EditableStorageFile;
};

/** Column width in Excel character units (the unit `.xlsx` stores). */
export interface SpreadsheetColumnWidthEdit {
  readonly col: number;
  readonly width: number;
}

/** Row height in points (the unit `.xlsx` stores). */
export interface SpreadsheetRowHeightEdit {
  readonly row: number;
  readonly height: number;
}

/** A single in-place cell edit from the preview grid; `value` is exactly what the user typed. */
export interface SpreadsheetCellEdit {
  readonly row: number;
  readonly col: number;
  readonly value: string;
}

interface CacheEntry {
  readonly manifest: DocumentPreviewManifest;
  readonly expiresAt: number;
}

type SpreadsheetFormat = 'csv' | 'xlsx' | 'legacy' | 'unknown';

export class DocumentPreviewService {
  private static readonly manifestCache = new Map<string, CacheEntry>();

  /** Test hook: drops all cached manifests. */
  static clearManifestCache(): void {
    this.manifestCache.clear();
  }

  /**
   * Generates or retrieves a cached preview manifest for a UniversalFile.
   * Throws `DocumentPreviewUnavailableError` when the source cannot be read or parsed;
   * failures are never cached.
   */
  static async getPreviewManifest(params: {
    readonly file: UniversalFileDoc;
    readonly fileId?: string;
    readonly bucket: PreviewBucket;
    readonly pdfUrl?: string;
  }): Promise<DocumentPreviewManifest> {
    const { file, bucket, pdfUrl } = params;
    const documentId = params.fileId?.trim() || file.id;
    const cacheKey = `${documentId}:${file.updatedAt || file.createdAt}`;
    const cached = this.manifestCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      // Signed URLs expire faster than the cache; always hand back the caller's fresh URL.
      return { ...cached.manifest, pdfUrl };
    }
    if (cached) this.manifestCache.delete(cacheKey);

    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    const mimeType = binaryPayload?.mimeType || 'application/octet-stream';
    const fileName = file.title;
    const kind = binaryPayload?.kind;
    const sizeBytes = binaryPayload?.sizeBytes ?? 0;
    const docType: UniversalFileDocumentType = resolveUniversalFileDocumentType(
      mimeType,
      fileName,
      kind
    );

    let pageCount = 1;
    let pageCountKnown = true;
    let slides: DocumentSlideMetadata[] | undefined;
    let sheets: DocumentSheetMetadata[] | undefined;

    try {
      if (docType === 'pdf') {
        // The browser renders PDFs itself from the signed pdfUrl; the server only counts
        // pages. If that fails, still offer the preview (pdf.js reports the real count) rather
        // than pushing the client onto a possibly expired stored URL — just don't cache it.
        try {
          const buffer = await this.resolveFileBuffer(file, bucket);
          pageCount = await this.countPdfPages(buffer);
        } catch (err) {
          pageCountKnown = false;
          logger.warn('[DocumentPreviewService] PDF page count unavailable; serving preview', {
            fileId: file.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (docType === 'presentation') {
        const buffer = await this.resolveFileBuffer(file, bucket);
        if (!this.isZipBuffer(buffer)) {
          throw new DocumentPreviewUnavailableError(
            'unsupported_format',
            'Presentation is not an Open XML (.pptx) deck.'
          );
        }
        const extracted = await extractPptxDocumentContent(buffer);
        if (extracted.slides.length === 0) {
          throw new DocumentPreviewUnavailableError(
            'render_failed',
            'Presentation contains no readable slides.'
          );
        }
        pageCount = Math.max(1, extracted.slideCount);
        slides = extracted.slides.map((slide) => ({
          slideNumber: slide.slideNumber,
          title: this.inferSlideTitle(slide.slideText) || `Slide ${slide.slideNumber}`,
          slideText: slide.slideText,
          speakerNotes: slide.speakerNotes,
          hasVisualElements: slide.hasVisualElements,
          visualElementCount: slide.visualElementCount,
        }));
      } else if (docType === 'spreadsheet') {
        const declaredFormat = this.resolveSpreadsheetFormat(mimeType, fileName);
        this.assertSpreadsheetFormatSupported(declaredFormat);
        const buffer = await this.resolveFileBuffer(file, bucket);
        const format = this.sniffSpreadsheetFormat(declaredFormat, buffer);
        this.assertSpreadsheetFormatSupported(format);

        if (format === 'csv') {
          const parsed = this.parseCsvBuffer(buffer, mimeType, fileName);
          const columnCount = parsed.reduce((max, row) => Math.max(max, row.length), 0);
          sheets = [
            {
              sheetId: CSV_SHEET_ID,
              name: 'Sheet 1',
              rowCount: Math.max(1, parsed.length),
              columnCount: Math.max(1, columnCount),
            },
          ];
          pageCount = 1;
        } else {
          const workbook = await this.loadWorkbook(buffer);
          sheets = workbook.worksheets.map((ws) => ({
            sheetId: String(ws.id ?? ws.name),
            name: ws.name,
            rowCount: Math.max(1, ws.rowCount),
            columnCount: Math.max(1, ws.columnCount),
          }));
          if (sheets.length === 0) {
            throw new DocumentPreviewUnavailableError(
              'render_failed',
              'Workbook contains no worksheets.'
            );
          }
          pageCount = sheets.length;
        }
      }
    } catch (err) {
      const unavailable =
        err instanceof DocumentPreviewUnavailableError
          ? err
          : new DocumentPreviewUnavailableError('render_failed', 'Failed to parse document.');
      logger.warn('[DocumentPreviewService] Preview metadata extraction failed', {
        fileId: file.id,
        docType,
        reason: unavailable.reason,
        error: err instanceof Error ? err.message : String(err),
      });
      throw unavailable;
    }

    const manifest: DocumentPreviewManifest = {
      schemaVersion: 1,
      documentId,
      documentType: docType,
      fileName,
      mimeType,
      sizeBytes,
      pageCount,
      pdfStoragePath: binaryPayload?.storagePath,
      slides,
      sheets,
      generatedAt: new Date().toISOString(),
    };

    if (pageCountKnown) this.setCachedManifest(cacheKey, manifest);

    return { ...manifest, pdfUrl };
  }

  /**
   * Retrieves a bounded cell range for spreadsheet preview. Oversized requests are clamped
   * to the per-query cell budget rather than rejected.
   */
  static async getSpreadsheetRange(params: {
    readonly file: UniversalFileDoc;
    readonly bucket: PreviewBucket;
    readonly sheetId?: string;
    readonly startRow?: number;
    readonly endRow?: number;
    readonly startCol?: number;
    readonly endCol?: number;
  }): Promise<DocumentSpreadsheetRangeData> {
    const { file, bucket } = params;
    const startRow = Math.max(1, Math.floor(params.startRow ?? 1));
    const startCol = Math.max(1, Math.floor(params.startCol ?? 1));
    const endCol = Math.max(
      startCol,
      Math.min(
        startCol + MAX_SPREADSHEET_COLS_PER_QUERY - 1,
        Math.floor(params.endCol ?? startCol + 25)
      )
    );
    const colSpan = endCol - startCol + 1;
    const maxRows = Math.max(
      1,
      Math.min(
        MAX_SPREADSHEET_ROWS_PER_QUERY,
        Math.floor(MAX_SPREADSHEET_CELLS_PER_QUERY / colSpan)
      )
    );
    const endRow = Math.max(
      startRow,
      Math.min(startRow + maxRows - 1, Math.floor(params.endRow ?? startRow + 50))
    );

    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    const mimeType = binaryPayload?.mimeType || '';
    const declaredFormat = this.resolveSpreadsheetFormat(mimeType, file.title);
    this.assertSpreadsheetFormatSupported(declaredFormat);
    const buffer = await this.resolveFileBuffer(file, bucket);
    const format = this.sniffSpreadsheetFormat(declaredFormat, buffer);
    this.assertSpreadsheetFormatSupported(format);
    const requestedSheetId = params.sheetId?.trim() || undefined;

    const cells: DocumentSpreadsheetCell[] = [];
    let totalRows: number;
    let totalCols: number;
    let resolvedSheetId: string;
    let columnWidths: (number | null)[] | undefined;
    let rowHeights: (number | null)[] | undefined;

    if (format === 'csv') {
      if (requestedSheetId && requestedSheetId !== CSV_SHEET_ID) {
        throw new DocumentPreviewRequestError(404, 'Worksheet not found.');
      }
      resolvedSheetId = CSV_SHEET_ID;

      let parsed: string[][];
      try {
        parsed = this.parseCsvBuffer(buffer, mimeType, file.title);
      } catch {
        throw new DocumentPreviewUnavailableError('render_failed', 'Failed to parse CSV.');
      }

      totalRows = parsed.length;
      totalCols = parsed.reduce((max, row) => Math.max(max, row.length), 0);

      for (let r = startRow; r <= Math.min(endRow, totalRows); r++) {
        const rowData = parsed[r - 1] ?? [];
        for (let c = startCol; c <= Math.min(endCol, rowData.length); c++) {
          const val = rowData[c - 1];
          if (val !== undefined && val !== '') {
            cells.push({
              row: r,
              col: c,
              value: val,
              formattedValue: val,
              isHeader: r === 1,
            });
          }
        }
      }
    } else {
      let workbook: ExcelJS.Workbook;
      try {
        workbook = await this.loadWorkbook(buffer);
      } catch {
        throw new DocumentPreviewUnavailableError('render_failed', 'Failed to parse workbook.');
      }

      const worksheet = this.findWorksheet(workbook, requestedSheetId);
      if (!worksheet) {
        throw new DocumentPreviewRequestError(404, 'Worksheet not found.');
      }
      resolvedSheetId = String(worksheet.id ?? worksheet.name);

      totalRows = worksheet.rowCount;
      totalCols = worksheet.columnCount;

      const lastRow = Math.min(endRow, totalRows);
      const lastCol = Math.min(endCol, totalCols);
      // Merge masters → furthest covered cell seen inside the requested window.
      const mergeExtents = new Map<ExcelJS.Cell, { row: number; col: number }>();
      const cellsByMaster = new Map<ExcelJS.Cell, DocumentSpreadsheetCell>();

      for (let r = startRow; r <= lastRow; r++) {
        const row = worksheet.getRow(r);
        for (let c = startCol; c <= lastCol; c++) {
          const cell = row.getCell(c);
          // Merged ranges: only the master cell carries the value; covered cells extend its span.
          if (cell.type === ExcelJS.ValueType.Merge) {
            const master = cell.master;
            if (master && master !== cell) {
              const extent = mergeExtents.get(master) ?? { row: r, col: c };
              mergeExtents.set(master, {
                row: Math.max(extent.row, r),
                col: Math.max(extent.col, c),
              });
            }
            continue;
          }

          const resolved = this.resolveExcelCell(cell);
          const style = this.resolveExcelCellStyle(cell);
          const isBold = !!cell.font?.bold;
          // Styled blanks still matter: color-coded rows often have empty cells.
          if (!resolved && !style && !cell.isMerged) continue;

          const entry: DocumentSpreadsheetCell = {
            row: r,
            col: c,
            value: resolved?.value ?? null,
            formattedValue: resolved?.formattedValue ?? '',
            formula: resolved?.formula,
            isBold,
            ...(style ? { style } : {}),
          };
          cells.push(entry);
          if (cell.isMerged) cellsByMaster.set(cell, entry);
        }
      }

      for (const [master, extent] of mergeExtents) {
        const entry = cellsByMaster.get(master);
        if (!entry) continue;
        const index = cells.indexOf(entry);
        cells[index] = {
          ...entry,
          rowSpan: extent.row - entry.row + 1,
          colSpan: extent.col - entry.col + 1,
        };
      }

      columnWidths = [];
      for (let c = startCol; c <= endCol; c++) {
        const width = worksheet.getColumn(c).width;
        columnWidths.push(typeof width === 'number' && width > 0 ? width : null);
      }

      rowHeights = [];
      for (let r = startRow; r <= endRow; r++) {
        const height = r <= totalRows ? worksheet.getRow(r).height : undefined;
        rowHeights.push(typeof height === 'number' && height > 0 ? height : null);
      }
    }

    return {
      sheetId: resolvedSheetId,
      startRow,
      endRow,
      startCol,
      endCol,
      totalRows,
      totalCols,
      cells,
      ...(columnWidths?.some((w) => w !== null) ? { columnWidths } : {}),
      ...(rowHeights?.some((h) => h !== null) ? { rowHeights } : {}),
    };
  }

  /**
   * Applies in-place cell edits and column/row resizes to a stored XLSX/CSV and overwrites the
   * source object, keeping cell formatting. Uses a storage generation precondition so concurrent
   * saves 409 instead of silently clobbering each other. CSV has no sizing, so resize-only
   * requests on CSV are a no-op (`saved: false`).
   */
  static async updateSpreadsheetCells(params: {
    readonly file: UniversalFileDoc;
    readonly bucket: EditableBucket;
    readonly sheetId?: string;
    readonly edits: readonly SpreadsheetCellEdit[];
    readonly columnWidths?: readonly SpreadsheetColumnWidthEdit[];
    readonly rowHeights?: readonly SpreadsheetRowHeightEdit[];
  }): Promise<{ cells: DocumentSpreadsheetCell[]; sizeBytes: number; saved: boolean }> {
    const { file, bucket, edits, columnWidths = [], rowHeights = [] } = params;
    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    const storagePath = binaryPayload?.storagePath;
    if (!storagePath) {
      throw new DocumentPreviewUnavailableError(
        'unsupported_format',
        'Only files stored in the library can be edited.'
      );
    }

    const mimeType = binaryPayload?.mimeType || '';
    const declaredFormat = this.resolveSpreadsheetFormat(mimeType, file.title);
    this.assertSpreadsheetFormatSupported(declaredFormat);

    const storageFile = bucket.file(storagePath);
    const [metadata] = await storageFile.getMetadata();
    const generation = Number(metadata.generation);
    const buffer = await this.resolveFileBuffer(file, bucket);
    const format = this.sniffSpreadsheetFormat(declaredFormat, buffer);
    this.assertSpreadsheetFormatSupported(format);
    const requestedSheetId = params.sheetId?.trim() || undefined;

    let output: Buffer;
    const cells: DocumentSpreadsheetCell[] = [];

    if (format === 'csv') {
      if (requestedSheetId && requestedSheetId !== CSV_SHEET_ID) {
        throw new DocumentPreviewRequestError(404, 'Worksheet not found.');
      }
      if (edits.length === 0) return { cells, sizeBytes: buffer.length, saved: false };
      const rawText = buffer.toString('utf-8');
      const hasBom = rawText.startsWith('\uFEFF');
      const delimiter = this.resolveCsvDelimiter(
        rawText.replace(/^\uFEFF/, ''),
        mimeType,
        file.title
      );
      const rows = this.parseCsvBuffer(buffer, mimeType, file.title).map((row) => [...row]);

      for (const edit of edits) {
        while (rows.length < edit.row) rows.push([]);
        const row = rows[edit.row - 1]!;
        while (row.length < edit.col) row.push('');
        row[edit.col - 1] = edit.value;
        cells.push({
          row: edit.row,
          col: edit.col,
          value: edit.value === '' ? null : edit.value,
          formattedValue: edit.value,
          isHeader: edit.row === 1,
        });
      }
      const text = stringifyCsv(rows, { delimiter }) as string;
      output = Buffer.from(`${hasBom ? '\uFEFF' : ''}${text}`, 'utf-8');
    } else {
      // ExcelJS round-trips drop charts, pivots, slicers, and macros; refuse rather than corrupt.
      if (EXCEL_UNSAFE_TO_EDIT_PARTS.some((part) => buffer.includes(part))) {
        throw new DocumentPreviewUnavailableError(
          'unsupported_format',
          'Workbooks with charts, pivot tables, or macros cannot be edited in the preview.'
        );
      }
      let workbook: ExcelJS.Workbook;
      try {
        workbook = await this.loadWorkbook(buffer);
      } catch (err) {
        if (err instanceof DocumentPreviewUnavailableError) throw err;
        throw new DocumentPreviewUnavailableError('render_failed', 'Failed to parse workbook.');
      }
      const worksheet = this.findWorksheet(workbook, requestedSheetId);
      if (!worksheet) {
        throw new DocumentPreviewRequestError(404, 'Worksheet not found.');
      }

      for (const edit of edits) {
        // Writes to a covered merge cell land on the merge's top-left cell, as in Excel.
        const cell = worksheet.getCell(edit.row, edit.col).master;
        cell.value = this.parseEditedExcelValue(edit.value, cell.numFmt);
        const resolved = this.resolveExcelCell(cell);
        const style = this.resolveExcelCellStyle(cell);
        cells.push({
          row: Number(cell.row),
          col: Number(cell.col),
          value: resolved?.value ?? null,
          formattedValue: resolved?.formattedValue ?? '',
          isBold: !!cell.font?.bold,
          ...(style ? { style } : {}),
        });
      }
      for (const { col, width } of columnWidths) {
        worksheet.getColumn(col).width = width;
      }
      for (const { row, height } of rowHeights) {
        worksheet.getRow(row).height = height;
      }
      output = Buffer.from(await workbook.xlsx.writeBuffer());
    }

    if (output.length > MAX_PREVIEW_FETCH_BYTES) {
      throw new DocumentPreviewUnavailableError('file_too_large', 'Edited file is too large.');
    }

    try {
      await storageFile.save(output, {
        resumable: false,
        metadata: {
          contentType: metadata.contentType || mimeType || undefined,
          ...(metadata.cacheControl ? { cacheControl: metadata.cacheControl } : {}),
          // Keep custom metadata (e.g. firebaseStorageDownloadTokens) so existing links keep working.
          metadata: metadata.metadata ?? {},
        },
        ...(Number.isFinite(generation) && generation > 0
          ? { preconditionOpts: { ifGenerationMatch: generation } }
          : {}),
      });
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 412 || code === '412') {
        throw new DocumentPreviewRequestError(
          409,
          'This file changed while you were editing. Reload and try again.'
        );
      }
      throw err;
    }

    return { cells, sizeBytes: output.length, saved: true };
  }

  /** Mirrors Excel's input coercion: numbers, percents, currency, and booleans become typed values. */
  private static parseEditedExcelValue(
    input: string,
    numFmt: string | undefined
  ): string | number | boolean | Date | null {
    const trimmed = input.trim();
    if (trimmed === '') return null;
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toUpperCase() === 'TRUE';

    // The grid shows dates as `YYYY-MM-DD[ HH:MM[:SS]]` (UTC); read them back as real dates.
    const date = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (date) {
      const [, y, mo, d, h = '0', mi = '0', sec = '0'] = date;
      const parsed = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +sec));
      if (!Number.isNaN(parsed.getTime()) && parsed.getUTCDate() === +d!) return parsed;
    }

    const percent = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (percent) return Number(percent[1]) / 100;

    const numeric = trimmed.replace(/^(-?)[$€£¥]/, '$1');
    if (
      /^-?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(numeric) &&
      /\d/.test(numeric)
    ) {
      const value = Number(numeric.replace(/,/g, ''));
      if (Number.isFinite(value)) {
        // In a percent-formatted cell Excel reads both `10` and `0.1` as 10%.
        return numFmt && /%$/.test(numFmt.trim()) && Math.abs(value) >= 1 ? value / 100 : value;
      }
    }
    return input;
  }

  /**
   * Decides the spreadsheet parser from mime type / extension only. Upload `kind` is not
   * trusted here because XLSX uploads are also tagged `csv`.
   */
  private static resolveSpreadsheetFormat(mimeType: string, fileName: string): SpreadsheetFormat {
    const normMime = mimeType.trim().toLowerCase().split(';')[0]?.trim() ?? '';
    const normName = fileName.trim().toLowerCase();

    if (CSV_MIME_TYPES.has(normMime) || /\.(csv|tsv)$/.test(normName)) return 'csv';
    if (normMime.includes('spreadsheetml') || /\.(xlsx|xlsm)$/.test(normName)) return 'xlsx';
    if (
      normMime === 'application/vnd.ms-excel' ||
      normMime.includes('opendocument.spreadsheet') ||
      /\.(xls|ods)$/.test(normName)
    ) {
      return 'legacy';
    }
    return 'unknown';
  }

  /** Resolves an `unknown` format by content: ZIP → xlsx, OLE2 → legacy .xls, else CSV text. */
  private static sniffSpreadsheetFormat(
    format: SpreadsheetFormat,
    buffer: Buffer
  ): Exclude<SpreadsheetFormat, 'unknown'> {
    if (format !== 'unknown') return format;
    if (this.isZipBuffer(buffer)) return 'xlsx';
    if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0) return 'legacy';
    return 'csv';
  }

  private static assertSpreadsheetFormatSupported(format: SpreadsheetFormat): void {
    if (format === 'legacy') {
      throw new DocumentPreviewUnavailableError(
        'unsupported_format',
        'Legacy spreadsheet formats (.xls/.ods) are not previewable.'
      );
    }
  }

  private static parseCsvBuffer(buffer: Buffer, mimeType: string, fileName: string): string[][] {
    // Strip the UTF-8 BOM ourselves; the local csv-parse type shim doesn't expose `bom`.
    const rawText = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const parsed = parseCsv(rawText, {
      delimiter: this.resolveCsvDelimiter(rawText, mimeType, fileName),
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as unknown;
    return Array.isArray(parsed) ? (parsed as string[][]) : [];
  }

  private static resolveCsvDelimiter(rawText: string, mimeType: string, fileName: string): string {
    const isTsv =
      mimeType.trim().toLowerCase().startsWith('text/tab-separated-values') ||
      fileName.trim().toLowerCase().endsWith('.tsv');
    return isTsv ? '\t' : this.sniffCsvDelimiter(rawText);
  }

  /** Picks the most frequent unquoted delimiter (comma, semicolon, tab) on the first non-empty line. */
  private static sniffCsvDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
    const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
    }
    let best = ',';
    for (const candidate of [';', '\t']) {
      if ((counts[candidate] ?? 0) > (counts[best] ?? 0)) best = candidate;
    }
    return best;
  }

  private static async loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    if (!this.isZipBuffer(buffer)) {
      throw new DocumentPreviewUnavailableError(
        'unsupported_format',
        'Spreadsheet is not an Open XML (.xlsx) workbook.'
      );
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
  }

  private static findWorksheet(
    workbook: ExcelJS.Workbook,
    sheetId: string | undefined
  ): ExcelJS.Worksheet | undefined {
    if (!sheetId) return workbook.worksheets[0];
    if (/^\d+$/.test(sheetId)) {
      const numericId = Number(sheetId);
      const byId = workbook.worksheets.find((ws) => ws.id === numericId);
      if (byId) return byId;
    }
    return workbook.worksheets.find((ws) => ws.name === sheetId);
  }

  private static resolveExcelCell(cell: ExcelJS.Cell): {
    value: string | number | boolean | null;
    formattedValue: string;
    formula?: string;
  } | null {
    const raw = cell.value as unknown;
    if (raw === null || raw === undefined || raw === '') return null;

    let formula: string | undefined;
    let target: unknown = raw;
    if (typeof raw === 'object' && !(raw instanceof Date)) {
      const record = raw as Record<string, unknown>;
      if ('formula' in record || 'sharedFormula' in record) {
        const formulaText = record['formula'] ?? record['sharedFormula'];
        formula = typeof formulaText === 'string' ? formulaText : undefined;
        target = record['result'] ?? null;
      }
    }

    const numFmt = typeof cell.numFmt === 'string' ? cell.numFmt : undefined;
    const { value, formattedValue } = this.normalizeExcelValue(target, numFmt);
    if (formattedValue === '' && value === null && !formula) return null;
    return { value, formattedValue, formula };
  }

  /** Extracts the fill, font, and alignment the grid needs to mirror Excel. Null when unstyled. */
  private static resolveExcelCellStyle(cell: ExcelJS.Cell): DocumentSpreadsheetCellStyle | null {
    const style: {
      -readonly [K in keyof DocumentSpreadsheetCellStyle]: DocumentSpreadsheetCellStyle[K];
    } = {};

    const fill = cell.fill as ExcelJS.Fill | undefined;
    if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
      // Solid fills store the visible color in fgColor; bgColor is only the pattern backdrop.
      const color = this.resolveExcelColor(fill.fgColor) ?? this.resolveExcelColor(fill.bgColor);
      if (color) style.backgroundColor = color;
    } else if (fill?.type === 'gradient') {
      const color = this.resolveExcelColor(fill.stops?.[0]?.color);
      if (color) style.backgroundColor = color;
    }

    const font = cell.font;
    if (font) {
      const fontColor = this.resolveExcelColor(font.color);
      if (fontColor) style.fontColor = fontColor;
      if (font.italic) style.isItalic = true;
      if (font.underline) style.isUnderline = true;
      if (font.strike) style.isStrike = true;
      if (typeof font.size === 'number' && font.size > 0 && font.size !== 11) {
        style.fontSize = font.size;
      }
    }

    const alignment = cell.alignment;
    if (alignment) {
      const horizontal = alignment.horizontal;
      if (horizontal === 'left' || horizontal === 'right') style.horizontalAlign = horizontal;
      else if (horizontal === 'center' || horizontal === 'centerContinuous') {
        style.horizontalAlign = 'center';
      }
      const vertical = alignment.vertical;
      if (vertical === 'top' || vertical === 'bottom') style.verticalAlign = vertical;
      else if (vertical === 'middle') style.verticalAlign = 'middle';
      if (alignment.wrapText) style.wrapText = true;
    }

    return Object.keys(style).length > 0 ? style : null;
  }

  /** Resolves an ExcelJS color (ARGB, theme + tint, or legacy index) to `#rrggbb`. */
  private static resolveExcelColor(color: Partial<ExcelJS.Color> | undefined): string | undefined {
    if (!color) return undefined;
    const record = color as Partial<ExcelJS.Color> & { indexed?: number; tint?: number };

    let hex: string | undefined;
    if (typeof record.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(record.argb)) {
      // 8-digit values are AARRGGBB; Excel ignores the alpha byte for cell colors.
      hex = record.argb.slice(-6);
    } else if (typeof record.theme === 'number') {
      hex = EXCEL_THEME_COLORS[record.theme];
    } else if (typeof record.indexed === 'number') {
      hex = EXCEL_INDEXED_COLORS[record.indexed];
    }
    if (!hex) return undefined;

    const tint = typeof record.tint === 'number' ? record.tint : 0;
    return `#${(tint ? this.applyExcelTint(hex, tint) : hex).toLowerCase()}`;
  }

  /** Applies an OOXML tint: shifts HSL luminance toward white (tint > 0) or black (tint < 0). */
  private static applyExcelTint(hex: string, tint: number): string {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }

    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    l = Math.min(1, Math.max(0, l));

    const hueToRgb = (p: number, q: number, t: number): number => {
      const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    let rgb: [number, number, number];
    if (s === 0) {
      rgb = [l, l, l];
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      rgb = [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
    }
    return rgb
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
  }

  private static normalizeExcelValue(
    raw: unknown,
    numFmt: string | undefined
  ): { value: string | number | boolean | null; formattedValue: string } {
    if (raw === null || raw === undefined) return { value: null, formattedValue: '' };
    if (raw instanceof Date) {
      const formatted = this.formatExcelDate(raw);
      return { value: formatted, formattedValue: formatted };
    }
    if (typeof raw === 'number') {
      return { value: raw, formattedValue: this.formatExcelNumber(raw, numFmt) };
    }
    if (typeof raw === 'boolean') {
      return { value: raw, formattedValue: raw ? 'TRUE' : 'FALSE' };
    }
    if (typeof raw === 'string') return { value: raw, formattedValue: raw };
    if (typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      if (Array.isArray(record['richText'])) {
        const text = (record['richText'] as Array<{ text?: unknown }>)
          .map((run) => (typeof run?.text === 'string' ? run.text : ''))
          .join('');
        return { value: text, formattedValue: text };
      }
      if ('text' in record) {
        // Hyperlink cells: `text` may itself be a rich-text value.
        return this.normalizeExcelValue(record['text'], numFmt);
      }
      if (typeof record['error'] === 'string') {
        return { value: record['error'], formattedValue: record['error'] };
      }
    }
    return { value: null, formattedValue: '' };
  }

  /** ISO date (UTC) — ExcelJS materializes serial dates as UTC instants. */
  private static formatExcelDate(date: Date): string {
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    const h = date.getUTCHours();
    const m = date.getUTCMinutes();
    const s = date.getUTCSeconds();
    if (h === 0 && m === 0 && s === 0) return datePart;
    return `${datePart} ${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
  }

  private static formatExcelNumber(value: number, numFmt: string | undefined): string {
    const percentMatch = numFmt?.trim().match(/^0(?:\.(0+))?%$/);
    if (percentMatch) {
      const decimals = percentMatch[1]?.length ?? 0;
      return `${(value * 100).toFixed(decimals)}%`;
    }

    // Common fixed/grouped/currency formats (`0.00`, `#,##0`, `$#,##0.00`, `"$"#,##0;("$"#,##0)`).
    const section = numFmt?.split(';')[0]?.trim() ?? '';
    const numberPattern = section.match(/[#0,]*0(?:\.(0+))?/);
    if (numberPattern && !/[dmyhs]/i.test(section.replace(/"[^"]*"|\[[^\]]*\]/g, ''))) {
      const decimals = numberPattern[1]?.length ?? 0;
      const grouped = numberPattern[0].includes(',');
      const currency = section.match(/[$€£¥]/)?.[0] ?? '';
      const formatted = Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      });
      const negativeInParens = value < 0 && /\(.*\)/.test(numFmt?.split(';')[1] ?? '');
      if (negativeInParens) return `(${currency}${formatted})`;
      return `${value < 0 ? '-' : ''}${currency}${formatted}`;
    }

    // General: trim float noise (0.1 + 0.2) the way Excel's 11-character display does.
    if (!Number.isInteger(value)) return String(Number(value.toPrecision(10)));
    return String(value);
  }

  private static async countPdfPages(buffer: Buffer): Promise<number> {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      disableFontFace: true,
      useSystemFonts: true,
    });
    try {
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;
      if (numPages < 1) {
        throw new DocumentPreviewUnavailableError('render_failed', 'PDF contains no pages.');
      }
      return numPages;
    } finally {
      await loadingTask.destroy().catch(() => undefined);
    }
  }

  private static setCachedManifest(cacheKey: string, manifest: DocumentPreviewManifest): void {
    const now = Date.now();
    for (const [key, entry] of this.manifestCache) {
      if (entry.expiresAt <= now) this.manifestCache.delete(key);
    }
    // Map preserves insertion order, so the first key is the oldest entry.
    while (this.manifestCache.size >= MANIFEST_CACHE_MAX_ENTRIES) {
      const oldestKey = this.manifestCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.manifestCache.delete(oldestKey);
    }
    this.manifestCache.set(cacheKey, {
      manifest,
      expiresAt: now + MANIFEST_CACHE_TTL_MS,
    });
  }

  private static isZipBuffer(buffer: Buffer): boolean {
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  /** Only fetch payload URLs that point at our storage hosts (no arbitrary egress). */
  private static isTrustedStorageUrl(rawUrl: string, bucketName?: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (TRUSTED_STORAGE_HOSTS.has(host)) return true;
      return !!bucketName && host === `${bucketName.toLowerCase()}.storage.googleapis.com`;
    } catch {
      return false;
    }
  }

  /**
   * Loads the source bytes (multipart-unwrapped). Throws `DocumentPreviewUnavailableError`
   * when the file is missing, unreachable, or exceeds the preview fetch limit.
   */
  private static async resolveFileBuffer(
    file: UniversalFileDoc,
    bucket: PreviewBucket
  ): Promise<Buffer> {
    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    if ((binaryPayload?.sizeBytes ?? 0) > MAX_PREVIEW_FETCH_BYTES) {
      throw new DocumentPreviewUnavailableError(
        'file_too_large',
        'File exceeds max preview fetch size.'
      );
    }

    let buffer: Buffer | null = null;
    if (!binaryPayload?.storagePath) {
      const url = binaryPayload?.url;
      if (url && this.isTrustedStorageUrl(url, bucket.name)) {
        try {
          const response = await fetch(url, { redirect: 'error' });
          const declaredLength = Number(response.headers.get('content-length') ?? 0);
          if (response.ok && declaredLength <= MAX_PREVIEW_FETCH_BYTES) {
            buffer = Buffer.from(await response.arrayBuffer());
          }
        } catch (err) {
          logger.warn('[DocumentPreviewService] Failed to fetch file URL for preview', {
            fileId: file.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      try {
        [buffer] = await bucket.file(binaryPayload.storagePath).download();
      } catch (err) {
        logger.warn('[DocumentPreviewService] Failed to download storage file for preview', {
          fileId: file.id,
          storagePath: binaryPayload.storagePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!buffer) {
      throw new DocumentPreviewUnavailableError(
        'render_failed',
        'Unable to read document content.'
      );
    }
    if (buffer.length > MAX_PREVIEW_FETCH_BYTES) {
      logger.warn('[DocumentPreviewService] File exceeds max preview fetch size', {
        fileId: file.id,
        sizeBytes: buffer.length,
      });
      throw new DocumentPreviewUnavailableError(
        'file_too_large',
        'File exceeds max preview fetch size.'
      );
    }

    return (
      tryExtractMultipartExportPayload({
        buffer,
        expectedMimeType: binaryPayload?.mimeType ?? '',
      }) ?? buffer
    );
  }

  private static inferSlideTitle(slideText?: string): string | null {
    if (!slideText) return null;
    const lines = slideText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines[0]?.slice(0, 60) ?? null;
  }
}
