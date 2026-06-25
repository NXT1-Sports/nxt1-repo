import type { Firestore } from 'firebase-admin/firestore';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';

const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;

type AccessSnapshot = {
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
};

export interface PropagateFolderShareAccessParams {
  readonly db: Firestore;
  readonly folderId: string;
  readonly previousAccess: AccessSnapshot;
  readonly nextAccess: AccessSnapshot;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
}

export interface PropagateFolderShareAccessResult {
  readonly updatedFolderCount: number;
  readonly updatedFileCount: number;
}

function getStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function uniqueAccessKeys(keys: readonly string[]): readonly string[] {
  return [...new Set(keys.filter((key) => key.trim().length > 0))];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getSourceFolderId(data: Record<string, unknown>): string | null {
  const acl = data['acl'];
  if (!acl || typeof acl !== 'object') {
    return null;
  }

  const mode =
    typeof (acl as { mode?: unknown }).mode === 'string' ? (acl as { mode: string }).mode : '';
  const sourceFolderId =
    typeof (acl as { sourceFolderId?: unknown }).sourceFolderId === 'string'
      ? (acl as { sourceFolderId: string }).sourceFolderId.trim()
      : '';

  return mode === 'copied_from_folder' && sourceFolderId.length > 0 ? sourceFolderId : null;
}

function resolveCurrentAccessKeys(
  data: Record<string, unknown>,
  field: 'readAccessKeys' | 'writeAccessKeys',
  fallback: readonly string[]
): readonly string[] {
  const explicit = getStringArray(data[field]);
  return explicit.length > 0 ? explicit : fallback;
}

function shouldPropagateFromParent(params: {
  readonly data: Record<string, unknown>;
  readonly parentFolderId: string;
  readonly parentAccess: AccessSnapshot;
  readonly currentAccess: AccessSnapshot;
}): boolean {
  const inheritedSourceFolderId = getSourceFolderId(params.data);
  if (inheritedSourceFolderId === params.parentFolderId) {
    return true;
  }

  return (
    arraysEqual(params.currentAccess.readAccessKeys, params.parentAccess.readAccessKeys) &&
    arraysEqual(params.currentAccess.writeAccessKeys, params.parentAccess.writeAccessKeys)
  );
}

function applyAccessDelta(params: {
  readonly currentAccessKeys: readonly string[];
  readonly previousParentAccessKeys: readonly string[];
  readonly nextParentAccessKeys: readonly string[];
}): readonly string[] {
  const removedKeys = new Set(
    params.previousParentAccessKeys.filter((key) => !params.nextParentAccessKeys.includes(key))
  );
  const nextKeys = params.currentAccessKeys.filter((key) => !removedKeys.has(key));

  for (const addedKey of params.nextParentAccessKeys) {
    if (!nextKeys.includes(addedKey)) {
      nextKeys.push(addedKey);
    }
  }

  return uniqueAccessKeys(nextKeys);
}

export async function propagateInheritedFolderShareAccess(
  params: PropagateFolderShareAccessParams
): Promise<PropagateFolderShareAccessResult> {
  const counts = {
    updatedFolderCount: 0,
    updatedFileCount: 0,
  };

  const pendingFolders: Array<{
    readonly folderId: string;
    readonly previousAccess: AccessSnapshot;
    readonly nextAccess: AccessSnapshot;
  }> = [
    {
      folderId: params.folderId,
      previousAccess: {
        readAccessKeys: uniqueAccessKeys(params.previousAccess.readAccessKeys),
        writeAccessKeys: uniqueAccessKeys(params.previousAccess.writeAccessKeys),
      },
      nextAccess: {
        readAccessKeys: uniqueAccessKeys(params.nextAccess.readAccessKeys),
        writeAccessKeys: uniqueAccessKeys(params.nextAccess.writeAccessKeys),
      },
    },
  ];

  while (pendingFolders.length > 0) {
    const current = pendingFolders.shift();
    if (!current) {
      continue;
    }

    const [childFoldersSnapshot, childFilesSnapshot] = await Promise.all([
      params.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .where('parentId', '==', current.folderId)
        .get(),
      params.db
        .collection(UNIVERSAL_FILES_COLLECTION)
        .where('folderId', '==', current.folderId)
        .get(),
    ]);

    for (const childFolderDoc of childFoldersSnapshot.docs) {
      const childFolderData = (childFolderDoc.data() ?? {}) as Record<string, unknown>;
      const currentAccess: AccessSnapshot = {
        readAccessKeys: resolveCurrentAccessKeys(
          childFolderData,
          'readAccessKeys',
          current.previousAccess.readAccessKeys
        ),
        writeAccessKeys: resolveCurrentAccessKeys(
          childFolderData,
          'writeAccessKeys',
          current.previousAccess.writeAccessKeys
        ),
      };

      if (
        !shouldPropagateFromParent({
          data: childFolderData,
          parentFolderId: current.folderId,
          parentAccess: current.previousAccess,
          currentAccess,
        })
      ) {
        continue;
      }

      const nextAccess: AccessSnapshot = {
        readAccessKeys: applyAccessDelta({
          currentAccessKeys: currentAccess.readAccessKeys,
          previousParentAccessKeys: current.previousAccess.readAccessKeys,
          nextParentAccessKeys: current.nextAccess.readAccessKeys,
        }),
        writeAccessKeys: applyAccessDelta({
          currentAccessKeys: currentAccess.writeAccessKeys,
          previousParentAccessKeys: current.previousAccess.writeAccessKeys,
          nextParentAccessKeys: current.nextAccess.writeAccessKeys,
        }),
      };

      await childFolderDoc.ref.set(
        {
          readAccessKeys: nextAccess.readAccessKeys,
          writeAccessKeys: nextAccess.writeAccessKeys,
          updatedByUserId: params.updatedByUserId,
          updatedAt: params.updatedAt,
        },
        { merge: true }
      );

      counts.updatedFolderCount += 1;
      pendingFolders.push({
        folderId: childFolderDoc.id,
        previousAccess: currentAccess,
        nextAccess,
      });
    }

    for (const childFileDoc of childFilesSnapshot.docs) {
      const childFileData = (childFileDoc.data() ?? {}) as Record<string, unknown>;
      const currentAccess: AccessSnapshot = {
        readAccessKeys: resolveCurrentAccessKeys(
          childFileData,
          'readAccessKeys',
          current.previousAccess.readAccessKeys
        ),
        writeAccessKeys: resolveCurrentAccessKeys(
          childFileData,
          'writeAccessKeys',
          current.previousAccess.writeAccessKeys
        ),
      };

      if (
        !shouldPropagateFromParent({
          data: childFileData,
          parentFolderId: current.folderId,
          parentAccess: current.previousAccess,
          currentAccess,
        })
      ) {
        continue;
      }

      const nextAccess: AccessSnapshot = {
        readAccessKeys: applyAccessDelta({
          currentAccessKeys: currentAccess.readAccessKeys,
          previousParentAccessKeys: current.previousAccess.readAccessKeys,
          nextParentAccessKeys: current.nextAccess.readAccessKeys,
        }),
        writeAccessKeys: applyAccessDelta({
          currentAccessKeys: currentAccess.writeAccessKeys,
          previousParentAccessKeys: current.previousAccess.writeAccessKeys,
          nextParentAccessKeys: current.nextAccess.writeAccessKeys,
        }),
      };

      await childFileDoc.ref.set(
        {
          readAccessKeys: nextAccess.readAccessKeys,
          writeAccessKeys: nextAccess.writeAccessKeys,
          updatedByUserId: params.updatedByUserId,
          updatedAt: params.updatedAt,
        },
        { merge: true }
      );

      counts.updatedFileCount += 1;
    }
  }

  return counts;
}
