import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../base.tool.js';
import { ToolRegistry } from '../../tool-registry.js';
import { RenderEditablePptxTool } from '../render-editable-pptx.tool.js';

describe('RenderEditablePptxTool', () => {
  const render = vi.fn();
  const emitStage = vi.fn();
  const fileSave = vi.fn();
  const fileExists = vi.fn();
  const bucketFile = vi.fn();
  const bucket = vi.fn();

  let tool: RenderEditablePptxTool;
  let context: ToolExecutionContext;

  beforeEach(() => {
    render.mockReset();
    emitStage.mockReset();
    fileSave.mockReset();
    fileExists.mockReset();
    bucketFile.mockReset();
    bucket.mockReset();

    render.mockResolvedValue({
      buffer: Buffer.from('PK\x03\x04pptx'),
      metadata: {
        schemaVersion: 'editable-pptx.v1',
        slideCount: 1,
        aspectRatio: 'widescreen_16_9',
        warnings: ['slides[0].elements[2] extends outside 13.333x7.5in slide bounds.'],
        verified: false,
      },
    });
    fileSave.mockResolvedValue(undefined);
    fileExists.mockResolvedValue([true]);
    bucketFile.mockReturnValue({ save: fileSave, exists: fileExists });
    bucket.mockReturnValue({ file: bucketFile });

    tool = new RenderEditablePptxTool({ render });
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

  it('renders and uploads editable PPTX plus schema source artifacts', async () => {
    const result = await tool.execute(
      {
        fileName: 'Staff Briefing',
        title: 'Staff Briefing',
        schemaVersion: 'editable-pptx.v1',
        aspectRatio: 'widescreen_16_9',
        theme: { primaryColor: '#0F766E' },
        relatedDocumentId: 'doc-1',
        sourceDocumentIds: ['source-doc-1'],
        sourceAttachmentIds: ['source-attachment-1'],
        slides: [
          {
            title: 'Overview',
            elements: [
              {
                type: 'text',
                text: 'Editable PowerPoint Briefing',
                x: 0.7,
                y: 0.7,
                w: 7,
                h: 0.5,
                fontSize: 22,
                bold: true,
              },
            ],
          },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 'editable-pptx.v1',
        title: 'Staff Briefing',
        aspectRatio: 'widescreen_16_9',
        slides: expect.any(Array),
      })
    );
    expect(bucketFile).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(
        /^Users\/user-123\/threads\/thread-123\/exports\/\d+-[a-f0-9]{8}\.pptx$/
      )
    );
    expect(bucketFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /^Users\/user-123\/threads\/thread-123\/exports\/\d+-[a-f0-9]{8}\.json$/
      )
    );
    expect(fileSave).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        resumable: false,
        metadata: expect.objectContaining({
          contentDisposition: 'attachment; filename="Staff Briefing.pptx"',
        }),
      })
    );
    expect(fileSave).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"schemaVersion": "editable-pptx.v1"'),
      expect.objectContaining({
        contentType: 'application/json; charset=utf-8',
        resumable: false,
        metadata: expect.objectContaining({
          contentDisposition: 'attachment; filename="Staff Briefing.editable-source.json"',
        }),
      })
    );
    expect(emitStage).toHaveBeenCalledWith(
      'uploading_assets',
      expect.objectContaining({ phase: 'upload_editable_pptx_export' })
    );
    expect(emitStage).toHaveBeenCalledWith(
      'persisting_result',
      expect.objectContaining({ phase: 'create_editable_pptx_download_links' })
    );
    expect(result).toMatchObject({
      data: {
        fileName: 'Staff Briefing.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        format: 'pptx',
        artifactRole: 'export',
        schemaVersion: 'editable-pptx.v1',
        warnings: ['slides[0].elements[2] extends outside 13.333x7.5in slide bounds.'],
        editableSource: expect.objectContaining({
          name: 'Staff Briefing.editable-source.json',
          mimeType: 'application/json',
          type: 'doc',
          artifactRole: 'source',
        }),
        revisionHint: expect.stringContaining('schema JSON was saved'),
        relatedDocumentId: 'doc-1',
        sourceDocumentIds: ['source-doc-1'],
        sourceAttachmentIds: ['source-attachment-1'],
        artifactGroupId: 'operation-123',
        attachments: [
          expect.objectContaining({
            name: 'Staff Briefing.pptx',
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            artifactRole: 'export',
          }),
          expect.objectContaining({
            name: 'Staff Briefing.editable-source.json',
            mimeType: 'application/json',
            artifactRole: 'source',
          }),
        ],
      },
    });
  });

  it('returns validation errors for invalid slide schema input', async () => {
    const result = await tool.execute(
      {
        fileName: 'broken',
        title: 'Broken',
        slides: [],
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });

  it('returns a failure when thread context is missing', async () => {
    const result = await tool.execute(
      {
        fileName: 'deck.pptx',
        title: 'Deck',
        schemaVersion: 'editable-pptx.v1',
        slides: [
          {
            elements: [
              { type: 'text', text: 'No thread', x: 0.5, y: 0.5, w: 2, h: 0.4 },
            ],
          },
        ],
      },
      { userId: 'user-123', environment: 'staging' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('no threadId');
  });

  it('exposes render_editable_pptx to coordinator registry definitions', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    const definition = registry
      .getDefinitions('strategy_coordinator')
      .find((candidate) => candidate.name === 'render_editable_pptx');

    expect(definition).toBeDefined();
    expect(definition?.category).toBe('system');
  });
});