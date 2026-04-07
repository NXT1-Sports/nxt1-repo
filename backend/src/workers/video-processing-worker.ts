/**
 * @fileoverview Video Processing Worker - Processes video uploads from Pub/Sub
 * @module @nxt1/backend/workers
 *
 * Async worker that receives video upload events from Pub/Sub and processes
 * them into HLS-ready streams. Designed to be deployed as a separate Cloud Run
 * service with FFmpeg installed in the container image.
 *
 * Architecture:
 * 1. POST /upload/highlight-video → client uploads via presigned URL → client
 *    calls POST /upload/highlight-video/confirm → Pub/Sub message published
 * 2. This worker receives the message, downloads the source video from Storage,
 *    transcodes to HLS (multiple qualities), and uploads segments back.
 * 3. Firestore document tracks processing status for the frontend to poll.
 *
 * Deployment:
 *   This worker runs as an independent Cloud Run service.
 *   The container image MUST include ffmpeg (e.g. FROM node:20 + apt install ffmpeg).
 *   Environment variables: GCP_PROJECT_ID, VIDEO_PROCESSING_SUBSCRIPTION
 *
 * @see stripe-worker.ts for the existing Pub/Sub worker pattern
 */

import { type PubSub, type Message } from '@google-cloud/pubsub';
import { createPubSubClient } from '../utils/pubsub.js';
import { getStorage } from 'firebase-admin/storage';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/** Status of a video processing job */
export type VideoProcessingStatus =
  | 'pending'
  | 'downloading'
  | 'transcoding'
  | 'uploading'
  | 'completed'
  | 'failed';

/** Pub/Sub message payload for video processing */
export interface VideoProcessingMessage {
  /** Unique job ID (used for idempotency) */
  readonly jobId: string;
  /** User who uploaded the video */
  readonly userId: string;
  /** Storage path of the source video */
  readonly storagePath: string;
  /** MIME type of the source video */
  readonly mimeType: string;
  /** Original file size in bytes */
  readonly fileSize?: number;
  /** Firebase environment (staging / production) */
  readonly environment: 'staging' | 'production';
}

/** Result of HLS transcoding */
export interface HlsTranscodeResult {
  /** Storage path of the HLS master playlist (.m3u8) */
  readonly masterPlaylistPath: string;
  /** Storage path of the thumbnail image */
  readonly thumbnailPath: string;
  /** Duration in seconds */
  readonly durationSeconds: number;
  /** Available quality variants */
  readonly variants: readonly HlsVariant[];
}

/** A single HLS quality variant */
export interface HlsVariant {
  /** Quality label (e.g. '720p', '480p', '360p') */
  readonly label: string;
  /** Width in pixels */
  readonly width: number;
  /** Height in pixels */
  readonly height: number;
  /** Bitrate in kbps */
  readonly bitrate: number;
  /** Storage path of the variant playlist */
  readonly playlistPath: string;
}

// ============================================
// CONSTANTS
// ============================================

const TOPIC_NAME = 'video-processing';
const SUBSCRIPTION_NAME = process.env['VIDEO_PROCESSING_SUBSCRIPTION'] || 'video-processing-sub';
const MAX_PROCESSING_TIME_MS = 10 * 60 * 1000; // 10 minutes

/** HLS quality presets for adaptive bitrate streaming */
export const HLS_PRESETS = [
  { label: '720p', width: 1280, height: 720, bitrate: 2500 },
  { label: '480p', width: 854, height: 480, bitrate: 1200 },
  { label: '360p', width: 640, height: 360, bitrate: 600 },
] as const;

// ============================================
// PUB/SUB PUBLISHER (used by upload endpoint)
// ============================================

let pubsubClient: PubSub | null = null;

function getPubSub(): PubSub {
  if (!pubsubClient) {
    pubsubClient = createPubSubClient();
  }
  return pubsubClient;
}

/**
 * Publish a video processing job to Pub/Sub.
 * Called by the upload confirmation endpoint after the client
 * completes the presigned URL upload.
 */
