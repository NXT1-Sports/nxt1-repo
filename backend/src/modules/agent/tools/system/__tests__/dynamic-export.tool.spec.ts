import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicExportTool } from '../dynamic-export.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';

describe('DynamicExportTool', () => {
  const generateXlsx = vi.fn();
  const generatePdf = vi.fn();
  const emitStage = vi.fn();
  const fileSave = vi.fn();
  const fileExists = vi.fn();
  const bucketFile = vi.fn();
  const bucket = vi.fn();

  let tool: DynamicExportTool;
  let context: ToolExecutionContext;

  beforeEach(() => {
    generateXlsx.mockReset();
    generatePdf.mockReset();
    emitStage.mockReset();
    fileSave.mockReset();
    fileExists.mockReset();
    bucketFile.mockReset();
    bucket.mockReset();

    generateXlsx.mockResolvedValue(Buffer.from('xlsx-binary'));
    generatePdf.mockResolvedValue(Buffer.from('%PDF-test'));
    fileSave.mockResolvedValue(undefined);
    fileExists.mockResolvedValue([true]);
    bucketFile.mockReturnValue({
      save: fileSave,
      exists: fileExists,
    });
    bucket.mockReturnValue({ file: bucketFile });

    tool = new DynamicExportTool({
      generateCsv: vi.fn(),
      generateXlsx,
      generatePdf,
    } as never);

    Object.assign(tool as object, {
      resolveStorage: () => ({ bucket }),
    });

    context = {
      threadId: 'thread-123',
      userId: 'user-123',
      environment: 'staging',
      emitStage,
    };
  });

  it('should generate section-only XLSX exports without top-level rows', async () => {
    const result = await tool.execute(
      {
        format: 'xlsx',
        fileName: 'callsheet',
        title: 'Test Callsheet',
        layoutMode: 'multi_column_grid',
        pageOrientation: 'landscape',
        pageSize: 'LEGAL',
        sections: [
          {
            title: '1st Down Calls',
            columns: [
              { key: 'play', label: 'Play' },
              { key: 'notes', label: 'Notes' },
            ],
            rows: [
              ['Split Zone Read', 'Best vs Cover 2'],
              ['Counter Trey', 'Downhill answer'],
            ],
          },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(generateXlsx).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          ['Split Zone Read', 'Best vs Cover 2'],
          ['Counter Trey', 'Downhill answer'],
        ],
        sections: [
          expect.objectContaining({
            rows: [
              ['Split Zone Read', 'Best vs Cover 2'],
              ['Counter Trey', 'Downhill answer'],
            ],
          }),
        ],
        layoutMode: 'multi_column_grid',
        pageOrientation: 'landscape',
        pageSize: 'LEGAL',
      })
    );
    expect(emitStage).toHaveBeenCalledWith(
      'submitting_job',
      expect.objectContaining({
        rowCount: 2,
        format: 'xlsx',
      })
    );
  });

  it('should forward PDF layout mode and watermark options', async () => {
    const result = await tool.execute(
      {
        format: 'pdf',
        fileName: 'game-plan',
        title: 'Game Plan',
        layoutMode: 'multi_column_grid',
        pageOrientation: 'landscape',
        watermarkText: 'DRAFT',
        sections: [
          {
            title: 'Opponent Strengths',
            gridColumn: 1,
            bodyParagraphs: ['Film: https://example.com/clip'],
          },
          {
            title: 'Our Answers',
            gridColumn: 2,
            bulletPoints: ['Tempo', 'Formation stress'],
          },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(generatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        layoutMode: 'multi_column_grid',
        pageOrientation: 'landscape',
        watermarkText: 'DRAFT',
      })
    );
  });
});
