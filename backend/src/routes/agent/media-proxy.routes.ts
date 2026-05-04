import { Router, type Request, type Response } from 'express';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';

const router = Router();

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
      res.status(400).json({ success: false, error: 'content-type does not match provisioned upload' });
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

export default router;