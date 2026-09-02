import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import {
  CreateDriveFolderTool,
  UploadDriveFileTool,
  SearchDriveFilesTool,
  ReadDriveFileTool,
  DeleteDriveFileTool,
} from '../index.js';

const mockCreateDriveFolder = vi.fn();
const mockUploadDriveFile = vi.fn();
const mockUploadStoredDriveFile = vi.fn();
const mockSearchDriveFiles = vi.fn();
const mockGetDriveFileContent = vi.fn();
const mockDeleteDriveFile = vi.fn();

vi.mock('../../../../../../services/platform/connected-drive.service.js', () => ({
  createDriveFolder: (...args: unknown[]) => mockCreateDriveFolder(...args),
  uploadDriveFile: (...args: unknown[]) => mockUploadDriveFile(...args),
  uploadStoredDriveFile: (...args: unknown[]) => mockUploadStoredDriveFile(...args),
  searchDriveFiles: (...args: unknown[]) => mockSearchDriveFiles(...args),
  getDriveFileContent: (...args: unknown[]) => mockGetDriveFileContent(...args),
  deleteDriveFile: (...args: unknown[]) => mockDeleteDriveFile(...args),
}));

function createContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    environment: 'staging',
    emitStage: vi.fn(),
    ...overrides,
  };
}

describe('First-Party Google Drive Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CreateDriveFolderTool', () => {
    const tool = new CreateDriveFolderTool();

    it('has correct metadata', () => {
      expect(tool.name).toBe('create_drive_folder');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('data');
      expect(tool.allowedAgents).toEqual(['*']);
    });

    it('executes folder creation successfully', async () => {
      mockCreateDriveFolder.mockResolvedValueOnce({
        success: true,
        id: 'folder-abc',
        name: 'test-folder',
        mimeType: 'application/vnd.google-apps.folder',
      });

      const result = await tool.execute({ folder_name: 'test-folder' }, createContext());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          id: 'folder-abc',
          name: 'test-folder',
        })
      );
      expect(mockCreateDriveFolder).toHaveBeenCalledWith(
        'test-user-123',
        'test-folder',
        undefined,
        'staging'
      );
    });

    it('requires authenticated user context', async () => {
      const result = await tool.execute({ folder_name: 'test-folder' }, undefined);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authenticated user context is required');
    });
  });

  describe('UploadDriveFileTool', () => {
    const tool = new UploadDriveFileTool();

    it('has correct metadata', () => {
      expect(tool.name).toBe('upload_drive_file');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('data');
    });

    it('uploads a file successfully', async () => {
      mockUploadDriveFile.mockResolvedValueOnce({
        success: true,
        id: 'file-123',
        name: 'Report.pdf',
        mimeType: 'application/pdf',
      });

      const result = await tool.execute(
        {
          filename: 'Report.pdf',
          content_base64: 'bW9jaw==',
          mime_type: 'application/pdf',
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(mockUploadDriveFile).toHaveBeenCalledWith(
        'test-user-123',
        'Report.pdf',
        'bW9jaw==',
        'application/pdf',
        undefined,
        'staging'
      );
    });

    it('uploads an existing NXT1 file reference successfully', async () => {
      mockUploadStoredDriveFile.mockResolvedValueOnce({
        success: true,
        id: 'file-456',
        name: 'Scout Team Play Cards — Week 1.pdf',
        mimeType: 'application/pdf',
      });

      const result = await tool.execute(
        {
          document_id: 'team-file:week-1-cards',
          parent_folder_id: 'folder-1',
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(mockUploadStoredDriveFile).toHaveBeenCalledWith(
        'test-user-123',
        {
          filename: undefined,
          mimeType: undefined,
          parentFolderId: 'folder-1',
          sourceStoragePath: undefined,
          sourceUrl: undefined,
          documentId: 'team-file:week-1-cards',
        },
        'staging'
      );
    });
  });

  describe('SearchDriveFilesTool', () => {
    const tool = new SearchDriveFilesTool();

    it('has correct metadata', () => {
      expect(tool.name).toBe('search_drive_files');
      expect(tool.isMutation).toBe(false);
      expect(tool.category).toBe('data');
    });

    it('searches files successfully', async () => {
      mockSearchDriveFiles.mockResolvedValueOnce({
        success: true,
        count: 1,
        files: [{ id: 'f-1', name: 'Plan.pdf' }],
      });

      const result = await tool.execute({ query: 'Plan' }, createContext());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          count: 1,
        })
      );
    });
  });

  describe('ReadDriveFileTool', () => {
    const tool = new ReadDriveFileTool();

    it('reads file content successfully', async () => {
      mockGetDriveFileContent.mockResolvedValueOnce({
        success: true,
        fileId: 'f-1',
        name: 'Plan.txt',
        content: 'Practice schedule content',
      });

      const result = await tool.execute({ file_id: 'f-1' }, createContext());

      expect(result.success).toBe(true);
      expect(mockGetDriveFileContent).toHaveBeenCalledWith('test-user-123', 'f-1', 'staging');
    });
  });

  describe('DeleteDriveFileTool', () => {
    const tool = new DeleteDriveFileTool();

    it('deletes file successfully', async () => {
      mockDeleteDriveFile.mockResolvedValueOnce({
        success: true,
        fileId: 'f-1',
        deleted: true,
      });

      const result = await tool.execute({ file_id: 'f-1' }, createContext());

      expect(result.success).toBe(true);
      expect(mockDeleteDriveFile).toHaveBeenCalledWith('test-user-123', 'f-1', 'staging');
    });
  });
});
