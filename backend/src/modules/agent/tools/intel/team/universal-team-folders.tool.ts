import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentFileAcl, TeamFileFolderDoc, UniversalFileDoc } from '@nxt1/core';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  createOwnerScopedAccessLists,
  createOwnerPrivateAccessLists,
  resolveFileAccessContext,
  toUserAccessKey,
} from '../../../../../services/team/file-access-keys.service.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;
const AccessKeyArraySchema = z.array(z.string().trim().min(1)).max(250);

const ListTeamFileFoldersInputSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
});

const OptionalFolderSortOrderInputSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }
  return value;
}, z.coerce.number().int().min(0).optional());

const CreateTeamFileFolderInputSchema = z.object({
  folderId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  parentId: z.string().trim().min(1).nullable().optional(),
  sortOrder: OptionalFolderSortOrderInputSchema,
});

const UpdateTeamFileFolderInputSchema = z
  .object({
    folderId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(80).optional(),
    parentId: z.string().trim().min(1).nullable().optional(),
    sortOrder: OptionalFolderSortOrderInputSchema,
    readAccessKeys: AccessKeyArraySchema.optional(),
    writeAccessKeys: AccessKeyArraySchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.parentId !== undefined ||
      value.sortOrder !== undefined ||
      value.readAccessKeys !== undefined ||
      value.writeAccessKeys !== undefined,
    {
      message: 'At least one folder field besides folderId must be provided for update',
    }
  );

const DeleteTeamFileFolderInputSchema = z.object({
  folderId: z.string().trim().min(1),
});

const MoveUniversalFileToFolderInputSchema = z
  .object({
    documentId: z.string().trim().min(1),
    folderId: z.string().trim().min(1).nullable().optional(),
    folderName: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.folderId !== undefined || value.folderName !== undefined, {
    message: 'folderId or folderName must be provided',
    path: ['folderId'],
  });

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

function normalizeAccessKeyArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  return [...new Set(normalized)];
}

function isAgentFileAcl(value: unknown): value is AgentFileAcl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === 1 &&
    (candidate['mode'] === 'explicit' || candidate['mode'] === 'copied_from_folder') &&
    Array.isArray(candidate['grants']) &&
    Array.isArray(candidate['readKeys']) &&
    Array.isArray(candidate['manageKeys'])
  );
}

function resolveFolderAccessLists(input: {
  readonly ownerUserId: string;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
}): { readonly readAccessKeys: readonly string[]; readonly writeAccessKeys: readonly string[] } {
  const ownerKey = toUserAccessKey(input.ownerUserId);
  const writeAccessKeys = [...new Set([ownerKey, ...(input.writeAccessKeys ?? [])])];
  const readAccessKeys = [
    ...new Set([ownerKey, ...(input.readAccessKeys ?? []), ...writeAccessKeys]),
  ];

  return {
    readAccessKeys,
    writeAccessKeys,
  };
}

function isFolderShareUpdateAllowed(input: {
  readonly userId: string;
  readonly ownerUserId: string;
}): boolean {
  return input.userId === input.ownerUserId;
}

function canAccessFolderByGrantedKeys(
  folder: Pick<TeamFileFolderDoc, 'createdByUserId' | 'readAccessKeys' | 'writeAccessKeys'>,
  userId: string,
  grantedAccessKeys: readonly string[],
  mode: 'read' | 'write'
): boolean {
  if (folder.createdByUserId === userId) {
    return true;
  }

  const candidateKeys =
    mode === 'write' ? (folder.writeAccessKeys ?? []) : (folder.readAccessKeys ?? []);
  if (candidateKeys.length === 0) {
    return false;
  }

  return canAccessByKeys(candidateKeys, grantedAccessKeys);
}

async function hasDirectFolderWriteAccess(
  db: Firestore,
  userId: string,
  folder: TeamFileFolderDoc
): Promise<boolean> {
  const accessContext = await resolveFileAccessContext(db, userId);
  return canAccessFolderByGrantedKeys(
    folder,
    userId,
    buildGrantedAccessKeys(accessContext),
    'write'
  );
}

async function hasDirectUniversalFileWriteAccess(
  db: Firestore,
  userId: string,
  document: UniversalFileDoc
): Promise<boolean> {
  const writeAccessKeys = document.writeAccessKeys ?? [];
  if (writeAccessKeys.length === 0) {
    return false;
  }

  const accessContext = await resolveFileAccessContext(db, userId);
  return canAccessByKeys(writeAccessKeys, buildGrantedAccessKeys(accessContext));
}

