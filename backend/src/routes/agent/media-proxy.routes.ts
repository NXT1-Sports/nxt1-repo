import { Router, type Request, type Response } from 'express';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../utils/logger.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';

const router = Router();

function detectMultipartBoundary(buffer: Buffer): string | null {
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex <= 2) return null;

  const firstLine = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
  return firstLine.startsWith('--') ? firstLine : null;
}

export function tryExtractMultipartExportPayload(params: {
  readonly buffer: Buffer;
  readonly expectedMimeType: string;
}): Buffer | null {
  const boundaryLine = detectMultipartBoundary(params.buffer);
  if (!boundaryLine) return null;

  const expectedMimeType = params.expectedMimeType.trim().toLowerCase();
  if (!expectedMimeType) return null;

  const text = params.buffer.toString('latin1');
  const boundaryToken = boundaryLine.replace(/^--/, '');
  const parts = text.split(`--${boundaryToken}`);
  if (parts.length < 3) return null;

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, '');
    if (!part || part === '--' || /^--\r?\n?$/.test(part)) continue;

    const separator = part.indexOf('\r\n\r\n');
    const hasCrlfSeparator = separator >= 0;
    const fallbackSeparator = hasCrlfSeparator ? separator : part.indexOf('\n\n');
    if (fallbackSeparator < 0) continue;

    const headerBlock = part.slice(0, fallbackSeparator);
    const mimeMatch = headerBlock.match(/content-type:\s*([^\r\n;]+)/i);
    const partMimeType = mimeMatch?.[1]?.trim().toLowerCase() ?? '';
    if (!partMimeType) continue;

    const isExpectedPart =
      partMimeType === expectedMimeType ||
      (expectedMimeType.includes('spreadsheetml.sheet') &&
        partMimeType === 'application/octet-stream');
    if (!isExpectedPart) continue;

    const contentStart = fallbackSeparator + (hasCrlfSeparator ? 4 : 2);
    let content = part.slice(contentStart);
    content = content.replace(/\r?\n--$/, '');
    content = content.replace(/\r?\n$/, '');

    return Buffer.from(content, 'latin1');
  }

  return null;
}

function buildContentDisposition(
  fileName: string,
  mode: 'attachment' | 'inline' = 'attachment'
): string {
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${mode}; filename="${fileName}"; filename*=UTF-8''${encoded}`;
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
    const {
      exp,
      sig,
      path: storagePathRaw,
      mime: mimeTypeRaw,
      disposition: dispositionRaw,
    } = req.query;
    const storagePath = typeof storagePathRaw === 'string' ? storagePathRaw.trim() : '';
    const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw.trim() : '';
    const disposition = dispositionRaw === 'inline' ? 'inline' : 'attachment';

    if (!storagePath || !mimeType) {
      res.status(400).json({ success: false, error: 'Missing export download parameters' });
      return;
    }

    if (!/^Users\/.+\/threads\/.+\/exports\/.+/i.test(storagePath)) {
      res.status(403).json({ success: false, error: 'Invalid export path' });
      return;
    }

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
    res.setHeader('Content-Disposition', buildContentDisposition(fileName, disposition));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

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
  } catch (error) {
    logger.error('Agent media proxy export download failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to serve export' });
    }
  }
});

export default router;
