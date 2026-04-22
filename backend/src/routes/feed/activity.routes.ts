/**
 * @fileoverview Activity Routes
 * @module @nxt1/backend/routes/activity
 *
 * Document-based activity/notifications feature routes.
 * Stores per-user notifications in Firestore: users/{uid}/activity/{docId}
 * Matches ACTIVITY_API_ENDPOINTS from @nxt1/core/activity/constants.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import {
  MarkActivityReadDto,
  MarkAllActivityReadDto,
  ArchiveActivityDto,
  RestoreActivityDto,
} from '../../dtos/social.dto.js';
import { logger } from '../../utils/logger.js';
import {
  ACTIVITY_DEFAULT_TAB,
  ACTIVITY_TABS,
  type ActivityPriority,
  type ActivityTabId,
  type ActivityType,
} from '@nxt1/core';

const router: ExpressRouter = Router();

// ============================================
// CONSTANTS
// ============================================

const ACTIVITY_COLLECTION = 'activity';
const ACTIVITY_STATS_COLLECTION = 'stats';
const ACTIVITY_BADGES_DOC_ID = 'activity_badges';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const VALID_TABS: readonly ActivityTabId[] = ACTIVITY_TABS.map((tab) => tab.id);
const VALID_SORT_FIELDS = ['timestamp', 'priority'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const VALID_ACTIVITY_TYPES = [
  'like',
  'mention',
  'announcement',
  'milestone',
  'reminder',
  'system',
  'update',
  'agent_task',
] as const;

type ActivitySortField = (typeof VALID_SORT_FIELDS)[number];
type ActivitySortOrder = (typeof VALID_SORT_ORDERS)[number];

interface ActivityBadgeStatsDocument {
  readonly badges?: Partial<Record<ActivityTabId, number>>;
  readonly totalUnread?: number;
}

// ============================================
// HELPERS
// ============================================

function getUserActivityCollection(db: FirebaseFirestore.Firestore, uid: string) {
  return db.collection('Users').doc(uid).collection(ACTIVITY_COLLECTION);
}

function getUserActivityBadgeDoc(db: FirebaseFirestore.Firestore, uid: string) {
  return db
    .collection('Users')
    .doc(uid)
    .collection(ACTIVITY_STATS_COLLECTION)
    .doc(ACTIVITY_BADGES_DOC_ID);
}

function clampPageSize(value: unknown): number {
  const num = Number(value) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(num, 1), MAX_PAGE_SIZE);
}

function parseActivityTab(value: unknown): ActivityTabId | null {
  if (typeof value !== 'string') return null;
  return VALID_TABS.includes(value as ActivityTabId) ? (value as ActivityTabId) : null;
}

function parseSortField(value: unknown): ActivitySortField {
  return typeof value === 'string' && VALID_SORT_FIELDS.includes(value as ActivitySortField)
    ? (value as ActivitySortField)
    : 'timestamp';
}

function parseSortOrder(value: unknown): ActivitySortOrder {
  return typeof value === 'string' && VALID_SORT_ORDERS.includes(value as ActivitySortOrder)
    ? (value as ActivitySortOrder)
    : 'desc';
}

function parseBooleanQuery(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parsePriority(value: unknown): ActivityPriority | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  return VALID_PRIORITIES.includes(value as ActivityPriority) ? (value as ActivityPriority) : null;
}

function parseActivityTypes(value: unknown): readonly ActivityType[] | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;

  const types = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (types.length === 0 || types.length > 10) {
    return null;
  }

  return types.every((type) => VALID_ACTIVITY_TYPES.includes(type as ActivityType))
    ? (types as ActivityType[])
    : null;
}

function parseDateQuery(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeBadges(
  badges?: Partial<Record<ActivityTabId, number>>
): Record<ActivityTabId, number> {
  return {
    alerts: Math.max(0, Number(badges?.['alerts'] ?? 0) || 0),
  };
}

function totalUnreadFromBadges(badges: Record<ActivityTabId, number>): number {
  return Object.values(badges).reduce((sum, count) => sum + count, 0);
}

async function countUnreadBadges(
  col: FirebaseFirestore.CollectionReference
): Promise<Record<ActivityTabId, number>> {
  const counts = await Promise.all(
    VALID_TABS.map(async (tab) => {
      const snapshot = await withFirestoreRetry(
        () =>
          col
            .where('isArchived', '==', false)
            .where('tab', '==', tab)
            .where('isRead', '==', false)
            .count()
            .get(),
        `count-unread/${tab}`
      );

      return [tab, snapshot.data().count] as const;
    })
  );

  return normalizeBadges(Object.fromEntries(counts) as Partial<Record<ActivityTabId, number>>);
}

async function readProjectedBadges(
  db: FirebaseFirestore.Firestore,
  uid: string
): Promise<{ badges: Record<ActivityTabId, number>; totalUnread: number; found: boolean }> {
  const snapshot = await withFirestoreRetry(
    () => getUserActivityBadgeDoc(db, uid).get(),
    'activity-badges/read-projection'
  );

  if (!snapshot.exists) {
    const badges = normalizeBadges();
    return { badges, totalUnread: 0, found: false };
  }

  const data = snapshot.data() as ActivityBadgeStatsDocument | undefined;
  const badges = normalizeBadges(data?.badges);
  const totalUnread = Math.max(0, Number(data?.totalUnread ?? totalUnreadFromBadges(badges)) || 0);

  return { badges, totalUnread, found: true };
}

async function readBadgesWithFallback(
  db: FirebaseFirestore.Firestore,
  uid: string,
  col: FirebaseFirestore.CollectionReference
): Promise<{ badges: Record<ActivityTabId, number>; totalUnread: number }> {
  const projected = await readProjectedBadges(db, uid);
  if (projected.found) {
    return projected;
  }

  const badges = await countUnreadBadges(col);
  return {
    badges,
    totalUnread: totalUnreadFromBadges(badges),
  };
}

function buildFeedQuery(
  col: FirebaseFirestore.CollectionReference,
  options: {
    readonly tab: ActivityTabId;
    readonly isRead?: boolean;
    readonly priority?: ActivityPriority;
    readonly types?: readonly ActivityType[];
    readonly since?: Date;
    readonly until?: Date;
    readonly sortOrder: ActivitySortOrder;
  }
): FirebaseFirestore.Query {
  let query: FirebaseFirestore.Query = col
    .where('isArchived', '==', false)
    .where('tab', '==', options.tab);

  if (options.isRead !== undefined) {
    query = query.where('isRead', '==', options.isRead);
  }

  if (options.priority) {
    query = query.where('priority', '==', options.priority);
  }

  if (options.types && options.types.length > 0) {
    query =
      options.types.length === 1
        ? query.where('type', '==', options.types[0])
        : query.where('type', 'in', [...options.types]);
  }

  if (options.since) {
    query = query.where('timestamp', '>=', options.since);
  }

  if (options.until) {
    query = query.where('timestamp', '<=', options.until);
  }

  return query.orderBy('timestamp', options.sortOrder);
}

function buildArchivedQuery(col: FirebaseFirestore.CollectionReference): FirebaseFirestore.Query {
  return col.where('isArchived', '==', true).orderBy('timestamp', 'desc');
}

/**
 * Retry a Firestore operation on transient errors (UNAVAILABLE, DEADLINE_EXCEEDED,
 * INTERNAL, ABORTED, RESOURCE_EXHAUSTED) with exponential back-off.
 *
 * Max 3 retries: delays ≈ 500 ms → 1 s → 2 s before giving up.
 */
