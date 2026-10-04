import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '@angular/common/http';
import JSZip from 'jszip';
import type { AgentXLibraryFile } from '../../agent-x/services/agent-x-files.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import {
  NxtDocumentViewerComponent,
  toSpreadsheetColumnName,
  withDocxFontFallback,
} from './document-viewer.component';
import { DocumentPreviewClientService } from './document-preview-client.service';
import { DOCUMENT_VIEWER_TEST_IDS } from '@nxt1/core/testing';
import { buildDeck, slideXml, textShape } from './pptx/pptx-test-fixtures';
import type { DocumentAskAgentSelection, DocumentPreviewSession } from './document-viewer.types';

describe('NxtDocumentViewerComponent', () => {
  let fixture: ComponentFixture<NxtDocumentViewerComponent>;
  let component: NxtDocumentViewerComponent;
  let clientMock: {
    getPreviewSession: ReturnType<typeof vi.fn>;
    getSpreadsheetRange: ReturnType<typeof vi.fn>;
    updateSpreadsheetCells: ReturnType<typeof vi.fn>;
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
      updateSpreadsheetCells: vi.fn(),
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
    expect(fixture.nativeElement.textContent).toContain('not available for this file type');
    // Raw reason codes are never shown to users.
    expect(fixture.nativeElement.textContent).not.toContain('(unsupported)');
  });

  it('maps unknown fallback reasons to generic copy without leaking the code', async () => {
    clientMock.getPreviewSession.mockResolvedValue({
      available: false,
      reason: 'some_internal_code',
    } satisfies DocumentPreviewSession);

    createComponentWithFile({
      ...sampleFile,
      id: 'file-raw-2',
      name: 'Blob.bin',
      mimeType: 'application/octet-stream',
      kind: 'doc',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isFallback()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('some_internal_code');
  });

  describe('file switching', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }

    const deckFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'deck-switch',
      name: 'Deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      kind: 'pptx',
    };

    function deckSession(): DocumentPreviewSession {
      return {
        available: true,
        manifest: {
          schemaVersion: 1,
          documentId: deckFile.id,
          documentType: 'presentation',
          fileName: deckFile.name,
          mimeType: deckFile.mimeType,
          sizeBytes: 10,
          pageCount: 2,
          slides: [
            { slideNumber: 1, title: 'One', slideText: 'a' },
            { slideNumber: 2, title: 'Two', slideText: 'b' },
          ],
          generatedAt: '2026-10-03T00:00:00.000Z',
        },
      };
    }

    it('ignores a stale preview session that resolves after the file changed', async () => {
      const first = deferred<DocumentPreviewSession>();
      const second = deferred<DocumentPreviewSession>();
      clientMock.getPreviewSession
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      fixture = TestBed.createComponent(NxtDocumentViewerComponent);
      component = fixture.componentInstance;
      const initPdf = vi
        .spyOn(
          component as unknown as { initPdfViewer: (url: string) => Promise<void> },
          'initPdfViewer'
        )
        .mockResolvedValue(undefined);

      component.file = sampleFile; // PDF, slow
      component.file = deckFile; // presentation, wins

      second.resolve(deckSession());
      await vi.waitFor(() => expect(component.manifest()?.documentType).toBe('presentation'));

      // The stale PDF session lands last but must not overwrite the deck or start a PDF load.
      first.resolve({
        available: true,
        manifest: {
          schemaVersion: 1,
          documentId: sampleFile.id,
          documentType: 'pdf',
          fileName: sampleFile.name,
          mimeType: sampleFile.mimeType,
          sizeBytes: 1024,
          pageCount: 9,
          pdfUrl: sampleFile.url,
          generatedAt: '2026-10-03T00:00:00.000Z',
        },
      });
      await fixture.whenStable();

      expect(component.manifest()?.documentType).toBe('presentation');
      expect(component.docType()).toBe('presentation');
      expect(component.totalSlides()).toBe(2);
      expect(component.loading()).toBe(false);
      expect(initPdf).not.toHaveBeenCalled();
    });

    it('resets per-document state when the file changes', async () => {
      clientMock.getPreviewSession.mockResolvedValue(deckSession());
      createComponentWithFile(deckFile);
      await fixture.whenStable();

      component.zoomLevel.set(2);
      component.rotation.set(90);
      component.selectedAskAgentIndices.set(new Set([1, 2]));
      component.askAgentDropdownOpen.set(true);
      component.currentSheetIndex.set(3);
      component.docxFitScale.set(0.5);

      const pending = deferred<DocumentPreviewSession>();
      clientMock.getPreviewSession.mockReturnValueOnce(pending.promise);
      const legacyDoc: AgentXLibraryFile = {
        ...sampleFile,
        id: 'file-other',
        name: 'Notes.doc',
        mimeType: 'application/msword',
        kind: 'doc',
      };
      component.file = legacyDoc;

      expect(component.loading()).toBe(true);
      expect(component.manifest()).toBeNull();
      expect(component.zoomLevel()).toBe(1);
      expect(component.rotation()).toBe(0);
      expect(component.selectedAskAgentIndices().size).toBe(0);
      expect(component.askAgentDropdownOpen()).toBe(false);
      expect(component.currentSheetIndex()).toBe(0);
      expect(component.docxFitScale()).toBe(1);
      expect(component.pdfReady()).toBe(false);
      // Fallback branches derive the type from the new file, not the previous deck manifest.
      expect(component.docType()).toBe('word');

      pending.resolve({ available: false, reason: 'unsupported' });
      await fixture.whenStable();
    });

    it('reloads a same-id file when its status changes', async () => {
      clientMock.getPreviewSession.mockResolvedValue({
        available: false,
        reason: 'source_not_ready',
      });
      const processing: AgentXLibraryFile = { ...deckFile, status: 'processing' };
      createComponentWithFile(processing);
      await fixture.whenStable();
      expect(clientMock.getPreviewSession).toHaveBeenCalledTimes(1);

      clientMock.getPreviewSession.mockResolvedValue(deckSession());
      component.file = { ...deckFile, status: 'ready' };
      await fixture.whenStable();

      expect(clientMock.getPreviewSession).toHaveBeenCalledTimes(2);
      expect(component.isFallback()).toBe(false);
      expect(component.docType()).toBe('presentation');
    });

    it('keeps the loaded preview for an identical refreshed copy of the file', async () => {
      clientMock.getPreviewSession.mockResolvedValue(deckSession());
      createComponentWithFile(deckFile);
      await fixture.whenStable();

      component.file = { ...deckFile, url: 'https://cdn.example.com/re-signed.pptx' };
      await fixture.whenStable();

      expect(clientMock.getPreviewSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('spreadsheets', () => {
    const sheetFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'sheet-1',
      name: 'Stats.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'doc',
    };

    function sheetSession(
      sheets: NonNullable<DocumentPreviewSession['manifest']>['sheets']
    ): DocumentPreviewSession {
      return {
        available: true,
        manifest: {
          schemaVersion: 1,
          documentId: sheetFile.id,
          documentType: 'spreadsheet',
          fileName: sheetFile.name,
          mimeType: sheetFile.mimeType,
          sizeBytes: 10,
          pageCount: sheets?.length ?? 0,
          pdfUrl: 'https://cdn.example.com/stats.xlsx',
          sheets,
          generatedAt: '2026-10-03T00:00:00.000Z',
        },
      };
    }

    it('names columns past Z correctly', () => {
      expect(toSpreadsheetColumnName(1)).toBe('A');
      expect(toSpreadsheetColumnName(26)).toBe('Z');
      expect(toSpreadsheetColumnName(27)).toBe('AA');
      expect(toSpreadsheetColumnName(30)).toBe('AD');
      expect(toSpreadsheetColumnName(52)).toBe('AZ');
      expect(toSpreadsheetColumnName(703)).toBe('AAA');
    });

    it('labels grid headers and A1 ranges past Z, and notes truncated sheets', async () => {
      clientMock.getPreviewSession.mockResolvedValue(
        sheetSession([{ sheetId: 's1', name: 'Roster', rowCount: 500, columnCount: 40 }])
      );
      clientMock.getSpreadsheetRange.mockResolvedValue({ cells: [] });
      createComponentWithFile(sheetFile);
      await fixture.whenStable();

      const labels = component.columnHeaderLabels();
      expect(labels).toHaveLength(30);
      expect(labels[25]).toBe('Z');
      expect(labels[26]).toBe('AA');
      expect(labels[29]).toBe('AD');
      expect(component.gridTruncationNotice()).toContain('Showing first 60 rows × 30 columns');

      await component['onSelectCell'](4, 28);
      expect(component.cellSelection()?.rangeA1).toBe('Roster!AB4');
    });

    it('hides the printable toggle and pagination when no printable PDF exists', async () => {
      clientMock.getPreviewSession.mockResolvedValue(
        sheetSession([
          { sheetId: 's1', name: 'A', rowCount: 5, columnCount: 3 },
          { sheetId: 's2', name: 'B', rowCount: 5, columnCount: 3 },
        ])
      );
      clientMock.getSpreadsheetRange.mockResolvedValue({ cells: [] });
      createComponentWithFile(sheetFile);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.printablePdfUrl()).toBeNull();
      expect(component.totalPages()).toBe(1);
      expect(fixture.nativeElement.textContent).not.toContain('Printable View');
      expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    });

    it('falls back when the manifest has zero sheets', async () => {
      clientMock.getPreviewSession.mockResolvedValue(sheetSession([]));
      createComponentWithFile(sheetFile);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.isFallback()).toBe(true);
      expect(component.fallbackReason()).toBe('empty_spreadsheet');
      expect(clientMock.getSpreadsheetRange).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('no sheets');
    });

    it('ignores an out-of-order spreadsheet range response', async () => {
      clientMock.getPreviewSession.mockResolvedValue(
        sheetSession([
          { sheetId: 's1', name: 'A', rowCount: 5, columnCount: 3 },
          { sheetId: 's2', name: 'B', rowCount: 5, columnCount: 3 },
        ])
      );
      let releaseFirst!: (v: unknown) => void;
      clientMock.getSpreadsheetRange
        .mockReturnValueOnce(new Promise((r) => (releaseFirst = r)))
        .mockResolvedValueOnce({
          cells: [{ row: 1, col: 1, value: 'B1', formattedValue: 'from-B' }],
        });
      createComponentWithFile(sheetFile);
      await fixture.whenStable().catch(() => undefined);

      await component['loadSpreadsheetRange'](1);
      releaseFirst({ cells: [{ row: 1, col: 1, value: 'A1', formattedValue: 'from-A' }] });
      await Promise.resolve();

      expect(component.spreadsheetCells()[0]?.formattedValue).toBe('from-B');
    });

    describe('selection and editing', () => {
      const rosterCells = [
        { row: 1, col: 1, value: 'Name', formattedValue: 'Name' },
        { row: 1, col: 2, value: 'Yds', formattedValue: 'Yds' },
        { row: 2, col: 1, value: 'John', formattedValue: 'John' },
        { row: 2, col: 2, value: 120, formattedValue: '120' },
        { row: 3, col: 1, value: 'Marcus', formattedValue: 'Marcus' },
        { row: 3, col: 2, value: 80, formattedValue: '80' },
      ];

      async function openRoster() {
        clientMock.getPreviewSession.mockResolvedValue(
          sheetSession([{ sheetId: 's1', name: 'Roster', rowCount: 3, columnCount: 2 }])
        );
        clientMock.getSpreadsheetRange.mockResolvedValue({ cells: rosterCells });
        createComponentWithFile(sheetFile);
        await fixture.whenStable();
        fixture.detectChanges();
      }

      const cellEl = (row: number, col: number): HTMLElement =>
        fixture.nativeElement.querySelector(`[data-cell="${row}:${col}"]`);

      it('extends the selection with shift-click and computes Excel-style stats', async () => {
        await openRoster();

        await component['onSelectCell'](1, 1);
        await component['onSelectCell'](3, 2, new MouseEvent('mousedown', { shiftKey: true }));

        const sel = component.cellSelection()!;
        expect(sel.rangeA1).toBe('Roster!A1:B3');
        expect(sel.count).toBe(6);
        expect(sel.sum).toBe(200);
        expect(sel.average).toBe(100);
        fixture.detectChanges();
        expect(cellEl(2, 2).classList).toContain('nxt1-doc-viewer__grid-cell--selected');
      });

      it('selects a range by dragging across cells', async () => {
        await openRoster();

        cellEl(2, 1).dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        cellEl(3, 2).dispatchEvent(new MouseEvent('mouseenter'));
        window.dispatchEvent(new MouseEvent('mouseup'));

        expect(component.cellSelection()?.rangeA1).toBe('Roster!A2:B3');
      });

      it('sends every selected value to Agent X with the range', async () => {
        await openRoster();
        const emitted: DocumentAskAgentSelection[] = [];
        component.askAgentRequested.subscribe((selection) => emitted.push(selection));

        await component['onSelectCell'](2, 1);
        await component['onSelectCell'](3, 2, new MouseEvent('mousedown', { shiftKey: true }));
        component['onAskAgentForSelection']();

        expect(emitted[0]?.anchors[0]).toMatchObject({
          anchorType: 'cell_range',
          rangeA1: 'Roster!A2:B3',
        });
        expect(emitted[0]?.excerpts?.[0]).toBe(
          'Selected cells Roster!A2:B3\nColumns: A | B\nRow 2: John | 120\nRow 3: Marcus | 80'
        );
      });

      it('edits a cell in place and saves it to the file', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({
          ok: true,
          cells: [{ row: 2, col: 2, value: 1500, formattedValue: '1,500' }],
        });

        cellEl(2, 2).dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const input = fixture.nativeElement.querySelector(
          '.nxt1-doc-viewer__grid-cell-input'
        ) as HTMLInputElement;
        expect(input.value).toBe('120');

        input.value = '1500';
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(component['getCell'](2, 2)?.formattedValue).toBe('1500');
        await vi.waitFor(() => expect(component['getCell'](2, 2)?.formattedValue).toBe('1,500'));

        expect(clientMock.updateSpreadsheetCells).toHaveBeenCalledWith(sheetFile.id, {
          sheetId: 's1',
          edits: [{ row: 2, col: 2, value: '1500' }],
        });
        // Enter moves down a row, like Excel.
        expect(component.cellSelection()?.rangeA1).toBe('Roster!B3');
      });

      it('starts editing when typing on a selected cell and reverts when the save fails', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({
          ok: false,
          error: "You don't have permission to edit this file.",
        });

        await component['onSelectCell'](2, 1);
        component['onGridKeydown'](new KeyboardEvent('keydown', { key: 'J' }));
        expect(component.cellEditDraft()).toBe('J');
        component.cellEditDraft.set('Jake');
        component['commitCellEdit']();

        await vi.waitFor(() =>
          expect(component.cellSaveError()).toBe("You don't have permission to edit this file.")
        );
        expect(component['getCell'](2, 1)?.formattedValue).toBe('John');
      });

      it('resizes a column by dragging its header edge and saves the width', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({ ok: true, cells: [] });
        const grip = fixture.nativeElement.querySelectorAll('.nxt1-doc-viewer__col-resize')[1];

        grip.dispatchEvent(
          new PointerEvent('pointerdown', { button: 0, clientX: 100, pointerId: 1 })
        );
        grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 156, pointerId: 1 }));
        fixture.detectChanges();
        // 64px default + 56px drag = 120px.
        expect(fixture.nativeElement.querySelectorAll('colgroup col')[2].style.width).toBe('120px');
        expect(component.resizingAxis()).toBe('col');

        grip.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
        expect(component.resizingAxis()).toBeNull();
        await vi.waitFor(() =>
          expect(clientMock.updateSpreadsheetCells).toHaveBeenCalledWith(sheetFile.id, {
            sheetId: 's1',
            edits: [],
            columnWidths: [{ col: 2, width: 16.43 }],
          })
        );
      });

      it('resizes a row by dragging and resets it on double-click', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({ ok: true, cells: [] });
        const grip = fixture.nativeElement.querySelectorAll('.nxt1-doc-viewer__row-resize')[0];

        grip.dispatchEvent(
          new PointerEvent('pointerdown', { button: 0, clientY: 50, pointerId: 1 })
        );
        grip.dispatchEvent(new PointerEvent('pointermove', { clientY: 70, pointerId: 1 }));
        grip.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('tbody tr').style.height).toBe('40px');
        await vi.waitFor(() =>
          expect(clientMock.updateSpreadsheetCells).toHaveBeenCalledWith(sheetFile.id, {
            sheetId: 's1',
            edits: [],
            rowHeights: [{ row: 1, height: 30 }],
          })
        );

        grip.dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('tbody tr').style.height).toBe('20px');
      });

      it('auto-fits a column to its widest value on double-click', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({ ok: true, cells: [] });

        component['autoFitColumn'](1);
        // Without canvas, 'Marcus' measures 6 chars × 7px = 42px, + 9px padding = 51px.
        expect(component['columnWidthPx'](1)).toBe(51);
      });

      it('keeps CSV resizes local instead of saving them', async () => {
        clientMock.getPreviewSession.mockResolvedValue({
          available: true,
          manifest: {
            ...sheetSession([{ sheetId: 'sheet-1', name: 'Sheet 1', rowCount: 3, columnCount: 2 }])
              .manifest!,
            mimeType: 'text/csv',
            fileName: 'roster.csv',
          },
        });
        clientMock.getSpreadsheetRange.mockResolvedValue({ cells: rosterCells });
        createComponentWithFile(sheetFile);
        await fixture.whenStable();

        component['autoFitColumn'](1);
        await Promise.resolve();
        expect(component['columnWidthPx'](1)).toBe(51);
        expect(clientMock.updateSpreadsheetCells).not.toHaveBeenCalled();
      });

      it('clears the selected range with Delete and blocks formula edits', async () => {
        await openRoster();
        clientMock.updateSpreadsheetCells.mockResolvedValue({ ok: true, cells: [] });

        await component['onSelectCell'](2, 1);
        await component['onSelectCell'](3, 1, new MouseEvent('mousedown', { shiftKey: true }));
        component['onGridKeydown'](new KeyboardEvent('keydown', { key: 'Delete' }));
        await vi.waitFor(() =>
          expect(clientMock.updateSpreadsheetCells).toHaveBeenCalledWith(sheetFile.id, {
            sheetId: 's1',
            edits: [
              { row: 2, col: 1, value: '' },
              { row: 3, col: 1, value: '' },
            ],
          })
        );

        component['startCellEdit'](1, 1);
        component.cellEditDraft.set('=SUM(B2:B3)');
        component['commitCellEdit']();
        expect(component.cellSaveError()).toContain("Formulas can't be edited");
        expect(clientMock.updateSpreadsheetCells).toHaveBeenCalledTimes(1);
      });
    });

    it('renders workbook fills, font colors, merges, and column widths', async () => {
      clientMock.getPreviewSession.mockResolvedValue(
        sheetSession([{ sheetId: 's1', name: 'A', rowCount: 2, columnCount: 3 }])
      );
      clientMock.getSpreadsheetRange.mockResolvedValue({
        columnWidths: [20, null, null],
        cells: [
          {
            row: 1,
            col: 1,
            value: 'Title',
            formattedValue: 'Title',
            colSpan: 3,
            rowSpan: 1,
            style: { backgroundColor: '#1f4e78', fontColor: '#ffffff', horizontalAlign: 'center' },
          },
          {
            row: 2,
            col: 1,
            value: null,
            formattedValue: '',
            style: { backgroundColor: '#e2f0d9' },
          },
          { row: 2, col: 2, value: 42, formattedValue: '42' },
        ],
      });
      createComponentWithFile(sheetFile);
      await fixture.whenStable();
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const firstRowCells = rows[0].querySelectorAll('td.nxt1-doc-viewer__grid-cell');
      // A1:C1 merge collapses three of the ten default columns into one cell.
      expect(firstRowCells.length).toBe(8);
      expect(firstRowCells[0].getAttribute('colspan')).toBe('3');
      expect(firstRowCells[0].style.backgroundColor).toBe('#1f4e78');
      expect(firstRowCells[0].style.color).toBe('#ffffff');
      expect(firstRowCells[0].style.textAlign).toBe('center');

      const secondRowCells = rows[1].querySelectorAll('td.nxt1-doc-viewer__grid-cell');
      expect(secondRowCells[0].style.backgroundColor).toBe('#e2f0d9');
      expect(secondRowCells[1].style.textAlign).toBe('right');

      const cols = fixture.nativeElement.querySelectorAll('colgroup col');
      expect(cols[1].style.width).toBe('145px');
      expect(cols[2].style.width).toBe('64px');
    });
  });

  it('falls back when a presentation manifest has zero slides', async () => {
    clientMock.getPreviewSession.mockResolvedValue({
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'deck-empty',
        documentType: 'presentation',
        fileName: 'Empty.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: 10,
        pageCount: 0,
        slides: [],
        generatedAt: '2026-10-03T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession);
    createComponentWithFile({ ...sampleFile, id: 'deck-empty', name: 'Empty.pptx', kind: 'pptx' });
    await fixture.whenStable();

    expect(component.isFallback()).toBe(true);
    expect(component.fallbackReason()).toBe('empty_presentation');
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

  describe('native presentation rendering', () => {
    interface PptxInternals {
      paintSlide(
        deck: NonNullable<ReturnType<NxtDocumentViewerComponent['pptxDeck']>>,
        host: HTMLElement,
        index: number,
        scale?: number
      ): void;
    }

    const deckFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'deck-native',
      name: 'GamePlan.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      kind: 'pptx',
      url: 'https://cdn.example.com/GamePlan.pptx',
    };
    const deckSession = (): DocumentPreviewSession => ({
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'deck-native',
        documentType: 'presentation',
        fileName: 'GamePlan.pptx',
        mimeType: deckFile.mimeType,
        sizeBytes: 4096,
        pageCount: 2,
        pdfUrl: 'https://storage.example.com/signed/GamePlan.pptx',
        slides: [
          { slideNumber: 1, title: 'Cover', slideText: 'Week 4 Plan', speakerNotes: 'Notes 1' },
          { slideNumber: 2, title: 'Keys', slideText: 'Run the ball' },
        ],
        generatedAt: '2026-09-27T00:00:00.000Z',
      },
    });

    it('renders the actual slides from the signed source URL', async () => {
      const data = await buildDeck([
        slideXml(textShape(2, 'Week 4 Plan')),
        slideXml(textShape(2, 'Run the ball')),
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => data,
      });
      vi.stubGlobal('fetch', fetchMock);
      clientMock.getPreviewSession.mockResolvedValue(deckSession());

      createComponentWithFile(deckFile);
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(component.pptxDeck()).not.toBeNull();
      });
      fixture.detectChanges();

      expect(fetchMock).toHaveBeenCalledWith('https://storage.example.com/signed/GamePlan.pptx');
      expect(component.totalSlides()).toBe(2);
      // The native stage replaces the text-outline card.
      expect(fixture.nativeElement.querySelector('.nxt1-doc-viewer__slide-host')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.nxt1-doc-viewer__slide-card')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.nxt1-doc-viewer__thumb-canvas')).toHaveLength(
        2
      );

      // Signal view queries need the AOT compiler, so paint into a host directly (as the docx tests do).
      const deck = component.pptxDeck();
      const host = document.createElement('div');
      const paint = (component as unknown as PptxInternals).paintSlide.bind(component);
      if (!deck) throw new Error('deck not loaded');
      // (Slide order itself is covered by the real-browser check; happy-dom drops `r:id`.)
      paint(deck, host, 0);
      const first = host.textContent ?? '';
      paint(deck, host, 1, 0.1);
      expect([first, host.textContent].sort()).toEqual(['Run the ball', 'Week 4 Plan']);
      // Thumbnails scale from the top-left corner; a centered origin pushes the slide out of view.
      const thumbSlide = host.firstElementChild as HTMLElement;
      expect(thumbSlide.style.transform).toBe('scale(0.1)');
      expect(thumbSlide.style.transformOrigin).toMatch(/^0(px)? 0(px)?/);
      expect(thumbSlide.style.position).toBe('absolute');

      await component['nextSlide']();
      expect(component.currentSlideData()?.title).toBe('Keys');
    });

    it('keeps the text outline when the deck cannot be rendered', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode('not a zip').buffer,
        })
      );
      clientMock.getPreviewSession.mockResolvedValue(deckSession());

      createComponentWithFile(deckFile);
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(component.pptxRendering()).toBe(false);
      });

      expect(component.pptxDeck()).toBeNull();
      expect(component.isFallback()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Week 4 Plan');
    });
  });

  describe('showAskAgent', () => {
    const deckFile: AgentXLibraryFile = {
      ...sampleFile,
      id: 'deck-ask',
      name: 'Deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      kind: 'pptx',
    };
    const deckSession = {
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: deckFile.id,
        documentType: 'presentation',
        fileName: deckFile.name,
        mimeType: deckFile.mimeType,
        sizeBytes: 10,
        pageCount: 1,
        slides: [{ slideNumber: 1, title: 'One', slideText: 'a' }],
        generatedAt: '2026-10-03T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession;

    const askAgentButton = () =>
      fixture.nativeElement.querySelector(
        `[data-testid="${DOCUMENT_VIEWER_TEST_IDS.ASK_AGENT_BTN}"]`
      );

    async function renderDeck(showAskAgent?: boolean): Promise<void> {
      clientMock.getPreviewSession.mockResolvedValue(deckSession);
      createComponentWithFile(deckFile);
      if (showAskAgent !== undefined) component.showAskAgent = showAskAgent;
      await vi.waitFor(() => expect(component.manifest()?.documentType).toBe('presentation'));
      fixture.detectChanges();
    }

    it('shows the Ask Agent X action by default', async () => {
      await renderDeck();

      expect(askAgentButton()).toBeTruthy();
    });

    it('hides the Ask Agent X action when the host turns it off', async () => {
      await renderDeck(false);

      expect(fixture.nativeElement.querySelector('.nxt1-doc-viewer__toolbar')).toBeTruthy();
      expect(askAgentButton()).toBeNull();
    });
  });

  describe('toolbarDownload', () => {
    const pdfSession = {
      available: true,
      manifest: {
        schemaVersion: 1,
        documentId: 'file-doc-1',
        documentType: 'pdf',
        fileName: 'Playbook.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        pageCount: 3,
        generatedAt: '2026-09-27T00:00:00.000Z',
      },
    } satisfies DocumentPreviewSession;

    const byTestId = (id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;

    async function renderPdf(toolbarDownload: boolean, downloadBusy = false): Promise<void> {
      clientMock.getPreviewSession.mockResolvedValue(pdfSession);
      createComponentWithFile(sampleFile);
      vi.spyOn(
        component as unknown as { initPdfViewer: (url: string) => Promise<void> },
        'initPdfViewer'
      ).mockResolvedValue(undefined);
      component.toolbarDownload = toolbarDownload;
      component.downloadBusy = downloadBusy;
      await vi.waitFor(() => expect(component.manifest()?.documentType).toBe('pdf'));
      await vi.waitFor(() => expect(component.loading()).toBe(false));
      fixture.detectChanges();
    }

    it('keeps Rotate and no toolbar Download by default', async () => {
      await renderPdf(false);

      expect(byTestId(DOCUMENT_VIEWER_TEST_IDS.ROTATE_BTN)).toBeTruthy();
      expect(byTestId(DOCUMENT_VIEWER_TEST_IDS.DOWNLOAD_BTN)).toBeNull();
    });

    it('replaces Rotate with a Download action that emits downloadRequested', async () => {
      await renderPdf(true);
      const downloadSpy = vi.fn();
      component.downloadRequested.subscribe(downloadSpy);

      expect(byTestId(DOCUMENT_VIEWER_TEST_IDS.ROTATE_BTN)).toBeNull();
      byTestId(DOCUMENT_VIEWER_TEST_IDS.DOWNLOAD_BTN)!.click();

      expect(downloadSpy).toHaveBeenCalledWith(sampleFile);
    });

    it('disables the toolbar Download while the host is busy', async () => {
      await renderPdf(true, true);

      expect(byTestId(DOCUMENT_VIEWER_TEST_IDS.DOWNLOAD_BTN)!.disabled).toBe(true);
    });
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

describe('withDocxFontFallback', () => {
  it('appends a sans stack to Office sans fonts so they never drop to the default serif', () => {
    expect(withDocxFontFallback('Aptos')).toMatch(/^Aptos, .*sans-serif$/);
    expect(withDocxFontFallback('var(--docx-minorHAnsi-font)')).toMatch(/sans-serif$/);
  });

  it('prefers the metric-compatible twin for Calibri and Cambria', () => {
    expect(withDocxFontFallback('Calibri')).toMatch(/^Calibri, Carlito, .*sans-serif$/);
    expect(withDocxFontFallback('"Cambria"')).toMatch(/^"Cambria", Caladea, .*[^-]serif$/);
  });

  it('matches serif and monospace primaries to their own class', () => {
    expect(withDocxFontFallback('Times New Roman')).toMatch(/, serif$/);
    expect(withDocxFontFallback('Consolas')).toMatch(/monospace$/);
  });

  it('leaves values that already end in a generic family untouched', () => {
    expect(withDocxFontFallback('Arial, sans-serif')).toBe('Arial, sans-serif');
  });
});
