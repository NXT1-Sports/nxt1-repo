export interface OAuthNameFields {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
}

export function extractAppleNameFieldsFromAuthResult(input: {
  user?: {
    displayName?: string | null;
    email?: string | null;
  } | null;
  additionalUserInfo?: {
    profile?: unknown;
  } | null;
  _tokenResponse?: unknown;
}): OAuthNameFields {
  const profileFields = extractNameFieldsFromRecord(asRecord(input.additionalUserInfo?.profile));
  const tokenFields = extractNameFieldsFromRecord(asRecord(input._tokenResponse));

  const firstName = tokenFields.firstName ?? profileFields.firstName;
  const lastName = tokenFields.lastName ?? profileFields.lastName;

  if (firstName || lastName) {
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
    return {
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(displayName ? { displayName } : {}),
    };
  }

  const displayName = input.user?.displayName?.trim();
  const email = input.user?.email?.trim();

  if (!displayName || isLikelySyntheticProviderDisplayName(displayName, email)) {
    return {};
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  const derivedFirstName = parts[0];
  const derivedLastName = parts.slice(1).join(' ') || undefined;

  return {
    ...(derivedFirstName ? { firstName: derivedFirstName } : {}),
    ...(derivedLastName ? { lastName: derivedLastName } : {}),
    displayName,
  };
}

function extractNameFieldsFromRecord(record?: Record<string, unknown>): OAuthNameFields {
  if (!record) {
    return {};
  }

  const firstName = readString(
    record['firstName'],
    record['first_name'],
    record['givenName'],
    record['given_name']
  );
  const lastName = readString(
    record['lastName'],
    record['last_name'],
    record['familyName'],
    record['family_name']
  );
  const joinedDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
  const displayName =
    readString(record['displayName'], record['display_name'], record['fullName'], record['name']) ??
    joinedDisplayName;

  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

function isLikelySyntheticProviderDisplayName(
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