async function resolveCreatedFolderAccess(input: {
  readonly db: Firestore;
  readonly parentId: string | null;
  readonly teamId?: string | null;
  readonly ownerUserId: string;
}): Promise<{
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
}> {
  const normalizedTeamId = typeof input.teamId === 'string' ? input.teamId.trim() : '';
  const ownerScopedAccess = normalizedTeamId
    ? createOwnerScopedAccessLists({
        ownerUserId: input.ownerUserId,
        teamId: normalizedTeamId,
      })
    : createOwnerPrivateAccessLists({ ownerUserId: input.ownerUserId });
  if (!input.parentId) {
    return ownerScopedAccess;
  }

  const parentDoc = await input.db
    .collection(TEAM_FILE_FOLDERS_COLLECTION)
    .doc(input.parentId)
    .get();
  const parentData = (parentDoc.data() ?? {}) as Record<string, unknown>;
  const inheritedReadAccessKeys = normalizeAccessKeyArray(parentData['readAccessKeys']) ?? [];
  const inheritedWriteAccessKeys = normalizeAccessKeyArray(parentData['writeAccessKeys']) ?? [];

  return {
    readAccessKeys: [...new Set([...ownerScopedAccess.readAccessKeys, ...inheritedReadAccessKeys])],
    writeAccessKeys: [
      ...new Set([...ownerScopedAccess.writeAccessKeys, ...inheritedWriteAccessKeys]),
    ],
  };
}

function toTeamFileFolderDoc(docId: string, data: Record<string, unknown>): TeamFileFolderDoc {
  const parentId = typeof data['parentId'] === 'string' ? data['parentId'].trim() : '';
  const readAccessKeys = normalizeAccessKeyArray(data['readAccessKeys']);
  const writeAccessKeys = normalizeAccessKeyArray(data['writeAccessKeys']);
  const acl = isAgentFileAcl(data['acl']) ? data['acl'] : undefined;
  return {
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    name: String(data['name'] ?? 'Untitled folder'),
    normalizedName: String(data['normalizedName'] ?? '')
      .trim()
      .toLowerCase(),
    ...(typeof data['organizationId'] === 'string'
      ? { organizationId: data['organizationId'] }
      : {}),
    ...(parentId ? { parentId } : {}),
    sortOrder: Number(data['sortOrder'] ?? 0),
    createdByUserId: String(data['createdByUserId'] ?? ''),
    ...(acl ? { acl } : {}),
    ...(readAccessKeys ? { readAccessKeys } : {}),
    ...(writeAccessKeys ? { writeAccessKeys } : {}),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
  } satisfies TeamFileFolderDoc;
}

