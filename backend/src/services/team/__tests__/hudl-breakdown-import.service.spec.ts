import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  parseHudlBreakdownBuffer,
  parseHudlBreakdownRows,
} from '../hudl-breakdown-import.service.js';

describe('Hudl breakdown import service', () => {
  it('maps Hudl-style football rows into tagged film review timeline plays', () => {
    const result = parseHudlBreakdownRows(
      [
        ['Play #', 'ODK', 'QTR', 'DN', 'DIST', 'YARD LN', 'OFF PLAY', 'PLAY TYPE', 'GN/LS'],
        [1, 'O', 1, 1, 10, '-35', 'Inside Zone', 'Run', 6],
        [2, 'O', 1, 2, 4, '-41', 'Boot Pass', 'Pass', 14],
      ],
      'football'
    );

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]).toEqual(
      expect.objectContaining({
        number: 1,
        label: 'Run',
        startSec: 0,
        endSec: 8,
        confidence: 0.55,
        tags: expect.objectContaining({
          odk: 'O',
          quarter: '1',
          down: 1,
          distance: 10,
          yardLine: '-35',
          offPlay: 'Inside Zone',
          playType: 'Run',
          gainLoss: '6',
        }),
      })
    );
    expect(result.warnings).toContain(
      'No explicit video start/end columns were found; play timing was estimated from row order.'
    );
  });

  it('parses an xlsx workbook export and preserves the worksheet name', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Hudl Export');
    worksheet.addRows([
      ['Play #', 'Start Time', 'End Time', 'ODK', 'DN', 'DIST', 'OFF PLAY'],
      [1, '00:12', '00:20', 'O', 1, 10, 'Power'],
      [2, '00:21', '00:28', 'D', 2, 6, 'Counter'],
    ]);

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(workbookBuffer);

    const result = await parseHudlBreakdownBuffer({
      buffer,
      fileName: 'hudl-breakdown.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sport: 'football',
    });

    expect(result.sheetName).toBe('Hudl Export');
    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]).toEqual(
      expect.objectContaining({
        label: 'Power',
        startSec: 12,
        endSec: 20,
        confidence: 0.9,
        tags: expect.objectContaining({
          offPlay: 'Power',
        }),
      })
    );
  });
});