const FIRESTORE_TRANSIENT_CODES = new Set([
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'ABORTED',
  'RESOURCE_EXHAUSTED',
]);

async function withFirestoreRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      const isTransient = FIRESTORE_TRANSIENT_CODES.has(code);
      if (!isTransient || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`[${label}] Transient Firestore error — retrying`, {
        code,
        attempt: attempt + 1,
        delayMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable — loop always throws or returns before exhausting retries.
  throw new Error(`[${label}] Retry loop exhausted`);
}

/** Parse a Firestore doc into a plain activity item object. */
function docToItem(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id,
    type: data['type'],
    tab: data['tab'] as ActivityTabId,
    priority: data['priority'] || 'normal',
    title: data['title'],
    body: data['body'] || undefined,
    timestamp: data['timestamp']?.toDate?.()
      ? data['timestamp'].toDate().toISOString()
      : data['timestamp'],
    isRead: data['isRead'] ?? false,
    isArchived: data['isArchived'] ?? false,
    source: data['source'] || undefined,
    action: data['action'] || undefined,
    secondaryActions: data['secondaryActions'] || undefined,
    deepLink: data['deepLink'] || undefined,
    expiresAt: data['expiresAt']?.toDate?.()
      ? data['expiresAt'].toDate().toISOString()
      : data['expiresAt'] || undefined,
    metadata: data['metadata'] || undefined,
    mediaUrl: data['mediaUrl'] || (data['metadata']?.['imageUrl'] as string) || undefined,
    mediaType:
      data['mediaType'] ||
      (data['mediaUrl'] || data['metadata']?.['imageUrl'] ? 'image' : undefined),
  };
}

