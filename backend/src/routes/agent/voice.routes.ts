/**
 * @fileoverview Agent X voice dictation routes.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { aiRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const MAX_VOICE_AUDIO_BYTES = 8 * 1024 * 1024;
const OPENAI_TRANSCRIPTION_MODEL = 'gpt-transcribe';
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/mpga',
  'audio/m4a',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOICE_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error(`Voice audio type ${file.mimetype} is not supported`));
  },
});

function voiceUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('audio')(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'Voice recording is too large. Please keep dictation clips short.',
        code: 'VOICE_AUDIO_TOO_LARGE',
      });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({ success: false, error: err.message, code: 'INVALID_VOICE_AUDIO' });
      return;
    }

    next(err);
  });
}

function getAuthUser(req: Request): { uid: string } | null {
  const user = (req as Request & { user?: { uid?: string } }).user;
  return user?.uid ? { uid: user.uid } : null;
}

function resolveAudioFileName(file: Express.Multer.File): string {
  const original = file.originalname?.trim();
  if (original) return original;

  switch (file.mimetype) {
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'voice.mp3';
    case 'audio/mp4':
    case 'audio/m4a':
    case 'video/mp4':
      return 'voice.m4a';
    case 'audio/wav':
      return 'voice.wav';
    case 'audio/webm':
    case 'video/webm':
    default:
      return 'voice.webm';
  }
}

async function transcribeWithOpenAi(file: Express.Multer.File): Promise<unknown> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const formData = new FormData();
  const audioBytes = Uint8Array.from(file.buffer);
  formData.set('model', OPENAI_TRANSCRIPTION_MODEL);
  formData.set('file', new Blob([audioBytes], { type: file.mimetype }), resolveAudioFileName(file));

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      typeof body?.['error'] === 'object' && body['error'] !== null
        ? String(
            (body['error'] as Record<string, unknown>)['message'] ?? 'Voice transcription failed'
          )
        : 'Voice transcription failed';
    throw new Error(message);
  }

  return body;
}

router.post(
  '/voice/transcribe',
  appGuard,
  aiRateLimit,
  voiceUpload,
  async (req: Request, res: Response) => {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file || file.size <= 0) {
      res.status(400).json({ success: false, error: 'Voice audio file is required' });
      return;
    }

    try {
      const result = (await transcribeWithOpenAi(file)) as Record<string, unknown> | null;
      const text = typeof result?.['text'] === 'string' ? result['text'].trim() : '';

      if (!text) {
        res.status(422).json({ success: false, error: 'No speech was detected in the recording' });
        return;
      }

      res.json({
        success: true,
        data: {
          text,
          provider: 'openai',
          model: OPENAI_TRANSCRIPTION_MODEL,
          languages: Array.isArray(result?.['languages']) ? result?.['languages'] : [],
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice transcription failed';
      logger.warn('Agent X voice transcription failed', {
        userId: auth.uid,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        error: message,
      });
      res.status(message.includes('OPENAI_API_KEY') ? 503 : 502).json({
        success: false,
        error: message.includes('OPENAI_API_KEY')
          ? 'Voice transcription is not configured'
          : 'Voice transcription failed. Please try again.',
      });
    }
  }
);

export default router;
