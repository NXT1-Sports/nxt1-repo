import { describe, expect, it } from 'vitest';
import {
  TEAM_FILM_REVIEW_FALLBACK_PLAY_TAG_SCHEMA,
  getTeamFilmReviewSportTagDefinitions,
  resolveTeamFilmReviewSportTagSchemaKey,
} from './team-film-review.model';

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
