import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../utils/logger.js';
import {
  buildAttachmentContentDisposition,
  tryExtractMultipartExportPayload,
} from '../../utils/export-multipart-payload.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';

export { tryExtractMultipartExportPayload };

const router = Router();

function isInlineSafeMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return (
    normalized === 'application/pdf' ||
    (normalized.startsWith('image/') && normalized !== 'image/svg+xml') ||
    normalized.startsWith('video/') ||
    normalized.startsWith('audio/')
  );
}

function normalizeExportRequestFileName(params: {
  readonly requestPathFileName: string;
  readonly storagePath: string;
}): string {
  const requestPathFileName = params.requestPathFileName.trim();
  if (requestPathFileName && !requestPathFileName.includes('/')) {
    return requestPathFileName;
  }

  const storageBaseName = path.posix.basename(params.storagePath.trim());
  if (storageBaseName) {
    return storageBaseName;
  }

  const requestBaseName = path.posix.basename(requestPathFileName);
  return requestBaseName || 'export';
}

async function serveSignedExportDownload(req: Request, res: Response, requestPathFileName: string) {
  const {
    exp,
    sig,
    path: storagePathRaw,
    mime: mimeTypeRaw,
    disposition: dispositionRaw,
  } = req.query;
  const storagePath = typeof storagePathRaw === 'string' ? storagePathRaw.trim() : '';
  const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw.trim() : '';
  // `disposition` is not covered by the signature, so only passive types may render inline.
  // Inline HTML/SVG would execute agent-written markup on the API origin.
  const disposition =
    dispositionRaw === 'inline' && isInlineSafeMimeType(mimeType) ? 'inline' : 'attachment';

  if (!storagePath || !mimeType) {
    res.status(400).json({ success: false, error: 'Missing export download parameters' });
    return;
  }

  if (!/^Users\/.+\/threads\/.+\/exports\/.+/i.test(storagePath)) {
    res.status(403).json({ success: false, error: 'Invalid export path' });
    return;
  }

  const fileName = normalizeExportRequestFileName({
    requestPathFileName,
    storagePath,
  });

  if (
    !AgentEphemeralStateService.validateSignedExportReadRequest({
      storagePath,
      fileName,
      mimeType,
      expRaw: exp,
      sigRaw: sig,
    })
  ) {
    res.status(403).json({ success: false, error: 'Invalid or expired export signature' });
    return;
  }

  const bucket = req.firebase?.storage?.bucket() ?? getStorage().bucket();
  const file = bucket.file(storagePath) as {
    exists: () => Promise<[boolean]>;
    createReadStream: () => NodeJS.ReadableStream;
  };

  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ success: false, error: 'Export not found' });
    return;
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', buildAttachmentContentDisposition(fileName, disposition));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  // Helmet's global middleware sets `X-Frame-Options: SAMEORIGIN` and
  // `Cross-Origin-Resource-Policy: same-origin` on every response, which silently blocks
  // the Files panel's <iframe> preview whenever the web app and API are served from
  // different origins (local dev: 4200 vs 3000; production: separate app/API domains).
  // This route already gates access with an HMAC signature, expiry, and a strict
  // export-path pattern, so it's safe to relax framing only for the explicit inline-view
  // request the frontend makes to render the PDF. Downloads (disposition=attachment)
  // keep the default protective headers.
  if (disposition === 'inline') {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  const readStream = file.createReadStream();
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    readStream.on('error', reject);
    readStream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    readStream.on('end', resolve);
  });

  const rawBuffer = Buffer.concat(chunks);
  const payload =
    tryExtractMultipartExportPayload({
      buffer: rawBuffer,
      expectedMimeType: mimeType,
    }) ?? rawBuffer;

  res.setHeader('Content-Length', String(payload.length));
  res.end(payload);
}

router.put('/media-proxy/upload/:uploadId', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params as { uploadId: string };
    const record = await AgentEphemeralStateService.getUploadRecord(uploadId);

    if (!record) {
      res.status(404).json({ success: false, error: 'Upload provision not found' });
      return;
    }

    if (record.ready) {
      res.status(409).json({ success: false, error: 'Upload has already completed' });
      return;
    }

    const contentType = req.get('content-type')?.trim() ?? '';
    if (!contentType.startsWith('video/')) {
      res.status(400).json({ success: false, error: 'content-type must be video/*' });
      return;
    }

    if (!contentType.startsWith(record.mimeType)) {
      res
        .status(400)
        .json({ success: false, error: 'content-type does not match provisioned upload' });
      return;
    }

    await AgentEphemeralStateService.writeRequestBodyToProvisionedUpload(
      uploadId,
      req,
      AGENT_X_MAX_VIDEO_FILE_SIZE
    );

    logger.info('Agent media proxy upload completed', {
      uploadId,
      mimeType: record.mimeType,
      declaredSizeBytes: record.declaredSizeBytes,
    });

    res.status(200).json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /maximum video size limit/i.test(message) ? 400 : 500;

    logger.error('Agent media proxy PUT upload failed', {
      error: message,
    });
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/media-proxy/temp/:uploadId/:fileName', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params as { uploadId: string; fileName: string };
    const { exp, sig } = req.query;

    if (!AgentEphemeralStateService.validateSignedReadRequest(uploadId, exp, sig)) {
      res.status(403).json({ success: false, error: 'Invalid or expired media signature' });
      return;
    }

    const streamed = await AgentEphemeralStateService.streamUploadToResponse(uploadId, res);
    if (!streamed) {
      res.status(404).json({ success: false, error: 'Media not found or not ready' });
    }
  } catch (error) {
    logger.error('Agent media proxy GET failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to serve media' });
    }
  }
});

router.get('/media-proxy/export/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params as { fileName: string };
    await serveSignedExportDownload(req, res, fileName);
  } catch (error) {
    logger.error('Agent media proxy export download failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to serve export' });
    }
  }
});

router.get(/^\/media-proxy\/export\/(.+)$/u, async (req: Request, res: Response) => {
  try {
    const requestPathFileName =
      typeof req.params[0] === 'string' ? req.params[0] : String(req.params[0] ?? '');
    await serveSignedExportDownload(req, res, requestPathFileName);
  } catch (error) {
    logger.error('Agent media proxy legacy export download failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to serve export' });
    }
  }
});

export default router;
