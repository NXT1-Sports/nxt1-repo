export type DurableLogoEntity = 'organization' | 'team';

export type LogoRepairDecision =
  | {
      readonly kind: 'canonical';
      readonly destinationPath: string;
    }
  | {
      readonly kind: 'promote';
      readonly destinationPath: string;
      readonly sourcePath: string;
      readonly sourceKind: 'bare-path' | 'firebase-url' | 'gcs-url';
    }
  | {
      readonly kind: 'skip';
      readonly reason:
        | 'empty'
        | 'external-url'
        | 'foreign-bucket'
        | 'malformed-storage-url'
        | 'unsafe-storage-path';
    };

function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isSafeStoragePath(storagePath: string): boolean {
  return (
    /^(?:Users|Teams|Organizations)\/.+/.test(storagePath) &&
    !storagePath.split('/').some((segment) => segment === '..' || segment.length === 0)
  );
}

function getFirebaseStorageReference(url: URL): { bucketName: string; storagePath: string } | null {
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;

  const bucketName = decodePath(match[1]);
  const storagePath = decodePath(match[2]);
  return bucketName && storagePath ? { bucketName, storagePath } : null;
}

function getGcsStorageReference(url: URL): { bucketName: string; storagePath: string } | null {
  const pathname = url.pathname.replace(/^\/+/, '');
  const separatorIndex = pathname.indexOf('/');
  if (separatorIndex === -1) return null;

  const bucketName = decodePath(pathname.slice(0, separatorIndex));
  const storagePath = decodePath(pathname.slice(separatorIndex + 1));
  return bucketName && storagePath ? { bucketName, storagePath } : null;
}

function isTokenizedFirebaseUrl(url: URL): boolean {
  return (
    url.searchParams.get('alt') === 'media' &&
    (url.searchParams.get('token')?.trim().length ?? 0) > 0
  );
}

export function durableLogoDestinationPath(entity: DurableLogoEntity, entityId: string): string {
  return entity === 'organization' ? `Organizations/${entityId}/logo` : `Teams/${entityId}/logo`;
}

export function classifyLogoForDurableRepair(params: {
  readonly bucketName: string;
  readonly entity: DurableLogoEntity;
  readonly entityId: string;
  readonly logoUrl: string | null | undefined;
}): LogoRepairDecision {
  const destinationPath = durableLogoDestinationPath(params.entity, params.entityId);
  const rawValue = params.logoUrl?.trim() ?? '';
  if (!rawValue) return { kind: 'skip', reason: 'empty' };

  const bareStoragePath = rawValue.replace(/^\/+/, '');
  if (/^(?:Users|Teams|Organizations)\//.test(bareStoragePath)) {
    if (!isSafeStoragePath(bareStoragePath)) {
      return { kind: 'skip', reason: 'unsafe-storage-path' };
    }
    return {
      kind: 'promote',
      sourceKind: 'bare-path',
      sourcePath: bareStoragePath,
      destinationPath,
    };
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    return { kind: 'skip', reason: 'malformed-storage-url' };
  }

  if (url.hostname === 'firebasestorage.googleapis.com') {
    const reference = getFirebaseStorageReference(url);
    if (!reference) return { kind: 'skip', reason: 'malformed-storage-url' };
    if (reference.bucketName !== params.bucketName) {
      return { kind: 'skip', reason: 'foreign-bucket' };
    }
    if (!isSafeStoragePath(reference.storagePath)) {
      return { kind: 'skip', reason: 'unsafe-storage-path' };
    }
    if (reference.storagePath === destinationPath && isTokenizedFirebaseUrl(url)) {
      return { kind: 'canonical', destinationPath };
    }
    return {
      kind: 'promote',
      sourceKind: 'firebase-url',
      sourcePath: reference.storagePath,
      destinationPath,
    };
  }

  if (url.hostname === 'storage.googleapis.com') {
    const reference = getGcsStorageReference(url);
    if (!reference) return { kind: 'skip', reason: 'malformed-storage-url' };
    if (reference.bucketName !== params.bucketName) {
      return { kind: 'skip', reason: 'foreign-bucket' };
    }
    if (!isSafeStoragePath(reference.storagePath)) {
      return { kind: 'skip', reason: 'unsafe-storage-path' };
    }
    return {
      kind: 'promote',
      sourceKind: 'gcs-url',
      sourcePath: reference.storagePath,
      destinationPath,
    };
  }

  return { kind: 'skip', reason: 'external-url' };
}
