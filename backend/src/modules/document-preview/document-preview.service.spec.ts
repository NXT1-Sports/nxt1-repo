import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { UniversalFileDoc } from '@nxt1/core';
import {
  DocumentPreviewRequestError,
  DocumentPreviewService,
  DocumentPreviewUnavailableError,
} from './document-preview.service.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function buildFile(params: {
  id: string;
  title: string;
  mimeType: string;
  kind?: 'csv' | 'pdf' | 'pptx' | 'doc';
  sizeBytes?: number;
  updatedAt?: string;
}): UniversalFileDoc {
  return {
    id: params.id,
    teamId: 'team-1',
    title: params.title,
    normalizedTitle: params.title.toLowerCase(),
    type: 'file',
    payloadKind: 'native',
    payload: {
      asset: {
        mimeType: params.mimeType,
        kind: params.kind ?? 'csv',
        origin: 'files_upload',
        sizeBytes: params.sizeBytes ?? 100,
        url: `https://cdn.example.com/${params.id}`,
        storagePath: `teams/team-1/${params.id}`,
      },
    },
    status: 'ready',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: params.updatedAt ?? '2026-06-24T00:00:00.000Z',
  } as UniversalFileDoc;
}

function bucketReturning(buffer: Buffer) {
  const download = vi.fn().mockResolvedValue([buffer]);
  return { bucket: { file: vi.fn().mockReturnValue({ download }) }, download };
}

function editableBucket(buffer: Buffer, generation = '7') {
  const download = vi.fn().mockResolvedValue([buffer]);
  const getMetadata = vi.fn().mockResolvedValue([
    {
      generation,
      contentType: XLSX_MIME,
      metadata: { firebaseStorageDownloadTokens: 'tok-1' },
    },
  ]);
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    bucket: { file: vi.fn().mockReturnValue({ download, getMetadata, save }) },
    save,
  };
}

