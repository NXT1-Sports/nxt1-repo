import { Router, type Request, type Response } from 'express';
import type { AgentXAttachment, TeamFileDoc, TeamFileFolderDoc } from '@nxt1/core';
import { randomUUID } from 'node:crypto';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  canManageTeamMutationForUser,
  canReadTeamIntelForUser,
} from '../../services/team/team-intel-permissions.js';
import { upsertTeamFileFromAttachment } from '../../services/team/team-files-index.service.js';
import { getSignedUrlWithTimeout } from '../../utils/gcs-signed-url.js';
import { z } from 'zod';

const router = Router();
const TEAM_FILES_COLLECTION = 'TeamFiles' as const;
const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const TeamFileIndexBodySchema = z.object({
  teamId: z.string().trim().min(1),
  sport: z.string().trim().min(1).optional(),
  attachment: z.object({
    id: z.string().trim().min(1),
    url: z.string().trim().min(1),
    storagePath: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    type: z.enum(['image', 'video', 'pdf', 'csv', 'doc', 'app']),
    sizeBytes: z.number().nonnegative(),
    cloudflareVideoId: z.string().trim().min(1).optional(),
    cloudflareStatus: z.string().trim().min(1).optional(),
    readyToStream: z.boolean().optional(),
    thumbnailUrl: z.string().trim().min(1).optional(),
    platform: z.string().trim().min(1).optional(),
    profileUrl: z.string().trim().min(1).optional(),
    faviconUrl: z.string().trim().min(1).optional(),
  }),
});

const TeamFileFolderCreateBodySchema = z.object({
  teamId: z.string().trim().min(1),
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  parentId: z.string().trim().min(1).nullable().optional(),
});

const TeamFileFolderUpdateBodySchema = z.object({
  teamId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const TeamFileMoveBodySchema = z.object({
  teamId: z.string().trim().min(1),
  folderId: z.string().trim().min(1).nullable().optional(),
});

function getAuthUser(req: Request): { uid: string } | null {
  const user = (req as Request & { user?: { uid?: string } }).user;
  return user?.uid ? { uid: user.uid } : null;
}

function toPortableTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

async function refreshFileUrl(
  bucket: ReturnType<NonNullable<Request['firebase']>['storage']['bucket']>,
  file: Pick<TeamFileDoc, 'url' | 'storagePath' | 'kind'>
): Promise<string> {
  if (!file.storagePath || file.kind === 'video') {
    return file.url;
  }

  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [signedUrl] = await getSignedUrlWithTimeout(() =>
    bucket.file(file.storagePath as string).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    })
  );
  return signedUrl;
}

function compareTeamFilesByUpdatedAtDesc(
  left: Pick<TeamFileDoc, 'updatedAt' | 'createdAt'>,
  right: Pick<TeamFileDoc, 'updatedAt' | 'createdAt'>
): number {
  const leftTime = Date.parse(
    toPortableTimestamp(left.updatedAt || left.createdAt || new Date(0).toISOString())
  );
  const rightTime = Date.parse(
    toPortableTimestamp(right.updatedAt || right.createdAt || new Date(0).toISOString())
  );
  return rightTime - leftTime;
}

function compareTeamFileFolders(
  left: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>,
  right: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>
): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

async function getAuthorizedTeam(
  req: Request,
  teamId: string,
  mode: 'read' | 'manage'
): Promise<
  | { ok: true; db: NonNullable<Request['firebase']>['db']; authUid: string }
  | { ok: false; status: number; error: string }
> {
  const auth = getAuthUser(req);
  if (!auth) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const db = req.firebase?.db;
  if (!db) {
    return { ok: false, status: 500, error: 'Firestore unavailable' };
  }

  const teamDoc = await db.collection('Teams').doc(teamId).get();
  if (!teamDoc.exists) {
    return { ok: false, status: 404, error: 'Team not found' };
  }

  const authorized =
    mode === 'read'
      ? await canReadTeamIntelForUser(db, auth.uid, teamId, teamDoc.data() ?? {})
      : await canManageTeamMutationForUser(db, auth.uid, teamId, teamDoc.data() ?? {});

  if (!authorized) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, db, authUid: auth.uid };
}