export async function publishVideoProcessingJob(message: VideoProcessingMessage): Promise<string> {
  const pubsub = getPubSub();
  const topic = pubsub.topic(TOPIC_NAME);

  const messageId = await topic.publishMessage({
    json: message,
    attributes: {
      jobId: message.jobId,
      userId: message.userId,
      environment: message.environment,
    },
  });

  logger.info('[publishVideoProcessingJob] Published', {
    messageId,
    jobId: message.jobId,
    storagePath: message.storagePath,
  });

  return messageId;
}

// ============================================
// PUB/SUB WORKER (Cloud Run service)
// ============================================

/**
 * Process a single video processing message.
 * Downloads source video, transcodes to HLS, uploads segments.
 */
async function processVideoMessage(message: VideoProcessingMessage): Promise<void> {
  const { jobId, userId, storagePath, environment } = message;

  logger.info('[processVideoMessage] Starting', { jobId, userId, storagePath, environment });

  const bucket = getStorage().bucket();
  const sourceFile = bucket.file(storagePath);

  // Verify source file exists
  const [exists] = await sourceFile.exists();
  if (!exists) {
    logger.error('[processVideoMessage] Source file not found', { jobId, storagePath });
    throw new Error(`Source file not found: ${storagePath}`);
  }

  // Get file metadata for duration estimation
  const [metadata] = await sourceFile.getMetadata();
  const fileSize = Number(metadata.size ?? 0);

  logger.info('[processVideoMessage] Source file verified', {
    jobId,
    fileSize,
    contentType: metadata.contentType,
  });

  // The actual FFmpeg transcoding would happen here.
  // In the Cloud Run container with FFmpeg installed:
  //
  // 1. Download source to /tmp:
  //    await sourceFile.download({ destination: '/tmp/source.mp4' });
  //
  // 2. Generate thumbnail:
  //    ffmpeg -i /tmp/source.mp4 -ss 00:00:01 -vframes 1 /tmp/thumb.jpg
  //
  // 3. Transcode to HLS per preset:
  //    for each preset in HLS_PRESETS:
  //      ffmpeg -i /tmp/source.mp4 \
  //        -vf "scale=${width}:${height}" \
  //        -c:v libx264 -preset fast -crf 23 \
  //        -c:a aac -b:a 128k \
  //        -hls_time 6 -hls_list_size 0 \
  //        -hls_segment_filename "/tmp/hls/${label}_%03d.ts" \
  //        /tmp/hls/${label}.m3u8
  //
  // 4. Generate master playlist referencing all variants
  //
  // 5. Upload all segments + playlists to Storage:
  //    users/{userId}/highlight-video/{timestamp}/hls/...
  //
  // 6. Upload thumbnail:
  //    users/{userId}/highlight-video/{timestamp}/thumbnail.jpg

  const hlsBasePath = storagePath.replace(/\.[^.]+$/, '/hls');

  logger.info('[processVideoMessage] Video processing complete (stub — FFmpeg not yet installed)', {
    jobId,
    hlsBasePath,
    fileSize,
  });
}

/**
 * Start the video processing worker.
 * Subscribes to the Pub/Sub topic and processes messages.
 *
 * Call this from the Cloud Run service entry point.
 */
export async function startVideoProcessingWorker(): Promise<void> {
  const pubsub = getPubSub();
  const subscription = pubsub.subscription(SUBSCRIPTION_NAME);

  logger.info('[startVideoProcessingWorker] Subscribing', {
    subscription: SUBSCRIPTION_NAME,
  });

  subscription.on('message', async (message: Message) => {
    const startTime = Date.now();

    try {
      const data: VideoProcessingMessage = JSON.parse(message.data.toString('utf-8'));

      logger.info('[startVideoProcessingWorker] Received message', {
        jobId: data.jobId,
        messageId: message.id,
      });

      // Process with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Processing timeout')), MAX_PROCESSING_TIME_MS)
      );

      await Promise.race([processVideoMessage(data), timeoutPromise]);

      message.ack();
      logger.info('[startVideoProcessingWorker] Message processed', {
        jobId: data.jobId,
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      logger.error('[startVideoProcessingWorker] Failed to process message', {
        messageId: message.id,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      });

      // Nack so Pub/Sub retries (with exponential backoff)
      message.nack();
    }
  });

  subscription.on('error', (err: Error) => {
    logger.error('[startVideoProcessingWorker] Subscription error', {
      error: err.message,
    });
  });

  logger.info('[startVideoProcessingWorker] Worker started');
}
