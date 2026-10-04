import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtBrowserService } from '../../../services/browser/browser.service';
import { NxtFileSaveService } from '../../../services/file-save/file-save.service';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXFilesService, type AgentXLibraryFile } from '../../services/agent-x-files.service';
import {
  AGENT_X_DOCUMENT_PREVIEW_SHEET_TEST_IDS as TEST_IDS,
  AgentXDocumentPreviewSheetComponent,
} from './agent-x-document-preview-sheet.component';

@Component({
  selector: 'nxt1-sheet-header',
  standalone: true,
  template: `<h2 class="stub-title">{{ title }}</h2>
    <span class="stub-close-position">{{ closePosition }}</span>
    <ng-content select="[sheetHeaderAction]" />`,
})
class StubSheetHeaderComponent {
  @Input() title = '';
  @Input() closePosition = 'right';
  @Input() centerTitle = false;
  @Input() closeTestId: string | undefined;
}

@Component({
  selector: 'nxt1-document-viewer',
  standalone: true,
  template: '',
})
class StubDocumentViewerComponent {
  @Input() file!: AgentXLibraryFile;
  @Input() compact = false;
  @Input() editable = true;
  @Input() showAskAgent = true;
  @Input() toolbarDownload = false;
  @Input() downloadBusy = false;
  @Output() downloadRequested = new EventEmitter<AgentXLibraryFile>();
  @Output() openOriginalRequested = new EventEmitter<AgentXLibraryFile>();
}

function makeFile(overrides: Partial<AgentXLibraryFile> = {}): AgentXLibraryFile {
  return {
    id: 'file-1',
    ownerUserId: 'user-1',
    name: 'Scouting Report.pdf',
    normalizedName: 'scouting report.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    status: 'ready',
    origin: 'agent',
    sizeBytes: 2048,
    url: 'https://api.nxt1sports.com/agent-x/media-proxy/export/report.pdf?sig=abc',
    storagePath: 'Users/u/threads/t/exports/report.pdf',
    ...overrides,
  } as AgentXLibraryFile;
}

