import { describe, expect, it } from 'vitest';
import { getAgentExportFormatDisplayName } from './export-format';

describe('getAgentExportFormatDisplayName', () => {
  it.each([
    ['pdf', 'PDF document'],
    ['csv', 'CSV spreadsheet'],
    ['xlsx', 'Excel spreadsheet'],
    ['pptx', 'PowerPoint presentation'],
    ['docx', 'Word document'],
  ])('returns the display name for %s', (format, displayName) => {
    expect(getAgentExportFormatDisplayName(format)).toBe(displayName);
  });

  it('normalizes case and whitespace', () => {
    expect(getAgentExportFormatDisplayName(' DOCX ')).toBe('Word document');
  });

  it('returns null for unsupported formats and non-string values', () => {
    expect(getAgentExportFormatDisplayName('html')).toBeNull();
    expect(getAgentExportFormatDisplayName(null)).toBeNull();
  });
});
