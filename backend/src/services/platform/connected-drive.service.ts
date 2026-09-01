/**
 * @fileoverview Connected Google Drive Service — Direct REST API Integration
 * @module @nxt1/backend/services/platform
 *
 * Provides first-party Google Drive integration using the Google Drive v3 REST API
 * and the user's stored Google OAuth token (Users/{uid}/oauthTokens/google).
 *
 * Scope requirement:
 *   https://www.googleapis.com/auth/drive.file
 *   (Non-sensitive scope: access to app-created files and folders)
 */

import axios from 'axios';
import { UNIVERSAL_FILES_COLLECTION, getUniversalBinaryFilePayload } from '@nxt1/core';
import {
  OAUTH_TOKEN_SUBCOLLECTION,
  LEGACY_EMAIL_TOKEN_SUBCOLLECTION,
  getOAuthTokenDocId,
} from '@nxt1/core/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb, storage as defaultStorage } from '../../utils/firebase.js';
import { stagingDb, stagingStorage } from '../../utils/firebase-staging.js';
import {
  getActiveFirestoreEnvironment,
  isEnvironmentScopedFirestore,
} from '../../utils/firestore-environment-context.js';
import { logger } from '../../utils/logger.js';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';

const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000;
const GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000;

interface StoredGoogleTokenDoc {
  provider?: string;
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  grantedScopes?: string;
  lastRefreshedAt?: string;
}

type DriveStorageFile = {
  getMetadata(): Promise<[Record<string, unknown>] | [Record<string, unknown>, unknown]>;
  download(): Promise<[Buffer]>;
};

type DriveStorageBucket = {
  file(path: string): DriveStorageFile;
};

type DriveStorage = {
  bucket(): DriveStorageBucket;
};