describe('AgentXDocumentPreviewSheetComponent', () => {
  let fixture: ComponentFixture<AgentXDocumentPreviewSheetComponent>;

  const filesService = { downloadFileContent: vi.fn() };
  const fileSave = { saveBlob: vi.fn() };
  const browser = { openLink: vi.fn(async () => ({ success: true })) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const haptics = { impact: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };

  async function render(file = makeFile()): Promise<void> {
    fixture = TestBed.createComponent(AgentXDocumentPreviewSheetComponent);
    fixture.componentInstance.file = file;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function tapDownload(): Promise<void> {
    viewer().downloadRequested.emit(makeFile());
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function viewer(): StubDocumentViewerComponent {
    return fixture.debugElement.query(By.directive(StubDocumentViewerComponent))
      .componentInstance as StubDocumentViewerComponent;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    logger.child.mockReturnValue(logger);

    TestBed.configureTestingModule({
      imports: [AgentXDocumentPreviewSheetComponent],
      providers: [
        { provide: AgentXFilesService, useValue: filesService },
        { provide: NxtFileSaveService, useValue: fileSave },
        { provide: NxtBrowserService, useValue: browser },
        { provide: NxtToastService, useValue: toast },
        { provide: HapticsService, useValue: haptics },
        { provide: NxtLoggingService, useValue: logger },
      ],
    });
    TestBed.overrideComponent(AgentXDocumentPreviewSheetComponent, {
      set: {
        imports: [StubSheetHeaderComponent, StubDocumentViewerComponent],
      },
    });
  });

  const title = (): string => fixture.nativeElement.querySelector('.stub-title').textContent;
  const loading = (): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${TEST_IDS.LOADING}"]`);
  const hasViewer = (): boolean =>
    !!fixture.debugElement.query(By.directive(StubDocumentViewerComponent));

  it('shows the file name in the header', async () => {
    await render();

    expect(title()).toBe('Scouting Report.pdf');
  });

  describe('while the deliverable is still resolving', () => {
    async function renderPending(request: Promise<AgentXLibraryFile>, pendingName = 'report.pdf') {
      fixture = TestBed.createComponent(AgentXDocumentPreviewSheetComponent);
      fixture.componentInstance.fileRequest = request;
      fixture.componentInstance.pendingName = pendingName;
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('shows a loading state titled from the link, then swaps in the viewer', async () => {
      let resolve!: (file: AgentXLibraryFile) => void;
      await renderPending(new Promise((r) => (resolve = r)));

      expect(loading()).not.toBeNull();
      expect(hasViewer()).toBe(false);
      expect(title()).toBe('report.pdf');

      const file = makeFile();
      resolve(file);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(loading()).toBeNull();
      expect(viewer().file).toBe(file);
      expect(title()).toBe('Scouting Report.pdf');
    });

    it('falls back to a generic title when the link has no file name', async () => {
      await renderPending(new Promise(() => undefined), '');

      expect(title()).toBe('Document');
    });

    it('stays in the loading state when the lookup fails (the opener closes the sheet)', async () => {
      await renderPending(Promise.reject(new Error('not indexed')));
      fixture.detectChanges();

      expect(loading()).not.toBeNull();
      expect(hasViewer()).toBe(false);
    });

    it('ignores downloads until the file is resolved', async () => {
      await renderPending(new Promise(() => undefined));

      await (fixture.componentInstance as unknown as { download(): Promise<void> }).download();

      expect(filesService.downloadFileContent).not.toHaveBeenCalled();
      expect(browser.openLink).not.toHaveBeenCalled();
    });
  });

  it('keeps close on the right and moves download into the viewer toolbar', async () => {
    const file = makeFile();
    await render(file);

    expect(fixture.nativeElement.querySelector('.stub-close-position').textContent).toBe('right');
    expect(fixture.nativeElement.querySelector('[sheetHeaderAction]')).toBeNull();
    expect(viewer().toolbarDownload).toBe(true);
    expect(viewer().downloadBusy).toBe(false);
    expect(viewer().file).toBe(file);
    expect(viewer().compact).toBe(true);
    expect(viewer().editable).toBe(false);
    expect(viewer().showAskAgent).toBe(false);
  });

  it('downloads the real bytes and hands them to the file-save service', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    filesService.downloadFileContent.mockResolvedValue(blob);
    fileSave.saveBlob.mockResolvedValue('shared');
    await render();

    await tapDownload();

    expect(haptics.impact).toHaveBeenCalledWith('light');
    expect(filesService.downloadFileContent).toHaveBeenCalledWith('file-1');
    expect(fileSave.saveBlob).toHaveBeenCalledWith(
      blob,
      'Scouting Report.pdf',
      expect.objectContaining({ title: 'Scouting Report.pdf' })
    );
    expect(toast.error).not.toHaveBeenCalled();
    // Native share sheet is its own confirmation; no extra toast.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('confirms browser downloads with a toast', async () => {
    filesService.downloadFileContent.mockResolvedValue(new Blob(['x']));
    fileSave.saveBlob.mockResolvedValue('downloaded');
    await render();

    await tapDownload();

    expect(toast.success).toHaveBeenCalledWith('Download started');
  });

  it('shows an error toast without logging the signed URL when the download fails', async () => {
    filesService.downloadFileContent.mockRejectedValue(new Error('403'));
    await render();

    await tapDownload();

    expect(toast.error).toHaveBeenCalledWith('Failed to download file');
    expect(fileSave.saveBlob).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('sig=abc');
    expect(viewer().downloadBusy).toBe(false);
  });

  it('treats an empty download as a failure', async () => {
    filesService.downloadFileContent.mockResolvedValue(new Blob([]));
    await render();

    await tapDownload();

    expect(fileSave.saveBlob).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('opens files without a stored binary in the browser instead of downloading', async () => {
    await render(makeFile({ storagePath: undefined }));

    await tapDownload();

    expect(filesService.downloadFileContent).not.toHaveBeenCalled();
    expect(browser.openLink).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'agent_x_document_sheet' })
    );
  });

  it('keeps content touches from reaching the sheet drag gesture, but not header touches', async () => {
    await render();
    const host: HTMLElement = fixture.nativeElement;
    const onHostTouch = vi.fn();
    host.addEventListener('touchstart', onHostTouch);
    host.addEventListener('mousedown', onHostTouch);

    const body = host.querySelector('.doc-sheet__body') as HTMLElement;
    body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    body.dispatchEvent(new Event('mousedown', { bubbles: true }));
    expect(onHostTouch).not.toHaveBeenCalled();

    host.querySelector('.stub-title')!.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(onHostTouch).toHaveBeenCalledTimes(1);
  });

  it('shows the toolbar spinner while the download is in flight', async () => {
    let resolveBlob!: (blob: Blob) => void;
    filesService.downloadFileContent.mockReturnValue(
      new Promise<Blob>((resolve) => (resolveBlob = resolve))
    );
    fileSave.saveBlob.mockResolvedValue('shared');
    await render();

    viewer().downloadRequested.emit(makeFile());
    fixture.detectChanges();
    expect(viewer().downloadBusy).toBe(true);

    // A second tap while busy is ignored.
    viewer().downloadRequested.emit(makeFile());
    expect(filesService.downloadFileContent).toHaveBeenCalledTimes(1);

    resolveBlob(new Blob(['x']));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(viewer().downloadBusy).toBe(false);
  });

  it('wires the viewer fallback actions to download and open', async () => {
    filesService.downloadFileContent.mockResolvedValue(new Blob(['x']));
    fileSave.saveBlob.mockResolvedValue('shared');
    await render();

    viewer().downloadRequested.emit(makeFile());
    viewer().openOriginalRequested.emit(makeFile());
    await fixture.whenStable();

    expect(filesService.downloadFileContent).toHaveBeenCalledTimes(1);
    expect(browser.openLink).toHaveBeenCalledTimes(1);
  });
});
