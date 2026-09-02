import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

const { mockDownload, mockFile, mockGet, mockGetMetadata, mockSet, fakeDb, fakeStorage } =
  vi.hoisted(() => {
    const mockDownload = vi.fn();
    const mockGetMetadata = vi.fn();
    const mockFile = vi.fn(() => ({
      getMetadata: mockGetMetadata,
      download: mockDownload,
    }));
    const mockGet = vi.fn();
    const mockSet = vi.fn();
    const fakeDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: mockGet,
          set: mockSet,
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              get: mockGet,
              set: mockSet,
            })),
          })),
        })),
      })),
    };
    const fakeStorage = {
      bucket: vi.fn(() => ({
        file: mockFile,
      })),
    };
    return { mockDownload, mockFile, mockGet, mockGetMetadata, mockSet, fakeDb, fakeStorage };
  });

vi.mock('axios');

vi.mock('../../../utils/firebase.js', () => ({
  db: fakeDb,
  storage: fakeStorage,
}));

vi.mock('../../../utils/firebase-staging.js', () => ({
  stagingDb: fakeDb,
  stagingStorage: fakeStorage,
}));

import {
  createDriveFolder,
  deleteDriveFile,
  getValidGoogleDriveAccessToken,
  searchDriveFiles,
  uploadDriveFile,
  uploadStoredDriveFile,
} from '../connected-drive.service.js';

