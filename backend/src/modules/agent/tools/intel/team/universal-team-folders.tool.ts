import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentFileAcl, TeamFileFolderDoc, UniversalFileDoc } from '@nxt1/core';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import {
  canManageTeamMutationForUser,
  canReadTeamIntelForUser,
} from '../../../../../services/team/team-intel-permissions.js';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  createOwnerPrivateAccessLists,
  resolveFileAccessContext,
  toUserAccessKey,
} from '../../../../../services/team/file-access-keys.service.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAMS_COLLECTION = 'Teams' as const;
const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;
const AccessKeyArraySchema = z.array(z.string().trim().min(1)).max(250);

const ListTeamFileFoldersInputSchema = z.object({
  teamId: z.string().trim().min(1),
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
  teamId: z.string().trim().min(1),
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
  readonly hasManagePermission: boolean;
}): boolean {
  return input.hasManagePermission || input.userId === input.ownerUserId;
}

async function hasDirectFolderWriteAccess(
  db: Firestore,
  userId: string,
  folder: TeamFileFolderDoc
): Promise<boolean> {
  const writeAccessKeys = folder.writeAccessKeys ?? [];
  if (writeAccessKeys.length === 0) {
    return false;
  }

  const accessContext = await resolveFileAccessContext(db, userId);
  return canAccessByKeys(writeAccessKeys, buildGrantedAccessKeys(accessContext));
}

