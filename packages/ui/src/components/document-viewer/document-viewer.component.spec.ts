import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '@angular/common/http';
import JSZip from 'jszip';
import type { AgentXLibraryFile } from '../../agent-x/services/agent-x-files.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtDocumentViewerComponent } from './document-viewer.component';
import { DocumentPreviewClientService } from './document-preview-client.service';
import type { DocumentPreviewSession } from './document-viewer.types';

describe('NxtDocumentViewerComponent', () => {
  let fixture: ComponentFixture<NxtDocumentViewerComponent>;
  let component: NxtDocumentViewerComponent;
  let clientMock: {
    getPreviewSession: ReturnType<typeof vi.fn>;
    getSpreadsheetRange: ReturnType<typeof vi.fn>;
  };

  const sampleFile: AgentXLibraryFile = {
    id: 'file-doc-1',
    ownerUserId: 'user-1',
    name: 'Playbook.pdf',
    normalizedName: 'playbook.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    status: 'ready',
    origin: 'files_upload',
    sizeBytes: 1024,
    url: 'https://cdn.example.com/playbook.pdf',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    lastSeenAt: '2026-06-24T00:00:00.000Z',
  };

  beforeEach(async () => {
    clientMock = {
      getPreviewSession: vi.fn(),
      getSpreadsheetRange: vi.fn(),
    };

    const loggerMock = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    loggerMock.child.mockReturnValue(loggerMock);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(['pdf-data'], { type: 'application/pdf' })),
      })
    );

    await TestBed.configureTestingModule({
      imports: [NxtDocumentViewerComponent],
      providers: [
        { provide: DocumentPreviewClientService, useValue: clientMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: HapticsService, useValue: { impact: vi.fn() } },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: HttpClient, useValue: { get: vi.fn(), post: vi.fn() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createComponentWithFile(file: AgentXLibraryFile) {
    fixture = TestBed.createComponent(NxtDocumentViewerComponent);
    component = fixture.componentInstance;
    component.file = file;
    return { fixture, component };
  }

  it('renders fallback when preview session is unavailable for unsupported files', async () => {
    const unsupportedFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'file-raw-1',
      name: 'BinaryData.bin',
      kind: 'doc',
      mimeType: 'application/octet-stream',
    };

    clientMock.getPreviewSession.mockResolvedValue({
      available: false,
      reason: 'unsupported',
    } satisfies DocumentPreviewSession);

    createComponentWithFile(unsupportedFile);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isFallback()).toBe(true);
    expect(fixture.nativeElement.querySelector('.nxt1-doc-viewer__fallback')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('unsupported');
  });

  it('renders PDF preview directly when preview session provides pdfUrl', async () => {
    clientMock.getPreviewSession.mockResolvedValue({
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'file-doc-1',
        documentType: 'pdf',
        fileName: 'Playbook.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        pageCount: 5,
        pdfUrl: 'https://cdn.example.com/playbook.pdf',
        generatedAt: '2026-09-27T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession);

    fixture = TestBed.createComponent(NxtDocumentViewerComponent);
    component = fixture.componentInstance;
    vi.spyOn(
      component as unknown as { initPdfViewer: (url: string) => Promise<void> },
      'initPdfViewer'
    ).mockResolvedValue(undefined);
    component.file = sampleFile;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isFallback()).toBe(false);
    expect(component.docType()).toBe('pdf');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
  });

  it('loads presentation deck manifest and navigates slides', async () => {
    const presentationFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'deck-1',
      name: 'GamePlan.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      kind: 'pptx',
    };

    clientMock.getPreviewSession.mockResolvedValue({
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'deck-1',
        documentType: 'presentation',
        fileName: 'GamePlan.pptx',
        mimeType: presentationFile.mimeType,
        sizeBytes: 2048,
        pageCount: 3,
        slides: [
          {
            slideNumber: 1,
            title: 'Cover Slide',
            slideText: 'Week 4 Plan',
            speakerNotes: 'Coach notes 1',
          },
          {
            slideNumber: 2,
            title: 'Defensive Keys',
            slideText: 'Key 1, Key 2',
            speakerNotes: 'Coach notes 2',
          },
          { slideNumber: 3, title: 'Special Teams', slideText: 'Field Goal block' },
        ],
        generatedAt: '2026-09-27T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession);

    createComponentWithFile(presentationFile);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.docType()).toBe('presentation');
    expect(component.totalSlides()).toBe(3);
    expect(component.currentSlide()).toBe(1);

    await component['nextSlide']();
    fixture.detectChanges();

    expect(component.currentSlide()).toBe(2);
    expect(component.currentSlideData()?.title).toBe('Defensive Keys');
  });

  it('emits askAgentRequested with document anchor when Ask Agent button is clicked', async () => {
    clientMock.getPreviewSession.mockResolvedValue({
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'file-doc-1',
        documentType: 'pdf',
        fileName: 'Playbook.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        pageCount: 10,
        generatedAt: '2026-09-27T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession);

    createComponentWithFile(sampleFile);
    await fixture.whenStable();
    fixture.detectChanges();

    const askAgentSpy = vi.fn();
    component.askAgentRequested.subscribe(askAgentSpy);

    component['onAskAgentForCurrentAnchor']();

    expect(askAgentSpy).toHaveBeenCalledWith({
      anchors: [
        {
          documentFileId: 'file-doc-1',
          anchorType: 'page',
          pageNumber: 1,
          label: 'Page 1',
        },
      ],
      isAllSelected: false,
    });
  });

  describe('Word (.docx)', () => {
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docxFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'file-docx-1',
      name: 'Spring Playbook.docx',
      normalizedName: 'spring playbook.docx',
      mimeType: docxMime,
      kind: 'doc',
      url: 'https://cdn.example.com/spring-playbook.docx',
    };

    function wordSession(file: AgentXLibraryFile): DocumentPreviewSession {
      return {
        available: true,
        manifest: {
          schemaVersion: 1,
          documentId: file.id,
          documentType: 'word',
          fileName: file.name,
          mimeType: file.mimeType,
          sizeBytes: 2048,
          pageCount: 1,
          pdfUrl: file.url,
          generatedAt: '2026-10-02T00:00:00.000Z',
        },
      };
    }

    async function buildDocx(): Promise<ArrayBuffer> {
      const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const zip = new JSZip();
      zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      );
      zip.file(
        '_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      );
      zip.file(
        'word/_rels/document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdBad" Type="${r}/hyperlink" Target="javascript:alert(1)" TargetMode="External"/><Relationship Id="rIdGood" Type="${r}/hyperlink" Target="https://nxt1sports.com/" TargetMode="External"/></Relationships>`
      );
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:r><w:t>Spring Playbook Overview</w:t></w:r></w:p><w:p><w:hyperlink r:id="rIdBad"><w:r><w:t>bad link</w:t></w:r></w:hyperlink></w:p><w:p><w:hyperlink r:id="rIdGood"><w:r><w:t>good link</w:t></w:r></w:hyperlink></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
      );
      return zip.generateAsync({ type: 'arraybuffer' });
    }

    // The @nxt1/ui Vitest setup is JIT-only, so signal viewChild() queries never resolve here.
    // These tests drive the real render pipeline against real DOM hosts instead.
    type DocxInternals = {
      renderDocx: (data: ArrayBuffer, host: HTMLElement, styleHost: HTMLElement) => Promise<void>;
    };

    // Silences the component's own background load so only the direct render under test runs.
    async function createWordComponent(): Promise<void> {
      clientMock.getPreviewSession.mockResolvedValue(wordSession(docxFile));
      fixture = TestBed.createComponent(NxtDocumentViewerComponent);
      component = fixture.componentInstance;
      vi.spyOn(
        component as unknown as { initDocxViewer: (url: string) => Promise<void> },
        'initDocxViewer'
      ).mockResolvedValue(undefined);
      component.file = docxFile;
      await fixture.whenStable();
    }

    async function renderRealDocx(): Promise<HTMLElement> {
      await createWordComponent();
      const host = document.createElement('div');
      const styleHost = document.createElement('div');
      document.body.append(styleHost, host);
      await (component as unknown as DocxInternals).renderDocx(await buildDocx(), host, styleHost);
      return host;
    }

    it('renders a real .docx natively as HTML with no iframe or canvas', async () => {
      const host = await renderRealDocx();

      expect(host.textContent).toContain('Spring Playbook Overview');
      expect(host.querySelector('.nxt1-docx-wrapper')).toBeTruthy();
      expect(host.querySelector('section.nxt1-docx')).toBeTruthy();
      expect(host.querySelector('iframe')).toBeNull();
      expect(host.querySelector('canvas')).toBeNull();
      expect(component.docxRendering()).toBe(false);
      expect(component.isFallback()).toBe(false);
    });

    // happy-dom's XML parser keeps `r:id` as a qualified name, so docx-preview cannot resolve
    // hyperlink relationships here (browsers can). The sanitizer is tested directly instead.
    it('strips unsafe link protocols and hardens external links', async () => {
      await createWordComponent();
      const host = document.createElement('div');
      const hrefs: Record<string, string> = {
        js: 'javascript:alert(1)',
        jsUpper: 'JaVaScRiPt:alert(1)',
        jsPadded: '  javascript:alert(1)',
        data: 'data:text/html,<script>alert(1)</script>',
        vbs: 'vbscript:msgbox(1)',
        file: 'file:///etc/passwd',
        web: 'https://nxt1sports.com/plays',
        mail: 'mailto:coach@nxt1sports.com',
        tel: 'tel:+15555550100',
        jump: '#section-2',
      };
      for (const [id, href] of Object.entries(hrefs)) {
        const a = document.createElement('a');
        a.id = id;
        a.setAttribute('href', href);
        host.appendChild(a);
      }

      (component as unknown as { sanitizeDocxLinks: (h: HTMLElement) => void }).sanitizeDocxLinks(
        host
      );

      for (const id of ['js', 'jsUpper', 'jsPadded', 'data', 'vbs', 'file']) {
        expect(host.querySelector(`#${id}`)?.hasAttribute('href'), id).toBe(false);
      }
      for (const id of ['web', 'mail', 'tel']) {
        const a = host.querySelector(`#${id}`);
        expect(a?.getAttribute('href'), id).toBe(hrefs[id]);
        expect(a?.getAttribute('rel'), id).toBe('noopener noreferrer');
        expect(a?.getAttribute('target'), id).toBe('_blank');
      }
      expect(host.querySelector('#jump')?.getAttribute('href')).toBe('#section-2');
      expect(host.innerHTML.toLowerCase()).not.toContain('javascript:');
    });

    it('falls back with a clear message when the file is not a valid .docx', async () => {
      await createWordComponent();
      const host = document.createElement('div');
      const styleHost = document.createElement('div');

      await (component as unknown as DocxInternals).renderDocx(
        new TextEncoder().encode('not a zip').buffer as ArrayBuffer,
        host,
        styleHost
      );

      expect(component.isFallback()).toBe(true);
      expect(component.fallbackReason()).toBe('docx_render_failed');
      expect(component.docxRendering()).toBe(false);
    });

    it('shows an honest download fallback for legacy .doc files', async () => {
      const legacy: AgentXLibraryFile = {
        ...docxFile,
        id: 'file-doc-legacy',
        name: 'Old Playbook.doc',
        mimeType: 'application/msword',
        url: 'https://cdn.example.com/old.doc',
      };
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      clientMock.getPreviewSession.mockResolvedValue(wordSession(legacy));

      createComponentWithFile(legacy);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.isFallback()).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('.docx');
    });

    it('refuses to render documents over the size cap', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(26 * 1024 * 1024),
        })
      );
      clientMock.getPreviewSession.mockResolvedValue(wordSession(docxFile));

      createComponentWithFile(docxFile);
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(component.isFallback()).toBe(true);
      });

      expect(fixture.nativeElement.textContent).toContain('too large');
    });

    it('emits a whole-document anchor for Ask Agent', async () => {
      clientMock.getPreviewSession.mockResolvedValue(wordSession(docxFile));
      fixture = TestBed.createComponent(NxtDocumentViewerComponent);
      component = fixture.componentInstance;
      vi.spyOn(
        component as unknown as { initDocxViewer: (url: string) => Promise<void> },
        'initDocxViewer'
      ).mockResolvedValue(undefined);
      component.file = docxFile;
      await fixture.whenStable();
      fixture.detectChanges();

      const askAgentSpy = vi.fn();
      component.askAgentRequested.subscribe(askAgentSpy);
      component['confirmAskAgentDocument']();

      expect(askAgentSpy).toHaveBeenCalledWith({
        anchors: [
          { documentFileId: 'file-docx-1', anchorType: 'document', label: 'Entire document' },
        ],
        isAllSelected: true,
      });
    });
  });
});