describe('Connected Google Drive Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
    mockGetMetadata.mockReset();
    mockDownload.mockReset();
    mockFile.mockClear();
    vi.stubEnv('CLIENT_ID', 'test-client-id');
    vi.stubEnv('CLIENT_SECRET', 'test-client-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getValidGoogleDriveAccessToken', () => {
    it('returns fresh accessToken without refreshing', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'valid-token-123',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });

      const result = await getValidGoogleDriveAccessToken('user-1');
      expect(result).toEqual({
        accessToken: 'valid-token-123',
        email: 'coach@example.com',
      });
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('refreshes token when accessToken is expired', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'expired-token',
          refreshToken: 'refresh-token-xyz',
          email: 'coach@example.com',
          lastRefreshedAt: new Date(Date.now() - 7200000).toISOString(),
        }),
      });

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          access_token: 'new-token-456',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file',
          token_type: 'Bearer',
        },
      });

      const result = await getValidGoogleDriveAccessToken('user-1');
      expect(result.accessToken).toBe('new-token-456');
      expect(result.email).toBe('coach@example.com');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-token-456',
          provider: 'google',
        }),
        { merge: true }
      );
    });

    it('throws when user has no Google connection', async () => {
      mockGet.mockResolvedValue({ exists: false });

      await expect(getValidGoogleDriveAccessToken('user-no-token')).rejects.toThrow(
        /Google Drive is not connected/i
      );
    });
  });

  describe('createDriveFolder', () => {
    it('creates a folder in Google Drive via v3 REST API', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'token-abc',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          id: 'folder-123',
          name: '2026 Scout Reports',
          mimeType: 'application/vnd.google-apps.folder',
          webViewLink: 'https://drive.google.com/drive/folders/folder-123',
        },
      });

      const result = await createDriveFolder('user-1', '2026 Scout Reports', 'parent-99');

      expect(result).toEqual({
        success: true,
        id: 'folder-123',
        name: '2026 Scout Reports',
        mimeType: 'application/vnd.google-apps.folder',
        webViewLink: 'https://drive.google.com/drive/folders/folder-123',
        parentFolderId: 'parent-99',
      });
      expect(axios.post).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink,parents',
        {
          name: '2026 Scout Reports',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent-99'],
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-abc',
          }),
        })
      );
    });
  });

  describe('uploadDriveFile', () => {
    it('uploads a file using multipart upload', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'token-abc',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });

      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          id: 'file-456',
          name: 'Report.pdf',
          mimeType: 'application/pdf',
          size: '1024',
          webViewLink: 'https://drive.google.com/file/d/file-456/view',
          webContentLink: 'https://drive.google.com/uc?id=file-456',
        },
      });

      const contentBase64 = Buffer.from('PDF content mock').toString('base64');
      const result = await uploadDriveFile(
        'user-1',
        'Report.pdf',
        contentBase64,
        'application/pdf'
      );

      expect(result).toEqual({
        success: true,
        id: 'file-456',
        name: 'Report.pdf',
        mimeType: 'application/pdf',
        size: '1024',
        webViewLink: 'https://drive.google.com/file/d/file-456/view',
        webContentLink: 'https://drive.google.com/uc?id=file-456',
        parentFolderId: undefined,
      });
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('uploadType=multipart'),
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-abc',
          }),
        })
      );
    });

    it('uploads an existing NXT1 file from a trusted storage path', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'token-abc',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });
      mockGetMetadata.mockResolvedValueOnce([{ contentType: 'application/pdf', size: '15' }]);
      mockDownload.mockResolvedValueOnce([Buffer.from('stored-pdf-binary')]);
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          id: 'file-789',
          name: 'Week 1 Cards.pdf',
          mimeType: 'application/pdf',
          size: '15',
          webViewLink: 'https://drive.google.com/file/d/file-789/view',
          webContentLink: 'https://drive.google.com/uc?id=file-789',
        },
      });

      const result = await uploadStoredDriveFile('user-1', {
        sourceStoragePath: 'Users/user-1/threads/thread-1/exports/week-1.pdf',
        filename: 'Week 1 Cards.pdf',
        parentFolderId: 'folder-1',
      });

      expect(result).toEqual({
        success: true,
        id: 'file-789',
        name: 'Week 1 Cards.pdf',
        mimeType: 'application/pdf',
        size: '15',
        webViewLink: 'https://drive.google.com/file/d/file-789/view',
        webContentLink: 'https://drive.google.com/uc?id=file-789',
        parentFolderId: 'folder-1',
      });
      expect(mockFile).toHaveBeenCalledWith('Users/user-1/threads/thread-1/exports/week-1.pdf');
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });

    it('uploads an existing NXT1 file by document id', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            accessToken: 'token-abc',
            email: 'coach@example.com',
            lastRefreshedAt: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            title: 'Scout Team Play Cards — Week 1.pdf',
            payload: {
              storagePath: 'Users/user-1/threads/thread-1/exports/scout-team-play-cards.pdf',
              mimeType: 'application/pdf',
            },
          }),
        });
      mockGetMetadata.mockResolvedValueOnce([{ contentType: 'application/pdf', size: '20' }]);
      mockDownload.mockResolvedValueOnce([Buffer.from('stored-pdf-binary')]);
      vi.mocked(axios.post).mockResolvedValueOnce({
        data: {
          id: 'file-999',
          name: 'Scout Team Play Cards — Week 1.pdf',
          mimeType: 'application/pdf',
          size: '20',
          webViewLink: 'https://drive.google.com/file/d/file-999/view',
          webContentLink: 'https://drive.google.com/uc?id=file-999',
        },
      });

      const result = await uploadStoredDriveFile('user-1', {
        documentId: 'team-file:strategy-doc-1',
        parentFolderId: 'folder-1',
      });

      expect(result.id).toBe('file-999');
      expect(mockFile).toHaveBeenCalledWith(
        'Users/user-1/threads/thread-1/exports/scout-team-play-cards.pdf'
      );
    });
  });

  describe('searchDriveFiles', () => {
    it('searches files using drive v3 API query parameters', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'token-abc',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          files: [
            {
              id: 'file-1',
              name: 'Film Review.mp4',
              mimeType: 'video/mp4',
              webViewLink: 'https://drive.google.com/file/d/file-1/view',
            },
          ],
        },
      });

      const result = await searchDriveFiles('user-1', 'Film Review');

      expect(result).toEqual({
        success: true,
        count: 1,
        files: [
          {
            id: 'file-1',
            name: 'Film Review.mp4',
            mimeType: 'video/mp4',
            webViewLink: 'https://drive.google.com/file/d/file-1/view',
          },
        ],
      });
    });
  });

  describe('deleteDriveFile', () => {
    it('deletes a file by ID', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          accessToken: 'token-abc',
          email: 'coach@example.com',
          lastRefreshedAt: new Date().toISOString(),
        }),
      });

      vi.mocked(axios.delete).mockResolvedValueOnce({ data: {} });

      const result = await deleteDriveFile('user-1', 'file-to-delete');
      expect(result).toEqual({
        success: true,
        fileId: 'file-to-delete',
        deleted: true,
      });
      expect(axios.delete).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/file-to-delete',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token-abc' },
        })
      );
    });
  });
});