async function resolveCreatedFolderAccess(input: {
  readonly db: Firestore;
  readonly parentId: string | null;
  readonly teamId: string;
  readonly ownerUserId: string;
}): Promise<{
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
}> {
  const ownerScopedAccess = createOwnerPrivateAccessLists({ ownerUserId: input.ownerUserId });
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

function compareTeamFileFolders(
  left: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>,
  right: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>
): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

async function assertTeamPermission(
  db: Firestore,
  teamId: string,
  userId: string,
  mode: 'read' | 'manage'
): Promise<{ ok: true; teamData: Record<string, unknown> } | { ok: false; error: string }> {
  const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
  if (!teamDoc.exists) {
    return { ok: false, error: `Team ${teamId} not found.` };
  }

  const teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
  const authorized =
    mode === 'read'
      ? await canReadTeamIntelForUser(db, userId, teamId, teamData)
      : await canManageTeamMutationForUser(db, userId, teamId, teamData);

  if (!authorized) {
    return {
      ok: false,
      error:
        mode === 'read'
          ? 'Not authorized to read team folders for this team.'
          : 'Not authorized to manage team folders for this team.',
    };
  }

  return { ok: true, teamData };
}

async function listTeamFileFolders(
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
      return { error: `Team file folder ${targetId} was not found for this team.` };
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
    return { error: `No team file folder named "${targetName}" was found for this team.` };
  }

  if (matches.length > 1) {
    return {
      error:
        `Multiple team file folders are named "${targetName}". ` +
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

  const folders = await listTeamFileFolders(params.db, params.teamId);
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
  const folders = await listTeamFileFolders(db, teamId);
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
  readonly entityGroup = 'team_tools' as const;

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
    'List Team File folders for the Files panel so Agent X can organize universal files and generated documents.';

  readonly parameters = ListTeamFileFoldersInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
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

    const permission = await assertTeamPermission(this.db, parsed.data.teamId, userId, 'read');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const folders = await listTeamFileFolders(this.db, parsed.data.teamId);
    return {
      success: true,
      data: {
        teamId: parsed.data.teamId,
        count: folders.length,
        folders,
      },
    };
  }
}

export class CreateTeamFileFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'create_team_file_folder';
  readonly description =
    'Create a Team File folder for the Files panel. Supports optional nesting through parentId.';

  readonly parameters = CreateTeamFileFolderInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
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
    const permission = await assertTeamPermission(this.db, teamId, userId, 'manage');
    const normalizedParentId = parentId?.trim() || null;
    let hasDirectParentWriteAccess = false;
    if (!permission.ok && normalizedParentId) {
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
      hasDirectParentWriteAccess = await hasDirectFolderWriteAccess(this.db, userId, parentFolder);
    }
    if (!permission.ok && !hasDirectParentWriteAccess) {
      return {
        success: false,
        error: 'Not authorized to create a folder here. Read-only access cannot add folders.',
      };
    }

    const validParent = await assertFolderParentIsValid({
      db: this.db,
      teamId,
      parentId: normalizedParentId,
    });
    if (!validParent.ok) {
      return { success: false, error: validParent.error };
    }

    const nextFolderId = folderId?.trim() || randomUUID();
    const now = new Date().toISOString();
    const nextSortOrder =
      sortOrder ?? (await resolveNextFolderSortOrder(this.db, teamId, normalizedParentId));
    const inheritedAccess = await resolveCreatedFolderAccess({
      db: this.db,
      parentId: normalizedParentId,
      teamId,
      ownerUserId: userId,
    });

    await this.db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(nextFolderId)
      .set({
        id: nextFolderId,
        teamId,
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

    await invalidateTeamFileFolderCaches(teamId);

    return {
      success: true,
      data: {
        folder: {
          id: nextFolderId,
          teamId,
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
    'Rename, reparent, or adjust direct read/write access on an existing Team File folder while preventing invalid parent cycles.';

  readonly parameters = UpdateTeamFileFolderInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
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
    const hasAccessPatch =
      Object.prototype.hasOwnProperty.call(parsed.data, 'readAccessKeys') ||
      Object.prototype.hasOwnProperty.call(parsed.data, 'writeAccessKeys');
    const permission = await assertTeamPermission(this.db, existing.teamId, userId, 'manage');
    if (
      hasAccessPatch &&
      !isFolderShareUpdateAllowed({
        userId,
        ownerUserId: existing.createdByUserId,
        hasManagePermission: permission.ok,
      })
    ) {
      return {
        success: false,
        error: 'Only the folder owner or a team manager can update direct folder sharing.',
      };
    }
    const hasDirectWriteAccess = permission.ok
      ? true
      : await hasDirectFolderWriteAccess(this.db, userId, existing);
    if (!permission.ok && !hasDirectWriteAccess) {
      return {
        success: false,
        error: 'Not authorized to edit this folder. Read-only access cannot make changes.',
      };
    }

    const nextParentId =
      parsed.data.parentId === undefined ? existing.parentId?.trim() || null : parsed.data.parentId;
    const validParent = await assertFolderParentIsValid({
      db: this.db,
      teamId: existing.teamId,
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

    await invalidateTeamFileFolderCaches(existing.teamId);

    return {
      success: true,
      data: {
        folder: {
          id: existing.id,
          teamId: existing.teamId,
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
    'Delete a Team File folder, reparent child folders to the deleted folder parent, and unassign contained files.';

  readonly parameters = DeleteTeamFileFolderInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
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
    const permission = await assertTeamPermission(this.db, folder.teamId, userId, 'manage');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const now = new Date().toISOString();
    const nextParentId = folder.parentId?.trim() || null;
    const [reparentedFolderCount, unassignedDocumentCount] = await Promise.all([
      reparentTeamFileFolderChildren(this.db, folder.teamId, folder.id, nextParentId, now),
      clearUniversalFileFolderAssignments(this.db, folder.teamId, folder.id, userId, now),
    ]);

    await folderRef.delete();
    await invalidateTeamFileFolderCaches(folder.teamId);

    return {
      success: true,
      data: {
        deletedFolderId: folder.id,
        teamId: folder.teamId,
        reparentedFolderCount,
        unassignedDocumentCount,
      },
    };
  }
}

export class MoveUniversalFileToFolderTool extends UniversalTeamFolderToolBase {
  readonly name = 'move_universal_file_to_folder';
  readonly description =
    'Move a universal file or generated document into a Team File folder, or pass folderId: null to move it back to the root.';

  readonly parameters = MoveUniversalFileToFolderInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
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
      return { success: false, error: `Universal file ${parsed.data.documentId} not found.` };
    }

    const permission = await assertTeamPermission(this.db, document.teamId, userId, 'manage');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const folders = await listTeamFileFolders(this.db, document.teamId);
    const resolvedTarget = resolveTeamFileFolderTarget(folders, {
      folderId: parsed.data.folderId,
      folderName: parsed.data.folderName,
    });
    if ('error' in resolvedTarget) {
      return { success: false, error: resolvedTarget.error };
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

    await invalidateTeamFileFolderCaches(document.teamId);

    return {
      success: true,
      data: {
        documentId: document.id,
        teamId: document.teamId,
        folderId,
        folderName: resolvedTarget.folder?.name ?? null,
        fileType: document.type,
      },
    };
  }
}