async function buildWorkbookBuffer(build: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('DocumentPreviewService', () => {
  beforeEach(() => {
    DocumentPreviewService.clearManifestCache();
  });

  it('generates a preview manifest for CSV spreadsheets', async () => {
    const csvContent =
      'Player,Position,Height,Weight\nJohn Keller,QB,6-2,215\nMarcus Ray,WR,6-1,195\n';
    const { bucket } = bucketReturning(Buffer.from(csvContent, 'utf-8'));

    const manifest = await DocumentPreviewService.getPreviewManifest({
      file: buildFile({ id: 'file-csv-1', title: 'Roster.csv', mimeType: 'text/csv' }),
      bucket,
    });

    expect(manifest.documentId).toBe('file-csv-1');
    expect(manifest.documentType).toBe('spreadsheet');
    expect(manifest.fileName).toBe('Roster.csv');
    expect(manifest.sheets).toHaveLength(1);
    expect(manifest.sheets?.[0]?.name).toBe('Sheet 1');
    expect(manifest.sheets?.[0]?.rowCount).toBe(3);
    expect(manifest.sheets?.[0]?.columnCount).toBe(4);
  });

  it('queries spreadsheet cell range data accurately', async () => {
    const csvContent = 'Header1,Header2\nValue1,Value2\nValue3,Value4\n';
    const { bucket } = bucketReturning(Buffer.from(csvContent, 'utf-8'));

    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'file-csv-2', title: 'Table.csv', mimeType: 'text/csv' }),
      bucket,
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    });

    expect(range.totalRows).toBe(3);
    expect(range.cells).toHaveLength(4);
    expect(range.cells[0]).toMatchObject({ row: 1, col: 1, value: 'Header1', isHeader: true });
    expect(range.cells[1]).toMatchObject({ row: 1, col: 2, value: 'Header2', isHeader: true });
    expect(range.cells[2]).toMatchObject({ row: 2, col: 1, value: 'Value1', isHeader: false });
    expect(range.cells[3]).toMatchObject({ row: 2, col: 2, value: 'Value2', isHeader: false });
  });

  it('parses XLSX uploads tagged with kind "csv" through ExcelJS', async () => {
    const buffer = await buildWorkbookBuffer((workbook) => {
      workbook.addWorksheet('Roster').addRow(['Name', 'Pos']);
      workbook.addWorksheet('Depth').addRow(['QB1']);
    });
    const { bucket } = bucketReturning(buffer);

    const manifest = await DocumentPreviewService.getPreviewManifest({
      file: buildFile({ id: 'xlsx-1', title: 'Roster.xlsx', mimeType: XLSX_MIME, kind: 'csv' }),
      bucket,
    });

    expect(manifest.sheets?.map((sheet) => sheet.name)).toEqual(['Roster', 'Depth']);
    expect(manifest.pageCount).toBe(2);
  });

  it('handles a BOM, embedded inch quotes, and ragged rows in CSV', async () => {
    const csvContent = '﻿Name,Height\nJohn,6\'2"\nMarcus,6\'1",extra\n';
    const { bucket } = bucketReturning(Buffer.from(csvContent, 'utf-8'));
    const file = buildFile({ id: 'csv-bom', title: 'Heights.csv', mimeType: 'text/csv' });

    const manifest = await DocumentPreviewService.getPreviewManifest({ file, bucket });
    expect(manifest.sheets?.[0]?.columnCount).toBe(3);

    const range = await DocumentPreviewService.getSpreadsheetRange({ file, bucket });
    expect(range.totalCols).toBe(3);
    expect(range.cells[0]).toMatchObject({ row: 1, col: 1, value: 'Name' });
    expect(range.cells.find((c) => c.row === 2 && c.col === 2)?.value).toBe('6\'2"');
  });

  it('detects semicolon-delimited CSV', async () => {
    const csvContent = 'Name;Position;Weight\nJohn;QB;215,5\n';
    const { bucket } = bucketReturning(Buffer.from(csvContent, 'utf-8'));

    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'csv-semi', title: 'Euro.csv', mimeType: 'text/csv' }),
      bucket,
    });

    expect(range.totalCols).toBe(3);
    expect(range.cells.find((c) => c.row === 2 && c.col === 3)?.value).toBe('215,5');
  });

  it('parses TSV files via the CSV path', async () => {
    const { bucket } = bucketReturning(Buffer.from('A\tB\n1\t2\n', 'utf-8'));
    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'tsv-1', title: 'Data.tsv', mimeType: 'text/tab-separated-values' }),
      bucket,
    });
    expect(range.totalCols).toBe(2);
    expect(range.cells.find((c) => c.row === 2 && c.col === 2)?.value).toBe('2');
  });

  it('reports failed downloads as unavailable and does not cache them', async () => {
    const download = vi.fn().mockRejectedValue(new Error('network'));
    const bucket = { file: vi.fn().mockReturnValue({ download }) };
    const file = buildFile({ id: 'fail-1', title: 'Roster.xlsx', mimeType: XLSX_MIME });

    await expect(DocumentPreviewService.getPreviewManifest({ file, bucket })).rejects.toMatchObject(
      {
        reason: 'render_failed',
      }
    );

    const buffer = await buildWorkbookBuffer((workbook) => {
      workbook.addWorksheet('Roster').addRow(['Name']);
    });
    download.mockResolvedValue([buffer]);
    const manifest = await DocumentPreviewService.getPreviewManifest({ file, bucket });
    expect(manifest.sheets).toHaveLength(1);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('reports corrupt workbooks and legacy formats as unavailable', async () => {
    const { bucket } = bucketReturning(Buffer.from('PK\u0003\u0004garbage', 'latin1'));
    await expect(
      DocumentPreviewService.getPreviewManifest({
        file: buildFile({ id: 'corrupt', title: 'Bad.xlsx', mimeType: XLSX_MIME }),
        bucket,
      })
    ).rejects.toBeInstanceOf(DocumentPreviewUnavailableError);

    await expect(
      DocumentPreviewService.getPreviewManifest({
        file: buildFile({
          id: 'legacy',
          title: 'Old.xls',
          mimeType: 'application/vnd.ms-excel',
        }),
        bucket,
      })
    ).rejects.toMatchObject({ reason: 'unsupported_format' });
  });

  it('reports oversized files as file_too_large', async () => {
    const { bucket, download } = bucketReturning(Buffer.from('a,b'));
    await expect(
      DocumentPreviewService.getPreviewManifest({
        file: buildFile({
          id: 'huge',
          title: 'Huge.csv',
          mimeType: 'text/csv',
          sizeBytes: 60 * 1024 * 1024,
        }),
        bucket,
      })
    ).rejects.toMatchObject({ reason: 'file_too_large' });
    expect(download).not.toHaveBeenCalled();
  });

  it('returns the caller-provided pdfUrl on cache hits', async () => {
    const { bucket } = bucketReturning(Buffer.from('a,b\n1,2\n'));
    const file = buildFile({ id: 'cache-url', title: 'T.csv', mimeType: 'text/csv' });

    const first = await DocumentPreviewService.getPreviewManifest({
      file,
      bucket,
      pdfUrl: 'https://signed/1',
    });
    const second = await DocumentPreviewService.getPreviewManifest({
      file,
      bucket,
      pdfUrl: 'https://signed/2',
    });
    expect(first.pdfUrl).toBe('https://signed/1');
    expect(second.pdfUrl).toBe('https://signed/2');
  });

  it('unwraps multipart-framed exports before parsing', async () => {
    const real = await buildWorkbookBuffer((workbook) => {
      workbook.addWorksheet('Plan').addRow(['Drill']);
    });
    const wrapped = Buffer.concat([
      Buffer.from(`--b123\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`, 'latin1'),
      real,
      Buffer.from('\r\n--b123--\r\n', 'latin1'),
    ]);
    const { bucket } = bucketReturning(wrapped);

    const manifest = await DocumentPreviewService.getPreviewManifest({
      file: buildFile({ id: 'wrapped', title: 'Plan.xlsx', mimeType: XLSX_MIME }),
      bucket,
    });
    expect(manifest.sheets?.[0]?.name).toBe('Plan');
  });

  it('formats XLSX dates, percents, formulas, rich text, hyperlinks, and merged cells', async () => {
    const buffer = await buildWorkbookBuffer((workbook) => {
      const ws = workbook.addWorksheet('Stats');
      ws.getCell('A1').value = new Date(Date.UTC(2026, 8, 5));
      ws.getCell('B1').value = 0.125;
      ws.getCell('B1').numFmt = '0.0%';
      ws.getCell('C1').value = { formula: 'B1*2', result: 0.25 };
      ws.getCell('D1').value = { richText: [{ text: 'Go ' }, { text: 'Team' }] };
      ws.getCell('E1').value = { text: 'Site', hyperlink: 'https://example.com' };
      ws.getCell('A2').value = 'Merged';
      ws.mergeCells('A2:C2');
      ws.getCell('D2').value = new Date(Date.UTC(2026, 8, 5, 14, 30));
      ws.getCell('E2').value = 0.5;
      ws.getCell('E2').numFmt = '0%';
    });
    const { bucket } = bucketReturning(buffer);

    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'fmt', title: 'Stats.xlsx', mimeType: XLSX_MIME }),
      bucket,
      sheetId: '1',
    });
    const at = (row: number, col: number) =>
      range.cells.find((c) => c.row === row && c.col === col);

    expect(at(1, 1)).toMatchObject({ value: '2026-09-05', formattedValue: '2026-09-05' });
    expect(at(1, 2)).toMatchObject({ value: 0.125, formattedValue: '12.5%' });
    expect(at(1, 3)).toMatchObject({ value: 0.25, formula: 'B1*2' });
    expect(at(1, 4)).toMatchObject({ value: 'Go Team' });
    expect(at(1, 5)).toMatchObject({ value: 'Site' });
    expect(at(2, 1)).toMatchObject({ value: 'Merged' });
    expect(at(2, 2)).toBeUndefined();
    expect(at(2, 3)).toBeUndefined();
    expect(at(2, 4)?.formattedValue).toBe('2026-09-05 14:30');
    expect(at(2, 5)?.formattedValue).toBe('50%');
    expect(range.cells.some((c) => String(c.formattedValue).includes('[object Object]'))).toBe(
      false
    );
  });

  it('carries fills, font styles, alignment, merge spans, and column widths for XLSX', async () => {
    const buffer = await buildWorkbookBuffer((workbook) => {
      const ws = workbook.addWorksheet('Depth');
      ws.getColumn(1).width = 20;
      ws.getCell('A1').value = 'Title';
      ws.mergeCells('A1:C1');
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell('A1').alignment = { horizontal: 'center' };
      // Color-coded row, including an empty styled cell.
      ws.getCell('A2').value = 'Starter';
      for (const addr of ['A2', 'B2']) {
        ws.getCell(addr).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { theme: 9, tint: 0.7999816888943144 },
        };
      }
      ws.getCell('C2').value = 1234.5;
      ws.getCell('C2').numFmt = '$#,##0.00';
      ws.getCell('C2').font = { italic: true, color: { indexed: 10 } };
    });
    const { bucket } = bucketReturning(buffer);

    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'styled', title: 'Depth.xlsx', mimeType: XLSX_MIME }),
      bucket,
    });
    const at = (row: number, col: number) =>
      range.cells.find((c) => c.row === row && c.col === col);

    expect(at(1, 1)).toMatchObject({
      value: 'Title',
      isBold: true,
      colSpan: 3,
      rowSpan: 1,
      style: { backgroundColor: '#1f4e78', fontColor: '#ffffff', horizontalAlign: 'center' },
    });
    expect(at(1, 1)?.isHeader).toBeUndefined();
    expect(at(1, 2)).toBeUndefined();
    expect(at(2, 1)?.style?.backgroundColor).toBe('#e2f0d9');
    expect(at(2, 2)).toMatchObject({ value: null, style: { backgroundColor: '#e2f0d9' } });
    expect(at(2, 3)).toMatchObject({
      formattedValue: '$1,234.50',
      style: { isItalic: true, fontColor: '#ff0000' },
    });
    expect(range.columnWidths?.[0]).toBe(20);
    expect(range.columnWidths?.[1]).toBeNull();
  });

  it('looks up worksheets by numeric id, then name, and 404s unknown sheets', async () => {
    const buffer = await buildWorkbookBuffer((workbook) => {
      workbook.addWorksheet('First').addRow(['one']);
      workbook.addWorksheet('Second').addRow(['two']);
    });
    const { bucket } = bucketReturning(buffer);
    const file = buildFile({ id: 'sheets', title: 'Book.xlsx', mimeType: XLSX_MIME });

    const byId = await DocumentPreviewService.getSpreadsheetRange({ file, bucket, sheetId: '2' });
    expect(byId.cells[0]?.value).toBe('two');

    const byName = await DocumentPreviewService.getSpreadsheetRange({
      file,
      bucket,
      sheetId: 'Second',
    });
    expect(byName.cells[0]?.value).toBe('two');

    await expect(
      DocumentPreviewService.getSpreadsheetRange({ file, bucket, sheetId: '99' })
    ).rejects.toBeInstanceOf(DocumentPreviewRequestError);
  });

  it('clamps oversized range requests to the cell budget instead of throwing', async () => {
    const { bucket } = bucketReturning(Buffer.from('a,b\n1,2\n'));
    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: buildFile({ id: 'clamp', title: 'C.csv', mimeType: 'text/csv' }),
      bucket,
      startRow: 1,
      endRow: 100_000,
      startCol: 1,
      endCol: 100_000,
    });
    const cellCount = (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
    expect(cellCount).toBeLessThanOrEqual(5_000);
    expect(range.endCol).toBe(51);
  });

  describe('updateSpreadsheetCells', () => {
    it('writes typed values into XLSX cells, keeps formatting, and preserves storage metadata', async () => {
      const buffer = await buildWorkbookBuffer((workbook) => {
        const ws = workbook.addWorksheet('Roster');
        ws.getCell('A1').value = 'Name';
        ws.getCell('A1').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' },
        };
        ws.getCell('B2').numFmt = '$#,##0.00';
        ws.getCell('C1').value = 'Merged';
        ws.mergeCells('C1:D1');
      });
      const { bucket, save } = editableBucket(buffer);

      const result = await DocumentPreviewService.updateSpreadsheetCells({
        file: buildFile({ id: 'edit-xlsx', title: 'Roster.xlsx', mimeType: XLSX_MIME }),
        bucket,
        sheetId: '1',
        edits: [
          { row: 1, col: 1, value: 'Player' },
          { row: 2, col: 2, value: '$1,250.5' },
          { row: 1, col: 4, value: 'Into merge' },
          { row: 3, col: 1, value: '2026-09-05' },
        ],
      });

      expect(result.cells[0]).toMatchObject({
        row: 1,
        col: 1,
        value: 'Player',
        style: { backgroundColor: '#ffc000' },
      });
      expect(result.cells[1]).toMatchObject({ value: 1250.5, formattedValue: '$1,250.50' });
      // Edits to a covered merge cell land on the merge's top-left cell.
      expect(result.cells[2]).toMatchObject({ row: 1, col: 3, value: 'Into merge' });

      const [savedBuffer, options] = save.mock.calls[0]!;
      expect(options).toMatchObject({
        resumable: false,
        metadata: {
          contentType: XLSX_MIME,
          metadata: { firebaseStorageDownloadTokens: 'tok-1' },
        },
        preconditionOpts: { ifGenerationMatch: 7 },
      });
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(savedBuffer as unknown as ArrayBuffer);
      const ws = reloaded.getWorksheet('Roster')!;
      expect(ws.getCell('A1').value).toBe('Player');
      expect((ws.getCell('A1').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFFC000');
      expect(ws.getCell('B2').value).toBe(1250.5);
      expect(ws.getCell('A3').value).toEqual(new Date(Date.UTC(2026, 8, 5)));
      expect(result.cells[3]).toMatchObject({ formattedValue: '2026-09-05' });
      expect(result.sizeBytes).toBe((savedBuffer as Buffer).length);
    });

    it('saves column widths and row heights, and reads them back in range data', async () => {
      const buffer = await buildWorkbookBuffer((workbook) => {
        workbook.addWorksheet('Sizes').addRows([
          ['a', 'b'],
          ['c', 'd'],
        ]);
      });
      const { bucket, save } = editableBucket(buffer);
      const file = buildFile({ id: 'sizes', title: 'Sizes.xlsx', mimeType: XLSX_MIME });

      const result = await DocumentPreviewService.updateSpreadsheetCells({
        file,
        bucket,
        edits: [],
        columnWidths: [{ col: 2, width: 30 }],
        rowHeights: [{ row: 2, height: 42 }],
      });
      expect(result.saved).toBe(true);

      const savedBuffer = save.mock.calls[0]![0] as Buffer;
      const range = await DocumentPreviewService.getSpreadsheetRange({
        file,
        bucket: bucketReturning(savedBuffer).bucket,
        endCol: 2,
        endRow: 2,
      });
      expect(range.columnWidths).toEqual([null, 30]);
      expect(range.rowHeights).toEqual([null, 42]);
    });

    it('treats resize-only requests on CSV as a no-op', async () => {
      const { bucket, save } = editableBucket(Buffer.from('a,b\n'));
      const result = await DocumentPreviewService.updateSpreadsheetCells({
        file: buildFile({ id: 'csv-size', title: 'Data.csv', mimeType: 'text/csv' }),
        bucket,
        edits: [],
        columnWidths: [{ col: 1, width: 20 }],
      });
      expect(result.saved).toBe(false);
      expect(save).not.toHaveBeenCalled();
    });

    it('edits CSV text in place and keeps its delimiter', async () => {
      const { bucket, save } = editableBucket(Buffer.from('a;b\n1;2\n'));
      const result = await DocumentPreviewService.updateSpreadsheetCells({
        file: buildFile({ id: 'edit-csv', title: 'Data.csv', mimeType: 'text/csv' }),
        bucket,
        edits: [
          { row: 2, col: 2, value: 'x;y' },
          { row: 3, col: 1, value: 'new' },
        ],
      });

      expect(result.cells[0]).toMatchObject({ row: 2, col: 2, value: 'x;y' });
      expect((save.mock.calls[0]![0] as Buffer).toString('utf-8')).toBe('a;b\n1;"x;y"\nnew\n');
    });

    it('refuses workbooks whose charts or pivots ExcelJS would drop', async () => {
      const zipWithChart = Buffer.concat([
        Buffer.from('PK\u0003\u0004'),
        Buffer.from('xl/charts/chart1.xml'),
      ]);
      const { bucket, save } = editableBucket(zipWithChart);
      await expect(
        DocumentPreviewService.updateSpreadsheetCells({
          file: buildFile({ id: 'chart', title: 'Chart.xlsx', mimeType: XLSX_MIME }),
          bucket,
          edits: [{ row: 1, col: 1, value: 'x' }],
        })
      ).rejects.toMatchObject({ reason: 'unsupported_format' });
      expect(save).not.toHaveBeenCalled();
    });

    it('reports a storage generation mismatch as a 409 conflict', async () => {
      const buffer = await buildWorkbookBuffer((workbook) => {
        workbook.addWorksheet('S').addRow(['a']);
      });
      const { bucket, save } = editableBucket(buffer);
      save.mockRejectedValueOnce(Object.assign(new Error('precondition'), { code: 412 }));

      await expect(
        DocumentPreviewService.updateSpreadsheetCells({
          file: buildFile({ id: 'race', title: 'Race.xlsx', mimeType: XLSX_MIME }),
          bucket,
          edits: [{ row: 1, col: 1, value: 'b' }],
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
