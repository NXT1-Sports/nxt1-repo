import { describe, expect, it } from 'vitest';
import {
  getUniversalFileClassification,
  getUniversalFilmReviewPayload,
  getUniversalPrimaryClassification,
  resolveUniversalFileDocumentType,
  isDocumentPreviewSupported,
  formatDocumentAnchorLabel,
} from './universal-file.model';
import { buildDocumentAnchorSelectedContext } from '../../ai/agent-x-context.types';

describe('universal file classification', () => {
  it('prefers universal classification fields over legacy documentSubtype aliases', () => {
    const classification = getUniversalFileClassification({
      type: 'file',
      documentSubtype: 'legacy_game_plan',
      classification: {
        primary: 'game_plan',
        route: 'game-plans',
        labels: ['strategy'],
      },
    });

    expect(classification).toEqual({
      primary: 'game-plans',
      route: 'game-plans',
      labels: ['strategy', 'game-plans'],
    });
    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'legacy_game_plan',
        classification: {
          primary: 'game_plan',
          route: 'game-plans',
        },
      })
    ).toBe('game-plans');
  });

  it('does not classify file records from documentSubtype alone anymore', () => {
    expect(
      getUniversalFileClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeNull();

    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeUndefined();
  });
});

describe('universal film review payload detection', () => {
  it('does not treat native asset payload containers as film reviews', () => {
    expect(
      getUniversalFilmReviewPayload({
        asset: {
          mimeType: 'video/mp4',
          kind: 'video',
          origin: 'files_upload',
          sizeBytes: 4096,
          url: 'https://cdn.example.com/practice-clip.mp4',
        },
      })
    ).toBeNull();
  });

  it('reads nested film review payloads from native file payload containers', () => {
    expect(
      getUniversalFilmReviewPayload({
        asset: {
          mimeType: 'video/mp4',
          kind: 'video',
          origin: 'files_upload',
          sizeBytes: 4096,
          url: 'https://cdn.example.com/practice-clip.mp4',
        },
        filmReview: {
          videoUrl: 'https://cdn.example.com/practice-clip.mp4',
          playlistId: 'playlist-special-teams',
        },
      })
    ).toMatchObject({
      videoUrl: 'https://cdn.example.com/practice-clip.mp4',
      playlistId: 'playlist-special-teams',
    });
  });
});

describe('document preview type resolution and anchoring', () => {
  it('correctly resolves document types from MIME and extensions', () => {
    expect(resolveUniversalFileDocumentType('application/pdf', 'Playbook.pdf')).toBe('pdf');
    expect(resolveUniversalFileDocumentType(undefined, 'defense.PDF')).toBe('pdf');
    expect(
      resolveUniversalFileDocumentType(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Install.pptx'
      )
    ).toBe('presentation');
    expect(resolveUniversalFileDocumentType(undefined, 'Scout_Deck.ppt')).toBe('presentation');
    expect(
      resolveUniversalFileDocumentType(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Roster.xlsx'
      )
    ).toBe('spreadsheet');
    expect(resolveUniversalFileDocumentType('text/csv', 'Stats.csv')).toBe('spreadsheet');
    expect(
      resolveUniversalFileDocumentType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Rules.docx'
      )
    ).toBe('word');
    expect(resolveUniversalFileDocumentType('image/png', 'Diagram.png')).toBe('image');
    expect(resolveUniversalFileDocumentType('video/mp4', 'Film.mp4')).toBe('video');
    expect(resolveUniversalFileDocumentType('application/zip', 'Archive.zip')).toBe('unsupported');
  });

  it('determines if native preview is supported', () => {
    expect(isDocumentPreviewSupported('application/pdf', 'playbook.pdf')).toBe(true);
    expect(isDocumentPreviewSupported(undefined, 'deck.pptx')).toBe(true);
    expect(isDocumentPreviewSupported('text/csv', 'data.csv')).toBe(true);
    expect(isDocumentPreviewSupported(undefined, 'notes.docx')).toBe(true);
    expect(isDocumentPreviewSupported('application/zip', 'archive.zip')).toBe(false);
  });

  it('formats human-readable anchor labels', () => {
    expect(
      formatDocumentAnchorLabel({
        documentFileId: 'file-1',
        anchorType: 'page',
        pageNumber: 5,
      })
    ).toBe('Page 5');

    expect(
      formatDocumentAnchorLabel({
        documentFileId: 'file-1',
        anchorType: 'slide',
        slideNumber: 3,
      })
    ).toBe('Slide 3');

    expect(
      formatDocumentAnchorLabel({
        documentFileId: 'file-1',
        anchorType: 'sheet',
        sheetName: 'Roster',
      })
    ).toBe('Sheet: Roster');

    expect(
      formatDocumentAnchorLabel({
        documentFileId: 'file-1',
        anchorType: 'cell_range',
        sheetName: 'Offense',
        rangeA1: 'A1:D20',
      })
    ).toBe('Offense!A1:D20');
  });

  it('constructs well-formed AgentXSelectedContext document anchors', () => {
    const context = buildDocumentAnchorSelectedContext({
      file: { id: 'file-doc-1', name: 'Spring Playbook.pdf' },
      anchor: {
        documentFileId: 'file-doc-1',
        anchorType: 'page',
        pageNumber: 12,
      },
      excerpt: 'Formation breakdown on page 12',
    });

    expect(context.id).toBe('doc-anchor:file-doc-1:page:12');
    expect(context.kind).toBe('document');
    expect(context.title).toBe('Spring Playbook.pdf — Page 12');
    expect(context.summary).toBe('Formation breakdown on page 12');
    expect(context.source).toEqual({
      type: 'agent_x',
      id: 'file-doc-1',
      label: 'Spring Playbook.pdf',
    });
    expect(context.entityRefs).toEqual([
      { type: 'team_file', id: 'file-doc-1', label: 'Spring Playbook.pdf' },
      { type: 'team_file_document_anchor', id: 'file-doc-1:page:12', label: 'Page 12' },
    ]);
    expect(context.metadata).toMatchObject({
      documentFileId: 'file-doc-1',
      anchorType: 'page',
      pageNumber: 12,
    });
  });
});
