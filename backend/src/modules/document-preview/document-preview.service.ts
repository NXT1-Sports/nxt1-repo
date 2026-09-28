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
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  type DocumentPreviewManifest,
  type DocumentSheetMetadata,
  type DocumentSlideMetadata,
  type DocumentSpreadsheetCell,
  type DocumentSpreadsheetRangeData,
  type UniversalFileDoc,
  type UniversalFileDocumentType,
  getUniversalBinaryFilePayload,
  resolveUniversalFileDocumentType,
} from '@nxt1/core';
import { extractPptxDocumentContent } from '../agent/tools/media/pptx-text-extractor.js';
import { logger } from '../../utils/logger.js';

const MAX_SPREADSHEET_CELLS_PER_QUERY = 5_000;
const MAX_PREVIEW_FETCH_BYTES = 50 * 1024 * 1024; // 50MB
const MANIFEST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  readonly manifest: DocumentPreviewManifest;
  readonly expiresAt: number;
}

export class DocumentPreviewService {
  private static readonly manifestCache = new Map<string, CacheEntry>();

  /**
   * Generates or retrieves a cached preview manifest for a UniversalFile.
   */
  static async getPreviewManifest(params: {
    readonly file: UniversalFileDoc;
    readonly fileId?: string;
    readonly bucket: {
      file(path: string): {
        download(): Promise<[Buffer]>;
      };
    };
    readonly pdfUrl?: string;
  }): Promise<DocumentPreviewManifest> {
    const { file, bucket, pdfUrl } = params;
    const documentId = params.fileId?.trim() || file.id;
    const cacheKey = `${documentId}:${file.updatedAt || file.createdAt}`;
    const cached = this.manifestCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.manifest;
    }

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
    let slides: DocumentSlideMetadata[] | undefined;
    let sheets: DocumentSheetMetadata[] | undefined;