function toUniversalFile(docId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function normalizeScopeTeamId(teamId: string | null | undefined): string {
  return typeof teamId === 'string' ? teamId.trim() : '';
}

function resolveFolderTeamId(folder: Pick<TeamFileFolderDoc, 'teamId'>): string {
  return normalizeScopeTeamId(folder.teamId);
}

function resolveUniversalFileTeamId(document: Pick<UniversalFileDoc, 'teamId'>): string {
  return normalizeScopeTeamId(document.teamId);
}

function compareTeamFileFolders(
  left: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>,
  right: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>
): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

async function resolveFolderAccessState(
  db: Firestore,
  userId: string
): Promise<{
  readonly teamIds: readonly string[];
  readonly grantedAccessKeys: readonly string[];
}> {
  const accessContext = await resolveFileAccessContext(db, userId);
  return {
    teamIds: accessContext.teamIds,
    grantedAccessKeys: buildGrantedAccessKeys(accessContext),
  };
}

async function listTeamFileFoldersByScope(
  db: Firestore,
  teamId: string
): Promise<readonly TeamFileFolderDoc[]> {
  const snapshot = await db
    .collection(TEAM_FILE_FOLDERS_COLLECTION)
    .where('teamId', '==', teamId)
    .limit(250)
    .get();

  return snapshot.docs
    .map((doc) => toTeamFileFolderDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .sort(compareTeamFileFolders);
}

function resolveTeamFileFolderTarget(
  folders: readonly TeamFileFolderDoc[],
  options: {
    readonly folderId?: string | null;
    readonly folderName?: string;
  }
): { readonly folder: TeamFileFolderDoc | null } | { readonly error: string } {
  const targetId = options.folderId === undefined ? undefined : options.folderId?.trim() || null;
  const targetName = options.folderName?.trim();

  if (targetId === null) {
    return { folder: null };
  }

  if (targetId) {
    const folder = folders.find((entry) => entry.id === targetId);
    if (!folder) {
      return { error: `Folder ${targetId} was not found in Files.` };
    }

    if (targetName && folder.name.trim().toLowerCase() !== targetName.toLowerCase()) {
      return {
        error:
          `Folder ID ${targetId} resolves to "${folder.name}", which does not match ` +
          `the requested folder name "${targetName}".`,
      };
    }

    return { folder };
  }

  if (!targetName) {
    return { error: 'folderId or folderName must be provided.' };
  }

  const matches = folders.filter(
    (entry) => entry.name.trim().toLowerCase() === targetName.toLowerCase()
  );

  if (matches.length === 0) {
    return { error: `No folder named "${targetName}" was found in Files.` };
  }

  if (matches.length > 1) {
    return {
      error:
        `Multiple folders are named "${targetName}" in Files. ` +
        'Use folderId so Agent X can target the correct folder.',
    };
  }

  return { folder: matches[0] as TeamFileFolderDoc };
}

function isFolderDescendant(
  folderId: string,
  ancestorId: string,
  folders: readonly TeamFileFolderDoc[]
): boolean {
  const parentById = new Map(
    folders.map((folder) => [folder.id, folder.parentId?.trim() || null] as const)
  );

  let current = parentById.get(folderId) ?? null;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    current = parentById.get(current) ?? null;
  }

  return false;
}

async function assertFolderParentIsValid(params: {
  readonly db: Firestore;
  readonly teamId: string;
  readonly folderId?: string;
  readonly parentId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parentId = params.parentId?.trim() || null;
  if (!parentId) {
    return { ok: true };
  }

  if (params.folderId && parentId === params.folderId) {
    return { ok: false, error: 'Folder cannot be its own parent.' };
  }

  const folders = await listTeamFileFoldersByScope(params.db, params.teamId);
  const parent = folders.find((folder) => folder.id === parentId);
  if (!parent) {
    return { ok: false, error: 'Parent folder not found.' };
  }

  if (params.folderId && isFolderDescendant(parentId, params.folderId, folders)) {
    return { ok: false, error: 'Folder cannot be moved inside its own tree.' };
  }

  return { ok: true };
}

async function resolveNextFolderSortOrder(
  db: Firestore,
  teamId: string,
  parentId: string | null
): Promise<number> {
  const folders = await listTeamFileFoldersByScope(db, teamId);
  const siblingSortOrders = folders
    .filter((folder) => (folder.parentId?.trim() || null) === (parentId?.trim() || null))
    .map((folder) => Number(folder.sortOrder ?? 0))
    .filter((value) => Number.isFinite(value));

  return siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;
}

async function reparentTeamFileFolderChildren(
  db: Firestore,
  teamId: string,
  folderId: string,
  nextParentId: string | null,
  updatedAt: string
): Promise<number> {
  const snap = await db
    .collection(TEAM_FILE_FOLDERS_COLLECTION)
    .where('teamId', '==', teamId)
    .where('parentId', '==', folderId)
    .limit(250)
    .get();

  if (snap.empty) {
    return 0;
  }

  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.set(
        {
          parentId: nextParentId,
          updatedAt,
        },
        { merge: true }
      )
    )
  );

  return snap.docs.length;
}

async function clearUniversalFileFolderAssignments(
  db: Firestore,
  teamId: string,
  folderId: string,
  updatedByUserId: string,
  updatedAt: string
): Promise<number> {
  const snap = await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('teamId', '==', teamId)
    .where('folderId', '==', folderId)
    .limit(250)
    .get();

  if (snap.empty) {
    return 0;
  }

  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.set(
        {
          folderId: null,
          updatedByUserId,
          updatedAt,
        },
        { merge: true }
      )
    )
  );

  return snap.docs.length;
}

async function invalidateTeamFileFolderCaches(teamId: string): Promise<void> {
  if (!teamId) {
    return;
  }

  try {
    const cache = getCacheService();
    await Promise.all([
      cache.del(`intel:team:${teamId}`),
      cache.del(`team:profile:${teamId}`),
      cache.del(`team:file_folders:${teamId}`),
    ]);
  } catch {
    // Best effort cache invalidation.
  }
}

