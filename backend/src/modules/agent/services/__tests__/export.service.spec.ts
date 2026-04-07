/**
 * @fileoverview Unit Tests — ExportService (CSV & PDF Generation)
 * @module @nxt1/backend/modules/agent/services
 *
 * Tests CSV generation (UTF-8 BOM, column headers, row data) and
 * PDF generation (valid PDF buffer output).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { ExportService } from '../export.service.js';
import type { CsvExportOptions, PdfExportOptions } from '../export.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sampleColumns = [
  { key: 'name', label: 'Name' },
  { key: 'sport', label: 'Sport' },
  { key: 'gpa', label: 'GPA' },
] as const;

const sampleRows = [
  ['John Doe', 'Football', '3.8'],
  ['Jane Smith', 'Basketball', '3.9'],
  ['Alex Johnson', 'Soccer', '3.5'],
];

function csvOpts(overrides?: Partial<CsvExportOptions>): CsvExportOptions {
  return {
    columns: [...sampleColumns],
    rows: [...sampleRows],
    ...overrides,
  };
}

function pdfOpts(overrides?: Partial<PdfExportOptions>): PdfExportOptions {
  return {
    title: 'Test Report',
    description: 'A test PDF document.',
    includeTable: true,
    columns: [...sampleColumns],
    rows: [...sampleRows],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    service = new ExportService();
  });

  // ── CSV ──────────────────────────────────────────────────────────────────

  describe('generateCsv', () => {
    it('should return a Buffer', () => {
      const result = service.generateCsv(csvOpts());
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should start with UTF-8 BOM for Excel compatibility', () => {
      const result = service.generateCsv(csvOpts());
      const str = result.toString('utf-8');
      expect(str.charCodeAt(0)).toBe(0xfeff);
    });

    it('should include column labels as header row', () => {
      const result = service.generateCsv(csvOpts());
      const str = result.toString('utf-8');
      const firstLine = str.split('\n')[0];
      expect(firstLine).toContain('"Name"');
      expect(firstLine).toContain('"Sport"');
      expect(firstLine).toContain('"GPA"');
    });

    it('should include all data rows', () => {
      const result = service.generateCsv(csvOpts());
      const str = result.toString('utf-8');
      const lines = str.trim().split('\n');
      // 1 header + 3 data rows
      expect(lines).toHaveLength(4);
      expect(str).toContain('John Doe');
      expect(str).toContain('Jane Smith');
      expect(str).toContain('Alex Johnson');
    });

    it('should handle empty rows', () => {
      const result = service.generateCsv(csvOpts({ rows: [] }));
      const str = result.toString('utf-8');
      const lines = str.trim().split('\n');
      // Only header row
      expect(lines).toHaveLength(1);
      expect(str).toContain('"Name"');
    });

    it('should handle single column', () => {
      const result = service.generateCsv(
        csvOpts({
          columns: [{ key: 'id', label: 'ID' }],
          rows: [['1'], ['2'], ['3']],
        })
      );
      const str = result.toString('utf-8');
      expect(str).toContain('"ID"');
      expect(str).toContain('"1"');
    });

    it('should quote values containing commas', () => {
      const result = service.generateCsv(
        csvOpts({
          columns: [{ key: 'name', label: 'Name' }],
          rows: [['Doe, John']],
        })
      );
      const str = result.toString('utf-8');
      expect(str).toContain('"Doe, John"');
    });
  });

  // ── PDF ──────────────────────────────────────────────────────────────────

  describe('generatePdf', () => {
    it('should return a Buffer', async () => {
      const result = await service.generatePdf(pdfOpts());
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should generate a valid PDF (starts with %PDF header)', async () => {
      const result = await service.generatePdf(pdfOpts());
      const header = result.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should produce non-empty output', async () => {
      const result = await service.generatePdf(pdfOpts());
      expect(result.length).toBeGreaterThan(100);
    });

    it('should generate PDF with only body paragraphs (no table)', async () => {
      const result = await service.generatePdf(
        pdfOpts({
          includeTable: false,
          columns: undefined,
          rows: undefined,
          bodyParagraphs: ['This is paragraph one.', 'This is paragraph two.'],
        })
      );
      const header = result.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should generate PDF with only bullet points', async () => {
      const result = await service.generatePdf(
        pdfOpts({
          includeTable: false,
          columns: undefined,
          rows: undefined,
          bulletPoints: ['Point A', 'Point B', 'Point C'],
        })
      );
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(100);
    });

    it('should generate PDF with all sections combined', async () => {
      const result = await service.generatePdf(
        pdfOpts({
          bodyParagraphs: ['Intro paragraph.'],
          bulletPoints: ['First bullet', 'Second bullet'],
          includeTable: true,
        })
      );
      const header = result.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should use custom footer text when provided', async () => {
      const result = await service.generatePdf(pdfOpts({ footerText: 'Custom Footer' }));
      // Can't easily inspect rendered text, but should not throw
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle title-only PDF (no table, no body, no bullets)', async () => {
      const result = await service.generatePdf(
        pdfOpts({
          includeTable: false,
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: undefined,
        })
      );
      const header = result.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });
  });
});