    try {
      if (docType === 'pdf') {
        const buffer = await this.resolveFileBuffer(file, bucket);
        if (buffer) {
          const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(buffer),
            useWorkerFetch: false,
            disableFontFace: true,
            useSystemFonts: true,
          });
          const pdfDoc = await loadingTask.promise;
          pageCount = pdfDoc.numPages;
          pdfDoc.cleanup();
        }
      } else if (docType === 'presentation') {
        const buffer = await this.resolveFileBuffer(file, bucket);
        if (buffer) {
          const extracted = await extractPptxDocumentContent(buffer);
          pageCount = Math.max(1, extracted.slideCount);
          slides = extracted.slides.map((slide) => ({
            slideNumber: slide.slideNumber,
            title: this.inferSlideTitle(slide.slideText) || `Slide ${slide.slideNumber}`,
            slideText: slide.slideText,
            speakerNotes: slide.speakerNotes,
            hasVisualElements: slide.hasVisualElements,
            visualElementCount: slide.visualElementCount,
          }));
        }
      } else if (docType === 'spreadsheet') {
        const buffer = await this.resolveFileBuffer(file, bucket);
        if (buffer) {
          const isCsv =
            mimeType === 'text/csv' || fileName.toLowerCase().endsWith('.csv') || kind === 'csv';

          if (isCsv) {
            const rawText = buffer.toString('utf-8');
            const parsed = parseCsv(rawText, {
              skip_empty_lines: false,
              relax_column_count: true,
            }) as unknown[];
            const rowCount = Array.isArray(parsed) ? parsed.length : 0;
            const columnCount =
              Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])
                ? parsed[0].length
                : 0;

            sheets = [
              {
                sheetId: 'sheet-1',
                name: 'Sheet 1',
                rowCount: Math.max(1, rowCount),
                columnCount: Math.max(1, columnCount),
              },
            ];
            pageCount = 1;
          } else {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
            sheets = workbook.worksheets.map((ws) => ({
              sheetId: String(ws.id ?? ws.name),
              name: ws.name,
              rowCount: Math.max(1, ws.rowCount),
              columnCount: Math.max(1, ws.columnCount),
            }));
            pageCount = Math.max(1, sheets.length);
          }
        }
      }
    } catch (err) {
      logger.warn('[DocumentPreviewService] Partial metadata extraction error', {
        fileId: file.id,
        docType,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const manifest: DocumentPreviewManifest = {
      schemaVersion: 1,
      documentId,
      documentType: docType,
      fileName,
      mimeType,
      sizeBytes,
      pageCount,
      pdfUrl,
      pdfStoragePath: binaryPayload?.storagePath,
      slides,
      sheets,
      generatedAt: new Date().toISOString(),
    };

    this.manifestCache.set(cacheKey, {
      manifest,
      expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
    });

    return manifest;
  }

  /**
   * Retrieves a bounded cell range for spreadsheet preview.
   */
  static async getSpreadsheetRange(params: {
    readonly file: UniversalFileDoc;
    readonly bucket: {
      file(path: string): {
        download(): Promise<[Buffer]>;
      };
    };
    readonly sheetId?: string;
    readonly startRow?: number;
    readonly endRow?: number;
    readonly startCol?: number;
    readonly endCol?: number;
  }): Promise<DocumentSpreadsheetRangeData> {
    const { file, bucket } = params;
    const startRow = Math.max(1, params.startRow ?? 1);
    const endRow = Math.max(startRow, Math.min(startRow + 200, params.endRow ?? startRow + 50));
    const startCol = Math.max(1, params.startCol ?? 1);
    const endCol = Math.max(startCol, Math.min(startCol + 50, params.endCol ?? startCol + 25));

    const requestedCells = (endRow - startRow + 1) * (endCol - startCol + 1);
    if (requestedCells > MAX_SPREADSHEET_CELLS_PER_QUERY) {
      throw new Error(`Requested range exceeds limit of ${MAX_SPREADSHEET_CELLS_PER_QUERY} cells.`);
    }

    const buffer = await this.resolveFileBuffer(file, bucket);
    if (!buffer) {
      throw new Error('Unable to read document content.');
    }

    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    const mimeType = binaryPayload?.mimeType || '';
    const isCsv =
      mimeType === 'text/csv' ||
      file.title.toLowerCase().endsWith('.csv') ||
      binaryPayload?.kind === 'csv';

    const cells: DocumentSpreadsheetCell[] = [];
    let totalRows: number;
    let totalCols: number;
    const resolvedSheetId = params.sheetId?.trim() || 'sheet-1';

    if (isCsv) {
      const rawText = buffer.toString('utf-8');
      const parsed = parseCsv(rawText, {
        skip_empty_lines: false,
        relax_column_count: true,
      }) as string[][];

      totalRows = parsed.length;
      totalCols = parsed[0]?.length ?? 0;

      for (let r = startRow; r <= Math.min(endRow, totalRows); r++) {
        const rowData = parsed[r - 1] ?? [];
        totalCols = Math.max(totalCols, rowData.length);
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
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      let worksheet = workbook.getWorksheet(resolvedSheetId);
      if (!worksheet && !Number.isNaN(Number(resolvedSheetId))) {
        worksheet = workbook.getWorksheet(Number(resolvedSheetId));
      }
      if (!worksheet && workbook.worksheets.length > 0) {
        worksheet = workbook.worksheets[0];
      }

      if (!worksheet) {
        throw new Error(`Worksheet ${resolvedSheetId} not found.`);
      }

      totalRows = worksheet.rowCount;
      totalCols = worksheet.columnCount;

      for (let r = startRow; r <= Math.min(endRow, totalRows); r++) {
        const row = worksheet.getRow(r);
        for (let c = startCol; c <= Math.min(endCol, totalCols); c++) {
          const cell = row.getCell(c);
          if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
            let cellValue: string | number | boolean | null;
            let formula: string | undefined;

            if (typeof cell.value === 'object') {
              if ('formula' in cell.value) {
                formula = String(cell.value.formula);
                cellValue = (cell.value as { result?: string | number | boolean }).result ?? null;
              } else if ('text' in cell.value) {
                cellValue = String(cell.value.text);
              } else if (cell.value instanceof Date) {
                cellValue = cell.value.toISOString().split('T')[0] ?? '';
              } else {
                cellValue = String(cell.value);
              }
            } else {
              cellValue = cell.value;
            }

            cells.push({
              row: r,
              col: c,
              value: cellValue,
              formattedValue: cell.text || (cellValue !== null ? String(cellValue) : ''),
              formula,
              isBold: !!cell.font?.bold,
              isHeader: r === 1,
            });
          }
        }
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
    };
  }

  private static async resolveFileBuffer(
    file: UniversalFileDoc,
    bucket: {
      file(path: string): {
        download(): Promise<[Buffer]>;
      };
    }
  ): Promise<Buffer | null> {
    const binaryPayload = getUniversalBinaryFilePayload(file.payload);
    if (!binaryPayload?.storagePath) {
      if (binaryPayload?.url && /^https?:\/\//i.test(binaryPayload.url)) {
        try {
          const response = await fetch(binaryPayload.url);
          if (!response.ok) return null;
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } catch {
          return null;
        }
      }
      return null;
    }

    try {
      const [buffer] = await bucket.file(binaryPayload.storagePath).download();
      if (buffer.length > MAX_PREVIEW_FETCH_BYTES) {
        logger.warn('[DocumentPreviewService] File exceeds max preview fetch size', {
          fileId: file.id,
          sizeBytes: buffer.length,
        });
        return null;
      }
      return buffer;
    } catch (err) {
      logger.warn('[DocumentPreviewService] Failed to download storage file for preview', {
        fileId: file.id,
        storagePath: binaryPayload.storagePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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
