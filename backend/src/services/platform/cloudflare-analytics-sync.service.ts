import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  getCloudflareAnalyticsService,
  type CloudflareAnalyticsService,
} from './cloudflare-analytics.service.js';
import {
  getAnalyticsLoggerService,
  type AnalyticsLoggerService,
} from '../core/analytics-logger.service.js';
import { getCloudflareHighlightPostId } from '../../routes/core/upload/shared.js';
import { logger } from '../../utils/logger.js';

type SyncSubject = {
  readonly subjectId: string;
  readonly subjectType: 'user' | 'team';
};

type ResolvedPost = {
  readonly ref: FirebaseFirestore.DocumentReference;
  readonly data: Record<string, unknown>;
};

export type CloudflareAnalyticsSyncResult = {
  readonly processed: number;
  readonly tracked: number;
  readonly errors: number;
};

export class CloudflareAnalyticsSyncService {
  constructor(
    private readonly cloudflareAnalytics: CloudflareAnalyticsService = getCloudflareAnalyticsService(),
    private readonly analyticsLogger: AnalyticsLoggerService = getAnalyticsLoggerService(),
    private readonly db: Firestore = getFirestore()
  ) {}

  async syncLast24Hours(now: Date = new Date()): Promise<CloudflareAnalyticsSyncResult> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const records = await this.cloudflareAnalytics.fetchVideoAnalyticsWindow(since, now);

    let processed = 0;
    let tracked = 0;
    let errors = 0;

    for (const record of records.values()) {
      processed += 1;

      try {
        const post = await this.resolvePost(record.videoUid);
        if (!post) {
          logger.warn('Cloudflare analytics sync skipped video with no matching Post doc', {
            videoUid: record.videoUid,
          });
          continue;
        }

        const subject = this.resolveSubject(post.data);
        if (!subject) {
          logger.warn(
            'Cloudflare analytics sync skipped video with no routable team/user subject',
            {
              videoUid: record.videoUid,
              postId: post.ref.id,
            }
          );
          continue;
        }

        const watchedMinutes =
          record.deliveryMinutesViewed > 0
            ? record.deliveryMinutesViewed
            : record.playbackMinutesViewed;

        if (record.playCount > 0) {
          await this.analyticsLogger.safeTrack({
            subjectId: subject.subjectId,
            subjectType: subject.subjectType,
            domain: 'engagement',
            eventType: 'video_played',
            source: 'user',
            actorUserId: null,
            value: record.playCount,
            tags: ['cloudflare', 'video'],
            payload: {
              videoUid: record.videoUid,
              syncWindow: '24h',
              byCountry: record.byCountry,
              playbackMinutesViewed: record.playbackMinutesViewed,
              deliveryMinutesViewed: record.deliveryMinutesViewed,
              syncedFrom: 'cloudflare',
            },
            metadata: {},
          });
          tracked += 1;
        }

        if (watchedMinutes > 0) {
          await this.analyticsLogger.safeTrack({
            subjectId: subject.subjectId,
            subjectType: subject.subjectType,
            domain: 'engagement',
            eventType: 'video_watched',
            source: 'user',
            actorUserId: null,
            value: watchedMinutes,
            tags: ['cloudflare', 'video'],
            payload: {
              videoUid: record.videoUid,
              syncWindow: '24h',
              byCountry: record.byCountry,
              playCount: record.playCount,
              playbackMinutesViewed: record.playbackMinutesViewed,
              deliveryMinutesViewed: record.deliveryMinutesViewed,
              syncedFrom: 'cloudflare',
            },
            metadata: {},
          });
          tracked += 1;
        }

        await post.ref.update({
          lastCfSyncAt: Timestamp.now(),
        });
      } catch (error) {
        errors += 1;
        logger.error('Cloudflare analytics sync failed for video', {
          videoUid: record.videoUid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Cloudflare analytics sync completed', {
      since: since.toISOString(),
      until: now.toISOString(),
      processed,
      tracked,
      errors,
    });

    return { processed, tracked, errors };
  }

  private async resolvePost(videoUid: string): Promise<ResolvedPost | null> {
    const postId = getCloudflareHighlightPostId(videoUid);
    const postRef = this.db.collection('Posts').doc(postId);
    const postSnap = await postRef.get();

    if (postSnap.exists) {
      return {
        ref: postRef,
        data: (postSnap.data() as Record<string, unknown>) ?? {},
      };
    }

    const querySnap = await this.db
      .collection('Posts')
      .where('cloudflareVideoId', '==', videoUid)
      .limit(1)
      .get();

    if (querySnap.empty) {
      return null;
    }

    const doc = querySnap.docs[0];
    return {
      ref: doc.ref,
      data: (doc.data() as Record<string, unknown>) ?? {},
    };
  }

  private resolveSubject(postData: Record<string, unknown>): SyncSubject | null {
    const teamId = typeof postData['teamId'] === 'string' ? postData['teamId'].trim() : '';
    if (teamId.length > 0) {
      return { subjectId: teamId, subjectType: 'team' };
    }

    const userId = typeof postData['userId'] === 'string' ? postData['userId'].trim() : '';
    if (userId.length > 0) {
      return { subjectId: userId, subjectType: 'user' };
    }

    return null;
  }
}

let cloudflareAnalyticsSyncService: CloudflareAnalyticsSyncService | null = null;

export function getCloudflareAnalyticsSyncService(): CloudflareAnalyticsSyncService {
  cloudflareAnalyticsSyncService ??= new CloudflareAnalyticsSyncService();
  return cloudflareAnalyticsSyncService;
}