// ============================================
// GET /feed — Paginated activity feed
// ============================================
// Uses simple single-field query + in-memory filtering to avoid
// composite index requirements. Per-user subcollections are small (<1000 docs).

router.get('/feed', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const col = getUserActivityCollection(db, uid);

    const requestedTab = req.query['tab'];
    const tab = parseActivityTab(requestedTab) ?? ACTIVITY_DEFAULT_TAB;
    const page = Math.max(Number(req.query['page']) || 1, 1);
    const limit = clampPageSize(req.query['limit']);
    const sortBy = parseSortField(req.query['sortBy']);
    const sortOrder = parseSortOrder(req.query['sortOrder']);
    const isRead = parseBooleanQuery(req.query['isRead']);
    const priority = parsePriority(req.query['priority']);
    const types = parseActivityTypes(req.query['types']);
    const since = parseDateQuery(req.query['since']);
    const until = parseDateQuery(req.query['until']);

    if (requestedTab !== undefined && parseActivityTab(requestedTab) === null) {
      res.status(400).json({
        success: false,
        error: `tab must be one of: ${VALID_TABS.join(', ')}`,
      });
      return;
    }

    if (isRead === null) {
      res.status(400).json({ success: false, error: 'isRead must be true or false' });
      return;
    }

    if (priority === null) {
      res.status(400).json({
        success: false,
        error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
      });
      return;
    }

    if (types === null) {
      res.status(400).json({
        success: false,
        error: `types must be a comma-separated list of up to 10 values from: ${VALID_ACTIVITY_TYPES.join(', ')}`,
      });
      return;
    }

    if (since === null || until === null) {
      res.status(400).json({ success: false, error: 'since and until must be valid ISO dates' });
      return;
    }

    if (since && until && since > until) {
      res.status(400).json({ success: false, error: 'since must be earlier than until' });
      return;
    }

    if (sortBy === 'priority') {
      logger.warn('Activity feed requested unsupported priority sort; falling back to timestamp', {
        uid,
      });
    }

    const query = buildFeedQuery(col, {
      tab,
      ...(isRead !== undefined ? { isRead } : {}),
      ...(priority ? { priority } : {}),
      ...(types ? { types } : {}),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
      sortOrder,
    });

    const offset = (page - 1) * limit;
    const [totalSnapshot, itemsSnapshot, badgeState] = await Promise.all([
      withFirestoreRetry(() => query.count().get(), 'activity-feed/count'),
      withFirestoreRetry(() => query.offset(offset).limit(limit).get(), 'activity-feed/page'),
      readBadgesWithFallback(db, uid, col),
    ]);

    const total = totalSnapshot.data().count;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const items = itemsSnapshot.docs.map(docToItem);

    res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      badges: badgeState.badges,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch activity feed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch activity feed' });
  }
});

// ============================================
// GET /badges — Badge counts per tab
// ============================================

router.get('/badges', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const col = getUserActivityCollection(db, uid);

    const { badges } = await readBadgesWithFallback(db, uid, col);

    res.json({ success: true, badges });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch badge counts', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch badge counts' });
  }
});

// ============================================
// GET /summary — Activity summary
// ============================================

router.get('/summary', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const col = getUserActivityCollection(db, uid);

    const [badgeState, lastActivitySnapshot] = await Promise.all([
      readBadgesWithFallback(db, uid, col),
      withFirestoreRetry(
        () => col.where('isArchived', '==', false).orderBy('timestamp', 'desc').limit(1).get(),
        'activity-summary/last-activity'
      ),
    ]);

    const lastActivity = lastActivitySnapshot.docs[0]
      ? docToItem(lastActivitySnapshot.docs[0]).timestamp
      : undefined;

    res.json({
      success: true,
      data: { totalUnread: badgeState.totalUnread, badges: badgeState.badges, lastActivity },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch activity summary', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch activity summary' });
  }
});

// ============================================
// GET /:id — Single activity item
// ============================================

router.get('/:id', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const docRef = getUserActivityCollection(db, uid).doc(req.params['id'] as string);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Activity item not found' });
      return;
    }

    const data = doc.data()!;
    res.json({
      success: true,
      data: {
        id: doc.id,
        type: data['type'],
        tab: data['tab'],
        priority: data['priority'] || 'normal',
        title: data['title'],
        body: data['body'] || undefined,
        timestamp: data['timestamp']?.toDate?.()
          ? data['timestamp'].toDate().toISOString()
          : data['timestamp'],
        isRead: data['isRead'] ?? false,
        isArchived: data['isArchived'] ?? false,
        source: data['source'] || undefined,
        action: data['action'] || undefined,
        metadata: data['metadata'] || undefined,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch activity item', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch activity item' });
  }
});

