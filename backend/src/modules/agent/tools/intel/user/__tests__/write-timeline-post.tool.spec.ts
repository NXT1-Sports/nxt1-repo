/**
 * @fileoverview Unit tests for WriteTimelinePostTool — validation paths.
 *
 * Covers the "Highlight posts require a videoUrl" production failure
 * (Operation ID: 13059eca-0bb3-458b-8bf3-543be0040e61) and related
 * media-type validation rules.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Logger mock (must be hoisted before any imports that pull logger) ──────────
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

// ── Profile write-access guard mock ───────────────────────────────────────────
// The tool calls assertCanManageAthleteProfileTarget before the type-level
// validation we are testing here. Stub it to pass so tests can reach the
// media-type validation branches.
vi.mock('../../../../../../services/profile/profile-write-access.service.js', () => ({
  createProfileWriteAccessService: () => ({
    assertCanManageAthleteProfileTarget: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ── Firebase / cache stubs (only needed to satisfy module imports) ─────────────
vi.mock('../../../../../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({ del: vi.fn(), delByPrefix: vi.fn() }),
}));
vi.mock('../../../../../../routes/core/upload/shared.js', () => ({
  CLOUDFLARE_API_BASE_URL: 'https://api.cloudflare.com/client/v4',
  getCloudflareHighlightPostId: (id: string) => id,
  normalizeCloudflareVideoForClient: () => ({
    readyToStream: false,
    playback: { iframeUrl: null, hlsUrl: null },
  }),
}));

import type { Firestore } from 'firebase-admin/firestore';
import type { ToolExecutionContext } from '../../base.tool.js';
import { WriteTimelinePostTool } from '../write-timeline-post.tool.js';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const db = {} as Firestore;
const tool = new WriteTimelinePostTool(db);

const baseContext: ToolExecutionContext = {
  userId: 'actor-tvn6C7zmTLQIwVa1OPi7LD7ip3C2',
  operationId: '13059eca-0bb3-458b-8bf3-543be0040e61',
  threadId: '6a4f03332b3425f43c829768',
  environment: 'staging',
};

const baseInput = {
  userId: 'tvn6C7zmTLQIwVa1OPi7LD7ip3C2',
  content: 'Check out my highlight reel!',
  visibility: 'public',
  sportId: 'football',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Highlight post validation ─────────────────────────────────────────────────

describe('WriteTimelinePostTool — highlight post validation', () => {
  it('returns an error when type is "highlight" and videoUrl is absent', async () => {
    const result = await tool.execute({ ...baseInput, type: 'highlight' }, baseContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Highlight posts require a videoUrl.');
  });

  it('logs userId, operationId, and threadId when highlight videoUrl is missing', async () => {
    await tool.execute({ ...baseInput, type: 'highlight' }, baseContext);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[WriteTimelinePostTool] Video/highlight post missing videoUrl',
      expect.objectContaining({
        userId: baseInput.userId,
        type: 'highlight',
        operationId: baseContext.operationId,
        threadId: baseContext.threadId,
      })
    );
  });

  it('returns an error when type is "video" and videoUrl is absent', async () => {
    const result = await tool.execute({ ...baseInput, type: 'video' }, baseContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Video posts require a videoUrl.');
  });

  it('passes validation when type is "highlight" and a valid videoUrl is provided', async () => {
    // Stub db.collection().doc().id and db.collection().doc().set() so the
    // post-write path does not throw before we can observe validation passing.
    const setMock = vi.fn().mockResolvedValue(undefined);
    const docIdMock = 'post-doc-id';
    const docRefMock = { id: docIdMock, set: setMock };
    const collectionMock = {
      doc: vi.fn().mockReturnValue(docRefMock),
    };
    const dbWithCollection = {
      collection: vi.fn().mockReturnValue(collectionMock),
    } as unknown as Firestore;

    const toolWithDb = new WriteTimelinePostTool(dbWithCollection);

    // Use a Firebase Storage HTTPS URL so Cloudflare submission is skipped
    // (no CLOUDFLARE_ACCOUNT_ID in test env) and the post is written cleanly.
    const result = await toolWithDb.execute(
      {
        ...baseInput,
        type: 'highlight',
        videoUrl: 'https://storage.googleapis.com/bucket/Users/u/threads/t/video.mp4',
      },
      baseContext
    );

    // Validation passes; the post creation may fail for unrelated env reasons,
    // but the "Highlight posts require a videoUrl" error must NOT appear.
    expect(result.error).not.toBe('Highlight posts require a videoUrl.');
    expect(loggerMock.warn).not.toHaveBeenCalledWith(
      '[WriteTimelinePostTool] Video/highlight post missing videoUrl',
      expect.anything()
    );
  });
});

// ── Photo post validation ─────────────────────────────────────────────────────

describe('WriteTimelinePostTool — photo post validation', () => {
  it('returns an error when type is "photo" and no images are provided', async () => {
    const result = await tool.execute({ ...baseInput, type: 'photo' }, baseContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Photo posts require at least one image URL.');
  });
});

// ── Error-log context propagation ─────────────────────────────────────────────

describe('WriteTimelinePostTool — error log context', () => {
  it('includes operationId and threadId in the Firestore error log', async () => {
    // Cause an error inside the try block by making db.collection throw.
    const dbThrowing = {
      collection: vi.fn().mockImplementation(() => {
        throw new Error('Firestore unavailable');
      }),
    } as unknown as Firestore;

    const toolThrowing = new WriteTimelinePostTool(dbThrowing);

    const result = await toolThrowing.execute(
      {
        ...baseInput,
        type: 'text',
      },
      baseContext
    );

    expect(result.success).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[WriteTimelinePostTool] Failed to create post',
      expect.objectContaining({
        operationId: baseContext.operationId,
        threadId: baseContext.threadId,
      })
    );
  });
});
