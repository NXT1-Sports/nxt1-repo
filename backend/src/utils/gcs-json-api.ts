/**
 * @fileoverview Minimal Google Cloud Storage JSON API helpers.
 *
 * The Firebase/@google-cloud Storage SDK path currently resolves through a
 * gaxios version that can serialize OAuth URLSearchParams incorrectly in this
 * runtime. These helpers use native fetch and an explicit service-account JWT
 * flow for high-impact backend write/maintenance paths.
 */

import jwt from 'jsonwebtoken';
import crypto, { createSign } from 'node:crypto';

interface FirebaseServiceAccountCredentials {
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly projectId: string;
}

export interface GcsObjectMetadata {
  readonly name: string;
  readonly bucket?: string;
  readonly size?: string;
  readonly timeCreated?: string;
  readonly contentType?: string;
  readonly metadata?: Record<string, string>;
  readonly [key: string]: unknown;
}

export interface GcsListObjectsResult {
  readonly items: readonly GcsObjectMetadata[];
  readonly nextPageToken?: string;
}

export interface GcsUploadObjectOptions {
  readonly contentType: string;
  readonly cacheControl?: string;
  readonly contentDisposition?: string;
  readonly metadata?: Record<string, string>;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STORAGE_SCOPE_FULL_CONTROL = 'https://www.googleapis.com/auth/devstorage.full_control';
const STORAGE_SCOPE_READ_ONLY = 'https://www.googleapis.com/auth/devstorage.read_only';

function resolveFirebaseServiceAccountCredentials(): FirebaseServiceAccountCredentials {
  const projectId = process.env['FIREBASE_PROJECT_ID'] ?? process.env['GOOGLE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'] ?? process.env['GOOGLE_CLIENT_EMAIL'];
  const privateKey = (
    process.env['FIREBASE_PRIVATE_KEY'] ?? process.env['GOOGLE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase service account credentials are not configured');
  }

  return { projectId, clientEmail, privateKey };
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text.slice(0, 1_000);
}

const GOOGLE_TOKEN_MAX_ATTEMPTS = 3;
const GOOGLE_TOKEN_RETRY_DELAYS_MS = [500, 1_500] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableTokenError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('premature close') ||
    message.includes('invalid response body') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('enotfound') ||
    message.includes('tls')
  );
}

export async function fetchGoogleAccessToken(scope: string): Promise<string> {
  const credentials = resolveFirebaseServiceAccountCredentials();

  let lastError: unknown;
  for (let attempt = 1; attempt <= GOOGLE_TOKEN_MAX_ATTEMPTS; attempt += 1) {
    try {
      const issuedAt = Math.floor(Date.now() / 1_000);
      const assertion = jwt.sign(
        {
          iss: credentials.clientEmail,
          scope,
          aud: TOKEN_ENDPOINT,
          exp: issuedAt + 3_600,
          iat: issuedAt,
        },
        credentials.privateKey,
        { algorithm: 'RS256' }
      );

      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });

      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          'user-agent': 'nxt1-backend/1.0',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(30_000),
      });

      const responseText = await response.text();
      let responseBody: Record<string, unknown>;
      try {
        responseBody = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Google token fetch failed: Invalid JSON response - ${responseText.substring(0, 200)}`
        );
      }

      if (!response.ok || typeof responseBody['access_token'] !== 'string') {
        const error =
          typeof responseBody['error'] === 'string'
            ? responseBody['error']
            : `HTTP ${response.status}`;
        const description =
          typeof responseBody['error_description'] === 'string'
            ? `: ${responseBody['error_description']}`
            : '';
        throw new Error(`Google token fetch failed: ${error}${description}`);
      }

      return responseBody['access_token'];
    } catch (error) {
      lastError = error;
      const retryable = isRetryableTokenError(error);
      const isFinalAttempt = attempt >= GOOGLE_TOKEN_MAX_ATTEMPTS;

      if (isFinalAttempt || !retryable) {
        throw error;
      }

      const delayMs = GOOGLE_TOKEN_RETRY_DELAYS_MS[attempt - 1] ?? 2_000;
      console.warn(
        `[GcsJsonApi] Retrying Google token fetch after ${delayMs}ms (attempt ${attempt}/${GOOGLE_TOKEN_MAX_ATTEMPTS})`,
        { error: error instanceof Error ? error.message : String(error) }
      );
      await delay(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function uploadGcsObject(
  bucketName: string,
  objectName: string,
  buffer: Buffer,
  options: GcsUploadObjectOptions
): Promise<void> {
  const accessToken = await fetchGoogleAccessToken(STORAGE_SCOPE_FULL_CONTROL);
  const boundary = `nxt1-gcs-${crypto.randomUUID()}`;
  const metadata = {
    name: objectName,
    contentType: options.contentType,
    ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
    ...(options.contentDisposition ? { contentDisposition: options.contentDisposition } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${options.contentType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o?uploadType=multipart&name=${encodeURIComponent(objectName)}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/related; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Storage upload failed: HTTP ${response.status} ${await readErrorBody(response)}`
    );
  }
}

