import { describe, expect, it, vi } from 'vitest';
import type { UniversalFileDoc } from '@nxt1/core';
import { DocumentPreviewService } from './document-preview.service.js';

describe('DocumentPreviewService', () => {
  it('generates a preview manifest for CSV spreadsheets', async () => {
    const csvContent =
      'Player,Position,Height,Weight\nJohn Keller,QB,6-2,215\nMarcus Ray,WR,6-1,195\n';
    const mockFile: UniversalFileDoc = {
      id: 'file-csv-1',
      teamId: 'team-1',
      title: 'Roster.csv',
      normalizedTitle: 'roster.csv',
      type: 'file',
      payloadKind: 'native',
      payload: {
        asset: {
          mimeType: 'text/csv',
          kind: 'csv',
          origin: 'files_upload',
          sizeBytes: csvContent.length,
          url: 'https://cdn.example.com/roster.csv',
          storagePath: 'teams/team-1/roster.csv',
        },
      },
      status: 'ready',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    };

    const mockBucket = {
      file: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue([Buffer.from(csvContent, 'utf-8')]),
      }),
    };

    const manifest = await DocumentPreviewService.getPreviewManifest({
      file: mockFile,
      bucket: mockBucket,
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
    const mockFile: UniversalFileDoc = {
      id: 'file-csv-2',
      teamId: 'team-1',
      title: 'Table.csv',
      normalizedTitle: 'table.csv',
      type: 'file',
      payloadKind: 'native',
      payload: {
        asset: {
          mimeType: 'text/csv',
          kind: 'csv',
          origin: 'files_upload',
          sizeBytes: csvContent.length,
          url: 'https://cdn.example.com/table.csv',
          storagePath: 'teams/team-1/table.csv',
        },
      },
      status: 'ready',
      createdAt: '2026-06-24T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    };

    const mockBucket = {
      file: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue([Buffer.from(csvContent, 'utf-8')]),
      }),
    };

    const range = await DocumentPreviewService.getSpreadsheetRange({
      file: mockFile,
      bucket: mockBucket,
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
});
