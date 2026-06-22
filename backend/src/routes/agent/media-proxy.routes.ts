import { Router, type Request, type Response } from 'express';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../utils/logger.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';

const router = Router();

function buildAttachmentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`;
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
    const { exp, sig, path: storagePathRaw, mime: mimeTypeRaw } = req.query;
    const storagePath = typeof storagePathRaw === 'string' ? storagePathRaw.trim() : '';
    const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw.trim() : '';

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
    res.setHeader('Content-Disposition', buildAttachmentDisposition(fileName));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    const readStream = file.createReadStream();
    await new Promise<void>((resolve, reject) => {
      readStream.on('error', reject);
      res.on('close', resolve);
      readStream.on('end', resolve);
      readStream.pipe(res);
    });
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
