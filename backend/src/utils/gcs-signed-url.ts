/**
 * @fileoverview GCS signed URL helper with timeout protection.
 *
 * The Firebase Admin SDK's `getSignedUrl()` delegates to the IAM Credentials
 * API on GCP, which can occasionally hang indefinitely. Every call site must
 * race against a short deadline so callers receive a fast, actionable error
 * rather than waiting for the global 30-second request timeout.
 */

const SIGNED_URL_TIMEOUT_MS = 8_000;

type GetSignedUrlFn = () => Promise<[string]>;

/**
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