interface StoredDriveSource {
  readonly storagePath: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export interface GoogleDriveFolderResult {
  readonly success: true;
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly webViewLink?: string;
  readonly parentFolderId?: string;
}

export interface GoogleDriveUploadResult {
  readonly success: true;
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: string;
  readonly webViewLink?: string;
  readonly webContentLink?: string;
  readonly parentFolderId?: string;
}

export interface GoogleDriveFileItem {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: string;
  readonly webViewLink?: string;
  readonly webContentLink?: string;
  readonly createdTime?: string;
  readonly modifiedTime?: string;
  readonly parents?: readonly string[];
}

export interface GoogleDriveSearchResult {
  readonly success: true;
  readonly count: number;
  readonly files: readonly GoogleDriveFileItem[];
}

export interface GoogleDriveFileContentResult {
  readonly success: true;
  readonly fileId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly content: string;
  readonly size?: string;
  readonly webViewLink?: string;
}

export interface UploadStoredDriveFileInput {
  readonly filename?: string;
  readonly mimeType?: string;
  readonly parentFolderId?: string;
  readonly sourceStoragePath?: string;
  readonly sourceUrl?: string;
  readonly documentId?: string;
}

function resolveFirestore(environment?: 'staging' | 'production'): Firestore {
  if (environment === 'staging') return stagingDb;
  if (environment === 'production') return defaultDb;
  return process.env['NODE_ENV'] === 'staging' ? stagingDb : defaultDb;
}

function resolveStorage(environment?: 'staging' | 'production'): DriveStorage {
  if (environment === 'staging') return stagingStorage as unknown as DriveStorage;
  if (environment === 'production') return defaultStorage as unknown as DriveStorage;
  return (process.env['NODE_ENV'] === 'staging'
    ? stagingStorage
    : defaultStorage) as unknown as DriveStorage;
}

function resolveGoogleCredentials(db: Firestore): { clientId: string; clientSecret: string } {
  const isStaging = isEnvironmentScopedFirestore(db)
    ? getActiveFirestoreEnvironment() === 'staging'
    : db === stagingDb;
  const clientId = isStaging
    ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
    : (process.env['CLIENT_ID'] ?? '');
  const clientSecret = isStaging
    ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
    : (process.env['CLIENT_SECRET'] ?? '');
  return { clientId, clientSecret };
}

function shouldRefreshAccessToken(lastRefreshedAt?: string): boolean {
  if (!lastRefreshedAt) return true;
  const refreshedAtMs = Date.parse(lastRefreshedAt);
  if (Number.isNaN(refreshedAtMs)) return true;
  return (
    Date.now() >= refreshedAtMs + GOOGLE_ACCESS_TOKEN_TTL_MS - GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_MS
  );
}

function normalizeDocumentId(value: string): string {
  return value.replace(/^team-file:/i, '').trim();
}

function normalizeContentType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function assertUserOwnedStoragePath(userId: string, storagePath: string): void {
  const expectedPrefix = `Users/${userId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error(
      'Google Drive uploads from NXT1 Files currently require a file owned by the authenticated user.'
    );
  }
}

function resolveFilenameFromStoragePath(storagePath: string): string {
  const basename = storagePath.split('/').pop()?.trim() || 'file';
  return AgentMediaLifecycleService.sanitizeFileName(basename);
}

async function uploadBufferToDrive(params: {
  readonly accessToken: string;
  readonly filename: string;
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly parentFolderId?: string;
  readonly userId: string;
}): Promise<GoogleDriveUploadResult> {
  const metadata: Record<string, unknown> = {
    name: params.filename.trim(),
    mimeType: params.mimeType,
  };

  if (params.parentFolderId && params.parentFolderId.trim()) {
    metadata['parents'] = [params.parentFolderId.trim()];
  }

  const boundary = `----Nxt1DriveUploadBoundary${Date.now()}`;
  const metadataHeader = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(metadataHeader, 'utf-8'),
    Buffer.from(mediaHeader, 'utf-8'),
    params.buffer,
    Buffer.from(footer, 'utf-8'),
  ]);

  const response = await axios.post<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
    webContentLink?: string;
  }>(
    `${GOOGLE_DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,parents`,
    multipartBody,
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  logger.info('[ConnectedDrive] Uploaded file to Google Drive', {
    userId: params.userId,
    fileId: response.data.id,
    filename: response.data.name,
    size: response.data.size,
  });

  return {
    success: true,
    id: response.data.id,
    name: response.data.name,
    mimeType: response.data.mimeType,
    size: response.data.size,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink,
    parentFolderId: params.parentFolderId,
  };
}

async function resolveStoredDriveSource(params: {
  readonly userId: string;
  readonly input: UploadStoredDriveFileInput;
  readonly environment?: 'staging' | 'production';
}): Promise<StoredDriveSource> {
  const db = resolveFirestore(params.environment);
  const storage = resolveStorage(params.environment);

  let storagePath = params.input.sourceStoragePath?.trim() || '';
  if (!storagePath && params.input.sourceUrl?.trim()) {
    storagePath =
      AgentMediaLifecycleService.extractStoragePathFromUrl(params.input.sourceUrl.trim()) ?? '';
  }

  let filename = params.input.filename?.trim() || '';
  let mimeType = params.input.mimeType?.trim().toLowerCase() || '';

  if (!storagePath && params.input.documentId?.trim()) {
    const documentId = normalizeDocumentId(params.input.documentId);
    const documentSnap = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(documentId).get();
    if (!documentSnap.exists) {
      throw new Error(`Files item ${documentId} was not found.`);
    }

    const record = (documentSnap.data() ?? {}) as Record<string, unknown>;
    const rawPayload =
      record['payload'] &&
      typeof record['payload'] === 'object' &&
      !Array.isArray(record['payload'])
        ? (record['payload'] as Record<string, unknown>)
        : null;
    const binaryPayload =
      getUniversalBinaryFilePayload(record['payload']) ?? getUniversalBinaryFilePayload(record);
    const fallbackStoragePath =
      (rawPayload &&
        typeof rawPayload['storagePath'] === 'string' &&
        rawPayload['storagePath'].trim()) ||
      (typeof record['storagePath'] === 'string' && record['storagePath'].trim()) ||
      '';
    const fallbackMimeType =
      (rawPayload && typeof rawPayload['mimeType'] === 'string' && rawPayload['mimeType'].trim()) ||
      (typeof record['mimeType'] === 'string' && record['mimeType'].trim()) ||
      '';

    if (!binaryPayload && !fallbackStoragePath) {
      throw new Error(`Files item ${documentId} does not contain an uploadable binary file.`);
    }

    storagePath =
      binaryPayload &&
      typeof binaryPayload.storagePath === 'string' &&
      binaryPayload.storagePath.trim().length > 0
        ? binaryPayload.storagePath.trim()
        : fallbackStoragePath
          ? fallbackStoragePath
          : (AgentMediaLifecycleService.extractStoragePathFromUrl(
              binaryPayload && typeof binaryPayload.url === 'string' ? binaryPayload.url : ''
            ) ?? '');

    if (!filename) {
      filename =
        (typeof record['title'] === 'string' && record['title'].trim()) ||
        (typeof record['name'] === 'string' && record['name'].trim()) ||
        (rawPayload &&
          typeof rawPayload['fileName'] === 'string' &&
          rawPayload['fileName'].trim()) ||
        (rawPayload &&
          typeof rawPayload['filename'] === 'string' &&
          rawPayload['filename'].trim()) ||
        '';
    }
    if (!mimeType) {
      mimeType =
        (binaryPayload &&
          typeof binaryPayload.mimeType === 'string' &&
          binaryPayload.mimeType.trim().toLowerCase()) ||
        fallbackMimeType.toLowerCase() ||
        '';
    }
  }

  const normalizedStoragePath =
    AgentMediaLifecycleService.extractStoragePathFromUrl(storagePath) ?? storagePath;
  if (!normalizedStoragePath) {
    throw new Error(
      'Google Drive upload from NXT1 Files requires a source_storage_path, source_url, or document_id.'
    );
  }

  assertUserOwnedStoragePath(params.userId, normalizedStoragePath);

  const file = storage.bucket().file(normalizedStoragePath);
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();
  const metadataRecord = Array.isArray(metadata) ? metadata[0] : metadata;

  return {
    storagePath: normalizedStoragePath,
    filename: filename || resolveFilenameFromStoragePath(normalizedStoragePath),
    mimeType:
      mimeType || normalizeContentType(metadataRecord['contentType']) || 'application/octet-stream',
    buffer,
  };
}

/**
 * Retrieve a valid Google OAuth access token for the given user, refreshing it if expired.
 */
export async function getValidGoogleDriveAccessToken(
  userId: string,
  environment?: 'staging' | 'production'
): Promise<{ accessToken: string; email: string }> {
  const db = resolveFirestore(environment);
  const tokenRef = db
    .collection('Users')
    .doc(userId)
    .collection(OAUTH_TOKEN_SUBCOLLECTION)
    .doc(getOAuthTokenDocId('gmail'));

  const tokenSnap = await tokenRef.get();
  let tokenDoc: StoredGoogleTokenDoc | null = null;

  if (tokenSnap.exists) {
    tokenDoc = tokenSnap.data() as StoredGoogleTokenDoc;
  } else {
    // Fallback: legacy emailTokens
    const legacyTokenRef = db
      .collection('Users')
      .doc(userId)
      .collection(LEGACY_EMAIL_TOKEN_SUBCOLLECTION)
      .doc('gmail');
    const legacySnap = await legacyTokenRef.get();
    if (legacySnap.exists) {
      tokenDoc = legacySnap.data() as StoredGoogleTokenDoc;
    }
  }

  if (!tokenDoc || (!tokenDoc.accessToken && !tokenDoc.refreshToken)) {
    throw new Error(
      'Google Drive is not connected for this account. Please connect your Google account in Settings -> Connected Accounts to allow Agent X to manage your files.'
    );
  }

  const email = tokenDoc.email ?? '';

  // Return existing token if still fresh
  if (tokenDoc.accessToken && !shouldRefreshAccessToken(tokenDoc.lastRefreshedAt)) {
    return { accessToken: tokenDoc.accessToken, email };
  }

  // Refresh token
  if (tokenDoc.refreshToken) {
    const { clientId, clientSecret } = resolveGoogleCredentials(db);
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth client credentials are not configured on the backend.');
    }

    try {
      const response = await axios.post<{
        access_token: string;
        expires_in: number;
        scope?: string;
        token_type: string;
      }>('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenDoc.refreshToken,
        grant_type: 'refresh_token',
      });

      const newAccessToken = response.data.access_token;
      const now = new Date().toISOString();

      await tokenRef.set(
        {
          provider: 'google',
          accessToken: newAccessToken,
          email,
          ...(response.data.scope ? { grantedScopes: response.data.scope } : {}),
          lastRefreshedAt: now,
        },
        { merge: true }
      );

      logger.info('[ConnectedDrive] Refreshed Google Drive access token', {
        userId,
        email,
        environment,
      });

      return { accessToken: newAccessToken, email };
    } catch (refreshErr) {
      logger.error('[ConnectedDrive] Failed to refresh Google OAuth token', {
        userId,
        error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
      });
      throw new Error(
        'Your Google connection has expired. Please reconnect your Google account in Settings -> Connected Accounts.',
        { cause: refreshErr }
      );
    }
  }

  if (tokenDoc.accessToken) {
    return { accessToken: tokenDoc.accessToken, email };
  }

  throw new Error(
    'Google Drive authorization is required. Please connect your Google account in Settings -> Connected Accounts.'
  );
}

/**
 * Create a new folder in Google Drive.
 */
export async function createDriveFolder(
  userId: string,
  folderName: string,
  parentFolderId?: string,
  environment?: 'staging' | 'production'
): Promise<GoogleDriveFolderResult> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);

  const requestBody: Record<string, unknown> = {
    name: folderName.trim(),
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId && parentFolderId.trim()) {
    requestBody['parents'] = [parentFolderId.trim()];
  }

  const response = await axios.post<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
  }>(`${GOOGLE_DRIVE_API_BASE}/files?fields=id,name,mimeType,webViewLink,parents`, requestBody, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  logger.info('[ConnectedDrive] Created folder in Google Drive', {
    userId,
    folderId: response.data.id,
    folderName: response.data.name,
  });

  return {
    success: true,
    id: response.data.id,
    name: response.data.name,
    mimeType: response.data.mimeType,
    webViewLink: response.data.webViewLink,
    parentFolderId,
  };
}

/**
 * Upload a file to Google Drive using multipart upload.
 */
export async function uploadDriveFile(
  userId: string,
  filename: string,
  contentBase64: string,
  mimeType = 'application/octet-stream',
  parentFolderId?: string,
  environment?: 'staging' | 'production'
): Promise<GoogleDriveUploadResult> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);

  return uploadBufferToDrive({
    accessToken,
    filename,
    buffer: Buffer.from(contentBase64, 'base64'),
    mimeType,
    parentFolderId,
    userId,
  });
}

/**
 * Upload an existing NXT1 file to Google Drive by reading its bytes directly
 * from Firebase Storage via a trusted storagePath, sourceUrl, or documentId.
 */
export async function uploadStoredDriveFile(
  userId: string,
  input: UploadStoredDriveFileInput,
  environment?: 'staging' | 'production'
): Promise<GoogleDriveUploadResult> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);
  const source = await resolveStoredDriveSource({
    userId,
    input,
    environment,
  });

  return uploadBufferToDrive({
    accessToken,
    filename: source.filename,
    buffer: source.buffer,
    mimeType: source.mimeType,
    parentFolderId: input.parentFolderId,
    userId,
  });
}

/**
 * Search/list files and folders in Google Drive.
 */
export async function searchDriveFiles(
  userId: string,
  query: string,
  pageSize = 20,
  parentFolderId?: string,
  environment?: 'staging' | 'production'
): Promise<GoogleDriveSearchResult> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);

  const queryParts: string[] = ['trashed = false'];

  const cleanQuery = query ? query.trim().replace(/'/g, "\\'") : '';
  if (cleanQuery) {
    queryParts.push(`(name contains '${cleanQuery}' or fullText contains '${cleanQuery}')`);
  }

  if (parentFolderId && parentFolderId.trim()) {
    queryParts.push(`'${parentFolderId.trim().replace(/'/g, "\\'")}' in parents`);
  }

  const response = await axios.get<{
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      webViewLink?: string;
      webContentLink?: string;
      createdTime?: string;
      modifiedTime?: string;
      parents?: string[];
    }>;
  }>(`${GOOGLE_DRIVE_API_BASE}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q: queryParts.join(' and '),
      pageSize: Math.min(Math.max(pageSize, 1), 100),
      fields:
        'files(id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents)',
      orderBy: 'modifiedTime desc',
    },
  });

  const files = response.data.files ?? [];

  return {
    success: true,
    count: files.length,
    files,
  };
}

/**
 * Read the content of a file from Google Drive.
 */
export async function getDriveFileContent(
  userId: string,
  fileId: string,
  environment?: 'staging' | 'production'
): Promise<GoogleDriveFileContentResult> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);

  // 1. Fetch file metadata
  const metaRes = await axios.get<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  }>(
    `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const meta = metaRes.data;

  // 2. Export Google Docs formats or download binary/text directly
  let content: string;

  if (meta.mimeType === 'application/vnd.google-apps.document') {
    const exportRes = await axios.get<string>(
      `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'text',
      }
    );
    content = exportRes.data;
  } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportRes = await axios.get<string>(
      `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'text',
      }
    );
    content = exportRes.data;
  } else {
    const downloadRes = await axios.get<ArrayBuffer>(
      `${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      }
    );

    const isTextMime =
      meta.mimeType.startsWith('text/') ||
      meta.mimeType.includes('json') ||
      meta.mimeType.includes('xml') ||
      meta.mimeType.includes('javascript');

    if (isTextMime) {
      content = Buffer.from(downloadRes.data).toString('utf-8');
    } else {
      content = Buffer.from(downloadRes.data).toString('base64');
    }
  }

  return {
    success: true,
    fileId: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    size: meta.size,
    webViewLink: meta.webViewLink,
    content,
  };
}

/**
 * Delete a file or folder from Google Drive.
 */
export async function deleteDriveFile(
  userId: string,
  fileId: string,
  environment?: 'staging' | 'production'
): Promise<{ success: true; fileId: string; deleted: true }> {
  const { accessToken } = await getValidGoogleDriveAccessToken(userId, environment);

  await axios.delete(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  logger.info('[ConnectedDrive] Deleted file from Google Drive', {
    userId,
    fileId,
  });

  return {
    success: true,
    fileId,
    deleted: true,
  };
}
