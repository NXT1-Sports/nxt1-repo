import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AgentXSelectedContext } from '@nxt1/core';
import { expandSelectedContextsWithDatabase } from './chat-context.async.helpers.js';

function createFirestoreMock(records: Record<string, Record<string, unknown>>): Firestore {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn().mockResolvedValue({
          exists: Object.prototype.hasOwnProperty.call(records, id),
          data: () => records[id],
        }),
      })),
    })),
  } as unknown as Firestore;
}

describe('chat-context.async.helpers', () => {
  it('expands selected film plays into a breakdown table', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            timeline: [
              {
                id: 'play-1',
                number: 1,
                label: 'Inside Zone',
                tags: {
                  odk: 'O',
                  down: '1',
                  distance: '10',
                  result: 'Gain 6',
                },
              },
            ],
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'film-play:review-1:play-1',
        kind: 'film_play',
        title: 'Inside Zone @ 12s',
        summary: 'Review clip',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Review vs East',
        },
        timeRange: {
          startSec: 12,
          endSec: 17,
        },
        entityRefs: [
          { type: 'film_review', id: 'review-1', label: 'Review vs East' },
          { type: 'film_play', id: 'play-1', label: 'Inside Zone' },
        ],
        metadata: {},
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Breakdown Data for Selected Film Contexts]');
    expect(expanded).toContain('**Film Review: Review vs East**');
    expect(expanded).toContain('| 1 | 12s-17s | O | 1 | 10 | Inside Zone | Gain 6 |');
  });

  it('expands a full selected film review file when no individual play IDs are attached', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            sport: 'football',
            opponentName: 'East',
            aiSummary: 'Strong downhill run fits and good pad level.',
            timeline: [],
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'film-review:review-1',
        kind: 'film_play',
        title: 'Review vs East',
        summary: 'Hudl breakdown • 24 tagged plays',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Review vs East',
        },
        entityRefs: [{ type: 'film_review', id: 'review-1', label: 'Review vs East' }],
        metadata: {
          itemType: 'film_review',
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Team File Contexts]');
    expect(expanded).toContain('1. Review vs East');
    expect(expanded).toContain('Title: Review vs East');
    expect(expanded).toContain('Opponent: East');
    expect(expanded).toContain('Summary: Strong downhill run fits and good pad level.');
  });

  it('expands child TeamFiles when a folder is dropped into chat', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            sport: 'football',
            opponentName: 'East',
            aiSummary: 'Explosive first step and clean scrape exchanges.',
            timeline: [],
          },
        },
      },
      'doc-2': {
        title: 'Wednesday Install',
        semanticText:
          'Title: Wednesday Install\nSubtype: pdf\nSummary: Red-zone install sheet for this week.',
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'team-file-folder:folder-1',
        kind: 'document',
        title: 'Scouting Folder',
        summary: '2 files in this folder',
        source: {
          type: 'agent_x',
          id: 'folder-1',
          label: 'Scouting Folder',
        },
        entityRefs: [
          { type: 'team_file_folder', id: 'folder-1', label: 'Scouting Folder' },
          { type: 'team_file', id: 'review-1', label: 'Review vs East' },
          { type: 'team_file', id: 'doc-2', label: 'Wednesday Install' },
        ],
        metadata: {
          itemType: 'team_file_folder',
          fileIdsCsv: 'review-1,doc-2',
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Team File Contexts]');
    expect(expanded).toContain('1. review-1 (from folder: Scouting Folder)');
    expect(expanded).toContain('Title: Review vs East');
    expect(expanded).toContain('2. doc-2 (from folder: Scouting Folder)');
    expect(expanded).toContain('Title: Wednesday Install');
    expect(expanded).toContain('Summary: Red-zone install sheet for this week.');
  });
});
