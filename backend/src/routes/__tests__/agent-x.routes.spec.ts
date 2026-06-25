/**
 * @fileoverview Agent X Routes Tests
 * @module @nxt1/backend/routes/__tests__/agent-x
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { notifyDirectFileShare } from '../../services/communications/file-share-notifications.js';
import app, {
  __getMockFirestoreWrites,
  __getMockFirestoreDocument,
  __getMockStorageCopies,
  __getMockStorageDeletes,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
  __seedMockStorageObject,
} from '../../test-app.js';
import { expectExpressRouter } from './route-test.utils.js';

vi.mock('../../services/communications/file-share-notifications.js', () => ({
  notifyDirectFileShare: vi.fn().mockResolvedValue({ dispatched: true, notificationId: 'notif-1' }),
}));

describe('Agent X Routes', () => {
  let router: unknown;
  let setAgentDependencies: typeof import('../../routes/agent/shared.js').setAgentDependencies;
  let activeAbortControllers: typeof import('../../routes/agent/shared.js').activeAbortControllers;
  let chatRouteTestUtils: typeof import('../../routes/agent/chat.routes.js').__agentChatRouteTestUtils;

  beforeAll(async () => {
    const module = await import('../../routes/agent/index.js');
    router = module.default;
    const shared = await import('../../routes/agent/shared.js');
    setAgentDependencies = shared.setAgentDependencies;
    activeAbortControllers = shared.activeAbortControllers;
    const chatRoutes = await import('../../routes/agent/chat.routes.js');
    chatRouteTestUtils = chatRoutes.__agentChatRouteTestUtils;
  }, 15_000);

  beforeEach(() => {
    __resetMockFirestore();
    vi.mocked(notifyDirectFileShare).mockClear();
    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
        cancel: vi.fn().mockResolvedValue(true),
      } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: {
        addMessage: vi.fn().mockImplementation((...args) => {
          console.log('addMessage called with:', args);
          return Promise.resolve();
        }),
      } as never,
      pubsub: null,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    activeAbortControllers.clear();
    chatRouteTestUtils.clearActiveUserStreams();
    __resetMockFirestore();
  });

  it('should fetch a message and append viewed annotation', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a10';
    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId: '64f10b2a6f1c2e0c1d3e8a11',
        userId: 'test-user',
        role: 'assistant',
        content: 'Test reply',
        origin: 'user',
        createdAt: new Date().toISOString(),
      }),
      appendMessageAction: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .get(`/api/v1/agent-x/messages/${messageId}`)
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(chatService.appendMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'viewed', messageId })
    );
  });

  it('should sync a completed attachment onto an idempotent user message', async () => {
    const syncedMessage = {
      id: '64f10b2a6f1c2e0c1d3e8aff',
      threadId: '64f10b2a6f1c2e0c1d3e8a11',
      userId: 'test-user',
      role: 'user',
      content: 'Analyze these clips',
      origin: 'user',
      createdAt: new Date().toISOString(),
      attachments: [
        {
          id: '7b95920d-6fdc-43e0-9c64-cc8fa5c91751',
          url: 'https://watch.cloudflarestream.com/video-123',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 1024,
          cloudflareVideoId: 'video-123',
        },
      ],
    };

    const chatService = {
      syncMessageAttachmentByIdempotencyKey: vi.fn().mockResolvedValue(syncedMessage),
      queueAttachmentSync: vi.fn(),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/messages/attachments/sync')
      .set('Authorization', 'Bearer test-token')
      .send({
        idempotencyKey: 'chat-test_sync-12345',
        attachment: syncedMessage.attachments[0],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.queued).toBe(false);
    expect(response.body.data.messageId).toBe(syncedMessage.id);
    expect(chatService.syncMessageAttachmentByIdempotencyKey).toHaveBeenCalledWith({
      userId: 'test-user',
      idempotencyKey: 'chat-test_sync-12345',
      attachment: syncedMessage.attachments[0],
    });
    expect(chatService.queueAttachmentSync).not.toHaveBeenCalled();
  });

  it('should promote a stored user chat attachment into Team Files on demand', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: '64f10b2a6f1c2e0c1d3e8a10',
        threadId: '64f10b2a6f1c2e0c1d3e8a11',
        userId: 'test-user',
        role: 'user',
        operationId: 'op-123',
        content: 'Analyze this image',
        origin: 'user',
        createdAt: new Date().toISOString(),
        attachments: [
          {
            id: 'attachment-1',
            url: 'https://example.com/image.png',
            storagePath: 'Users/test-user/agent-x/image.png',
            name: 'image.png',
            mimeType: 'image/png',
            type: 'image',
            sizeBytes: 1024,
          },
        ],
      }),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/promote-chat-attachment')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        messageId: '64f10b2a6f1c2e0c1d3e8a10',
        attachmentId: 'attachment-1',
        sport: 'basketball',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(chatService.getMessageById).toHaveBeenCalledWith(
      '64f10b2a6f1c2e0c1d3e8a10',
      'test-user'
    );

    const writes = __getMockFirestoreWrites().filter((write) =>
      write.path.startsWith('UniversalFiles/')
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toMatch(/^UniversalFiles\//);
    expect(writes[0]?.payload).toEqual(
      expect.objectContaining({
        teamId: 'team-123',
        ownerUserId: 'test-user',
        sourceRef: {
          sourceThreadId: '64f10b2a6f1c2e0c1d3e8a11',
          sourceMessageId: '64f10b2a6f1c2e0c1d3e8a10',
          sourceOperationId: 'op-123',
        },
        payload: expect.objectContaining({
          origin: 'agent_chat_input',
        }),
      })
    );
  });

  it('should attach a native film review payload when indexing a film review video upload', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
      organizationId: 'org-123',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/index')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        sport: 'football',
        uploadTarget: 'film_review',
        attachment: {
          id: 'attachment-video-1',
          url: 'https://example.com/uploads/test-video.mp4',
          storagePath: 'Users/test-user/uploads/video/test-video.mp4',
          thumbnailUrl: 'https://example.com/uploads/test-video.jpg',
          name: 'test-video.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 1024,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const writes = __getMockFirestoreWrites().filter((write) =>
      write.path.startsWith('UniversalFiles/')
    );
    const attachedPayloadWrite = [...writes]
      .reverse()
      .find((write) => write.payload?.payload?.filmReview);

    expect(attachedPayloadWrite?.payload).toEqual(
      expect.objectContaining({
        classification: expect.objectContaining({
          primary: 'film_review',
          route: 'film_review',
          labels: expect.arrayContaining(['film_review', 'video_analysis', 'team_document']),
        }),
        payload: expect.objectContaining({
          filmReview: expect.objectContaining({
            uploadMode: 'single_video',
            videoUrl: 'https://example.com/uploads/test-video.mp4',
            source: 'team_files',
          }),
          asset: expect.objectContaining({
            url: 'https://example.com/uploads/test-video.mp4',
            storagePath: 'Users/test-user/uploads/video/test-video.mp4',
          }),
        }),
      })
    );
  });

  it('should list files from UniversalFiles through the universal files endpoint', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Install Sheet.pdf',
      normalizedTitle: 'install sheet.pdf',
      status: 'ready',
      sport: 'basketball',
      ownerUserId: 'test-user',
      createdByUserId: 'test-user',
      updatedByUserId: 'test-user',
      sourceRef: {
        sourceThreadId: 'thread-1',
        sourceMessageId: 'message-1',
        sourceOperationId: 'op-1',
      },
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://example.com/install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      lastSeenAt: '2026-06-03T00:00:00.000Z',
    });

    const response = await request(app)
      .get('/api/v1/agent-x/files/universal')
      .query({ teamId: 'team-123' })
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.files).toEqual([
      expect.objectContaining({
        id: 'file-123',
        teamId: 'team-123',
        title: 'Install Sheet.pdf',
        normalizedTitle: 'install sheet.pdf',
        status: 'ready',
        type: 'file',
        payloadKind: 'native',
        sport: 'basketball',
        sourceRef: expect.objectContaining({
          sourceThreadId: 'thread-1',
          sourceMessageId: 'message-1',
          sourceOperationId: 'op-1',
        }),
        payload: expect.objectContaining({
          mimeType: 'application/pdf',
          kind: 'pdf',
          origin: 'agent_chat_output',
          sizeBytes: 4096,
          url: 'https://example.com/install-sheet.pdf',
        }),
      }),
    ]);
    expect(response.body.data.folders).toEqual([]);
  });

  it('should refresh a storage-backed file URL when fetching a single universal file', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Install Sheet.pdf',
      normalizedTitle: 'install sheet.pdf',
      status: 'ready',
      ownerUserId: 'test-user',
      createdByUserId: 'test-user',
      updatedByUserId: 'test-user',
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://expired.example.com/install-sheet.pdf',
        storagePath: 'Teams/team-123/files/install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      lastSeenAt: '2026-06-03T00:00:00.000Z',
    });

    const response = await request(app)
      .get('/api/v1/agent-x/files/file-123')
      .query({ teamId: 'team-123', disposition: 'inline' })
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.file).toEqual(
      expect.objectContaining({
        teamId: 'team-123',
        payload: expect.objectContaining({
          url: expect.stringContaining('response-content-disposition=inline'),
        }),
      })
    );
    expect(response.body.data.file.payload.url).toContain(
      'response-content-type=application%2Fpdf'
    );
  });

  it('should return an attachment-disposition URL when downloading a single universal file', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Install Sheet.pdf',
      normalizedTitle: 'install sheet.pdf',
      status: 'ready',
      ownerUserId: 'test-user',
      createdByUserId: 'test-user',
      updatedByUserId: 'test-user',
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://expired.example.com/install-sheet.pdf',
        storagePath: 'Teams/team-123/files/install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      lastSeenAt: '2026-06-03T00:00:00.000Z',
    });

    const response = await request(app)
      .get('/api/v1/agent-x/files/file-123')
      .query({ teamId: 'team-123', disposition: 'attachment' })
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.file).toEqual(
      expect.objectContaining({
        teamId: 'team-123',
        payload: expect.objectContaining({
          url: expect.stringContaining('response-content-disposition=attachment'),
        }),
      })
    );
    expect(response.body.data.file.payload.url).toContain(
      'response-content-type=application%2Fpdf'
    );
  });

  it('should promote a stored assistant chat attachment as an agent output', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: '64f10b2a6f1c2e0c1d3e8a22',
        threadId: '64f10b2a6f1c2e0c1d3e8a11',
        userId: 'test-user',
        role: 'assistant',
        operationId: 'op-456',
        content: 'Here is your report',
        origin: 'assistant',
        createdAt: new Date().toISOString(),
        attachments: [
          {
            id: 'attachment-2',
            url: 'https://example.com/report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            type: 'pdf',
            sizeBytes: 4096,
          },
        ],
      }),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/promote-chat-attachment')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        messageId: '64f10b2a6f1c2e0c1d3e8a22',
        attachmentId: 'attachment-2',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const writes = __getMockFirestoreWrites().filter((write) =>
      write.path.startsWith('UniversalFiles/')
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.payload).toEqual(
      expect.objectContaining({
        sourceRef: expect.objectContaining({
          sourceOperationId: 'op-456',
        }),
        payload: expect.objectContaining({
          origin: 'agent_chat_output',
        }),
      })
    );
  });

  it('should copy thread-scoped chat media into durable unbound storage before indexing', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_730_000_000_000);

    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockStorageObject('Users/test-user/threads/thread-1/media/image/171_old-image.png', {
      contentType: 'image/png',
      size: '1024',
    });

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: 'message-thread-1',
        threadId: 'thread-1',
        userId: 'test-user',
        role: 'assistant',
        operationId: 'op-789',
        content: 'Here is the generated image',
        origin: 'assistant',
        createdAt: new Date().toISOString(),
        attachments: [
          {
            id: 'attachment-thread-1',
            url: 'https://example.com/thread-image.png',
            storagePath: 'Users/test-user/threads/thread-1/media/image/171_old-image.png',
            name: 'image.png',
            mimeType: 'image/png',
            type: 'image',
            sizeBytes: 1024,
          },
        ],
      }),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/promote-chat-attachment')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        messageId: 'message-thread-1',
        attachmentId: 'attachment-thread-1',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(__getMockStorageCopies()).toEqual([
      {
        fromPath: 'Users/test-user/threads/thread-1/media/image/171_old-image.png',
        toPath: 'Users/test-user/uploads/image/unbound/1730000000000_image.png',
      },
    ]);

    const writes = __getMockFirestoreWrites().filter((write) =>
      write.path.startsWith('UniversalFiles/')
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.payload).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          origin: 'agent_chat_output',
          storagePath: 'Users/test-user/uploads/image/unbound/1730000000000_image.png',
          url: 'https://example.com/storage/Users%2Ftest-user%2Fuploads%2Fimage%2Funbound%2F1730000000000_image.png',
        }),
      })
    );
  });

  it('should update a file through UniversalFiles only', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('TeamFileFolders/folder-1', {
      teamId: 'team-123',
      name: 'Installs',
      normalizedName: 'installs',
      sortOrder: 0,
      createdByUserId: 'test-user',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Install Sheet.pdf',
      normalizedTitle: 'install sheet.pdf',
      status: 'ready',
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://example.com/install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    const response = await request(app)
      .patch('/api/v1/agent-x/files/file-123')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        folderId: 'folder-1',
        name: 'Updated Install Sheet.pdf',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(__getMockFirestoreDocument('UniversalFiles/file-123')).toMatchObject({
      folderId: 'folder-1',
      title: 'Updated Install Sheet.pdf',
      normalizedTitle: 'updated install sheet.pdf',
      updatedByUserId: 'test-user',
    });
  });

  it('should allow a directly shared writer to update a file without team-admin access', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Shared Install Sheet.pdf',
      normalizedTitle: 'shared install sheet.pdf',
      status: 'ready',
      ownerUserId: 'owner-user',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:test-user'],
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://example.com/shared-install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    const response = await request(app)
      .patch('/api/v1/agent-x/files/file-123')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        name: 'Writer Updated Sheet.pdf',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(__getMockFirestoreDocument('UniversalFiles/file-123')).toMatchObject({
      title: 'Writer Updated Sheet.pdf',
      normalizedTitle: 'writer updated sheet.pdf',
      updatedByUserId: 'test-user',
    });
  });

  it('should reject file updates when the user only has read access', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Read Only Install Sheet.pdf',
      normalizedTitle: 'read only install sheet.pdf',
      status: 'ready',
      ownerUserId: 'owner-user',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:owner-user'],
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://example.com/read-only-install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    const response = await request(app)
      .patch('/api/v1/agent-x/files/file-123')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        name: 'Should Not Update.pdf',
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('should allow a directly shared writer to create a child folder inside a shared folder', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('TeamFileFolders/folder-parent', {
      teamId: 'team-123',
      name: 'Shared Parent',
      normalizedName: 'shared parent',
      sortOrder: 0,
      createdByUserId: 'owner-user',
      readAccessKeys: ['user:test-user', 'team:team-123'],
      writeAccessKeys: ['user:test-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/folders')
      .set('Authorization', 'Bearer test-token')
      .send({
        teamId: 'team-123',
        parentId: 'folder-parent',
        name: 'Shared Child',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const writes = __getMockFirestoreWrites().filter((write) =>
      write.path.startsWith('TeamFileFolders/')
    );
    const createdFolder = writes[writes.length - 1];
    expect(createdFolder?.payload).toEqual(
      expect.objectContaining({
        teamId: 'team-123',
        parentId: 'folder-parent',
        createdByUserId: 'test-user',
        readAccessKeys: ['user:test-user', 'team:team-123'],
        writeAccessKeys: ['user:test-user'],
      })
    );
  });

  it('should allow the file owner to add a direct share grant', async () => {
    __seedMockFirestoreDocument('UniversalFiles/file-share-1', {
      teamId: 'team-123',
      ownerUserId: 'test-user',
      createdByUserId: 'test-user',
      title: 'Shared Report',
      normalizedTitle: 'shared report',
      type: 'file',
      payloadKind: 'native',
      payload: {
        content: {
          text: 'Shared notes',
        },
      },
      status: 'ready',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:test-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/file-share-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.readAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(notifyDirectFileShare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'file',
        resourceId: 'file-share-1',
        resourceName: 'Shared Report',
        recipientUserId: 'user-2',
        permission: 'read',
        sharerUserId: 'test-user',
      })
    );
    expect(__getMockFirestoreDocument('UniversalFiles/file-share-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user'],
      updatedByUserId: 'test-user',
    });
  });

  it('should allow the file owner to grant write access and downgrade back to read', async () => {
    __seedMockFirestoreDocument('UniversalFiles/file-share-write-1', {
      teamId: 'team-123',
      ownerUserId: 'test-user',
      createdByUserId: 'test-user',
      title: 'Editable Report',
      normalizedTitle: 'editable report',
      type: 'file',
      payloadKind: 'native',
      payload: {
        content: {
          text: 'Editable notes',
        },
      },
      status: 'ready',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:test-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const writeResponse = await request(app)
      .post('/api/v1/agent-x/files/file-share-write-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        permission: 'write',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(writeResponse.status).toBe(200);
    expect(writeResponse.body.success).toBe(true);
    expect(writeResponse.body.data.readAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(writeResponse.body.data.writeAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(notifyDirectFileShare).toHaveBeenCalledTimes(1);
    expect(notifyDirectFileShare).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'file',
        resourceId: 'file-share-write-1',
        recipientUserId: 'user-2',
        permission: 'write',
      })
    );
    expect(__getMockFirestoreDocument('UniversalFiles/file-share-write-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user', 'user:user-2'],
      updatedByUserId: 'test-user',
    });

    vi.mocked(notifyDirectFileShare).mockClear();

    const readResponse = await request(app)
      .post('/api/v1/agent-x/files/file-share-write-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        permission: 'read',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.success).toBe(true);
    expect(readResponse.body.data.readAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(readResponse.body.data.writeAccessKeys).toEqual(['user:test-user']);
    expect(notifyDirectFileShare).not.toHaveBeenCalled();
    expect(__getMockFirestoreDocument('UniversalFiles/file-share-write-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user'],
      updatedByUserId: 'test-user',
    });
  });

  it('should forbid non-owners from updating file sharing', async () => {
    __seedMockFirestoreDocument('UniversalFiles/file-share-2', {
      teamId: 'team-123',
      ownerUserId: 'owner-user',
      createdByUserId: 'owner-user',
      title: 'Owner Only Report',
      normalizedTitle: 'owner only report',
      type: 'file',
      payloadKind: 'native',
      payload: {
        content: {
          text: 'Owner only notes',
        },
      },
      status: 'ready',
      readAccessKeys: ['user:owner-user'],
      writeAccessKeys: ['user:owner-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/file-share-2/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(notifyDirectFileShare).not.toHaveBeenCalled();
    expect(__getMockFirestoreDocument('UniversalFiles/file-share-2')).toMatchObject({
      readAccessKeys: ['user:owner-user'],
      writeAccessKeys: ['user:owner-user'],
    });
  });

  it('should allow the folder owner to add a direct share grant', async () => {
    __seedMockFirestoreDocument('TeamFileFolders/folder-share-1', {
      teamId: 'team-123',
      name: 'Shared Folder',
      normalizedName: 'shared folder',
      sortOrder: 0,
      createdByUserId: 'test-user',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:test-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/folders/folder-share-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.folder.readAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(notifyDirectFileShare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'folder',
        resourceId: 'folder-share-1',
        resourceName: 'Shared Folder',
        recipientUserId: 'user-2',
        permission: 'read',
        sharerUserId: 'test-user',
      })
    );
    expect(__getMockFirestoreDocument('TeamFileFolders/folder-share-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user'],
      updatedByUserId: 'test-user',
    });
  });

  it('should allow the folder owner to grant write access and downgrade back to read', async () => {
    __seedMockFirestoreDocument('TeamFileFolders/folder-share-write-1', {
      teamId: 'team-123',
      name: 'Editable Folder',
      normalizedName: 'editable folder',
      sortOrder: 0,
      createdByUserId: 'test-user',
      readAccessKeys: ['user:test-user'],
      writeAccessKeys: ['user:test-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const writeResponse = await request(app)
      .post('/api/v1/agent-x/files/folders/folder-share-write-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        permission: 'write',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(writeResponse.status).toBe(200);
    expect(writeResponse.body.success).toBe(true);
    expect(writeResponse.body.data.folder.readAccessKeys).toEqual([
      'user:test-user',
      'user:user-2',
    ]);
    expect(writeResponse.body.data.folder.writeAccessKeys).toEqual([
      'user:test-user',
      'user:user-2',
    ]);
    expect(notifyDirectFileShare).toHaveBeenCalledTimes(1);
    expect(notifyDirectFileShare).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        resourceType: 'folder',
        resourceId: 'folder-share-write-1',
        recipientUserId: 'user-2',
        permission: 'write',
      })
    );
    expect(__getMockFirestoreDocument('TeamFileFolders/folder-share-write-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user', 'user:user-2'],
      updatedByUserId: 'test-user',
    });

    vi.mocked(notifyDirectFileShare).mockClear();

    const readResponse = await request(app)
      .post('/api/v1/agent-x/files/folders/folder-share-write-1/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        permission: 'read',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.success).toBe(true);
    expect(readResponse.body.data.folder.readAccessKeys).toEqual(['user:test-user', 'user:user-2']);
    expect(readResponse.body.data.folder.writeAccessKeys).toEqual(['user:test-user']);
    expect(notifyDirectFileShare).not.toHaveBeenCalled();
    expect(__getMockFirestoreDocument('TeamFileFolders/folder-share-write-1')).toMatchObject({
      readAccessKeys: ['user:test-user', 'user:user-2'],
      writeAccessKeys: ['user:test-user'],
      updatedByUserId: 'test-user',
    });
  });

  it('should forbid non-owners from updating folder sharing', async () => {
    __seedMockFirestoreDocument('TeamFileFolders/folder-share-2', {
      teamId: 'team-123',
      name: 'Owner Folder',
      normalizedName: 'owner folder',
      sortOrder: 1,
      createdByUserId: 'owner-user',
      readAccessKeys: ['user:owner-user'],
      writeAccessKeys: ['user:owner-user'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/files/folders/folder-share-2/share')
      .set('Authorization', 'Bearer test-token')
      .send({
        action: 'add',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(notifyDirectFileShare).not.toHaveBeenCalled();
    expect(__getMockFirestoreDocument('TeamFileFolders/folder-share-2')).toMatchObject({
      readAccessKeys: ['user:owner-user'],
      writeAccessKeys: ['user:owner-user'],
    });
  });

  it('should return scoped share candidates by member name', async () => {
    __seedMockFirestoreDocument('Roster/context-1', {
      userId: 'test-user',
      teamId: 'team-123',
      organizationId: 'org-123',
      status: 'active',
    });
    __seedMockFirestoreDocument('RosterEntries/team-member-1', {
      userId: 'user-2',
      teamId: 'team-123',
      organizationId: 'org-123',
      status: 'active',
      displayName: 'Jane Receiver',
      firstName: 'Jane',
      lastName: 'Receiver',
      email: 'jane@example.com',
      profileImgs: ['https://example.com/jane.jpg'],
    });
    __seedMockFirestoreDocument('RosterEntries/org-member-1', {
      userId: 'user-3',
      teamId: 'team-999',
      organizationId: 'org-123',
      status: 'active',
      displayName: 'Jordan Safety',
      firstName: 'Jordan',
      lastName: 'Safety',
      email: 'jordan@example.com',
    });
    __seedMockFirestoreDocument('RosterEntries/self-member', {
      userId: 'test-user',
      teamId: 'team-123',
      organizationId: 'org-123',
      status: 'active',
      displayName: 'Current User',
      email: 'me@example.com',
    });

    const response = await request(app)
      .get('/api/v1/agent-x/files/universal/share-candidates')
      .set('Authorization', 'Bearer test-token')
      .query({ teamId: 'team-123', organizationId: 'org-123', q: 'ja' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.candidates).toEqual([
      expect.objectContaining({
        id: 'user-2',
        displayName: 'Jane Receiver',
        email: 'jane@example.com',
        sourceScopes: ['team', 'organization'],
      }),
    ]);
  });

  it('should delete a file from UniversalFiles and storage', async () => {
    __seedMockFirestoreDocument('Teams/team-123', {
      adminIds: ['test-user'],
      name: 'Test Team',
    });
    __seedMockFirestoreDocument('UniversalFiles/file-123', {
      teamId: 'team-123',
      type: 'file',
      title: 'Install Sheet.pdf',
      normalizedTitle: 'install sheet.pdf',
      status: 'ready',
      payloadKind: 'native',
      payload: {
        mimeType: 'application/pdf',
        kind: 'pdf',
        origin: 'agent_chat_output',
        sizeBytes: 4096,
        url: 'https://example.com/install-sheet.pdf',
        storagePath: 'teams/team-123/files/install-sheet.pdf',
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    const response = await request(app)
      .delete('/api/v1/agent-x/files/file-123')
      .query({ teamId: 'team-123' })
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(__getMockFirestoreDocument('UniversalFiles/file-123')).toBeUndefined();
    expect(__getMockStorageDeletes()).toContainEqual({
      path: 'teams/team-123/files/install-sheet.pdf',
      options: { ignoreNotFound: true },
    });
  });

  it('should queue attachment to outbox when message not found during sync', async () => {
    const attachment = {
      id: '7b95920d-6fdc-43e0-9c64-cc8fa5c91751',
      url: 'https://watch.cloudflarestream.com/video-456',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      type: 'video',
      sizeBytes: 2048,
      cloudflareVideoId: 'video-456',
    };

    const chatService = {
      syncMessageAttachmentByIdempotencyKey: vi.fn().mockResolvedValue(null),
      queueAttachmentSync: vi.fn().mockResolvedValue(undefined),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/messages/attachments/sync')
      .set('Authorization', 'Bearer test-token')
      .send({
        idempotencyKey: 'chat-test_outbox-67890',
        attachment,
      });

    // Must return 200 (not 404) so the browser does not retry unnecessarily
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.queued).toBe(true);
    expect(response.body.data.messageId).toBeNull();
    expect(chatService.queueAttachmentSync).toHaveBeenCalledWith({
      userId: 'test-user',
      idempotencyKey: 'chat-test_outbox-67890',
      attachment,
    });
  });

  it('should edit a user message and enqueue rerun operation', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a20';
    const threadId = '64f10b2a6f1c2e0c1d3e8a21';
    const nowIso = new Date().toISOString();

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Old prompt',
        origin: 'user',
        createdAt: nowIso,
      }),
      editUserMessage: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Updated prompt',
        origin: 'user',
        createdAt: nowIso,
      }),
      getNextAssistantMessage: vi.fn().mockResolvedValue(null),
      softDeleteMessage: vi.fn(),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const response = await request(app)
      .put(`/api/v1/agent-x/messages/${messageId}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Updated prompt',
        threadId,
        reason: 'clarification',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.rerunEnqueued).toBe(true);
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('should delete, undo, submit feedback, and annotate message', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a30';
    const threadId = '64f10b2a6f1c2e0c1d3e8a31';
    const nowIso = new Date().toISOString();

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      softDeleteMessage: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      getNextAssistantMessage: vi.fn().mockResolvedValue(null),
      undoSoftDelete: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      setMessageFeedback: vi.fn().mockResolvedValue(true),
      appendMessageAction: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    const deleteRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/delete`)
      .set('Authorization', 'Bearer test-token')
      .send({ threadId, deleteResponse: false });

    expect(deleteRes.status).toBe(200);
    const restoreTokenId = deleteRes.body.data.restoreTokenId as string;
    expect(typeof restoreTokenId).toBe('string');

    const undoRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/undo`)
      .set('Authorization', 'Bearer test-token')
      .send({ restoreTokenId });
    expect(undoRes.status).toBe(200);

    const feedbackRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/feedback`)
      .set('Authorization', 'Bearer test-token')
      .send({ threadId, rating: 5, category: 'helpful', text: 'Great answer' });
    expect(feedbackRes.status).toBe(200);

    const annotateRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/annotation`)
      .set('Authorization', 'Bearer test-token')
      .send({ action: 'copied', metadata: { source: 'chat_bubble' } });
    expect(annotateRes.status).toBe(200);
  });

  it('should export a valid Express router', () => {
    expectExpressRouter(
      router,
      [
        { path: '/pause/:id', method: 'post' },
        { path: '/cancel/:id', method: 'post' },
        { path: '/history', method: 'get' },
        { path: '/operations-log', method: 'get' },
        { path: '/dashboard', method: 'get' },
        { path: '/threads', method: 'get' },
      ],
      5
    );
  });

  it('should stop scanning job pages early when the first page already yields enough sessions', async () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z');
    const jobs = Array.from({ length: 60 }, (_, index) => ({
      operationId: `op-${index + 1}`,
      threadId: `thread-${index + 1}`,
      userId: 'test-user',
      intent: `Session ${index + 1}`,
      status: 'completed',
      origin: 'user',
      createdAt: {
        toMillis: () => now - index * 60_000,
      },
    }));

    const jobRepository = createMockJobRepository();
    jobRepository.getByUserPage
      .mockResolvedValueOnce({
        jobs,
        hasMore: true,
        nextCreatedAt: 'cursor-2',
      })
      .mockResolvedValueOnce({
        jobs: [],
        hasMore: false,
      });

    const chatService = {
      getUserThreads: vi.fn().mockResolvedValue({
        items: jobs.map((job, index) => ({
          id: `thread-${index + 1}`,
          title: `Thread ${index + 1}`,
          lastMessageAt: new Date(now - index * 60_000).toISOString(),
          messageCount: 1,
          archived: false,
          category: 'general',
          createdAt: new Date(now - index * 60_000).toISOString(),
          updatedAt: new Date(now - index * 60_000).toISOString(),
        })),
        hasMore: false,
      }),
      addMessage: vi.fn(),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
        cancel: vi.fn().mockResolvedValue(true),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      pubsub: null,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .get('/api/v1/agent-x/operations-log?limit=50')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(50);
    expect(response.body.pageInfo).toMatchObject({ hasMore: true });
    expect(jobRepository.getByUserPage).toHaveBeenCalledTimes(1);
  });

  it('should keep pagination enabled when the active thread query is truncated', async () => {
    const now = Date.parse('2026-01-15T12:00:00.000Z');
    const jobs = Array.from({ length: 51 }, (_, index) => ({
      operationId: `op-${index + 1}`,
      threadId: `thread-${index + 1}`,
      userId: 'test-user',
      intent: `Session ${index + 1}`,
      status: 'completed',
      origin: 'user',
      createdAt: {
        toMillis: () => now - index * 60_000,
      },
    }));

    const jobRepository = createMockJobRepository();
    jobRepository.getByUserPage.mockResolvedValue({
      jobs,
      hasMore: false,
      nextCreatedAt: undefined,
    });

    const chatService = {
      getUserThreads: vi.fn().mockResolvedValue({
        items: Array.from({ length: 50 }, (_, index) => ({
          id: `thread-${index + 1}`,
          title: `Thread ${index + 1}`,
          lastMessageAt: new Date(now - index * 60_000).toISOString(),
          messageCount: 1,
          archived: false,
          category: 'general',
          createdAt: new Date(now - index * 60_000).toISOString(),
          updatedAt: new Date(now - index * 60_000).toISOString(),
        })),
        hasMore: true,
        nextCursor: new Date(now - 49 * 60_000).toISOString(),
      }),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
        cancel: vi.fn().mockResolvedValue(true),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      pubsub: null,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .get('/api/v1/agent-x/operations-log?limit=50')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(50);
    expect(response.body.pageInfo).toMatchObject({ hasMore: true });
    expect(typeof response.body.pageInfo.nextCursor).toBe('string');
  });

  it('should resolve approvals with edited tool input and resume the exact pending call', async () => {
    const jobRepository = createMockJobRepository({
      userId: 'test-user',
      intent: 'Send a recruiting email',
      threadId: 'thread-123',
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Draft an email' }],
        pendingToolCall: {
          toolName: 'send_email',
          toolInput: {
            toEmail: 'old@example.com',
            subject: 'Old subject',
            bodyHtml: '<p>Old body</p>',
          },
          toolCallId: 'tool-1',
        },
        approvalId: 'approval-123',
        yieldedAt: '2026-04-12T00:00:00.000Z',
        expiresAt: '2026-04-13T00:00:00.000Z',
      },
      status: 'awaiting_approval',
    });
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };
    const chatService = {
      addMessage: vi.fn(),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    __seedMockFirestoreDocument('AgentApprovalRequests/approval-123', {
      userId: 'test-user',
      status: 'pending',
      operationId: 'op-original',
      toolInput: {
        toEmail: 'old@example.com',
        subject: 'Old subject',
        bodyHtml: '<p>Old body</p>',
      },
    });

    const editedToolInput = {
      toEmail: 'coach@example.com',
      subject: 'Updated subject',
      bodyHtml: '<p>Updated body</p>',
    };

    const response = await request(app)
      .post('/api/v1/agent-x/approvals/approval-123/resolve')
      .set('Authorization', 'Bearer test-token')
      .send({ decision: 'approved', toolInput: editedToolInput });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        userId: 'test-user',
        role: 'system',
        origin: 'agent_chain',
        operationId: 'op-original',
        content:
          'Approved action: Send an email to coach@example.com with subject "Updated subject".',
        resultData: expect.objectContaining({
          eventType: 'approval_decision',
          decision: 'approved',
          actionSummary: 'Send an email to coach@example.com with subject "Updated subject".',
          hiddenFromTranscript: true,
        }),
      })
    );
    expect(chatService.clearThreadPausedYieldState).toHaveBeenCalledWith('thread-123');
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        approvalId?: string;
        yieldState?: {
          pendingToolCall?: {
            toolInput?: Record<string, unknown>;
          };
        };
      };
    };
    expect(resumedPayload.context?.approvalId).toBe('approval-123');
    expect(resumedPayload.context?.yieldState?.pendingToolCall?.toolInput).toEqual(editedToolInput);

    expect(__getMockFirestoreDocument('AgentApprovalRequests/approval-123')).toMatchObject({
      status: 'approved',
      resolvedBy: 'test-user',
      toolInput: editedToolInput,
    });
  });

  it('should normalize legacy batch email approval payloads before resuming direct approvals', async () => {
    const jobRepository = createMockJobRepository({
      operationId: 'op-original',
      userId: 'test-user',
      intent: 'Send a recruiting email campaign',
      threadId: 'thread-123',
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this batch email before sending.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Draft a recruiting email campaign' }],
        pendingToolCall: {
          toolName: 'batch_send_email',
          toolInput: {
            recipients: [{ toEmail: 'old@example.com', variables: {} }],
            subjectTemplate: 'Old subject',
            bodyHtmlTemplate: '<p>Old body</p>',
          },
          toolCallId: 'tool-1',
        },
        approvalId: 'approval-batch-legacy',
        yieldedAt: '2026-04-12T00:00:00.000Z',
        expiresAt: '2099-04-13T00:00:00.000Z',
      },
      status: 'awaiting_approval',
    });
    const chatService = {
      addMessage: vi.fn().mockResolvedValue(true),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    __seedMockFirestoreDocument('AgentApprovalRequests/approval-batch-legacy', {
      userId: 'test-user',
      status: 'pending',
      operationId: 'op-original',
      toolName: 'batch_send_email',
      toolInput: {
        recipients: 'coach@example.com, staff@example.com',
        subject: 'Updated subject',
        bodyHtml: '<p>Updated body</p>',
      },
    });

    const response = await request(app)
      .post('/api/v1/agent-x/approvals/approval-batch-legacy/resolve')
      .set('Authorization', 'Bearer test-token')
      .send({
        decision: 'approved',
        toolInput: {
          recipients: 'coach@example.com, staff@example.com',
          subject: 'Updated subject',
          bodyHtml: '<p>Updated body</p>',
        },
      });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          pendingToolCall?: {
            toolInput?: Record<string, unknown>;
          };
        };
      };
    };

    expect(resumedPayload.context?.yieldState?.pendingToolCall?.toolInput).toMatchObject({
      recipients: [
        { toEmail: 'coach@example.com', variables: {} },
        { toEmail: 'staff@example.com', variables: {} },
      ],
      subjectTemplate: 'Updated subject',
      bodyHtmlTemplate: '<p>Updated body</p>',
    });

    expect(__getMockFirestoreDocument('AgentApprovalRequests/approval-batch-legacy')).toMatchObject(
      {
        status: 'approved',
        resolvedBy: 'test-user',
        toolInput: {
          recipients: [
            { toEmail: 'coach@example.com', variables: {} },
            { toEmail: 'staff@example.com', variables: {} },
          ],
          subjectTemplate: 'Updated subject',
          bodyHtmlTemplate: '<p>Updated body</p>',
        },
      }
    );
  });

  it('should normalize legacy batch email approval payloads on thread action approvals', async () => {
    const jobRepository = createMockJobRepository({
      operationId: 'op-original',
      userId: 'test-user',
      intent: 'Send a recruiting email campaign',
      threadId: 'thread-123',
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this batch email before sending.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Draft a recruiting email campaign' }],
        pendingToolCall: {
          toolName: 'batch_send_email',
          toolInput: {
            recipients: [{ toEmail: 'old@example.com', variables: {} }],
            subjectTemplate: 'Old subject',
            bodyHtmlTemplate: '<p>Old body</p>',
          },
          toolCallId: 'tool-1',
        },
        approvalId: 'approval-thread-batch-legacy',
        yieldedAt: '2026-04-12T00:00:00.000Z',
        expiresAt: '2099-04-13T00:00:00.000Z',
      },
      status: 'awaiting_approval',
    });
    const chatService = {
      addMessage: vi.fn().mockResolvedValue(true),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    __seedMockFirestoreDocument('AgentApprovalRequests/approval-thread-batch-legacy', {
      userId: 'test-user',
      status: 'pending',
      operationId: 'op-original',
      toolName: 'batch_send_email',
      toolInput: {
        recipients: 'coach@example.com, staff@example.com',
        subject: 'Updated subject',
        bodyHtml: '<p>Updated body</p>',
      },
    });

    const response = await request(app)
      .post('/api/v1/agent-x/threads/thread-123/actions')
      .set('Authorization', 'Bearer test-token')
      .send({
        actionType: 'approval_decision',
        decision: 'approved',
        operationIdHint: 'op-original',
        toolInput: {
          recipients: 'coach@example.com, staff@example.com',
          subject: 'Updated subject',
          bodyHtml: '<p>Updated body</p>',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        userId: 'test-user',
        role: 'system',
        origin: 'agent_chain',
        operationId: 'op-original',
        content: 'Approved action: Send 2 emails with subject "Updated subject".',
        resultData: expect.objectContaining({
          eventType: 'approval_decision',
          decision: 'approved',
          actionSummary: 'Send 2 emails with subject "Updated subject".',
          hiddenFromTranscript: true,
        }),
      })
    );

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        approvalId?: string;
        yieldState?: {
          pendingToolCall?: {
            toolInput?: Record<string, unknown>;
          };
        };
      };
    };

    expect(resumedPayload.context?.approvalId).toBe('approval-thread-batch-legacy');
    expect(resumedPayload.context?.yieldState?.pendingToolCall?.toolInput).toMatchObject({
      recipients: [
        { toEmail: 'coach@example.com', variables: {} },
        { toEmail: 'staff@example.com', variables: {} },
      ],
      subjectTemplate: 'Updated subject',
      bodyHtmlTemplate: '<p>Updated body</p>',
    });

    expect(
      __getMockFirestoreDocument('AgentApprovalRequests/approval-thread-batch-legacy')
    ).toMatchObject({
      status: 'approved',
      resolvedBy: 'test-user',
      toolInput: {
        recipients: [
          { toEmail: 'coach@example.com', variables: {} },
          { toEmail: 'staff@example.com', variables: {} },
        ],
        subjectTemplate: 'Updated subject',
        bodyHtmlTemplate: '<p>Updated body</p>',
      },
    });
  });

  it('should close rejected approvals with an assistant acknowledgment', async () => {
    const jobRepository = createMockJobRepository({
      operationId: 'op-original',
      userId: 'test-user',
      intent: 'Send a recruiting email',
      threadId: 'thread-123',
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Draft an email' }],
        pendingToolCall: {
          toolName: 'batch_send_email',
          toolInput: {
            recipients: [{ toEmail: 'coach@example.com' }, { toEmail: 'staff@example.com' }],
            subject: 'Updated subject',
          },
          toolCallId: 'tool-1',
        },
        approvalId: 'approval-123',
        yieldedAt: '2026-04-12T00:00:00.000Z',
        expiresAt: '2099-04-13T00:00:00.000Z',
      },
      status: 'awaiting_approval',
    });
    const chatService = {
      addMessage: vi.fn().mockResolvedValue(true),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    __seedMockFirestoreDocument('AgentApprovalRequests/approval-123', {
      userId: 'test-user',
      status: 'pending',
      operationId: 'op-original',
      toolInput: {
        recipients: [{ toEmail: 'coach@example.com' }, { toEmail: 'staff@example.com' }],
        subject: 'Updated subject',
      },
    });

    const response = await request(app)
      .post('/api/v1/agent-x/approvals/approval-123/resolve')
      .set('Authorization', 'Bearer test-token')
      .send({
        decision: 'rejected',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({ decision: 'rejected', resumed: false });
    expect(jobRepository.markCancelled).toHaveBeenCalledWith('op-original');
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        userId: 'test-user',
        role: 'assistant',
        content: "Understood. I won't send those emails.",
        operationId: 'op-original',
        idempotencyKey: 'op-original:assistant_rejected_approval',
        semanticPhase: 'assistant_final',
      })
    );
    expect(chatService.clearThreadPausedYieldState).toHaveBeenCalledWith('thread-123');
    expect(__getMockFirestoreDocument('AgentApprovalRequests/approval-123')).toMatchObject({
      status: 'rejected',
      resolvedBy: 'test-user',
    });
  });

  it('should enqueue chat and stream replayed yield events from persisted history', async () => {
    const jobRepository = createMockJobRepository({
      userId: 'test-user',
      status: 'completed',
      threadId: 'thread-123',
    });
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-1',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'card',
        cardData: {
          type: 'ask_user',
          title: 'Agent X has a question',
          payload: { question: 'Which college should I target first?' },
        },
      },
      {
        seq: 2,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
        yieldState: { reason: 'needs_input' },
      },
    ]);

    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      cancel: vi.fn().mockResolvedValue(true),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Help me build a recruiting plan', mode: 'recruiting' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Which college should I target first?');
    expect(response.text).toContain('"status":"awaiting_input"');
    expect(response.text).toContain('"yieldState"');
    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'user',
        content: 'Help me build a recruiting plan',
      })
    );
    expect(chatService.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'strategy_coordinator',
      })
    );

    const payload = vi.mocked(jobRepository.create).mock.calls[0][0] as { agent?: unknown };
    expect(payload.agent).toBeUndefined();
  });

  it('should cancel the latest yielded thread operation from /chat and enqueue a fresh run', async () => {
    const threadId = '64f10b2a6f1c2e0c1d3e8a99';
    const yieldedJob = {
      operationId: 'op-awaiting-input',
      threadId,
      userId: 'test-user',
      status: 'awaiting_input',
      intent: 'Send 20 recruiting emails to Texas D2 coaches',
      yieldState: {
        reason: 'needs_input',
        agentId: 'recruiting_coordinator',
        promptToUser: 'Approve this recruiting email?',
        messages: [
          { role: 'user', content: 'Send 20 recruiting emails to Texas D2 coaches' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'ask-1',
                type: 'function',
                function: { name: 'ask_user', arguments: '{"question":"Approve this email?"}' },
              },
            ],
          },
        ],
        pendingToolCall: {
          toolName: 'ask_user',
          toolInput: { question: 'Approve this email?' },
          toolCallId: 'ask-1',
        },
        yieldedAt: '2026-04-28T00:00:00.000Z',
        expiresAt: '2026-04-29T00:00:00.000Z',
      },
    };

    const jobRepository = createMockJobRepository(yieldedJob);
    jobRepository.findActiveByThread.mockResolvedValue([yieldedJob]);
    jobRepository.getById.mockResolvedValue({
      operationId: 'resumed-op',
      threadId,
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
      },
    ]);

    const chatService = {
      addMessage: vi.fn(),
      getThread: vi.fn().mockResolvedValue({ id: threadId, userId: 'test-user' }),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      cancel: vi.fn().mockResolvedValue(true),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'application/json')
      .send({
        message: 'I approve email',
        threadId,
        mode: 'recruiting',
      });

    expect(response.status).toBe(200);
    expect(jobRepository.findActiveByThread).toHaveBeenCalledWith(threadId);
    expect(queueService.cancel).toHaveBeenCalledWith('op-awaiting-input');
    expect(jobRepository.markCancelled).toHaveBeenCalledWith('op-awaiting-input');
    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        role: 'user',
        content: 'I approve email',
      })
    );

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      intent: string;
      context?: {
        parentOperationId?: string;
      };
    };

    expect(payload.intent).toBe('I approve email');
    expect(payload.context?.parentOperationId).toBeUndefined();
    expect(chatService.clearThreadPausedYieldState).toHaveBeenCalledWith(threadId);
  });

  it('should stream a billing-action card when chat is blocked by the billing gate', async () => {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const timestamp = { seconds: Math.floor(now.getTime() / 1000), nanoseconds: 0 };

    __seedMockFirestoreDocument('Users/test-user', {
      activeBillingTarget: {
        ownerId: 'test-user',
        ownerType: 'individual',
        source: 'default',
      },
    });
    __seedMockFirestoreDocument('Wallets/test-user', {
      balanceCents: 0,
      pendingHoldsCents: 100,
      iapLowBalanceNotified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument('BillingPreferences/test-user', {
      hardStop: true,
      paymentProvider: 'iap',
      budgetInterval: 'monthly',
      budgetAlertsEnabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument(`PeriodLedgers/test-user:${periodKey}`, {
      monthlyBudget: 0,
      currentPeriodSpend: 0,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
      ).toISOString(),
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const jobRepository = createMockJobRepository({
      userId: 'test-user',
      status: 'queued',
      threadId: 'thread-123',
    });
    let addMessageCallCount = 0;
    const chatService = {
      addMessage: vi.fn().mockImplementation(async (payload: { role: string }) => {
        addMessageCallCount += 1;
        return {
          id:
            payload.role === 'assistant'
              ? 'billing-assistant-message-1'
              : `user-message-${addMessageCallCount}`,
        };
      }),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateTitleFromPromptOnly: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Build my recruiting plan', mode: 'recruiting' });

    expect(response.status).toBe(200);
    const events = parseSseEvents(response.text).filter((event) => event.event.length > 0);

    expect(events.map((event) => event.event)).toEqual(['thread', 'delta', 'card', 'done']);
    expect(events[0]?.data).toMatchObject({ threadId: 'thread-123' });
    expect(events[1]?.data).toMatchObject({
      content: expect.stringContaining('Add funds to continue this request.'),
    });
    expect(events[2]?.data).toMatchObject({
      agentId: 'router',
      type: 'billing-action',
      title: 'Add Funds to Continue',
      payload: {
        reason: 'insufficient_funds',
        description: expect.stringContaining('Wallet balance'),
        currentBalanceCents: 0,
        amountNeededCents: 30,
      },
    });
    expect(events[3]?.data).toMatchObject({ status: 'complete', threadId: 'thread-123' });
    expect(events[3]?.data).toMatchObject({ messageId: 'billing-assistant-message-1' });

    expect(jobRepository.create).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'user',
        content: 'Build my recruiting plan',
      })
    );
    expect(chatService.addMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        origin: 'agent_chain',
        agentId: 'router',
        content: expect.stringContaining('Add funds to continue this request.'),
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'card',
            card: expect.objectContaining({
              type: 'billing-action',
              agentId: 'router',
              title: 'Add Funds to Continue',
            }),
          }),
        ]),
      })
    );
  });

  it('should classify billing gate denials correctly across budget and wallet contexts', () => {
    const teamBudgetCode = chatRouteTestUtils.resolveBillingGateCode({
      billingEntity: 'team',
      reason:
        'Team monthly budget of $50.00 reached. Ask your Athletic Director to increase the team allocation.',
    });
    expect(teamBudgetCode).toBe('BUDGET_EXCEEDED');

    const orgBudgetCode = chatRouteTestUtils.resolveBillingGateCode({
      billingEntity: 'organization',
      reason: 'Monthly budget of $200.00 reached. Increase your organization budget to continue.',
    });
    expect(orgBudgetCode).toBe('BUDGET_EXCEEDED');

    const orgWalletCode = chatRouteTestUtils.resolveBillingGateCode({
      billingEntity: 'organization',
      reason:
        'Organization wallet balance of $0.00 (available) is insufficient. An admin can add funds in Settings → Usage.',
    });
    expect(orgWalletCode).toBe('WALLET_EMPTY');

    const paymentMethodCode = chatRouteTestUtils.resolveBillingGateCode({
      billingEntity: 'individual',
      reason: 'No payment method found. Add a payment method to continue.',
    });
    expect(paymentMethodCode).toBe('NO_PAYMENT_METHOD');
  });

  it('should block chat when wallet balance is positive but below the estimated gate cost', async () => {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const timestamp = { seconds: Math.floor(now.getTime() / 1000), nanoseconds: 0 };

    __seedMockFirestoreDocument('Users/test-user', {
      activeBillingTarget: {
        ownerId: 'test-user',
        ownerType: 'individual',
        source: 'default',
      },
    });
    __seedMockFirestoreDocument('Wallets/test-user', {
      balanceCents: 21,
      pendingHoldsCents: 0,
      iapLowBalanceNotified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument('BillingPreferences/test-user', {
      hardStop: true,
      paymentProvider: 'iap',
      budgetInterval: 'monthly',
      budgetAlertsEnabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument(`PeriodLedgers/test-user:${periodKey}`, {
      monthlyBudget: 0,
      currentPeriodSpend: 0,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
      ).toISOString(),
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const jobRepository = createMockJobRepository();
    const chatService = {
      addMessage: vi
        .fn()
        .mockResolvedValueOnce({ id: 'user-message-1' })
        .mockResolvedValueOnce({ id: 'billing-assistant-message-1' }),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateTitleFromPromptOnly: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Can you run this task?', mode: 'recruiting' });

    expect(response.status).toBe(200);
    const events = parseSseEvents(response.text).filter((event) => event.event.length > 0);
    expect(events.map((event) => event.event)).toEqual(['thread', 'delta', 'card', 'done']);
    expect(events[2]?.data).toMatchObject({
      type: 'billing-action',
      payload: {
        reason: 'insufficient_funds',
        description: expect.stringContaining('Wallet balance of $0.21'),
        currentBalanceCents: 21,
        amountNeededCents: 30,
      },
    });

    expect(jobRepository.create).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it('should price media preflight at the quoted request price by default', () => {
    const estimatedCents = chatRouteTestUtils.estimateChatBillingGateCostCents({
      message: 'Create a highlight video with a motion graphic intro and merge my posted clips',
      mode: 'recruiting',
    });

    expect(estimatedCents).toBe(30);
    expect(298).toBeGreaterThanOrEqual(estimatedCents);
  });

  it('should block chat on org hard-stop budget cap when resolved billing target is organization', async () => {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const timestamp = { seconds: Math.floor(now.getTime() / 1000), nanoseconds: 0 };
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    ).toISOString();

    __seedMockFirestoreDocument('Users/test-user', {
      activeBillingTarget: {
        ownerId: 'org-1',
        ownerType: 'organization',
        organizationId: 'org-1',
        source: 'organization',
      },
    });

    __seedMockFirestoreDocument('Organizations/org-1', {
      admins: [{ userId: 'test-user', role: 'director' }],
      ownerId: 'test-user',
    });

    __seedMockFirestoreDocument('Wallets/org:org-1', {
      balanceCents: 100_00,
      pendingHoldsCents: 0,
      iapLowBalanceNotified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    __seedMockFirestoreDocument('BillingPreferences/org:org-1', {
      hardStop: true,
      paymentProvider: 'iap',
      budgetInterval: 'monthly',
      budgetAlertsEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    __seedMockFirestoreDocument(`PeriodLedgers/org:org-1:${periodKey}`, {
      monthlyBudget: 100,
      currentPeriodSpend: 100,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    __seedMockFirestoreDocument('OrganizationBudgets/org-1_organization_org-1_monthly', {
      id: 'org-1_organization_org-1_monthly',
      organizationId: 'org-1',
      targetType: 'organization',
      targetId: 'org-1',
      budgetInterval: 'monthly',
      budgetLimit: 100,
      hardStop: true,
      currentPeriodSpend: 100,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const jobRepository = createMockJobRepository();
    const chatService = {
      addMessage: vi
        .fn()
        .mockResolvedValueOnce({ id: 'user-message-1' })
        .mockResolvedValueOnce({ id: 'billing-assistant-message-1' }),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateTitleFromPromptOnly: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Can you run this task?', mode: 'recruiting' });

    expect(response.status).toBe(200);
    const events = parseSseEvents(response.text).filter((event) => event.event.length > 0);
    expect(events.map((event) => event.event)).toEqual(['thread', 'delta', 'card', 'done']);
    expect(events[2]?.data).toMatchObject({
      type: 'billing-action',
      payload: {
        reason: 'limit_reached',
        description: expect.stringContaining('budget of $1.00 reached'),
      },
    });

    expect(jobRepository.create).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it('should block background enqueue on org hard-stop budget cap before creating a job', async () => {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const timestamp = { seconds: Math.floor(now.getTime() / 1000), nanoseconds: 0 };
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    ).toISOString();

    __seedMockFirestoreDocument('Users/test-user', {
      role: 'athlete',
      activeBillingTarget: {
        ownerId: 'org-1',
        ownerType: 'organization',
        organizationId: 'org-1',
        source: 'organization',
      },
    });
    __seedMockFirestoreDocument('Organizations/org-1', {
      admins: [{ userId: 'test-user', role: 'director' }],
      ownerId: 'test-user',
    });
    __seedMockFirestoreDocument('Wallets/org:org-1', {
      balanceCents: 100_00,
      pendingHoldsCents: 0,
      iapLowBalanceNotified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument('BillingPreferences/org:org-1', {
      hardStop: true,
      paymentProvider: 'iap',
      budgetInterval: 'monthly',
      budgetAlertsEnabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument(`PeriodLedgers/org:org-1:${periodKey}`, {
      monthlyBudget: 100,
      currentPeriodSpend: 100,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const jobRepository = createMockJobRepository();
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
        createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
        getThread: vi.fn().mockResolvedValue(null),
      } as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .send({ intent: 'Build my recruiting plan' });

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      success: false,
      code: 'BUDGET_EXCEEDED',
      billing: {
        title: 'Budget Limit Reached',
        payload: {
          reason: 'limit_reached',
          description: expect.stringContaining('budget of $1.00 reached'),
        },
      },
    });
    expect(jobRepository.create).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it('should normalize chat attachments to plain objects in job payload context', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-2',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
      },
    ]);
    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Review this image',
        mode: 'recruiting',
        attachments: [
          {
            id: 'de8a1081-9654-4d6e-8c6d-5e5cb5778ab6',
            url: 'https://cdn.example.com/test-image.png',
            name: 'test-image.png',
            mimeType: 'image/png',
            type: 'image',
            sizeBytes: 12345,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      context?: {
        attachments?: Array<Record<string, unknown>>;
      };
    };
    const attachment = payload.context?.attachments?.[0];
    expect(attachment).toMatchObject({
      id: 'de8a1081-9654-4d6e-8c6d-5e5cb5778ab6',
      url: 'https://cdn.example.com/test-image.png',
      name: 'test-image.png',
      mimeType: 'image/png',
      type: 'image',
      sizeBytes: 12345,
    });
    expect(Object.getPrototypeOf(attachment ?? null)).toBe(Object.prototype);
  });

  it('should keep quick prompt labels visible while resolving a detailed hidden intent and plain selectedAction payload', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-quick-action',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
      },
    ]);
    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Game Plan',
        mode: 'strategy',
        selectedAction: {
          coordinatorId: 'strategy_coordinator',
          actionId: 'strategy-priority',
          surface: 'command',
          label: 'Game Plan',
        },
      });

    expect(response.status).toBe(200);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      intent: string;
      displayIntent: string;
      context?: {
        selectedAction?: Record<string, unknown>;
      };
    };
    const selectedAction = payload.context?.selectedAction;

    expect(payload.displayIntent).toBe('Game Plan');
    expect(payload.intent).not.toBe('Game Plan');
    expect(payload.intent).toContain('Execution requirements:');
    expect(payload.intent).toContain('Selected action: Athlete Game Plan.');
    expect(selectedAction).toMatchObject({
      coordinatorId: 'strategy_coordinator',
      actionId: 'strategy-priority',
      surface: 'command',
      label: 'Game Plan',
    });
    expect(Object.getPrototypeOf(selectedAction ?? null)).toBe(Object.prototype);
  });

  it('should preserve attached video context for selected highlight reel quick action', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-highlight-action',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
      },
    ]);
    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Make me a grade A highlight reel from this upload',
        mode: 'brand',
        selectedAction: {
          coordinatorId: 'brand_coordinator',
          actionId: 'brand-highlight',
          surface: 'command',
          label: 'Highlight Video Creator',
        },
        attachments: [
          {
            id: '76f6f302-83f8-45df-ad86-206a5bdabff3',
            url: 'https://storage.googleapis.com/nxt1-test/highlight-source.mp4',
            name: 'highlight-source.mp4',
            mimeType: 'video/mp4',
            type: 'video',
            sizeBytes: 987654,
            cloudflareVideoId: 'cf-highlight-123',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      intent: string;
      displayIntent: string;
      context?: {
        selectedAction?: Record<string, unknown>;
        videoAttachments?: Array<Record<string, unknown>>;
      };
    };

    expect(payload.displayIntent).toBe('Make me a grade A highlight reel from this upload');
    expect(payload.intent).toContain('finished highlight reel workflow');
    expect(payload.intent).toContain('ffmpeg_trim_video');
    expect(payload.intent).toContain('[User request and attached context]');
    expect(payload.intent).toContain('Make me a grade A highlight reel from this upload');
    expect(payload.intent).toContain(
      '[Attached video (already visible to user — do not re-embed): highlight-source.mp4'
    );
    expect(payload.intent).toContain('cloudflareVideoId: cf-highlight-123');
    expect(payload.intent).toContain('Do not ignore attachments');
    expect(payload.context?.selectedAction).toMatchObject({
      coordinatorId: 'brand_coordinator',
      actionId: 'brand-highlight',
      surface: 'command',
      label: 'Highlight Video Creator',
    });
    expect(payload.context?.videoAttachments?.[0]).toMatchObject({
      id: '76f6f302-83f8-45df-ad86-206a5bdabff3',
      url: 'https://storage.googleapis.com/nxt1-test/highlight-source.mp4',
      name: 'highlight-source.mp4',
      mimeType: 'video/mp4',
      type: 'video',
      sizeBytes: 987654,
      cloudflareVideoId: 'cf-highlight-123',
    });
  });

  it('should deduplicate /enqueue requests by idempotency key', async () => {
    const jobRepository = createMockJobRepository({
      operationId: 'op-existing-1',
      threadId: 'thread-existing-1',
      userId: 'test-user',
    });
    jobRepository.getByIdempotencyKey.mockResolvedValue({
      operationId: 'op-existing-1',
      threadId: 'thread-existing-1',
      userId: 'test-user',
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-new'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .set('x-idempotency-key', 'enqueue_retry_key_001')
      .send({ intent: 'Generate weekly outreach plan' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.deduplicated).toBe(true);
    expect(response.body.data.operationId).toBe('op-existing-1');
    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(jobRepository.create).not.toHaveBeenCalled();
  });

  it('should emit a single terminal done event when Firestore tail sees done and completed status together', async () => {
    const operationId = '3f6f0f42-8e31-4b2e-92ad-fd5e67a97a11';
    const jobRepository = createMockJobRepository();
    jobRepository.getById
      .mockResolvedValueOnce({
        operationId,
        threadId: 'thread-tail-1',
        userId: 'test-user',
        status: 'in-progress',
      })
      .mockResolvedValueOnce({
        operationId,
        threadId: 'thread-tail-1',
        userId: 'test-user',
        status: 'completed',
      });

    jobRepository.getJobEvents
      .mockResolvedValueOnce([
        {
          seq: 1,
          type: 'step_active',
          step: 'research',
          message: 'Working',
        },
      ])
      .mockResolvedValueOnce([
        {
          seq: 1,
          type: 'step_active',
          step: 'research',
          message: 'Working',
        },
        {
          seq: 2,
          type: 'done',
          message: 'Completed',
          status: 'completed',
        },
      ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume operation stream',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);

    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should deliver replay-window events exactly once when live emits before replay resolves', async () => {
    const operationId = '9fbe4182-b5d9-4ca6-8426-2d66913d6fe4';
    const releaseReplay: () => void = () => {
      console.warn('releaseReplay called before being set');
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-race-1',
      userId: 'test-user',
      status: 'processing',
    });

    const replayEvents = [
      {
        seq: 1,
        type: 'delta',
        text: 'initial',
      },
      {
        seq: 2,
        type: 'delta',
        text: 'replay-window-event',
      },
      {
        seq: 3,
        type: 'done',
        operationId,
        threadId: 'thread-race-1',
        status: 'complete',
        success: true,
      },
    ];

    jobRepository.getJobEvents.mockImplementation(async () => {
      await releaseReplay();
      return replayEvents;
    });

    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Reconnect race test', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // Simulate live event arriving during replay window (before getJobEvents resolves).
    liveCallbacks[0]?.({
      event: 'delta',
      data: {
        seq: 2,
        content: 'replay-window-event',
      },
    });

    releaseReplay?.();

    const response = await streamPromise;
    expect(response.status).toBe(200);

    const replayWindowDeltaMatches = response.text.match(/"content":"replay-window-event"/g) ?? [];
    expect(replayWindowDeltaMatches).toHaveLength(1);

    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should emit only one terminal done when replay and live both contain terminal events', async () => {
    const operationId = 'bd4eb42f-6aa3-4c66-8f2f-fd6f0b76f3e7';
    const releaseReplay: () => void = () => {
      console.warn('releaseReplay called before being set');
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-terminal-race-1',
      userId: 'test-user',
      status: 'processing',
    });

    jobRepository.getJobEvents.mockImplementation(async () => {
      await releaseReplay();
      return [
        {
          seq: 1,
          type: 'done',
          operationId,
          threadId: 'thread-terminal-race-1',
          status: 'complete',
          success: true,
          message: 'Replay terminal',
        },
      ];
    });

    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Terminal dedupe race', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // Live terminal arrives before replay resolves.
    liveCallbacks[0]?.({
      event: 'done',
      data: {
        seq: 3,
        operationId,
        threadId: 'thread-terminal-race-1',
        status: 'complete',
        success: true,
      },
    });

    releaseReplay?.();
    const response = await streamPromise;

    expect(response.status).toBe(200);
    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should include canonical DB messageId when completion is synthesized from terminal job status', async () => {
    const operationId = 'de8f2d2a-b6d3-4ef0-b07a-3cb4f9766b67';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-synthetic-done-1',
      userId: 'test-user',
      status: 'completed',
    });
    jobRepository.getJobEvents.mockResolvedValue([]);

    const chatService = {
      addMessage: vi.fn(),
      getLatestAssistantMessageForOperation: vi.fn().mockResolvedValue({
        id: '64f10b2a6f1c2e0c1d3e8b01',
      }),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      pubsub: null,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Synthetic completed terminal', resumeOperationId: operationId });

    expect(response.status).toBe(200);

    const doneEvent = parseSseEvents(response.text).find((evt) => evt.event === 'done');
    expect(doneEvent?.data?.['success']).toBe(true);
    expect(doneEvent?.data?.['messageId']).toBe('64f10b2a6f1c2e0c1d3e8b01');
    expect(chatService.getLatestAssistantMessageForOperation).toHaveBeenCalledWith(operationId);
  });

  it('should increment seq regression counter when stale live seq is received', async () => {
    const operationId = 'fbb27af3-f6e2-46b6-b5d0-14f3f9b84a2a';
    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-seq-regression',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 2,
        type: 'operation',
        operationId,
        threadId: 'thread-seq-regression',
        status: 'running',
        timestamp: '2026-04-25T00:00:00.000Z',
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const beforeObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const beforeSeqRegressionTotal =
      (beforeObs.body?.data?.counters?.seqRegressionDetectedTotal as number | undefined) ?? 0;

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Seq regression counter', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // stale seq (1) after replay has advanced lastSeq to 2
    liveCallbacks[0]?.({
      event: 'delta',
      data: {
        seq: 1,
        content: 'stale-delta',
      },
    });

    // close stream with fresh terminal event
    liveCallbacks[0]?.({
      event: 'done',
      data: {
        seq: 3,
        operationId,
        threadId: 'thread-seq-regression',
        status: 'complete',
        success: true,
      },
    });

    const response = await streamPromise;
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('stale-delta');

    const afterObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const afterSeqRegressionTotal =
      (afterObs.body?.data?.counters?.seqRegressionDetectedTotal as number | undefined) ?? 0;

    expect(afterSeqRegressionTotal).toBeGreaterThan(beforeSeqRegressionTotal);
  });

  it('should replay title_updated and operation events for resumed operation streams', async () => {
    const operationId = '0decb9a4-c36f-468f-a5ad-5b1479d5d111';
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId,
      threadId: 'thread-replay-1',
      userId: 'test-user',
      status: 'awaiting_approval',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'title_updated',
        operationId,
        threadId: 'thread-replay-1',
        title: 'Updated Thread Title',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        seq: 2,
        type: 'operation',
        operationId,
        threadId: 'thread-replay-1',
        status: 'awaiting_approval',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
      {
        seq: 3,
        type: 'done',
        operationId,
        threadId: 'thread-replay-1',
        status: 'awaiting_approval',
        message: 'Awaiting approval',
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume operation replay',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: title_updated');
    expect(response.text).toContain('"title":"Updated Thread Title"');
    expect(response.text).toContain('event: operation');
    expect(response.text).toContain('"status":"awaiting_approval"');
  });

  it('should replay panel events from persisted live-view tool results', async () => {
    const operationId = '11111111-2222-4333-8444-555555555555';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-live-view',
      userId: 'test-user',
      status: 'processing',
    });

    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'tool_result',
        stepId: 'step-live-view',
        toolName: 'open_live_view',
        toolSuccess: true,
        message: 'Opening virtual browser',
        toolResult: {
          autoOpenPanel: {
            type: 'live-view',
            url: 'https://connect.firecrawl.dev/session/replay-123',
            title: 'acumbbcamps.com',
          },
        },
      },
      {
        seq: 2,
        type: 'done',
        operationId,
        threadId: 'thread-live-view',
        status: 'complete',
        success: true,
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume live view replay',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: panel');
    expect(response.text).toContain('https://connect.firecrawl.dev/session/replay-123');
  });

  it.each([
    {
      name: 'happy path',
      status: 'processing',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-happy',
          threadId: 'thread-contract',
          status: 'running',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'complete',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'running' },
        { event: 'done', status: 'complete' },
      ],
    },
    {
      name: 'yield path',
      status: 'awaiting_input',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-yield',
          threadId: 'thread-contract',
          status: 'awaiting_input',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'awaiting_input',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'awaiting_input' },
        { event: 'done', status: 'awaiting_input' },
      ],
    },
    {
      name: 'approval path',
      status: 'awaiting_approval',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-approval',
          threadId: 'thread-contract',
          status: 'awaiting_approval',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'awaiting_approval',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'awaiting_approval' },
        { event: 'done', status: 'awaiting_approval' },
      ],
    },
    {
      name: 'cancel path',
      status: 'cancelled',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-cancel',
          threadId: 'thread-contract',
          status: 'cancelled',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'cancelled',
          success: false,
        },
      ],
      expected: [
        { event: 'operation', status: 'cancelled' },
        { event: 'done', status: 'cancelled' },
      ],
    },
    {
      name: 'reconnect path',
      status: 'processing',
      afterSeq: 0,
      events: [
        {
          seq: 0,
          type: 'delta',
          text: 'old',
        },
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-reconnect',
          threadId: 'thread-contract',
          status: 'running',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'complete',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'running' },
        { event: 'done', status: 'complete' },
      ],
      expectNoSubstring: '"content":"old"',
    },
    {
      name: 'failure path',
      status: 'failed',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-failure',
          threadId: 'thread-contract',
          status: 'failed',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'failed',
          success: false,
        },
      ],
      expected: [
        { event: 'operation', status: 'failed' },
        { event: 'done', status: 'failed' },
      ],
    },
  ])(
    'should enforce SSE lifecycle sequence contract for $name',
    async ({ status, afterSeq, events, expected, expectNoSubstring }) => {
      const operationId = 'a8fe6a3f-2f92-4458-9cf7-2ecfe54c0111';
      const jobRepository = createMockJobRepository({
        operationId,
        threadId: 'thread-contract',
        userId: 'test-user',
        status,
      });
      jobRepository.getJobEvents.mockResolvedValue(events);

      setAgentDependencies({
        queueService: {
          enqueue: vi.fn().mockResolvedValue('job-123'),
        } as never,
        jobRepository: jobRepository as never,
        chatService: {
          addMessage: vi.fn(),
        } as never,
        contextBuilder: {
          buildContext: vi.fn(),
          compressToPrompt: vi.fn(),
          getRecentThreadHistory: vi.fn(),
        } as never,
        llmService: {
          completeStream: vi.fn(),
          embed: vi.fn(),
        } as never,
        agentRouter: {
          run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
        } as never,
      });

      const payload: Record<string, unknown> = {
        message: 'Resume operation replay',
        resumeOperationId: operationId,
      };
      if (typeof afterSeq === 'number') {
        payload['afterSeq'] = afterSeq;
      }

      const response = await request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send(payload);

      expect(response.status).toBe(200);
      const parsedEvents = parseSseEvents(response.text).filter(
        (evt) => evt.event === 'operation' || evt.event === 'done'
      );

      expect(parsedEvents).toHaveLength(expected.length);
      for (let i = 0; i < expected.length; i += 1) {
        const expectedEvent = expected[i];
        const actualEvent = parsedEvents[i];
        expect(actualEvent?.event).toBe(expectedEvent?.event);
        expect(actualEvent?.data?.status).toBe(expectedEvent?.status);
      }

      if (expectNoSubstring) {
        expect(response.text).not.toContain(expectNoSubstring);
      }
    }
  );

  it('should reject invalid idempotency key format', async () => {
    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .set('x-idempotency-key', 'bad key with spaces')
      .send({ intent: 'Plan my recruiting week' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error ?? '')).toContain('Invalid idempotency key');
  });

  it('should reject chat stream attachment when user exceeds concurrent stream limit', async () => {
    const operationId = 'd8f52f2e-85b0-4f36-a8c7-df8c3f2cc802';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-limit',
      userId: 'test-user',
      status: 'in-progress',
    });

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    chatRouteTestUtils.setActiveUserStreams('test-user', 5);

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Retry stream', resumeOperationId: operationId });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('AGENT_STREAM_LIMIT_REACHED');
  });

  it('should prune stale chat stream leases before enforcing the concurrent stream limit', async () => {
    const operationId = 'a2777f26-f4c2-47e6-8bf1-0c5646bcf3a0';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-stale-prune',
      userId: 'test-user',
      status: 'completed',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 7,
        type: 'done',
        operationId,
        threadId: 'thread-stream-stale-prune',
        status: 'completed',
        success: true,
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    chatRouteTestUtils.setStaleActiveUserStreams('test-user', 5);

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Recover from stale streams', resumeOperationId: operationId });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: done');
    expect(chatRouteTestUtils.getActiveUserStreamCount('test-user')).toBe(0);
  });

  it('should replace an existing stream for the same operation instead of rejecting at stream limit', async () => {
    const operationId = '8ef6679c-2f96-4f57-b122-6e8ca4f1ad8a';
    const beforeObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const beforeTakeovers =
      (beforeObs.body?.data?.counters?.streamTakeoverTotal as number | undefined) ?? 0;

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-takeover',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 11,
        type: 'done',
        operationId,
        threadId: 'thread-stream-takeover',
        status: 'complete',
        success: true,
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    chatRouteTestUtils.setActiveUserStreams('test-user', 5);
    chatRouteTestUtils.setActiveOperationStream('test-user', operationId, 'test-stream-0');

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Reconnect to same operation', resumeOperationId: operationId });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: done');
    expect(chatRouteTestUtils.getActiveUserStreamCount('test-user')).toBe(4);

    const afterObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const afterTakeovers =
      (afterObs.body?.data?.counters?.streamTakeoverTotal as number | undefined) ?? 0;
    expect(afterTakeovers).toBeGreaterThan(beforeTakeovers);
  });

  it('should emit stream_replaced to the old stream when a second client attaches to the same operation', async () => {
    const operationId = '3c8adf37-f3f0-4e11-9f0a-28f7468ecc20';
    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-dual',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const startStreamRequest = (message: string) =>
      new Promise<request.Response>((resolve, reject) => {
        request(app)
          .post('/api/v1/agent-x/chat')
          .set('Authorization', 'Bearer test-token')
          .set('Accept', 'text/event-stream')
          .send({ message, resumeOperationId: operationId })
          .end((err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
      });

    const firstStreamPromise = startStreamRequest('First viewer');

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
    });

    const secondStreamPromise = startStreamRequest('Second viewer');

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(2);
    });

    liveCallbacks[1]?.({
      event: 'done',
      data: {
        seq: 41,
        operationId,
        threadId: 'thread-stream-dual',
        status: 'complete',
        success: true,
      },
    });

    const [firstStreamResponse, secondStreamResponse] = await Promise.all([
      firstStreamPromise,
      secondStreamPromise,
    ]);

    expect(firstStreamResponse.status).toBe(200);
    expect(firstStreamResponse.text).toContain('event: stream_replaced');
    expect(firstStreamResponse.text).toContain('"reason":"replaced"');

    expect(secondStreamResponse.status).toBe(200);
    expect(secondStreamResponse.text).toContain('event: done');
    expect(secondStreamResponse.text).not.toContain('event: stream_replaced');
  });

  it('should expose stream observability counters and active stream counts', async () => {
    chatRouteTestUtils.setActiveUserStreams('test-user', 2);

    const response = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.activeStreams.user).toBe(2);
    expect(response.body.data.activeStreams.global).toBeGreaterThanOrEqual(2);
    expect(response.body.data.counters).toBeDefined();
  });

  it('should deny explicit cancel when operation belongs to another user', async () => {
    const foreignAbortController = new AbortController();
    activeAbortControllers.set('op-foreign', {
      controller: foreignAbortController,
      createdAt: Date.now(),
      userId: 'another-user',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/cancel/op-foreign')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(foreignAbortController.signal.aborted).toBe(false);
  });

  it('should queue a new /enqueue operation behind the latest running thread operation', async () => {
    const threadId = '64f10b2a6f1c2e0c1d3e8a11';
    const runningJob = {
      operationId: 'op-running',
      threadId,
      userId: 'test-user',
      status: 'acting',
      intent: 'Build my recruiting board',
    };

    const jobRepository = createMockJobRepository(runningJob);
    jobRepository.findActiveByThread.mockResolvedValue([runningJob]);
    const chatService = {
      addMessage: vi.fn(),
      getThread: vi.fn().mockResolvedValue({ id: threadId, userId: 'test-user' }),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-456'),
      cancel: vi.fn().mockResolvedValue(false),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'application/json')
      .send({
        intent: 'Also add Ohio D3 coaches',
        threadId,
      });

    expect(response.status).toBe(202);
    expect(queueService.cancel).not.toHaveBeenCalled();
    expect(jobRepository.markCancelled).not.toHaveBeenCalled();

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      context?: {
        parentOperationId?: string;
        threadId?: string;
      };
    };

    expect(payload.context?.threadId).toBe(threadId);
    expect(payload.context?.parentOperationId).toBe('op-running');
  });

  it('should pause an active operation and persist a resumable pause yield state', async () => {
    const operationId = 'f9e26a8e-f935-4fcb-95af-6e21d33fca21';
    const pauseAbortController = new AbortController();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-1',
      userId: 'test-user',
      status: 'processing',
      progress: {
        status: 'processing',
        message: 'Working',
        agentId: 'strategy_coordinator',
        percent: 35,
        totalSteps: 3,
      },
    });
    jobRepository.allocateEventSeqRange.mockResolvedValue(14);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
        updateThreadPausedYieldState: vi.fn().mockResolvedValue(true),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    activeAbortControllers.set(operationId, {
      controller: pauseAbortController,
      createdAt: Date.now(),
      userId: 'test-user',
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/pause/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('paused');
    expect(pauseAbortController.signal.aborted).toBe(true);
    expect(jobRepository.markPaused).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        pendingToolCall: expect.objectContaining({
          toolName: 'resume_paused_operation',
        }),
      })
    );
    expect(jobRepository.writeJobEvent).toHaveBeenCalledTimes(1);

    const operationEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[0]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
      yieldState?: { pendingToolCall?: { toolName?: string } };
    };
    expect(operationEventWrite.type).toBe('operation');
    expect(operationEventWrite.status).toBe('paused');
    expect(operationEventWrite.yieldState?.pendingToolCall?.toolName).toBe(
      'resume_paused_operation'
    );
  });

  it('should resume a paused yielded job without requiring user response text', async () => {
    const operationId = 'c8d26f9c-85b6-44c9-8d4a-9958683d7e9f';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-resume-1',
      userId: 'test-user',
      intent: 'Build a recruiting campaign plan',
      status: 'paused',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Build a recruiting campaign plan' }],
        pendingToolCall: {
          toolName: 'resume_paused_operation',
          toolInput: { operationId },
          toolCallId: 'pause_resume_op',
        },
        yieldedAt: '2099-04-25T00:00:00.000Z',
        expiresAt: '2099-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(jobRepository.markCompleted).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({
        summary: expect.stringContaining('Resumed after pause'),
        data: expect.objectContaining({ resumedFromPause: true }),
      })
    );

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Build a recruiting campaign plan' },
    ]);
  });

  it('should reuse the saved ask_user tool call id when resuming yielded input', async () => {
    const operationId = '8eec9a65-94a0-44fc-94f8-d2bdde1fa57d';
    const addMessage = vi.fn();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-ask-user-resume-1',
      userId: 'test-user',
      intent: 'Help me plan my recruiting outreach',
      status: 'awaiting_input',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'I need a few details first.',
        agentId: 'admin_coordinator',
        messages: [
          { role: 'user', content: 'Help me plan my recruiting outreach' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_ask_user_42',
                type: 'function',
                function: {
                  name: 'ask_user',
                  arguments: '{"question":"What is your grad year?"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Tool execution was interrupted.' }),
            tool_call_id: 'call_ask_user_42',
          },
        ],
        yieldedAt: '2099-04-25T00:00:00.000Z',
        expiresAt: '2099-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-ask-user-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage,
        clearThreadPausedYieldState: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({ response: 'I am class of 2027 and I play point guard.' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-ask-user-resume-1',
        userId: 'test-user',
        role: 'user',
        content: 'I am class of 2027 and I play point guard.',
        origin: 'user',
        operationId,
      })
    );

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Help me plan my recruiting outreach' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_ask_user_42',
            type: 'function',
            function: {
              name: 'ask_user',
              arguments: '{"question":"What is your grad year?"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          data: { userResponse: 'I am class of 2027 and I play point guard.' },
        }),
        tool_call_id: 'call_ask_user_42',
      },
    ]);
  });

  it('should strip synthetic pause tool_result messages when resuming a paused job', async () => {
    const operationId = 'e06f4d6d-56e2-4d0a-ac93-6f0964138c80';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-resume-2',
      userId: 'test-user',
      intent: 'Continue paused operation',
      status: 'paused',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        agentId: 'strategy_coordinator',
        messages: [
          { role: 'user', content: 'Continue paused operation' },
          {
            role: 'tool',
            content: JSON.stringify({ success: true }),
            tool_call_id: 'pause_resume_chat-c0d95276-ad5f-44d5-b7e4-4fee0dd3d6af',
          },
        ],
        pendingToolCall: {
          toolName: 'resume_paused_operation',
          toolInput: { operationId },
          toolCallId: 'pause_resume_op',
        },
        yieldedAt: '2099-04-25T00:00:00.000Z',
        expiresAt: '2099-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-124'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Continue paused operation' },
    ]);
  });

  it('should persist cancellation lifecycle events when cancelling an operation', async () => {
    const operationId = '54d85e88-e75f-4d4f-b97d-5579f78f2478';
    const cancelAbortController = new AbortController();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-cancel-1',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.allocateEventSeqRange.mockResolvedValue(8);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    activeAbortControllers.set(operationId, {
      controller: cancelAbortController,
      createdAt: Date.now(),
      userId: 'test-user',
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/cancel/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(cancelAbortController.signal.aborted).toBe(true);
    expect(jobRepository.markCancelled).toHaveBeenCalledWith(operationId);
    expect(jobRepository.writeJobEvent).toHaveBeenCalledTimes(2);

    const operationEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[0]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
    };
    const doneEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[1]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
    };

    expect(operationEventWrite.type).toBe('operation');
    expect(operationEventWrite.status).toBe('cancelled');
    expect(doneEventWrite.type).toBe('done');
    expect(doneEventWrite.status).toBe('cancelled');
    expect(doneEventWrite.seq).toBeGreaterThan(operationEventWrite.seq ?? -1);
  });

  it('should stamp expiresAt on AgentJobOutbox doc when /enqueue succeeds', async () => {
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-ttl-test'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .send({ intent: 'Build a recruiting plan for fall semester' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    const operationId = response.body.data.operationId as string;
    expect(typeof operationId).toBe('string');

    const outboxDoc = __getMockFirestoreDocument(`AgentJobOutbox/${operationId}`);
    expect(outboxDoc).toBeDefined();
    expect(outboxDoc?.status).toBe('enqueued');
    expect(outboxDoc?.jobId).toBe('job-ttl-test');

    // expiresAt should be stamped as a Timestamp ~7 days from now.
    // structuredClone loses the getter prototype so Firebase Timestamp
    // is stored as { _seconds, _nanoseconds } in the mock document store.
    const expiresAt = outboxDoc?.expiresAt as { _seconds: number } | undefined;
    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?._seconds).toBe('number');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(expiresAt!._seconds).toBeGreaterThan(nowSeconds + sevenDaysSeconds - 60);
    expect(expiresAt!._seconds).toBeLessThan(nowSeconds + sevenDaysSeconds + 60);
  });

  it('should stamp error expiresAt on AgentJobOutbox doc when enqueue throws', async () => {
    const queueService = {
      enqueue: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .send({ intent: 'Build a recruiting plan' });

    // The route should return an error response when enqueue fails
    expect(response.status).toBeGreaterThanOrEqual(400);

    // Find the outbox doc by scanning mock writes — operationId not in error response
    const { __getMockFirestoreWrites } = await import('../../test-app.js');
    const outboxWrites = __getMockFirestoreWrites().filter((w) =>
      w.path.startsWith('AgentJobOutbox/')
    );
    expect(outboxWrites.length).toBeGreaterThan(0);

    const errorWrite = outboxWrites.find((w) => w.payload?.['status'] === 'error');
    expect(errorWrite).toBeDefined();
    expect(errorWrite?.payload?.['lastError']).toBe('Queue unavailable');

    // structuredClone loses the getter prototype so Firebase Timestamp
    // is stored as { _seconds, _nanoseconds } in the mock write store.
    const expiresAt = errorWrite?.payload?.['expiresAt'] as { _seconds: number } | undefined;
    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?._seconds).toBe('number');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(expiresAt!._seconds).toBeGreaterThan(nowSeconds + sevenDaysSeconds - 60);
    expect(expiresAt!._seconds).toBeLessThan(nowSeconds + sevenDaysSeconds + 60);
  });

  it('should reject playbook generation when the user has no active goals', async () => {
    __seedMockFirestoreDocument('Users/test-user', {
      id: 'test-user',
      role: 'athlete',
      agentGoals: [],
    });

    const response = await request(app)
      .post('/api/v1/agent-x/playbook/generate')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatchObject({
      code: 'VAL_REQUIRED_FIELD',
      message: 'Set at least one goal before generating a playbook',
    });
    expect(__getMockFirestoreWrites()).toHaveLength(0);
  });
});

function createMockJobRepository(jobDoc?: Record<string, unknown>) {
  const repository = {
    withDb: vi.fn(),
    getById: vi.fn().mockResolvedValue(jobDoc ?? null),
    getByUser: vi.fn().mockResolvedValue(jobDoc ? [jobDoc] : []),
    getByUserPage: vi.fn().mockResolvedValue({
      jobs: jobDoc ? [jobDoc] : [],
      hasMore: false,
      nextCreatedAt: undefined,
    }),
    findActiveByThread: vi.fn().mockResolvedValue(jobDoc ? [jobDoc] : []),
    getByIdempotencyKey: vi.fn().mockResolvedValue(null),
    getJobEvents: vi.fn().mockResolvedValue([]),
    allocateEventSeqRange: vi.fn().mockResolvedValue(0),
    writeJobEvent: vi.fn().mockResolvedValue(undefined),
    writeJobEventWithAutoSeq: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markPaused: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    markDetached: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    patchContext: vi.fn().mockResolvedValue(undefined),
  };

  repository.withDb.mockReturnValue(repository);
  return repository;
}

function parseSseEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const eventMatch = /^event:\s*(.+)$/m.exec(frame);
      const dataMatch = /^data:\s*(.+)$/m.exec(frame);
      const event = eventMatch?.[1]?.trim() ?? '';
      const dataRaw = dataMatch?.[1]?.trim() ?? '{}';
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(dataRaw) as Record<string, unknown>;
      } catch {
        // data remains {}
      }
      return { event, data };
    });
}