async function loadUniversalFile(
  db: Firestore,
  documentId: string
): Promise<UniversalFileDoc | null> {
  const snapshot = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(documentId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toUniversalFile(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
}

abstract class UniversalTeamFolderToolBase extends BaseTool {
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  protected readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  protected requireUserId(context?: ToolExecutionContext): string | null {
    return context?.userId ?? null;
  }
}

export class ListTeamFileFoldersTool extends UniversalTeamFolderToolBase {
  readonly name = 'list_team_file_folders';
  readonly description =
    "List visible folders in the user's Files panel. Defaults to personal Files unless a shared/team teamId is explicitly provided.";

  readonly parameters = ListTeamFileFoldersInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListTeamFileFoldersInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const teamId = normalizeScopeTeamId(parsed.data.teamId);
    const accessState = await resolveFolderAccessState(this.db, userId);
    const folders = (await listTeamFileFoldersByScope(this.db, teamId)).filter((folder) =>
      canAccessFolderByGrantedKeys(folder, userId, accessState.grantedAccessKeys, 'read')
    );
    const canManageMutations =
      teamId.length === 0 ||
      accessState.teamIds.includes(teamId) ||
      folders.some((folder) =>
        canAccessFolderByGrantedKeys(folder, userId, accessState.grantedAccessKeys, 'write')
      );

    return {
      success: true,
      data: {
        teamId,
        count: folders.length,
        permissions: {
          canManageMutations,
        },
        folders,
      },
    };
  }
}

export class CreateTeamFileFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'create_team_file_folder';
  readonly description =
    "Create a folder in the user's Files panel. Defaults to personal Files unless a shared/team teamId is explicitly provided. Supports optional nesting through parentId.";

  readonly parameters = CreateTeamFileFolderInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateTeamFileFolderInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { folderId, teamId, name, parentId, sortOrder } = parsed.data;
    const accessState = await resolveFolderAccessState(this.db, userId);
    const requestedTeamId = normalizeScopeTeamId(teamId);
    const normalizedParentId = parentId?.trim() || null;
    let effectiveTeamId = requestedTeamId;
    if (normalizedParentId) {
      const parentDoc = await this.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .doc(normalizedParentId)
        .get();
      if (!parentDoc.exists) {
        return { success: false, error: `Parent folder ${normalizedParentId} not found.` };
      }
      const parentFolder = toTeamFileFolderDoc(
        parentDoc.id,
        (parentDoc.data() ?? {}) as Record<string, unknown>
      );
      if (
        !canAccessFolderByGrantedKeys(parentFolder, userId, accessState.grantedAccessKeys, 'write')
      ) {
        return {
          success: false,
          error: 'Not authorized to create a folder here. Read-only access cannot add folders.',
        };
      }

      const parentTeamId = resolveFolderTeamId(parentFolder);
      if (effectiveTeamId && parentTeamId !== effectiveTeamId) {
        return {
          success: false,
          error: 'Parent folder belongs to a different scope than the requested folder scope.',
        };
      }

      effectiveTeamId = parentTeamId;
    } else if (effectiveTeamId && !accessState.teamIds.includes(effectiveTeamId)) {
      return {
        success: false,
        error: 'Not authorized to create a root folder in that team scope.',
      };
    }

    const validParent = await assertFolderParentIsValid({
      db: this.db,
      teamId: effectiveTeamId,
      parentId: normalizedParentId,
    });
    if (!validParent.ok) {
      return { success: false, error: validParent.error };
    }

    const nextFolderId = folderId?.trim() || randomUUID();
    const now = new Date().toISOString();
    const nextSortOrder =
      sortOrder ?? (await resolveNextFolderSortOrder(this.db, effectiveTeamId, normalizedParentId));
    const inheritedAccess = await resolveCreatedFolderAccess({
      db: this.db,
      parentId: normalizedParentId,
      teamId: effectiveTeamId,
      ownerUserId: userId,
    });

    await this.db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(nextFolderId)
      .set({
        id: nextFolderId,
        teamId: effectiveTeamId,
        name: name.trim(),
        normalizedName: name.trim().toLowerCase(),
        ...(normalizedParentId ? { parentId: normalizedParentId } : {}),
        sortOrder: nextSortOrder,
        createdByUserId: userId,
        readAccessKeys: inheritedAccess.readAccessKeys,
        writeAccessKeys: inheritedAccess.writeAccessKeys,
        createdAt: now,
        updatedAt: now,
      });

    await invalidateTeamFileFolderCaches(effectiveTeamId);

    return {
      success: true,
      data: {
        folder: {
          id: nextFolderId,
          teamId: effectiveTeamId,
          name: name.trim(),
          normalizedName: name.trim().toLowerCase(),
          ...(normalizedParentId ? { parentId: normalizedParentId } : {}),
          sortOrder: nextSortOrder,
          createdByUserId: userId,
          readAccessKeys: inheritedAccess.readAccessKeys,
          writeAccessKeys: inheritedAccess.writeAccessKeys,
          createdAt: now,
          updatedAt: now,
        } satisfies TeamFileFolderDoc,
      },
    };
  }
}

