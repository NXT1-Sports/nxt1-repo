import { describe, expect, it } from 'vitest';
import {
  buildAttachmentContentDisposition,
  buildExportFileName,
} from './export-multipart-payload.js';

describe('buildExportFileName', () => {
  it('replaces a mismatched document extension instead of doubling it', () => {
    expect(buildExportFileName('Roster.pdf', 'xlsx', 'export')).toBe('Roster.xlsx');
    expect(buildExportFileName('Report.html', 'pdf', 'document')).toBe('Report.pdf');
  });

  it('keeps Unicode letters and strips path and header-unsafe characters', () => {
    expect(buildExportFileName('Équipe Rapport', 'pdf', 'export')).toBe('Équipe Rapport.pdf');
    expect(buildExportFileName('../a/b:"c"?.docx', 'docx', 'export')).toBe('a b c.docx');
  });

  it('truncates the base name only, so the extension survives', () => {
    const name = buildExportFileName(`${'x'.repeat(150)}.xlsx`, 'xlsx', 'artifact');
    expect(name.endsWith('.xlsx')).toBe(true);
    expect(name.length).toBe(105);
  });

  it('falls back when nothing usable remains', () => {
    expect(buildExportFileName('///', 'csv', 'export')).toBe('export.csv');
  });
});

describe('buildAttachmentContentDisposition', () => {
  it('emits an ASCII fallback plus an RFC 5987 name for non-ASCII files', () => {
    expect(buildAttachmentContentDisposition('Équipe "A".pdf', 'inline')).toBe(
      `inline; filename="_quipe _A_.pdf"; filename*=UTF-8''%C3%89quipe%20%22A%22.pdf`
    );
  });
});
