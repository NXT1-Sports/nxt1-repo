import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

class MockDomMatrix {}
class MockImageData {}
class MockPath2D {}

const {
  mockGetDocument,
  mockLoadingTaskDestroy,
  mockGetPage,
  mockRender,
  mockPageCleanup,
  mockCreateCanvas,
  mockToBuffer,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockLoadingTaskDestroy: vi.fn(),
  mockGetPage: vi.fn(),
  mockRender: vi.fn(),
  mockPageCleanup: vi.fn(),
  mockCreateCanvas: vi.fn(),
  mockToBuffer: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: mockGetDocument,
}));

import type { ToolExecutionContext } from '../../base.tool.js';
import { EnrichDocumentNotesTool } from '../enrich-document-notes.tool.js';

const mockCanvasBindings = {
  DOMMatrix: MockDomMatrix,
  ImageData: MockImageData,
  Path2D: MockPath2D,
  createCanvas: mockCreateCanvas,
};

type UniversalFileRecord = Record<string, unknown>;

function createDb(record: UniversalFileRecord) {
  const update = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({
    exists: true,
    data: () => record,
  });
  const doc = vi.fn().mockReturnValue({ get, update });
  const collection = vi.fn().mockReturnValue({ doc });

  return {
    db: { collection },
    update,
  };
}

function createStorage(buffer: Buffer) {
  const download = vi.fn().mockResolvedValue([buffer]);
  const file = vi.fn().mockReturnValue({ download });
  const bucket = vi.fn().mockReturnValue({ file });

  return {
    storage: { bucket },
    download,
  };
}

async function createPptxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>Install Menu</a:t></a:r></a:p>
                <a:p><a:r><a:t>Trips Right Flood</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
            <p:pic />
          </p:spTree>
        </p:cSld>
      </p:sld>
    `.trim()
  );
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship
          Id="rId1"
          Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
          Target="../notesSlides/notesSlide1.xml"
        />
      </Relationships>
    `.trim()
  );
  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>Coach the outside release and landmark.</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:notes>
    `.trim()
  );
  zip.file(
    'ppt/slides/slide2.xml',
    `
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>Third Down Answers</a:t></a:r></a:p>
                <a:p><a:r><a:t>Alert the boundary hot throw.</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `.trim()
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('EnrichDocumentNotesTool', () => {
  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRender.mockReturnValue({ promise: Promise.resolve() });
    mockPageCleanup.mockImplementation(() => undefined);
    mockToBuffer.mockReturnValue(Buffer.from('image-bytes'));
    mockCreateCanvas.mockImplementation((width: number, height: number) => ({
      width,
      height,
      getContext: () => ({
        fillStyle: '#ffffff',
        fillRect: vi.fn(),
      }),
      toBuffer: mockToBuffer,
    }));
    mockGetPage.mockImplementation(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 800 * scale, height: 600 * scale }),
      render: mockRender,
      cleanup: mockPageCleanup,
    }));
    mockLoadingTaskDestroy.mockResolvedValue(undefined);
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: mockGetPage,
      }),
      destroy: mockLoadingTaskDestroy,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the existing PDF enrichment path', async () => {
    const llm = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({ content: '- Page 1 install notes' })
        .mockResolvedValueOnce({ content: 'Condensed PDF summary.' }),
    };
    const pdfRecord = {
      title: 'Offense.pdf',
      ownerUserId: 'user-123',
      payload: {
        storagePath: 'Users/user-123/uploads/offense.pdf',
        url: 'https://cdn.example.com/offense.pdf',
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'files_upload',
        sizeBytes: 1024,
      },
    };
    const { db, update } = createDb(pdfRecord);
    const { storage } = createStorage(Buffer.from('pdf-bytes'));
    const tool = new EnrichDocumentNotesTool(
      llm as never,
      () => storage as never,
      () => db as never,
      mockCanvasBindings as never
    );

    const result = await tool.execute({ documentId: 'pdf-1' }, context);

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(mockGetDocument).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSummary: 'Condensed PDF summary.',
        artifactNotes: expect.stringContaining('### Page 1'),
        artifactTags: expect.arrayContaining(['ai-notes', 'page-by-page']),
        artifactClassification: expect.objectContaining({
          kind: 'ai_page_notes',
          source: 'enrich_document_notes',
          pageCount: 1,
        }),
      })
    );
  });

  it('generates slide-by-slide artifact notes for PPTX uploads', async () => {
    const llm = {
      complete: vi
        .fn()
        .mockImplementation(async (messages: Array<{ role: string; content: unknown }>) => {
          const userMessage = messages.findLast((message) => message.role === 'user')?.content;
          const textContent =
            typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage);
          if (textContent.includes('Write a 2-4 sentence summary')) {
            return { content: 'Condensed deck summary.' };
          }
          if (textContent.includes('slide 1')) {
            return { content: '- Slide 1 install notes\n- Outside release coached from notes.' };
          }
          return { content: '- Slide 2 third-down adjustments' };
        }),
    };
    const pptxRecord = {
      title: 'Scout Deck.pptx',
      ownerUserId: 'user-123',
      payload: {
        storagePath: 'Users/user-123/uploads/scout-deck.pptx',
        url: 'https://cdn.example.com/scout-deck.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        kind: 'pptx',
        origin: 'files_upload',
        sizeBytes: 2048,
      },
    };
    const { db, update } = createDb(pptxRecord);
    const { storage } = createStorage(await createPptxBuffer());
    const tool = new EnrichDocumentNotesTool(
      llm as never,
      () => storage as never,
      () => db as never,
      mockCanvasBindings as never
    );

    const result = await tool.execute({ documentId: 'pptx-1' }, context);

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(mockGetDocument).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSummary: 'Condensed deck summary.',
        artifactNotes: expect.stringContaining('## Slide-by-slide notes'),
        artifactClassification: expect.objectContaining({
          kind: 'ai_slide_notes',
          source: 'enrich_document_notes',
          pageCount: 2,
          unitKind: 'slide',
        }),
      })
    );
    expect(update.mock.calls[0]?.[0]?.artifactNotes).toContain('### Slide 1');
    expect(update.mock.calls[0]?.[0]?.artifactNotes).toContain('### Slide 2');
    expect(update.mock.calls[0]?.[0]?.artifactTags).toEqual(
      expect.arrayContaining(['ai-notes', 'slide-by-slide', 'slide-deck'])
    );
    expect(llm.complete.mock.calls[0]?.[0]?.[1]?.content).toContain(
      'Coach the outside release and landmark.'
    );
  });
});
