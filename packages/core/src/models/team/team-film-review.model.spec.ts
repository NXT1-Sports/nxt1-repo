import { describe, expect, it } from 'vitest';
import {
  TEAM_FILM_REVIEW_FALLBACK_PLAY_TAG_SCHEMA,
  TeamFilmReviewSourceBreakdownPatchError,
  buildTeamFilmReviewSourceAngleMetadata,
  getTeamFilmReviewSportTagDefinitions,
  mergeTeamFilmReviewSourceBreakdownPatches,
  resolveTeamFilmReviewRowOwnership,
  resolveTeamFilmReviewSportTagSchemaKey,
  type TeamFilmReviewDoc,
} from './team-film-review.model';

function makeReview(overrides: Partial<TeamFilmReviewDoc> = {}): TeamFilmReviewDoc {
  return {
    id: 'review-1',
    sport: 'football',
    title: 'Week 1',
    status: 'ready',
    videoUrl: 'https://cdn.example.com/film.mp4',
    source: 'team_files',
    schemaVersion: 2,
    createdBy: 'coach-1',
    updatedBy: 'coach-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    sources: [{ id: 'source-1', order: 0, videoUrl: 'https://cdn.example.com/film.mp4' }],
    timeline: [
      {
        id: 'row-1',
        sourceId: 'source-1',
        number: 1,
        label: 'Inside zone',
        startSec: 10,
        endSec: 18,
        annotation: {
          kind: 'text',
          text: 'Check the backside fit',
          bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
        },
        tags: { odk: 'O', defFront: 'Even', coverage: 'Cover 3' },
      },
    ],
    ...overrides,
  };
}

describe('team film review sport tag schemas', () => {
  it('returns the football tag schema for football film', () => {
    const schema = getTeamFilmReviewSportTagDefinitions('football');

    expect(schema.map((column) => column.id)).toContain('odk');
    expect(schema.map((column) => column.id)).toContain('coverage');
    expect(schema.find((column) => column.id === 'odk')?.options).toEqual(['O', 'D', 'K']);
  });

  it('normalizes sport aliases to the closest schema key', () => {
    expect(resolveTeamFilmReviewSportTagSchemaKey('Girls Lacrosse')).toBe('lacrosse');
    expect(resolveTeamFilmReviewSportTagSchemaKey('Flag Football')).toBe('football');
    expect(resolveTeamFilmReviewSportTagSchemaKey('Ice Hockey')).toBe('hockey');
  });

  it('falls back to the generic schema for unsupported sports', () => {
    expect(getTeamFilmReviewSportTagDefinitions('swimming')).toEqual(
      TEAM_FILM_REVIEW_FALLBACK_PLAY_TAG_SCHEMA
    );
  });
});

describe('buildTeamFilmReviewSourceAngleMetadata', () => {
  it('pairs wide and tight source videos from matching filenames', () => {
    expect(
      buildTeamFilmReviewSourceAngleMetadata([
        'Central Valley Game 1 Wide.mp4',
        'Central Valley Game 1 Tight.mp4',
        'Central Valley Game 2.mp4',
      ])
    ).toEqual([
      {
        cameraAngle: 'wide',
        angleDetectionSource: 'filename',
        angleGroupId: 'angle-central-valley-game-1',
      },
      {
        cameraAngle: 'tight',
        angleDetectionSource: 'filename',
        angleGroupId: 'angle-central-valley-game-1',
      },
      {
        cameraAngle: 'unknown',
        angleDetectionSource: 'unknown',
      },
    ]);
  });
});

describe('resolveTeamFilmReviewRowOwnership', () => {
  it('maps football O rows to our offense and opponent defense', () => {
    const row = makeReview().timeline![0]!;

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'football', row })).toMatchObject({
      rowKind: 'offense_defense',
      actionTeam: 'our',
      offensiveTagsDescribe: 'our',
      defensiveTagsDescribe: 'opponent',
      confidence: 'verified',
    });
  });

  it('maps football D rows to opponent offense and our defense', () => {
    const row = { ...makeReview().timeline![0]!, tags: { odk: 'D', defFront: 'Odd' } };

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'football', row })).toMatchObject({
      rowKind: 'offense_defense',
      actionTeam: 'opponent',
      offensiveTagsDescribe: 'opponent',
      defensiveTagsDescribe: 'our',
      confidence: 'verified',
    });
  });

  it('keeps football K rows out of offense and defense buckets', () => {
    const row = { ...makeReview().timeline![0]!, tags: { odk: 'K', playType: 'Punt' } };

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'football', row })).toMatchObject({
      rowKind: 'special_teams',
      actionTeam: 'unknown',
      offensiveTagsDescribe: 'unknown',
      defensiveTagsDescribe: 'unknown',
      confidence: 'verified',
    });
  });

  it('maps possession sports using possession O/D tags', () => {
    const row = {
      ...makeReview().timeline![0]!,
      tags: { possession: 'D', action: 'Pick and roll' },
    };

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'basketball', row })).toMatchObject({
      rowKind: 'possession',
      actionTeam: 'opponent',
      offensiveTagsDescribe: 'opponent',
      defensiveTagsDescribe: 'our',
      confidence: 'verified',
    });
  });

  it('requires home or away context for baseball and softball half-inning rows', () => {
    const row = { ...makeReview().timeline![0]!, tags: { half: 'TOP', pitchType: 'Fastball' } };

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'baseball', row })).toMatchObject({
      rowKind: 'at_bat',
      actionTeam: 'unknown',
      confidence: 'ambiguous',
      requiredClarification: 'Is our team home or away for this game?',
    });

    expect(
      resolveTeamFilmReviewRowOwnership({ sport: 'baseball', row, ourTeamGameSide: 'away' })
    ).toMatchObject({
      rowKind: 'at_bat',
      actionTeam: 'our',
      offensiveTagsDescribe: 'our',
      defensiveTagsDescribe: 'opponent',
      confidence: 'verified',
    });
  });

  it('returns an explicit clarification requirement when ownership cannot be resolved', () => {
    const row = { ...makeReview().timeline![0]!, tags: { phase: 'Forecheck', action: 'Dump in' } };

    expect(resolveTeamFilmReviewRowOwnership({ sport: 'hockey', row })).toMatchObject({
      rowKind: 'unknown',
      actionTeam: 'unknown',
      confidence: 'ambiguous',
    });
  });
});