export class UpdateTeamFileFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'update_team_file_folder';
  readonly description =
    'Rename, reparent, or adjust direct read/write access on an existing Files folder while preventing invalid parent cycles.';

  readonly parameters = UpdateTeamFileFolderInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateTeamFileFolderInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const folderRef = this.db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parsed.data.folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      return { success: false, error: `Folder ${parsed.data.folderId} not found.` };
    }

    const existing = toTeamFileFolderDoc(
      folderDoc.id,
      (folderDoc.data() ?? {}) as Record<string, unknown>
    );
    const existingTeamId = resolveFolderTeamId(existing);
    const accessState = await resolveFolderAccessState(this.db, userId);
    const hasAccessPatch =
      Object.prototype.hasOwnProperty.call(parsed.data, 'readAccessKeys') ||
      Object.prototype.hasOwnProperty.call(parsed.data, 'writeAccessKeys');
    if (
      hasAccessPatch &&
      !isFolderShareUpdateAllowed({
        userId,
        ownerUserId: existing.createdByUserId,
      })
    ) {
      return {
        success: false,
        error: 'Only the folder owner can update direct folder sharing.',
      };
    }
    if (!canAccessFolderByGrantedKeys(existing, userId, accessState.grantedAccessKeys, 'write')) {
      return {
        success: false,
        error: 'Not authorized to edit this folder. Read-only access cannot make changes.',
      };
    }

    const nextParentId =
      parsed.data.parentId === undefined ? existing.parentId?.trim() || null : parsed.data.parentId;
    if (nextParentId) {
      const targetParentDoc = await this.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .doc(nextParentId)
        .get();
      if (!targetParentDoc.exists) {
        return { success: false, error: 'Parent folder not found.' };
      }

      const targetParent = toTeamFileFolderDoc(
        targetParentDoc.id,
        (targetParentDoc.data() ?? {}) as Record<string, unknown>
      );
      if (resolveFolderTeamId(targetParent) !== existingTeamId) {
        return {
          success: false,
          error: 'Folder cannot be moved into a parent with a different scope.',
        };
      }
      if (
        !canAccessFolderByGrantedKeys(targetParent, userId, accessState.grantedAccessKeys, 'write')
      ) {
        return {
          success: false,
          error: 'Not authorized to move this folder into the selected parent.',
        };
      }
    }

    const validParent = await assertFolderParentIsValid({
      db: this.db,
      teamId: existingTeamId,
      folderId: existing.id,
      parentId: nextParentId,
    });
    if (!validParent.ok) {
      return { success: false, error: validParent.error };
    }

    const nextName = parsed.data.name?.trim() || existing.name;
    const nextSortOrder = parsed.data.sortOrder ?? existing.sortOrder;
    const normalizedParentId = nextParentId?.trim() || null;
    const nextAccess = hasAccessPatch
      ? resolveFolderAccessLists({
          ownerUserId: existing.createdByUserId,
          readAccessKeys: parsed.data.readAccessKeys ??
            existing.readAccessKeys ?? [toUserAccessKey(existing.createdByUserId)],
          writeAccessKeys: parsed.data.writeAccessKeys ??
            existing.writeAccessKeys ?? [toUserAccessKey(existing.createdByUserId)],
        })
      : {
          readAccessKeys: existing.readAccessKeys,
          writeAccessKeys: existing.writeAccessKeys,
        };
    const now = new Date().toISOString();

    await folderRef.set(
      {
        name: nextName,
        normalizedName: nextName.toLowerCase(),
        parentId: normalizedParentId,
        sortOrder: nextSortOrder,
        ...(nextAccess.readAccessKeys ? { readAccessKeys: nextAccess.readAccessKeys } : {}),
        ...(nextAccess.writeAccessKeys ? { writeAccessKeys: nextAccess.writeAccessKeys } : {}),
        updatedAt: now,
      },
      { merge: true }
    );

    await invalidateTeamFileFolderCaches(existingTeamId);

    return {
      success: true,
      data: {
        folder: {
          id: existing.id,
          teamId: existingTeamId,
          name: nextName,
          normalizedName: nextName.toLowerCase(),
          ...(normalizedParentId ? { parentId: normalizedParentId } : {}),
          sortOrder: nextSortOrder,
          createdByUserId: existing.createdByUserId,
          ...(nextAccess.readAccessKeys ? { readAccessKeys: nextAccess.readAccessKeys } : {}),
          ...(nextAccess.writeAccessKeys ? { writeAccessKeys: nextAccess.writeAccessKeys } : {}),
          createdAt: existing.createdAt,
          updatedAt: now,
        } satisfies TeamFileFolderDoc,
      },
    };
  }
}

