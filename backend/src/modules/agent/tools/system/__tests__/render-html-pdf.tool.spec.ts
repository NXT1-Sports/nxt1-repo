import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../base.tool.js';
import { ToolRegistry } from '../../tool-registry.js';
import { RenderHtmlPdfTool } from '../render-html-pdf.tool.js';

describe('RenderHtmlPdfTool', () => {
  const render = vi.fn();
  const emitStage = vi.fn();
  const fileSave = vi.fn();
  const fileExists = vi.fn();
  const bucketFile = vi.fn();
  const bucket = vi.fn();

  let tool: RenderHtmlPdfTool;
  let context: ToolExecutionContext;

  beforeEach(() => {
    render.mockReset();
    emitStage.mockReset();
    fileSave.mockReset();
    fileExists.mockReset();
    bucketFile.mockReset();
    bucket.mockReset();

    render.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7\n/Type /Page\n%%EOF'),
      metadata: {
        engine: 'e2b-playwright',
        pageSize: 'LETTER',
        orientation: 'landscape',
        expectedPageCount: 1,
        pageCount: 1,
        verified: true,
        warnings: [],
      },
    });
    fileSave.mockResolvedValue(undefined);
    fileExists.mockResolvedValue([true]);
    bucketFile.mockReturnValue({ save: fileSave, exists: fileExists });
    bucket.mockReturnValue({ file: bucketFile });

    tool = new RenderHtmlPdfTool({ render });
    Object.assign(tool as object, {
      resolveStorage: () => ({ bucket }),
    });

    context = {
      threadId: 'thread-123',
      userId: 'user-123',
      environment: 'staging',
      operationId: 'operation-123',
      emitStage,
    };
  });

  it('renders and uploads an exact-match HTML PDF export', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><head><style>@page{size:Letter landscape;margin:0}.sheet{position:relative;width:11in;height:8.5in}.card{position:absolute;left:1in;top:1in;width:1in;height:.6in}</style></head><body><main class="sheet"><section class="card">Depth chart</section></main></body></html>',
        fileName: 'Depth Chart',
        pageSize: 'LETTER',
        orientation: 'landscape',
        expectedPageCount: 1,
        layoutIntent: 'exact_match',
        relatedDocumentId: 'doc-1',
        sourceDocumentIds: ['source-doc-1'],
        sourceAttachmentIds: ['source-attachment-1'],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 'LETTER',
        orientation: 'landscape',
        expectedPageCount: 1,
      })
    );
    expect(bucketFile).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^Users\/user-123\/threads\/thread-123\/exports\/\d+-[a-f0-9]{8}\.pdf$/)
    );
    expect(bucketFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /^Users\/user-123\/threads\/thread-123\/exports\/\d+-[a-f0-9]{8}\.html$/
      )
    );
    expect(fileSave).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/pdf',
        resumable: false,
        metadata: expect.objectContaining({
          contentDisposition: 'attachment; filename="Depth Chart.pdf"',
        }),
      })
    );
    expect(fileSave).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('<!doctype html>'),
      expect.objectContaining({
        contentType: 'text/html; charset=utf-8',
        resumable: false,
        metadata: expect.objectContaining({
          contentDisposition: 'attachment; filename="Depth Chart.html"',
        }),
      })
    );
    expect(emitStage).toHaveBeenCalledWith(
      'uploading_assets',
      expect.objectContaining({ phase: 'upload_html_pdf_export' })
    );
    expect(emitStage).toHaveBeenCalledWith(
      'persisting_result',
      expect.objectContaining({ phase: 'create_html_pdf_download_links' })
    );
    expect(result).toMatchObject({
      data: {
        fileName: 'Depth Chart.pdf',
        mimeType: 'application/pdf',
        format: 'pdf',
        artifactRole: 'export',
        layoutIntent: 'exact_match',
        editableSource: expect.objectContaining({
          name: 'Depth Chart.html',
          mimeType: 'text/html',
          type: 'doc',
          artifactRole: 'source',
        }),
        revisionHint: expect.stringContaining('ask Agent X to adjust this PDF'),
        relatedDocumentId: 'doc-1',
        sourceDocumentIds: ['source-doc-1'],
        sourceAttachmentIds: ['source-attachment-1'],
        artifactGroupId: 'operation-123',
        attachments: [
          expect.objectContaining({
            name: 'Depth Chart.pdf',
            mimeType: 'application/pdf',
            type: 'doc',
            artifactRole: 'export',
          }),
          expect.objectContaining({
            name: 'Depth Chart.html',
            mimeType: 'text/html',
            type: 'doc',
            artifactRole: 'source',
          }),
        ],
      },
    });
  });

  it('renders exact-match exports best-effort instead of blocking on layout lint', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><head><style>.grid{display:flex}.col{flex:1}</style></head><body><main class="grid"><section class="col">Depth chart</section></main></body></html>',
        fileName: 'generic-depth-chart.pdf',
        layoutIntent: 'exact_match',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 'LETTER',
        orientation: 'landscape',
      })
    );
  });

  it('passes custom wristband dimensions through to the renderer', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><head><style>@page{size:4.75in 2.5in;margin:0}body{width:4.75in;height:2.5in}.card{width:100%;height:100%;display:grid;grid-template-columns:1fr 1fr}</style></head><body><main class="card">QB wristband</main></body></html>',
        fileName: 'qb-wristband.pdf',
        layoutIntent: 'exact_match',
        pageWidth: 4.75,
        pageHeight: 2.5,
        pageUnit: 'in',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageWidth: 4.75,
        pageHeight: 2.5,
        pageUnit: 'in',
      })
    );
  });

  it('uses title as a fallback filename when fileName is omitted', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><head><style>@page{size:11in 8.5in landscape;margin:0.15in}.card{width:100%;height:100%;display:flex}</style></head><body><main class="card">Scout team play card</main></body></html>',
        title: 'NXT1 Falcons - Scout Team Play Cards',
        layoutIntent: 'exact_match',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result).toMatchObject({
      data: { fileName: 'NXT1 Falcons - Scout Team Play Cards.pdf' },
    });
  });

  it('defaults to landscape letter best-fit operational exports', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><body>Calls</body></html>',
        fileName: 'callsheet.pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 'LETTER',
        orientation: 'landscape',
      })
    );
    expect(result).toMatchObject({
      data: { fileName: 'callsheet.pdf', layoutIntent: 'best_fit_operational' },
    });
  });

  it('returns a failure when thread context is missing', async () => {
    const result = await tool.execute(
      {
        html: '<!doctype html><html><body>Calls</body></html>',
        fileName: 'callsheet',
      },
      { userId: 'user-123', environment: 'staging' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('no threadId');
  });

  it('returns validation errors for invalid schema input', async () => {
    const result = await tool.execute({ html: '', fileName: '' }, context);

    expect(result.success).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });

  it('exposes render_html_pdf to strategy coordinator registry definitions', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    const definition = registry
      .getDefinitions('strategy_coordinator')
      .find((candidate) => candidate.name === 'render_html_pdf');

    expect(definition).toBeDefined();
    expect(definition?.category).toBe('system');
  });
});
