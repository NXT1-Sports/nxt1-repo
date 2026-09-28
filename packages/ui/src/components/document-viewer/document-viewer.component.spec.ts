import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '@angular/common/http';
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
      documentFileId: 'file-doc-1',
      anchorType: 'page',
      pageNumber: 1,
      label: 'Page 1',
    });
  });
});