// ============================================
// POST /read — Mark specific items as read
// ============================================

router.post(
  '/read',
  appGuard,
  validateBody(MarkActivityReadDto),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user!.uid;
      const db = req.firebase.db;
      const col = getUserActivityCollection(db, uid);

      const ids: string[] = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
        return;
      }

      if (ids.length > 100) {
        res.status(400).json({ success: false, error: 'Cannot mark more than 100 items at once' });
        return;
      }

      // Batch update
      const batch = db.batch();
      for (const id of ids) {
        batch.update(col.doc(id), { isRead: true, readAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();

      const badges = await countUnreadBadges(col);

      res.json({ success: true, count: ids.length, badges });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to mark items as read', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to mark items as read' });
    }
  }
);

// ============================================
// POST /read-all — Mark all items in a tab as read
// ============================================

router.post(
  '/read-all',
  appGuard,
  validateBody(MarkAllActivityReadDto),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user!.uid;
      const db = req.firebase.db;
      const col = getUserActivityCollection(db, uid);

      const tab = parseActivityTab(req.body?.tab);
      if (!tab) {
        res
          .status(400)
          .json({ success: false, error: `tab must be one of: ${VALID_TABS.join(', ')}` });
        return;
      }

      // Fetch all docs, filter in memory (avoids composite index)
      const snapshot = await withFirestoreRetry(() => col.get(), 'read-all/fetch');
      const toMark = snapshot.docs.filter((doc) => {
        const data = doc.data();
        if (data['isRead'] || data['isArchived']) return false;
        if (data['tab'] !== tab) return false;
        return true;
      });

      if (toMark.length === 0) {
        const badges = await countUnreadBadges(col);
        res.json({ success: true, count: 0, badges });
        return;
      }

      // Batch in chunks of 500 (Firestore limit)
      let count = 0;
      const BATCH_LIMIT = 500;
      for (let i = 0; i < toMark.length; i += BATCH_LIMIT) {
        const chunk = toMark.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const doc of chunk) {
          batch.update(doc.ref, { isRead: true, readAt: FieldValue.serverTimestamp() });
        }
        await withFirestoreRetry(() => batch.commit(), `read-all/batch-commit[${i}]`);
        count += chunk.length;
      }

      const badges = await countUnreadBadges(col);

      res.json({ success: true, count, badges });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to mark all as read', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }
  }
);

// ============================================
// POST /archive — Archive activity items
// ============================================

router.post(
  '/archive',
  appGuard,
  validateBody(ArchiveActivityDto),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user!.uid;
      const db = req.firebase.db;
      const col = getUserActivityCollection(db, uid);

      const ids: string[] = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
        return;
      }

      if (ids.length > 100) {
        res
          .status(400)
          .json({ success: false, error: 'Cannot archive more than 100 items at once' });
        return;
      }

      const batch = db.batch();
      for (const id of ids) {
        batch.update(col.doc(id), { isArchived: true, archivedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();

      res.json({ success: true, count: ids.length });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to archive items', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to archive items' });
    }
  }
);

// ============================================
// GET /archived — Get archived items
// ============================================

router.get('/archived', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const col = getUserActivityCollection(db, uid);

    const page = Math.max(Number(req.query['page']) || 1, 1);
    const limit = clampPageSize(req.query['limit']);

    const query = buildArchivedQuery(col);
    const offset = (page - 1) * limit;
    const [totalSnapshot, itemsSnapshot] = await Promise.all([
      withFirestoreRetry(() => query.count().get(), 'activity-archived/count'),
      withFirestoreRetry(() => query.offset(offset).limit(limit).get(), 'activity-archived/page'),
    ]);

    const total = totalSnapshot.data().count;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const items = itemsSnapshot.docs.map(docToItem);

    res.json({
      success: true,
      items,
      pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch archived items', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch archived items' });
  }
});

// ============================================
// POST /archived/restore — Restore archived items
// ============================================

router.post(
  '/archived/restore',
  appGuard,
  validateBody(RestoreActivityDto),
  async (req: Request, res: Response) => {
    try {
      const uid = req.user!.uid;
      const db = req.firebase.db;
      const col = getUserActivityCollection(db, uid);

      const ids: string[] = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
        return;
      }

      if (ids.length > 100) {
        res
          .status(400)
          .json({ success: false, error: 'Cannot restore more than 100 items at once' });
        return;
      }

      const batch = db.batch();
      for (const id of ids) {
        batch.update(col.doc(id), { isArchived: false, archivedAt: FieldValue.delete() });
      }
      await batch.commit();

      res.json({ success: true, count: ids.length });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to restore items', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to restore items' });
    }
  }
);

export default router;
