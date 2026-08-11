import { describe, expect, it } from 'vitest';
import { resolveProviderEmailAttachments } from '../email-attachment-resolver.js';

function createStorage(options: {
  readonly metadata: Record<string, unknown>;
  readonly content: Buffer;
}) {
  return {
    bucket: () => ({
      file: (_path: string) => ({
        getMetadata: async () => [options.metadata],
        download: async () => [options.content],
      }),
    }),
  };
}

describe('resolveProviderEmailAttachments', () => {
  it('downloads user-owned Firebase attachments as provider buffers', async () => {
    const attachments = await resolveProviderEmailAttachments({
      userId: 'user-123',
      attachments: [
        {
          name: 'Scout Report.pdf',
          mimeType: 'application/pdf',
          storagePath: 'Users/user-123/threads/thread-1/uploads/scout-report.pdf',
        },
      ],
      storage: createStorage({
        metadata: { contentType: 'application/pdf', size: '9' },
        content: Buffer.from('PDF bytes'),
      }),
    });

    expect(attachments).toEqual([
      {
        filename: 'Scout_Report.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('PDF bytes'),
        sizeBytes: 9,
      },
    ]);
  });

  it('rejects attachments outside the authenticated user path', async () => {
    await expect(
      resolveProviderEmailAttachments({
        userId: 'user-123',
        attachments: [
          {
            name: 'other.pdf',
            mimeType: 'application/pdf',
            storagePath: 'Users/other-user/threads/thread-1/uploads/other.pdf',
          },
        ],
        storage: createStorage({
          metadata: { contentType: 'application/pdf', size: '3' },
          content: Buffer.from('pdf'),
        }),
      })
    ).rejects.toThrow('Email attachments must belong to the authenticated user.');
  });

  it('rejects blocked file extensions', async () => {
    await expect(
      resolveProviderEmailAttachments({
        userId: 'user-123',
        attachments: [
          {
            name: 'run-me.sh',
            mimeType: 'text/plain',
            storagePath: 'Users/user-123/threads/thread-1/uploads/run-me.sh',
          },
        ],
        storage: createStorage({
          metadata: { contentType: 'text/plain', size: '3' },
          content: Buffer.from('bad'),
        }),
      })
    ).rejects.toThrow('Attachment type is not allowed for email');
  });
});