function toTeamFileFolderDoc(docId: string, data: Record<string, unknown>): TeamFileFolderDoc {
  return {
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    name: String(data['name'] ?? 'Untitled folder'),
    normalizedName: String(data['normalizedName'] ?? '')
      .trim()
      .toLowerCase(),
    ...(typeof data['parentId'] === 'string' ? { parentId: data['parentId'] } : {}),
    sortOrder: Number(data['sortOrder'] ?? 0),
    createdByUserId: String(data['createdByUserId'] ?? ''),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
  } satisfies TeamFileFolderDoc;
}

async function assertFolderParentIsValid(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly teamId: string;
  readonly folderId?: string;
  readonly parentId: string | null;
}): Promise<void> {
  const parentId = params.parentId?.trim() || null;
  if (!parentId) {
    return;
  }

  if (params.folderId && parentId === params.folderId) {
    throw new Error('Folder cannot be its own parent');
  }

  const parentDoc = await params.db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parentId).get();
  if (!parentDoc.exists) {
    throw new Error('Parent folder not found');
  }

  const parentData = parentDoc.data() ?? {};
  if (String(parentData['teamId'] ?? '') !== params.teamId) {
    throw new Error('Parent folder does not belong to this team');
  }

  if (!params.folderId) {
    return;
  }

  let currentParentId = typeof parentData['parentId'] === 'string' ? parentData['parentId'] : null;
  while (currentParentId) {
    if (currentParentId === params.folderId) {
      throw new Error('Folder cannot be moved inside its own tree');
    }
    const currentParentDoc = await params.db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(currentParentId)
      .get();
    if (!currentParentDoc.exists) {
      break;
    }
    const currentParentData = currentParentDoc.data() ?? {};
    currentParentId =
      typeof currentParentData['parentId'] === 'string' ? currentParentData['parentId'] : null;
  }
}

async function resolveNextFolderSortOrder(
  db: NonNullable<Request['firebase']>['db'],
  teamId: string,
  parentId: string | null
): Promise<number> {
  const snapshot = await db
    .collection(TEAM_FILE_FOLDERS_COLLECTION)
    .where('teamId', '==', teamId)
    .get();

  const siblingSortOrders = snapshot.docs
    .map((doc) => doc.data())
    .filter((data) => {
      const value = typeof data['parentId'] === 'string' ? data['parentId'] : null;
      return value === (parentId?.trim() || null);
    })
    .map((data) => Number(data['sortOrder'] ?? 0))
    .filter((value) => Number.isFinite(value));

  return siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;
}

