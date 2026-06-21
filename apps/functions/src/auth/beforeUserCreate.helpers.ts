/**
 * Filter provider display names that are really email-local-part fallbacks
 * (for example Apple private relay aliases like `john.keller-1`).
 */
export function isLikelySyntheticProviderDisplayName(
  displayName?: string | null,
  email?: string | null
): boolean {
  const trimmedDisplayName = displayName?.trim();
  if (!trimmedDisplayName) {
    return false;
  }

  const normalizedDisplayName = trimmedDisplayName.toLowerCase();
  const normalizedEmailLocalPart = email?.split('@')[0]?.trim().toLowerCase();

  if (normalizedEmailLocalPart && normalizedDisplayName === normalizedEmailLocalPart) {
    return true;
  }

  if (trimmedDisplayName.includes('@') || trimmedDisplayName.includes(' ')) {
    return false;
  }

  if (trimmedDisplayName.includes('.') || trimmedDisplayName.includes('_')) {
    return true;
  }

  return /-\d+$/.test(trimmedDisplayName);
}

export function extractProviderNameFields(source?: Record<string, unknown> | null): {
  firstName?: string;
  lastName?: string;
  displayName?: string;
} {
  if (!source) {
    return {};
  }

  const firstName = readString(
    source['firstName'],
    source['first_name'],
    source['givenName'],
    source['given_name']
  );
  const lastName = readString(
    source['lastName'],
    source['last_name'],
    source['familyName'],
    source['family_name']
  );
  const joinedDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
  const displayName =
    readString(source['displayName'], source['display_name'], source['fullName'], source['name']) ??
    joinedDisplayName;

  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

export function getNameFields(
  displayName?: string | null,
  email?: string | null,
  explicitNames?: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  }
): {
  firstName?: string;
  lastName?: string;
  displayName?: string;
} {
  const explicitFirstName = explicitNames?.firstName?.trim();
  const explicitLastName = explicitNames?.lastName?.trim();
  const explicitDisplayName = explicitNames?.displayName?.trim();

  if (explicitFirstName || explicitLastName) {
    const resolvedDisplayName =
      [explicitFirstName, explicitLastName].filter(Boolean).join(' ').trim() ||
      explicitDisplayName ||
      undefined;

    return {
      ...(explicitFirstName ? { firstName: explicitFirstName } : {}),
      ...(explicitLastName ? { lastName: explicitLastName } : {}),
      ...(resolvedDisplayName ? { displayName: resolvedDisplayName } : {}),
    };
  }

  const trimmedDisplayName = displayName?.trim();
  if (!trimmedDisplayName) {
    return {};
  }

  if (isLikelySyntheticProviderDisplayName(trimmedDisplayName, email)) {
    return {};
  }

  const parts = trimmedDisplayName.split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || undefined;

  return {
    displayName: trimmedDisplayName,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}