export class DeleteTeamFileFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'delete_team_file_folder';
  readonly description =
    'Delete a Files folder, reparent child folders to the deleted folder parent, and unassign contained files.';

  readonly parameters = DeleteTeamFileFolderInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteTeamFileFolderInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const folderRef = this.db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parsed.data.folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      return { success: false, error: `Folder ${parsed.data.folderId} not found.` };
    }

    const folder = toTeamFileFolderDoc(
      folderDoc.id,
      (folderDoc.data() ?? {}) as Record<string, unknown>
    );
    const folderTeamId = resolveFolderTeamId(folder);
    const accessState = await resolveFolderAccessState(this.db, userId);
    if (!canAccessFolderByGrantedKeys(folder, userId, accessState.grantedAccessKeys, 'write')) {
      return {
        success: false,
        error: 'Not authorized to delete this folder. Read-only access cannot remove folders.',
      };
    }

    const now = new Date().toISOString();
    const nextParentId = folder.parentId?.trim() || null;
    const [reparentedFolderCount, unassignedDocumentCount] = await Promise.all([
      reparentTeamFileFolderChildren(this.db, folderTeamId, folder.id, nextParentId, now),
      clearUniversalFileFolderAssignments(this.db, folderTeamId, folder.id, userId, now),
    ]);

    await folderRef.delete();
    await invalidateTeamFileFolderCaches(folderTeamId);

    return {
      success: true,
      data: {
        deletedFolderId: folder.id,
        teamId: folderTeamId,
        reparentedFolderCount,
        unassignedDocumentCount,
      },
    };
  }
}

export class MoveUniversalFileToFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'move_universal_file_to_folder';
  readonly description =
    'Move a saved Files item into a visible Files folder, or pass folderId: null to move it back to the Files root.';

  readonly parameters = MoveUniversalFileToFolderInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = MoveUniversalFileToFolderInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const document = await loadUniversalFile(this.db, parsed.data.documentId);
    if (!document) {
      return { success: false, error: `Files item ${parsed.data.documentId} not found.` };
    }

    const documentTeamId = resolveUniversalFileTeamId(document);
    const accessState = await resolveFolderAccessState(this.db, userId);

    const folders = (await listTeamFileFoldersByScope(this.db, documentTeamId)).filter((folder) =>
      canAccessFolderByGrantedKeys(folder, userId, accessState.grantedAccessKeys, 'read')
    );
    const resolvedTarget = resolveTeamFileFolderTarget(folders, {
      folderId: parsed.data.folderId,
      folderName: parsed.data.folderName,
    });
    if ('error' in resolvedTarget) {
      return { success: false, error: resolvedTarget.error };
    }

    const [hasDocumentWriteAccess, hasTargetFolderWriteAccess] = await Promise.all([
      hasDirectUniversalFileWriteAccess(this.db, userId, document),
      resolvedTarget.folder
        ? hasDirectFolderWriteAccess(this.db, userId, resolvedTarget.folder)
        : Promise.resolve(true),
    ]);

    if (!hasDocumentWriteAccess || !hasTargetFolderWriteAccess) {
      return {
        success: false,
        error:
          'Not authorized to move this file into the selected folder. Read-only access cannot reorganize files.',
      };
    }

    const now = new Date().toISOString();
    const folderId = resolvedTarget.folder?.id ?? null;

    await this.db.collection(UNIVERSAL_FILES_COLLECTION).doc(document.id).set(
      {
        folderId,
        updatedByUserId: userId,
        updatedAt: now,
      },
      { merge: true }
    );

    await invalidateTeamFileFolderCaches(documentTeamId);

    return {
      success: true,
      data: {
        documentId: document.id,
        teamId: documentTeamId,
        folderId,
        folderName: resolvedTarget.folder?.name ?? null,
        fileType: document.type,
      },
    };
  }
}
