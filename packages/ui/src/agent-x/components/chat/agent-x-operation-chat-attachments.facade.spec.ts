import { describe, expect, it } from 'vitest';
import {
  buildVideoUploadBatchProgressState,
  canAutoCreateTeamFilmReview,
} from './agent-x-operation-chat-attachments.facade';

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

describe('buildVideoUploadBatchProgressState', () => {
  it('builds an aggregate progress state for multiple videos', () => {
    expect(
      buildVideoUploadBatchProgressState([
        { fileName: 'game-1.mp4', status: 'complete', percent: 100 },
        { fileName: 'game-2.mp4', status: 'uploading', percent: 40 },
        { fileName: 'game-3.mp4', status: 'queued', percent: 0 },
      ])
    ).toEqual({
      totalFiles: 3,
      completedFiles: 1,
      failedFiles: 0,
      activeFiles: 1,
      currentFileName: 'game-2.mp4',
      overallPercent: 47,
    });
  });

  it('returns null when there is no active batch', () => {
    expect(buildVideoUploadBatchProgressState([])).toBeNull();
  });
});
