import { describe, expect, it, vi } from 'vitest';
import {
  attachExportAssetToUniversalDocument,
  upsertTeamFileFromAttachment,
} from '../team-files-index.service.js';

function createMockDb(options?: { readonly exists?: boolean }) {
  const set = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const get = vi.fn(async () => ({ exists: options?.exists ?? false }));
  const doc = vi.fn(() => ({ get, set, update }));
  const collection = vi.fn(() => ({ doc }));

  return {
    db: { collection } as never,
    doc,
    set,
    update,
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

    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;

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

    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;

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

    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;

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

  it('attaches a generated export asset directly to an existing universal document', async () => {
    const { db, update } = createMockDb({ exists: true });

    const attached = await attachExportAssetToUniversalDocument({
      db,
      documentId: 'strategy-doc-1',
      userId: 'user-1',
      origin: 'agent_chat_output',
      sourceThreadId: 'thread-1',
      sourceMessageId: 'message-1',
      sourceOperationId: 'operation-1',
      attachment: {
        id: 'export-1',
        url: 'https://cdn.example.com/strategy.xlsx',
        storagePath: 'Users/user-1/threads/thread-1/exports/strategy.xlsx',
        name: 'Strategy.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        type: 'doc',
        sizeBytes: 4096,
        artifactRole: 'export',
        relatedDocumentId: 'strategy-doc-1',
      },
    });

    expect(attached).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedByUserId: 'user-1',
        sourceRef: {
          sourceThreadId: 'thread-1',
          sourceMessageId: 'message-1',
          sourceOperationId: 'operation-1',
        },
        semanticSync: {
          status: 'pending',
          error: null,
        },
        'payload.asset': expect.objectContaining({
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          kind: 'doc',
          origin: 'agent_chat_output',
          sizeBytes: 4096,
          url: 'https://cdn.example.com/strategy.xlsx',
          storagePath: 'Users/user-1/threads/thread-1/exports/strategy.xlsx',
        }),
      })
    );
  });

  it('attaches a generated PDF asset directly to an existing universal document', async () => {
    const { db, doc, set, update } = createMockDb({ exists: true });

    const attached = await attachExportAssetToUniversalDocument({
      db,
      documentId: 'program-game-plan-document-1',
      userId: 'user-1',
      origin: 'agent_chat_output',
      sourceThreadId: 'thread-1',
      sourceOperationId: 'operation-pdf-1',
      attachment: {
        id: 'export-pdf-1',
        url: 'https://cdn.example.com/program-game-plan.pdf',
        storagePath: 'Users/user-1/threads/thread-1/exports/program-game-plan.pdf',
        name: 'Program Game Planning Standards.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        sizeBytes: 16384,
        artifactRole: 'export',
        relatedDocumentId: 'program-game-plan-document-1',
      },
    });

    expect(attached).toBe(true);
    expect(doc).toHaveBeenCalledWith('program-game-plan-document-1');
    expect(set).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedByUserId: 'user-1',
        sourceRef: {
          sourceThreadId: 'thread-1',
          sourceOperationId: 'operation-pdf-1',
        },
        semanticSync: {
          status: 'pending',
          error: null,
        },
        'payload.asset': {
          mimeType: 'application/pdf',
          kind: 'pdf',
          origin: 'agent_chat_output',
          sizeBytes: 16384,
          url: 'https://cdn.example.com/program-game-plan.pdf',
          storagePath: 'Users/user-1/threads/thread-1/exports/program-game-plan.pdf',
        },
      })
    );
  });

  it('does not create a new file when the related universal document is missing', async () => {
    const { db, set, update } = createMockDb({ exists: false });

    const attached = await attachExportAssetToUniversalDocument({
      db,
      documentId: 'missing-doc',
      userId: 'user-1',
      origin: 'agent_chat_output',
      attachment: {
        id: 'export-2',
        url: 'https://cdn.example.com/missing.pdf',
        name: 'Missing.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        sizeBytes: 1024,
      },
    });

    expect(attached).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
