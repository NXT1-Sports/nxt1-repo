import { describe, expect, it, vi } from 'vitest';
import { upsertTeamFileFromAttachment } from '../team-files-index.service.js';

function createMockDb() {
  const set = vi.fn(async () => undefined);
  const get = vi.fn(async () => ({ exists: false }));
  const doc = vi.fn(() => ({ get, set }));
  const collection = vi.fn(() => ({ doc }));

  return {
    db: { collection } as any,
    set,
  };
}

describe('team files index service', () => {
  it('hydrates film review payload when a video is uploaded to Film Review', async () => {
    const { db, set } = createMockDb();

    await upsertTeamFileFromAttachment({
      db,
      teamId: 'team-1',
      userId: 'user-1',
      origin: 'files_upload',
      sport: 'basketball',
      uploadTarget: 'film_review',
      attachment: {
        id: 'attachment-1',
        url: 'https://cdn.example.com/game.mp4',
        storagePath: 'Teams/team-1/files/game.mp4',
        name: 'Game Tape.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 1024,
        cloudflareVideoId: 'cf-video-1',
        readyToStream: true,
        thumbnailUrl: 'https://cdn.example.com/game.jpg',
      },
    });

    const payload = set.mock.calls[0]?.[0] as Record<string, any>;

    expect(payload.classification).toMatchObject({
      primary: 'film_review',
      route: 'film_review',
      labels: ['film_review', 'video_analysis', 'team_document'],
    });
    expect(payload.payload.filmReview).toMatchObject({
      uploadMode: 'single_video',
      videoUrl: 'https://cdn.example.com/game.mp4',
      storagePath: 'Teams/team-1/files/game.mp4',
      cloudflareVideoId: 'cf-video-1',
      readyToStream: true,
      thumbnailUrl: 'https://cdn.example.com/game.jpg',
      source: 'team_files',
      sourceUrl: 'https://cdn.example.com/game.mp4',
      timelineState: 'idle',
    });
    expect(payload.payload.filmReview.sources).toEqual([
      expect.objectContaining({
        id: 'attachment-1',
        order: 0,
        title: 'Game Tape.mp4',
        videoUrl: 'https://cdn.example.com/game.mp4',
      }),
    ]);
  });

  it('keeps generic file payloads unchanged for normal file uploads', async () => {
    const { db, set } = createMockDb();

    await upsertTeamFileFromAttachment({
      db,
      teamId: 'team-1',
      userId: 'user-1',
      origin: 'files_upload',
      uploadTarget: 'file',
      attachment: {
        id: 'attachment-2',
        url: 'https://cdn.example.com/notes.pdf',
        name: 'Notes.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        sizeBytes: 2048,
      },
    });

    const payload = set.mock.calls[0]?.[0] as Record<string, any>;

    expect(payload.classification).toBeUndefined();
    expect(payload.payload.filmReview).toBeUndefined();
    expect(payload.payload.kind).toBe('pdf');
  });

  it('derives a Cloudflare thumbnail URL when a video file has a Cloudflare ID but no thumbnail', async () => {
    const { db, set } = createMockDb();

    await upsertTeamFileFromAttachment({
      db,
      teamId: 'team-1',
      userId: 'user-1',
      origin: 'files_upload',
      uploadTarget: 'file',
      attachment: {
        id: 'attachment-3',
        url: 'https://watch.cloudflarestream.com/cf-video-9',
        name: 'Practice Tape.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 4096,
        cloudflareVideoId: 'cf-video-9',
        readyToStream: false,
      },
    });

    const payload = set.mock.calls[0]?.[0] as Record<string, any>;

    expect(payload.thumbnailUrl).toBe(
      'https://videodelivery.net/cf-video-9/thumbnails/thumbnail.jpg'
    );
    expect(payload.payload.thumbnailUrl).toBe(
      'https://videodelivery.net/cf-video-9/thumbnails/thumbnail.jpg'
    );
    expect(payload.payload.asset.thumbnailUrl).toBe(
      'https://videodelivery.net/cf-video-9/thumbnails/thumbnail.jpg'
    );
  });
});
