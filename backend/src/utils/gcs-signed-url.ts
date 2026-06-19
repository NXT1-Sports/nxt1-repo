/**
 * @fileoverview GCS signed URL helper with local signing (no HTTP calls).
 *
 * Signs URLs locally using the service account private key instead of
 * delegating to IAM Credentials API. This avoids network calls that can
 * fail with "Premature close" errors during high concurrency.
 */

import * as crypto from 'crypto';

const SIGNED_URL_TIMEOUT_MS = 8_000;
const DEFAULT_EXPIRES_IN_SECONDS = 2 * 60 * 60; // 2 hours

interface SignUrlOptions {
  bucketName: string;
  fileName: string;
  expiresInSeconds?: number;
}

/**
 * Creates a signed URL for Google Cloud Storage using local signing.
 * No HTTP calls to IAM or OAuth APIs - uses the service account private key directly.
 */
export function createSignedUrlLocally(options: SignUrlOptions): string | null {
  const { bucketName, fileName, expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS } = options;

  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'] ?? process.env['GOOGLE_CLIENT_EMAIL'];
  const privateKeyPem = (
    process.env['FIREBASE_PRIVATE_KEY'] ?? process.env['GOOGLE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKeyPem) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expires = now + expiresInSeconds;

  // Construct the string to sign
  const stringToSign = ['GET', '', '', expires, `/${bucketName}/${fileName}`].join('\n');

  try {
    // Sign with RSA-SHA256
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(stringToSign);
    const signature = sign.sign(privateKeyPem, 'base64');

    // URL encode the signature
    const encodedSignature = encodeURIComponent(signature);

    // Construct the signed URL
    const signedUrl = `https://storage.googleapis.com/${bucketName}/${fileName}?GoogleAccessId=${clientEmail}&Expires=${expires}&Signature=${encodedSignature}`;

    return signedUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[GCSSignedUrl] Failed to sign URL locally', { error: errorMessage });
    return null;
  }
}

type GetSignedUrlFn = () => Promise<[string]>;

/**
 * @deprecated Use createSignedUrlLocally instead to avoid IAM API calls.
 *
 * Calls `getSignedUrlFn` and rejects after `SIGNED_URL_TIMEOUT_MS` if the
 * IAM Credentials API hangs.
 *
 * @throws Error with message `'GCS signed URL generation timed out after 8s'`
 */
export async function getSignedUrlWithTimeout(getSignedUrlFn: GetSignedUrlFn): Promise<[string]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('GCS signed URL generation timed out after 8s')),
      SIGNED_URL_TIMEOUT_MS
    )
  );
  return Promise.race([getSignedUrlFn(), timeout]);
}