export async function gcsObjectExists(bucketName: string, objectName: string): Promise<boolean> {
  const accessToken = await fetchGoogleAccessToken(STORAGE_SCOPE_READ_ONLY);
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(objectName)}`;
  const response = await fetch(metadataUrl, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Storage metadata fetch failed: HTTP ${response.status} ${await readErrorBody(response)}`
    );
  }
  return true;
}

export async function listGcsObjects(params: {
  readonly bucketName: string;
  readonly prefix?: string;
  readonly maxResults?: number;
  readonly pageToken?: string;
}): Promise<GcsListObjectsResult> {
  const accessToken = await fetchGoogleAccessToken(STORAGE_SCOPE_READ_ONLY);
  const url = new URL(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(params.bucketName)}/o`
  );
  if (params.prefix) url.searchParams.set('prefix', params.prefix);
  if (params.maxResults) url.searchParams.set('maxResults', String(params.maxResults));
  if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);

  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    items?: GcsObjectMetadata[];
    nextPageToken?: string;
  };

  if (!response.ok) {
    throw new Error(
      `Storage list failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 1000)}`
    );
  }

  return {
    items: body.items ?? [],
    nextPageToken: body.nextPageToken,
  };
}

export async function patchGcsObjectMetadata(params: {
  readonly bucketName: string;
  readonly objectName: string;
  readonly metadata: Record<string, string>;
}): Promise<void> {
  const accessToken = await fetchGoogleAccessToken(STORAGE_SCOPE_FULL_CONTROL);
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    params.bucketName
  )}/o/${encodeURIComponent(params.objectName)}`;
  const response = await fetch(metadataUrl, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ metadata: params.metadata }),
  });

  if (!response.ok) {
    throw new Error(
      `Storage metadata patch failed: HTTP ${response.status} ${await readErrorBody(response)}`
    );
  }
}

export async function deleteGcsObject(
  bucketName: string,
  objectName: string,
  options: { readonly ignoreNotFound?: boolean } = {}
): Promise<void> {
  const accessToken = await fetchGoogleAccessToken(STORAGE_SCOPE_FULL_CONTROL);
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(objectName)}`;
  const response = await fetch(metadataUrl, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404 && options.ignoreNotFound) return;
  if (!response.ok && response.status !== 204) {
    throw new Error(
      `Storage delete failed: HTTP ${response.status} ${await readErrorBody(response)}`
    );
  }
}

export function createV4SignedReadUrl(params: {
  readonly bucketName: string;
  readonly objectName: string;
  readonly expiresAtMs: number;
}): string {
  const credentials = resolveFirebaseServiceAccountCredentials();
  const now = new Date();
  const requestTimestamp =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z';
  const datestamp = requestTimestamp.slice(0, 8);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const expiresSeconds = Math.max(1, Math.floor((params.expiresAtMs - Date.now()) / 1_000));
  const encodedObject = params.objectName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const canonicalUri = `/${encodeURIComponent(params.bucketName)}/${encodedObject}`;
  const queryParams = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': `${credentials.clientEmail}/${credentialScope}`,
    'X-Goog-Date': requestTimestamp,
    'X-Goog-Expires': String(expiresSeconds),
    'X-Goog-SignedHeaders': 'host',
  });
  queryParams.sort();
  const canonicalQuery = queryParams.toString();
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    'host:storage.googleapis.com\n',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    requestTimestamp,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');
  const signature = createSign('RSA-SHA256')
    .update(stringToSign)
    .sign(credentials.privateKey, 'hex');

  return `https://storage.googleapis.com${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}