router.get('/files', appGuard, async (req: Request, res: Response) => {
  try {
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }

    const authorizedTeam = await getAuthorizedTeam(req, teamId, 'read');
    if (!authorizedTeam.ok) {
      res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
      return;
    }

    const { db } = authorizedTeam;

    const [snapshot, folderSnapshot] = await Promise.all([
      db.collection(TEAM_FILES_COLLECTION).where('teamId', '==', teamId).limit(250).get(),
      db.collection(TEAM_FILE_FOLDERS_COLLECTION).where('teamId', '==', teamId).limit(250).get(),
    ]);
    const bucket = req.firebase!.storage.bucket();

    const files = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data() as Record<string, unknown>;
        const rawFile = {
          id: doc.id,
          teamId,
          ownerUserId: String(data['ownerUserId'] ?? ''),
          name: String(data['name'] ?? 'Untitled file'),
          normalizedName: String(data['normalizedName'] ?? '')
            .trim()
            .toLowerCase(),
          mimeType: String(data['mimeType'] ?? 'application/octet-stream'),
          kind: data['kind'] as TeamFileDoc['kind'],
          status: data['status'] as TeamFileDoc['status'],
          origin: data['origin'] as TeamFileDoc['origin'],
          sizeBytes: Number(data['sizeBytes'] ?? 0),
          url: String(data['url'] ?? ''),
          ...(typeof data['folderId'] === 'string' ? { folderId: data['folderId'] } : {}),
          ...(typeof data['storagePath'] === 'string' ? { storagePath: data['storagePath'] } : {}),
          ...(typeof data['cloudflareVideoId'] === 'string'
            ? { cloudflareVideoId: data['cloudflareVideoId'] }
            : {}),
          ...(typeof data['cloudflareStatus'] === 'string'
            ? { cloudflareStatus: data['cloudflareStatus'] }
            : {}),
          ...(typeof data['readyToStream'] === 'boolean'
            ? { readyToStream: data['readyToStream'] }
            : {}),
          ...(typeof data['thumbnailUrl'] === 'string'
            ? { thumbnailUrl: data['thumbnailUrl'] }
            : {}),
          ...(typeof data['platform'] === 'string' ? { platform: data['platform'] } : {}),
          ...(typeof data['profileUrl'] === 'string' ? { profileUrl: data['profileUrl'] } : {}),
          ...(typeof data['faviconUrl'] === 'string' ? { faviconUrl: data['faviconUrl'] } : {}),
          ...(typeof data['sport'] === 'string' ? { sport: data['sport'] } : {}),
          ...(typeof data['sourceThreadId'] === 'string'
            ? { sourceThreadId: data['sourceThreadId'] }
            : {}),
          ...(typeof data['sourceMessageId'] === 'string'
            ? { sourceMessageId: data['sourceMessageId'] }
            : {}),
          ...(typeof data['sourceOperationId'] === 'string'
            ? { sourceOperationId: data['sourceOperationId'] }
            : {}),
          createdAt: toPortableTimestamp(data['createdAt']),
          updatedAt: toPortableTimestamp(data['updatedAt']),
          lastSeenAt: toPortableTimestamp(data['lastSeenAt']),
        } satisfies TeamFileDoc;

        try {
          return {
            ...rawFile,
            url: await refreshFileUrl(bucket, rawFile),
          } satisfies TeamFileDoc;
        } catch (refreshError) {
          logger.warn('Failed to refresh Team File signed URL, falling back to stored URL', {
            teamId,
            fileId: doc.id,
            storagePath: rawFile.storagePath,
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          });
          return rawFile;
        }
      })
    );

    files.sort(compareTeamFilesByUpdatedAtDesc);

    const folders = folderSnapshot.docs
      .map((doc) => toTeamFileFolderDoc(doc.id, doc.data() as Record<string, unknown>))
      .sort(compareTeamFileFolders);

    res.json({ success: true, data: { files, folders } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list Team Files', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

router.post('/files/index', appGuard, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const parsedBody = TeamFileIndexBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        issues: parsedBody.error.issues,
      });
      return;
    }

    const body = parsedBody.data;
    const teamDoc = await db.collection('Teams').doc(body.teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      auth.uid,
      body.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const fileId = await upsertTeamFileFromAttachment({
      db,
      teamId: body.teamId,
      userId: auth.uid,
      attachment: body.attachment as AgentXAttachment,
      origin: 'files_upload',
      sport: body.sport,
    });

    res.json({ success: true, data: { fileId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to index Team File', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to index file' });
  }
});

