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

  it('expands selected film source clips into matching breakdown rows', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            sources: [
              {
                id: 'play-source-1',
                order: 1,
                videoUrl: 'https://example.com/clip-1.mp4',
                title: 'IMG_0093 2',
              },
            ],
            timeline: [
              {
                id: 'timeline-row-22',
                number: 22,
                label: 'Power Read',
                startSec: 0,
                endSec: 8,
                sourceId: 'play-source-1',
                tags: {
                  odk: 'O',
                  down: '2',
                  distance: '7',
                  play_name: 'Power Read',
                  result: 'Gain 12',
                  personnel: '11',
                },
              },
            ],
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'film-play:review-1:play-play-source-1',
        kind: 'film_play',
        title: 'IMG_0093 2 @ 0:00',
        summary: 'Review clip',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Review vs East',
        },
        timeRange: {
          startSec: 0,
          endSec: 8,
        },
        entityRefs: [
          { type: 'film_review', id: 'review-1', label: 'Review vs East' },
          { type: 'film_play', id: 'play-play-source-1', label: 'IMG_0093 2' },
          { type: 'film_review_source', id: 'play-source-1', label: 'IMG_0093 2' },
        ],
        metadata: {
          sourceId: 'play-source-1',
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Breakdown Data for Selected Film Contexts]');
    expect(expanded).toContain('Use this row-level context first');
    expect(expanded).toContain('**Film Review: Review vs East**');
    expect(expanded).toContain('| 22 | 0s-8s | O | 2 | 7 | Power Read | Gain 12 | personnel: 11 |');
  });

  it('expands bundled selected film plays when the bundle preserves original refs', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            sources: [
              {
                id: 'play-source-1',
                order: 1,
                videoUrl: 'https://example.com/clip-1.mp4',
                title: 'IMG_0093 2',
              },
              {
                id: 'play-source-2',
                order: 2,
                videoUrl: 'https://example.com/clip-2.mp4',
                title: 'IMG_0191',
              },
            ],
            timeline: [
              {
                id: 'play-1',
                number: 1,
                label: 'Inside Zone',
                startSec: 0,
                endSec: 6,
                sourceId: 'play-source-1',
                tags: {
                  odk: 'O',
                  down: '1',
                  distance: '10',
                  result: 'Gain 6',
                },
              },
              {
                id: 'play-2',
                number: 2,
                label: 'Power Read',
                startSec: 6,
                endSec: 12,
                sourceId: 'play-source-2',
                tags: {
                  odk: 'O',
                  down: '2',
                  distance: '7',
                  result: 'Gain 12',
                },
              },
            ],
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'film_play:film_review:review-1:bundle',
        kind: 'film_play',
        title: '4 selected film plays',
        summary: 'From Review vs East. Includes IMG_0093 2, IMG_0191, and 2 more.',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Review vs East',
        },
        entityRefs: [
          { type: 'film_review', id: 'review-1', label: 'Review vs East' },
          { type: 'film_play', id: 'play-1', label: 'Inside Zone' },
          { type: 'film_review_source', id: 'play-source-1', label: 'IMG_0093 2' },
          { type: 'film_play', id: 'play-2', label: 'Power Read' },
          { type: 'film_review_source', id: 'play-source-2', label: 'IMG_0191' },
        ],
        metadata: {
          bundleCount: 4,
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Breakdown Data for Selected Film Contexts]');
    expect(expanded).toContain('**Film Review: Review vs East**');
    expect(expanded).toContain('| 1 | 0s-6s | O | 1 | 10 | Inside Zone | Gain 6 |');
    expect(expanded).toContain('| 2 | 6s-12s | O | 2 | 7 | Power Read | Gain 12 |');
  });

  it('keeps selected film source clips in context when no breakdown rows exist', async () => {
    const db = createFirestoreMock({
      'review-1': {
        payload: {
          filmReview: {
            title: 'Review vs East',
            sources: [
              {
                id: 'play-source-1',
                order: 1,
                videoUrl: 'https://example.com/clip-1.mp4',
                title: 'IMG_0093 2',
              },
            ],
            timeline: [],
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'film-play:review-1:play-play-source-1',
        kind: 'film_play',
        title: 'IMG_0093 2 @ 0:00',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Review vs East',
        },
        entityRefs: [
          { type: 'film_review', id: 'review-1', label: 'Review vs East' },
          { type: 'film_review_source', id: 'play-source-1', label: 'IMG_0093 2' },
        ],
        metadata: {
          sourceId: 'play-source-1',
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Breakdown Data for Selected Film Contexts]');
    expect(expanded).toContain('selected source clip have no saved breakdown rows');
    expect(expanded).toContain('| IMG_0093 2 | play-source-1 | no saved breakdown rows |');
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

  it('includes artifact notes and text content for folder-dropped documents without semantic text', async () => {
    const db = createFirestoreMock({
      'doc-3': {
        title: 'Coach Notes',
        summary: 'Weekly install notes.',
        artifactSummary: 'Condensed coaching summary.',
        artifactNotes: 'Watch boundary leverage on motion checks.',
        payload: {
          kind: 'doc',
          content: {
            text: 'Detailed install reminders and situational coaching notes.',
          },
        },
      },
    });

    const selectedContexts: AgentXSelectedContext[] = [
      {
        id: 'team-file-folder:folder-2',
        kind: 'document',
        title: 'Install Folder',
        summary: '1 file in this folder',
        source: {
          type: 'agent_x',
          id: 'folder-2',
          label: 'Install Folder',
        },
        entityRefs: [
          { type: 'team_file_folder', id: 'folder-2', label: 'Install Folder' },
          { type: 'team_file', id: 'doc-3', label: 'Coach Notes' },
        ],
        metadata: {
          itemType: 'team_file_folder',
          fileIdsCsv: 'doc-3',
        },
      },
    ];

    const expanded = await expandSelectedContextsWithDatabase(db, selectedContexts);

    expect(expanded).toContain('[Expanded Team File Contexts]');
    expect(expanded).toContain('1. doc-3 (from folder: Install Folder)');
    expect(expanded).toContain('Title: Coach Notes');
    expect(expanded).toContain('Summary: Weekly install notes.');
    expect(expanded).toContain('Artifact Summary: Condensed coaching summary.');
    expect(expanded).toContain('Artifact Notes: Watch boundary leverage on motion checks.');
    expect(expanded).toContain(
      'Text Content: Detailed install reminders and situational coaching notes.'
    );
  });
});