describe('mergeTeamFilmReviewSourceBreakdownPatches', () => {
  it('patches one field while preserving other tags, annotations, and review metadata', () => {
    const review = makeReview();

    const updated = mergeTeamFilmReviewSourceBreakdownPatches({
      review,
      expectedRevision: 0,
      patches: [
        {
          sourceId: 'source-1',
          rowId: 'row-1',
          tags: { defFront: 'Odd' },
          tagProvenance: { defFront: { origin: 'agent_x', confidence: 0.92 } },
        },
      ],
    });

    expect(updated.reviewRevision).toBe(1);
    expect(updated.title).toBe(review.title);
    expect(updated.timeline?.[0]).toMatchObject({
      annotation: review.timeline?.[0]?.annotation,
      tags: { odk: 'O', defFront: 'Odd', coverage: 'Cover 3' },
      tagProvenance: { defFront: { origin: 'agent_x', confidence: 0.92 } },
    });
  });

  it('explicitly clears only requested tags and their provenance', () => {
    const review = makeReview({
      timeline: [
        {
          ...makeReview().timeline![0]!,
          tagProvenance: {
            defFront: { origin: 'agent_x' },
            coverage: { origin: 'manual' },
          },
        },
      ],
    });

    const updated = mergeTeamFilmReviewSourceBreakdownPatches({
      review,
      patches: [{ sourceId: 'source-1', rowId: 'row-1', clearTagIds: ['defFront'] }],
    });

    expect(updated.timeline?.[0]?.tags).toEqual({ odk: 'O', coverage: 'Cover 3' });
    expect(updated.timeline?.[0]?.tagProvenance).toEqual({ coverage: { origin: 'manual' } });
  });

  it('removes tag provenance when the final tracked tag is cleared', () => {
    const review = makeReview({
      timeline: [
        {
          ...makeReview().timeline![0]!,
          tagProvenance: { defFront: { origin: 'agent_x' } },
        },
      ],
    });

    const updated = mergeTeamFilmReviewSourceBreakdownPatches({
      review,
      patches: [{ sourceId: 'source-1', rowId: 'row-1', clearTagIds: ['defFront'] }],
    });

    expect(updated.timeline?.[0]?.tagProvenance).toBeUndefined();
  });

  it.each([
    [{ unknownTag: 'value' }, 'INVALID_TAG_ID'],
    [{ down: 'first' }, 'INVALID_TAG_VALUE'],
    [{ odk: 'X' }, 'INVALID_TAG_VALUE'],
  ] as const)('rejects invalid schema tag updates', (tags, code) => {
    expect(() =>
      mergeTeamFilmReviewSourceBreakdownPatches({
        review: makeReview(),
        patches: [{ sourceId: 'source-1', rowId: 'row-1', tags }],
      })
    ).toThrowError(expect.objectContaining<TeamFilmReviewSourceBreakdownPatchError>({ code }));
  });

  it('rejects stale revisions and duplicate row targets', () => {
    expect(() =>
      mergeTeamFilmReviewSourceBreakdownPatches({
        review: makeReview({ reviewRevision: 3 }),
        expectedRevision: 2,
        patches: [{ sourceId: 'source-1', rowId: 'row-1', tags: { defFront: 'Odd' } }],
      })
    ).toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }));

    expect(() =>
      mergeTeamFilmReviewSourceBreakdownPatches({
        review: makeReview(),
        patches: [
          { sourceId: 'source-1', rowId: 'row-1', tags: { defFront: 'Odd' } },
          { sourceId: 'source-1', rowId: 'row-1', tags: { coverage: 'Cover 2' } },
        ],
      })
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PATCH' }));
  });
});