router.post('/files/folders', appGuard, async (req: Request, res: Response) => {
  try {
    const parsedBody = TeamFileFolderCreateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const authorizedTeam = await getAuthorizedTeam(req, body.teamId, 'manage');
    if (!authorizedTeam.ok) {
      res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
      return;
    }

    const { db, authUid } = authorizedTeam;
    const parentId = body.parentId?.trim() || null;
    await assertFolderParentIsValid({ db, teamId: body.teamId, parentId });

    const folderId = body.id?.trim() || randomUUID();
    const sortOrder = await resolveNextFolderSortOrder(db, body.teamId, parentId);
    const now = new Date().toISOString();

    await db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(folderId)
      .set({
        teamId: body.teamId,
        name: body.name.trim(),
        normalizedName: body.name.trim().toLowerCase(),
        ...(parentId ? { parentId } : {}),
        sortOrder,
        createdByUserId: authUid,
        createdAt: now,
        updatedAt: now,
      });

    res.json({
      success: true,
      data: {
        folder: {
          id: folderId,
          teamId: body.teamId,
          name: body.name.trim(),
          normalizedName: body.name.trim().toLowerCase(),
          ...(parentId ? { parentId } : {}),
          sortOrder,
          createdByUserId: authUid,
          createdAt: now,
          updatedAt: now,
        } satisfies TeamFileFolderDoc,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to create folder' });
  }
});

router.patch('/files/folders/:folderId', appGuard, async (req: Request, res: Response) => {
  try {
    const folderId =
      typeof req.params['folderId'] === 'string' ? req.params['folderId'].trim() : '';
    if (!folderId) {
      res.status(400).json({ success: false, error: 'folderId is required' });
      return;
    }

    const parsedBody = TeamFileFolderUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const authorizedTeam = await getAuthorizedTeam(req, body.teamId, 'manage');
    if (!authorizedTeam.ok) {
      res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
      return;
    }

    const { db } = authorizedTeam;
    const folderRef = db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const existingData = folderDoc.data() ?? {};
    if (String(existingData['teamId'] ?? '') !== body.teamId) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const nextParentId =
      body.parentId === undefined
        ? typeof existingData['parentId'] === 'string'
          ? existingData['parentId']
          : null
        : body.parentId?.trim() || null;
    await assertFolderParentIsValid({ db, teamId: body.teamId, folderId, parentId: nextParentId });

    const nextName = body.name?.trim() || String(existingData['name'] ?? 'Untitled folder');
    const nextSortOrder = body.sortOrder ?? Number(existingData['sortOrder'] ?? 0);
    const now = new Date().toISOString();

    await folderRef.set(
      {
        name: nextName,
        normalizedName: nextName.toLowerCase(),
        parentId: nextParentId,
        sortOrder: nextSortOrder,
        updatedAt: now,
      },
      { merge: true }
    );

    res.json({
      success: true,
      data: {
        folder: {
          id: folderId,
          teamId: body.teamId,
          name: nextName,
          normalizedName: nextName.toLowerCase(),
          ...(nextParentId ? { parentId: nextParentId } : {}),
          sortOrder: nextSortOrder,
          createdByUserId: String(existingData['createdByUserId'] ?? ''),
          createdAt: toPortableTimestamp(existingData['createdAt']),
          updatedAt: now,
        } satisfies TeamFileFolderDoc,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to update folder' });
  }
});

router.delete('/files/folders/:folderId', appGuard, async (req: Request, res: Response) => {
  try {
    const folderId =
      typeof req.params['folderId'] === 'string' ? req.params['folderId'].trim() : '';
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
    if (!folderId || !teamId) {
      res.status(400).json({ success: false, error: 'folderId and teamId are required' });
      return;
    }

    const authorizedTeam = await getAuthorizedTeam(req, teamId, 'manage');
    if (!authorizedTeam.ok) {
      res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
      return;
    }

    const { db } = authorizedTeam;
    const folderRef = db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const folderData = folderDoc.data() ?? {};
    if (String(folderData['teamId'] ?? '') !== teamId) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const [childFoldersSnapshot, filesSnapshot] = await Promise.all([
      db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .where('teamId', '==', teamId)
        .where('parentId', '==', folderId)
        .get(),
      db
        .collection(TEAM_FILES_COLLECTION)
        .where('teamId', '==', teamId)
        .where('folderId', '==', folderId)
        .get(),
    ]);

    const batch = db.batch();
    batch.delete(folderRef);

    for (const childDoc of childFoldersSnapshot.docs) {
      batch.set(
        childDoc.ref,
        { parentId: null, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    for (const fileDoc of filesSnapshot.docs) {
      batch.set(
        fileDoc.ref,
        { folderId: null, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    await batch.commit();

    res.json({
      success: true,
      data: {
        deletedFolderId: folderId,
        unassignedFileCount: filesSnapshot.size,
        reparentedFolderCount: childFoldersSnapshot.size,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to delete folder' });
  }
});

router.patch('/files/:fileId', appGuard, async (req: Request, res: Response) => {
  try {
    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const parsedBody = TeamFileMoveBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const authorizedTeam = await getAuthorizedTeam(req, body.teamId, 'manage');
    if (!authorizedTeam.ok) {
      res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
      return;
    }

    const { db } = authorizedTeam;
    const fileRef = db.collection(TEAM_FILES_COLLECTION).doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileData = fileDoc.data() ?? {};
    if (String(fileData['teamId'] ?? '') !== body.teamId) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const folderId = body.folderId?.trim() || null;
    if (folderId) {
      const folderDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId).get();
      if (!folderDoc.exists || String(folderDoc.data()?.['teamId'] ?? '') !== body.teamId) {
        res.status(404).json({ success: false, error: 'Folder not found' });
        return;
      }
    }

    await fileRef.set({ folderId, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ success: true, data: { fileId, folderId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to move Team File', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to move file' });
  }
});

export default router;
