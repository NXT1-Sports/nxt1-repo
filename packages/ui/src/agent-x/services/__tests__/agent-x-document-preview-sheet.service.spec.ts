import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular/standalone';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCapacitor } from '@nxt1/core';
import { NxtBrowserService } from '../../../services/browser/browser.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtPlatformService } from '../../../services/platform/platform.service';
import { AgentXDocumentPreviewSheetComponent } from '../../components/shared/agent-x-document-preview-sheet.component';
import {
  AGENT_X_DOCUMENT_PREVIEW_SHEET_CSS_CLASS,
  AgentXDocumentPreviewSheetService,
  deliverableNameFromUrl,
} from '../agent-x-document-preview-sheet.service';
import { AgentXFilesService, type AgentXLibraryFile } from '../agent-x-files.service';

vi.mock('@nxt1/core', async () => {
  const actual = await vi.importActual<typeof import('@nxt1/core')>('@nxt1/core');
  return { ...actual, isCapacitor: vi.fn(() => false) };
});

const EXPORT_URL =
  'https://api.nxt1sports.com/agent-x/media-proxy/export/report.pdf?path=Users%2Fu%2Fthreads%2Ft%2Fexports%2Freport.pdf&sig=abc';

function makeFile(overrides: Partial<AgentXLibraryFile> = {}): AgentXLibraryFile {
  return {
    id: 'file-1',
    ownerUserId: 'user-1',
    name: 'Report.pdf',
    normalizedName: 'report.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    status: 'ready',
    origin: 'agent',
    sizeBytes: 2048,
    url: EXPORT_URL,
    storagePath: 'Users/u/threads/t/exports/report.pdf',
    ...overrides,
  } as AgentXLibraryFile;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('AgentXDocumentPreviewSheetService', () => {
  let service: AgentXDocumentPreviewSheetService;
  const isNative = signal(false);
  const viewport = signal({ width: 1280, height: 800 });
  const modals: Array<{
    present: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    onWillDismiss: ReturnType<typeof vi.fn>;
    userClose: () => void;
  }> = [];

  const modalCtrl = {
    create: vi.fn(async () => {
      let resolveWillDismiss!: () => void;
      const willDismiss = new Promise<void>((resolve) => (resolveWillDismiss = resolve));
      const modal = {
        present: vi.fn(async () => undefined),
        dismiss: vi.fn(async () => {
          resolveWillDismiss();
          return true;
        }),
        remove: vi.fn(),
        onWillDismiss: vi.fn(() => willDismiss),
        /** Simulates the user closing the sheet (swipe / X). */
        userClose: () => resolveWillDismiss(),
      };
      modals.push(modal);
      return modal;
    }),
  };
  const filesService = {
    resolveDeliverable: vi.fn(),
    refreshFile: vi.fn(),
  };
  const browser = { openLink: vi.fn(async () => ({ success: true })) };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    modals.length = 0;
    isNative.set(false);
    vi.mocked(isCapacitor).mockReturnValue(false);
    viewport.set({ width: 1280, height: 800 });
    logger.child.mockReturnValue(logger);

    TestBed.configureTestingModule({
      providers: [
        AgentXDocumentPreviewSheetService,
        { provide: ModalController, useValue: modalCtrl },
        { provide: AgentXFilesService, useValue: filesService },
        { provide: NxtBrowserService, useValue: browser },
        { provide: NxtLoggingService, useValue: logger },
        {
          provide: NxtPlatformService,
          useValue: { isNative, viewport, isIOS: () => true },
        },
      ],
    });
    service = TestBed.inject(AgentXDocumentPreviewSheetService);
  });

  describe('shouldUseSheet', () => {
    it('is false on desktop-width browsers', () => {
      expect(service.shouldUseSheet()).toBe(false);
    });

    it('is true on phone-width browsers', () => {
      viewport.set({ width: 390, height: 844 });
      expect(service.shouldUseSheet()).toBe(true);
    });

    it('is true on native regardless of width', () => {
      isNative.set(true);
      expect(service.shouldUseSheet()).toBe(true);
    });
  });

  describe('open', () => {
    type SheetProps = {
      fileRequest: Promise<AgentXLibraryFile>;
      pendingName: string;
    };
    const sheetProps = (call = 0): SheetProps =>
      (modalCtrl.create.mock.calls[call] as unknown as [{ componentProps: SheetProps }])[0]
        .componentProps;

    it('presents the sheet immediately, stacked over the chat, and resolves the file into it', async () => {
      const lookup = deferred<AgentXLibraryFile>();
      const inlineFile = makeFile({ url: `${EXPORT_URL}&disposition=inline` });
      filesService.resolveDeliverable.mockReturnValue(lookup.promise);
      filesService.refreshFile.mockResolvedValue(inlineFile);

      const opening = service.open(EXPORT_URL);
      await vi.waitFor(() => expect(modals[0]?.present).toHaveBeenCalled());

      // Sheet is up before the Files lookup finished, titled from the link.
      expect(sheetProps().pendingName).toBe('report.pdf');
      expect(modalCtrl.create).toHaveBeenCalledWith(
        expect.objectContaining({
          component: AgentXDocumentPreviewSheetComponent,
          breakpoints: [0, 1],
          initialBreakpoint: 1,
          expandToScroll: false,
          handle: true,
          backdropDismiss: true,
          cssClass: expect.arrayContaining([
            'nxt1-sheet-modal',
            'nxt1-sheet-modal--ios',
            AGENT_X_DOCUMENT_PREVIEW_SHEET_CSS_CLASS,
          ]),
        })
      );

      lookup.resolve(makeFile());
      await opening;

      await expect(sheetProps().fileRequest).resolves.toBe(inlineFile);
      expect(filesService.refreshFile).toHaveBeenCalledWith('file-1', null, {
        disposition: 'inline',
      });
      expect(browser.openLink).not.toHaveBeenCalled();
      expect(modals[0]?.dismiss).not.toHaveBeenCalled();
    });

    it('does not refresh non-PDF documents', async () => {
      const xlsx = makeFile({
        name: 'Roster.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        kind: 'xlsx' as never,
      });
      filesService.resolveDeliverable.mockResolvedValue(xlsx);

      await service.open(EXPORT_URL);

      expect(filesService.refreshFile).not.toHaveBeenCalled();
      await expect(sheetProps().fileRequest).resolves.toBe(xlsx);
    });

    it('still previews the PDF when the inline refresh fails', async () => {
      const file = makeFile();
      filesService.resolveDeliverable.mockResolvedValue(file);
      filesService.refreshFile.mockRejectedValue(new Error('offline'));

      await service.open(EXPORT_URL);

      await expect(sheetProps().fileRequest).resolves.toBe(file);
      expect(modals[0]?.dismiss).not.toHaveBeenCalled();
    });

    it('closes the sheet and falls back when the deliverable is not in Files yet', async () => {
      isNative.set(true);
      vi.mocked(isCapacitor).mockReturnValue(true);
      filesService.resolveDeliverable.mockRejectedValue(
        new Error('This document is not available in Files yet')
      );

      await service.open(EXPORT_URL);

      expect(modals[0]?.dismiss).toHaveBeenCalledWith(undefined, 'replace');
      expect(browser.openLink).toHaveBeenCalledWith(expect.objectContaining({ url: EXPORT_URL }));
      // Signed URLs carry credentials and must never be logged.
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('sig=abc');
    });

    it('closes the sheet and falls back when the file has no inline preview', async () => {
      isNative.set(true);
      vi.mocked(isCapacitor).mockReturnValue(true);
      filesService.resolveDeliverable.mockResolvedValue(
        makeFile({ name: 'bundle.zip', mimeType: 'application/zip', kind: 'other' as never })
      );

      await service.open(EXPORT_URL);

      expect(modals[0]?.dismiss).toHaveBeenCalled();
      expect(browser.openLink).toHaveBeenCalled();
    });

    it('does not fall back if the user already closed the loading sheet', async () => {
      const lookup = deferred<AgentXLibraryFile>();
      filesService.resolveDeliverable.mockReturnValue(lookup.promise);

      const opening = service.open(EXPORT_URL);
      await vi.waitFor(() => expect(modals[0]?.present).toHaveBeenCalled());
      modals[0]!.userClose();
      await Promise.resolve();

      lookup.resolve(
        makeFile({ name: 'bundle.zip', mimeType: 'application/zip', kind: 'other' as never })
      );
      await opening;

      expect(browser.openLink).not.toHaveBeenCalled();
    });

    it('falls back without a sheet when the modal cannot be created', async () => {
      vi.mocked(isCapacitor).mockReturnValue(true);
      filesService.resolveDeliverable.mockRejectedValue(new Error('not indexed'));
      modalCtrl.create.mockRejectedValueOnce(new Error('overlay failure'));

      await service.open(EXPORT_URL);

      expect(browser.openLink).toHaveBeenCalledTimes(1);
    });

    it('replaces the previous sheet on a second tap and ignores the first lookup', async () => {
      const first = deferred<AgentXLibraryFile>();
      const docx = makeFile({
        id: 'file-2',
        name: 'Letter.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        kind: 'docx' as never,
      });
      filesService.resolveDeliverable
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(docx);

      const firstOpen = service.open(EXPORT_URL);
      await vi.waitFor(() => expect(modals[0]?.present).toHaveBeenCalled());
      await service.open(`${EXPORT_URL}&v=2`);

      expect(modals[0]?.dismiss).toHaveBeenCalledWith(undefined, 'replace');
      expect(modals[1]?.present).toHaveBeenCalled();

      // The stale lookup failing must not close the new sheet or trigger a fallback.
      first.resolve(
        makeFile({ name: 'bundle.zip', mimeType: 'application/zip', kind: 'other' as never })
      );
      await firstOpen;

      expect(modals[1]?.dismiss).not.toHaveBeenCalled();
      expect(browser.openLink).not.toHaveBeenCalled();
      await expect(sheetProps(1).fileRequest).resolves.toBe(docx);
    });

    it('drops a sheet that finished creating after a newer tap', async () => {
      const slowCreate = deferred<void>();
      filesService.resolveDeliverable.mockResolvedValue(makeFile());
      modalCtrl.create.mockImplementationOnce(async () => {
        await slowCreate.promise;
        const modal = {
          present: vi.fn(async () => undefined),
          dismiss: vi.fn(async () => true),
          remove: vi.fn(),
          onWillDismiss: vi.fn(() => new Promise<void>(() => undefined)),
          userClose: () => undefined,
        };
        modals.push(modal);
        return modal;
      });

      const firstOpen = service.open(EXPORT_URL);
      await Promise.resolve();
      const secondOpen = service.open(EXPORT_URL);
      slowCreate.resolve();
      await Promise.all([firstOpen, secondOpen]);

      const presented = modals.filter((modal) => modal.present.mock.calls.length > 0);
      expect(presented).toHaveLength(1);
      expect(modals.find((modal) => modal.remove.mock.calls.length > 0)).toBeDefined();
    });
  });

  describe('deliverableNameFromUrl', () => {
    it('reads the file name from a media-proxy export path', () => {
      expect(deliverableNameFromUrl(EXPORT_URL)).toBe('report.pdf');
    });

    it('reads the file name from an encoded Firebase Storage path', () => {
      expect(
        deliverableNameFromUrl(
          'https://firebasestorage.googleapis.com/v0/b/bucket/o/Users%2Fu%2Fexports%2FWeek%204%20Plan.pptx?alt=media&token=t'
        )
      ).toBe('Week 4 Plan.pptx');
    });

    it('returns empty for links without a file name', () => {
      expect(deliverableNameFromUrl('https://api.nxt1sports.com/agent-x/files')).toBe('');
      expect(deliverableNameFromUrl('not a url')).toBe('');
    });
  });
});
