import { describe, expect, it } from 'vitest';
import { canAutoCreateTeamFilmReview } from './agent-x-operation-chat-attachments.facade';

describe('canAutoCreateTeamFilmReview', () => {
  it('allows manager roles', () => {
    expect(canAutoCreateTeamFilmReview('coach')).toBe(true);
    expect(canAutoCreateTeamFilmReview('Director')).toBe(true);
    expect(canAutoCreateTeamFilmReview('assistant coach')).toBe(true);
  });

  it('blocks athlete and missing roles', () => {
    expect(canAutoCreateTeamFilmReview('athlete')).toBe(false);
    expect(canAutoCreateTeamFilmReview(null)).toBe(false);
    expect(canAutoCreateTeamFilmReview(undefined)).toBe(false);
  });
});
