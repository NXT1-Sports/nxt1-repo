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
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  MarkActivityReadDto,
  MarkAllActivityReadDto,
  ArchiveActivityDto,
  RestoreActivityDto,
} from '../dtos/social.dto.js';
import { logger } from '../utils/logger.js';
import { ACTIVITY_TABS, type ActivityTabId } from '@nxt1/core';

const router: ExpressRouter = Router();

// ============================================
// CONSTANTS
// ============================================

const ACTIVITY_COLLECTION = 'activity';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const ALL_TAB = 'all';
const VALID_TABS: readonly ActivityTabId[] = ACTIVITY_TABS.map((tab) => tab.id);
const VALID_SORT_FIELDS = ['timestamp', 'priority'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
type ActivityTabFilter = ActivityTabId | typeof ALL_TAB;

// ============================================
// HELPERS
// ============================================

function getUserActivityCollection(db: FirebaseFirestore.Firestore, uid: string) {
  return db.collection('users').doc(uid).collection(ACTIVITY_COLLECTION);
}

function clampPageSize(value: unknown): number {
  const num = Number(value) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(num, 1), MAX_PAGE_SIZE);
}

function isActivityTabId(value: unknown): value is ActivityTabId {
  return typeof value === 'string' && VALID_TABS.includes(value as ActivityTabId);
}

function parseActivityTabFilter(value: unknown): ActivityTabFilter {
  if (value === ALL_TAB) return ALL_TAB;
  if (isActivityTabId(value)) return value;
  return ALL_TAB;
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

function buildBadges(items: ReturnType<typeof docToItem>[]): Record<ActivityTabId, number> {
  return {
    alerts: items.filter((item) => item.tab === 'alerts').length,
    analytics: items.filter((item) => item.tab === 'analytics').length,
    inbox: items.filter((item) => item.tab === 'inbox').length,
    agent: items.filter((item) => item.tab === 'agent').length,
    all: items.length,
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

    const tab = parseActivityTabFilter(req.query['tab']);
    const page = Math.max(Number(req.query['page']) || 1, 1);
    const limit = clampPageSize(req.query['limit']);
    const sortBy = VALID_SORT_FIELDS.includes(req.query['sortBy'] as any)
      ? (req.query['sortBy'] as string)
      : 'timestamp';
    const sortOrder = VALID_SORT_ORDERS.includes(req.query['sortOrder'] as any)
      ? (req.query['sortOrder'] as string)
      : 'desc';
    const isReadFilter = req.query['isRead'];
    const priority = req.query['priority'] as string | undefined;

    // Fetch all user activity docs (single-field index only, no composite needed)
    const snapshot = await col.get();

    // Filter in memory (avoids composite index requirements)
    let filtered = snapshot.docs.map(docToItem).filter((item) => !item.isArchived);

    if (tab !== ALL_TAB) {
      filtered = filtered.filter((item) => item.tab === tab);
    }

    if (isReadFilter === 'true') {
      filtered = filtered.filter((item) => item.isRead);
    } else if (isReadFilter === 'false') {
      filtered = filtered.filter((item) => !item.isRead);
    }

    if (priority) {
      filtered = filtered.filter((item) => item.priority === priority);
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a] ?? '';
      const bVal = b[sortBy as keyof typeof b] ?? '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);

    // Badge counts from already-fetched data (no extra queries)
    const allActive = snapshot.docs.map(docToItem).filter((i) => !i.isArchived && !i.isRead);
    const badges = buildBadges(allActive);

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
      badges,
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

    const snapshot = await col.get();
    const allActive = snapshot.docs.map(docToItem).filter((i) => !i.isArchived && !i.isRead);

    const badges = buildBadges(allActive);

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

    const snapshot = await col.get();
    const allItems = snapshot.docs.map(docToItem);
    const active = allItems.filter((i) => !i.isArchived);
    const unread = active.filter((i) => !i.isRead);

    const badges = buildBadges(unread);

    // Most recent timestamp
    let lastActivity: string | undefined;
    if (active.length > 0) {
      const sorted = active
        .filter((i) => i.timestamp)
        .sort((a, b) => (a.timestamp! > b.timestamp! ? -1 : 1));
      lastActivity = sorted[0]?.timestamp;
    }

    res.json({
      success: true,
      data: { totalUnread: unread.length, badges, lastActivity },
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

      // Recompute badges from all docs (no composite index needed)
      const allDocs = await col.get();
      const unread = allDocs.docs.map(docToItem).filter((i) => !i.isArchived && !i.isRead);
      const badges = buildBadges(unread);

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

      const tab = parseActivityTabFilter(req.body?.tab);
      if (!tab) {
        res
          .status(400)
          .json({ success: false, error: 'tab must be one of: all, alerts, analytics' });
        return;
      }

      // Fetch all docs, filter in memory (avoids composite index)
      const snapshot = await col.get();
      const toMark = snapshot.docs.filter((doc) => {
        const data = doc.data();
        if (data['isRead'] || data['isArchived']) return false;
        if (tab !== ALL_TAB && data['tab'] !== tab) return false;
        return true;
      });

      if (toMark.length === 0) {
        const unread = snapshot.docs.map(docToItem).filter((i) => !i.isArchived && !i.isRead);
        const badges = buildBadges(unread);
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
        await batch.commit();
        count += chunk.length;
      }

      // Recompute badges after marking
      const afterSnapshot = await col.get();
      const unread = afterSnapshot.docs.map(docToItem).filter((i) => !i.isArchived && !i.isRead);
      const badges = buildBadges(unread);

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

    // Fetch all docs, filter + sort in memory (avoids composite index)
    const snapshot = await col.get();
    const archived = snapshot.docs
      .map(docToItem)
      .filter((i) => i.isArchived)
      .sort((a, b) => {
        const at = a.timestamp ?? '';
        const bt = b.timestamp ?? '';
        return at > bt ? -1 : at < bt ? 1 : 0;
      });

    const total = archived.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = archived.slice(offset, offset + limit);

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
