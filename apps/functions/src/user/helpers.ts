/**
 * @fileoverview Profile Completeness Helper
 * @module @nxt1/functions/user/helpers
 *
 * Shared helper functions for user-related triggers.
 */

/**
 * Calculate profile completeness percentage
 */
export function calculateProfileCompleteness(userData: FirebaseFirestore.DocumentData): number {
  const hasPrimarySport = !!getPrimarySportName(userData);
  const hasPrimaryPositions = hasPrimarySportPositions(userData);
  const fields = [
    'displayName',
    'photoURL',
    'bio',
    'location',
    'highSchool',
    'graduationYear',
    'height',
    'weight',
    'gpa',
  ];

  const filledFields = fields.filter((field) => {
    const value = userData[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== '';
  });

  const completeFieldCount =
    filledFields.length + Number(hasPrimarySport) + Number(hasPrimaryPositions);
  const totalFieldCount = fields.length + 2;

  return Math.round((completeFieldCount / totalFieldCount) * 100);
}

function getSportProfiles(
  userData: FirebaseFirestore.DocumentData
): Array<Record<string, unknown>> {
  const sports = userData['sports'];
  return Array.isArray(sports)
    ? sports.filter(
        (sport): sport is Record<string, unknown> => !!sport && typeof sport === 'object'
      )
    : [];
}

function getPrimarySportProfile(
  userData: FirebaseFirestore.DocumentData
): Record<string, unknown> | undefined {
  const sports = getSportProfiles(userData);
  return sports.find((sport) => sport['order'] === 0) ?? sports[0];
}

export function getPrimarySportName(userData: FirebaseFirestore.DocumentData): string | undefined {
  const sport = getPrimarySportProfile(userData)?.['sport'];
  if (typeof sport === 'string' && sport.trim().length > 0) {
    return sport.trim();
  }

  const legacySport = userData['primarySport'];
  return typeof legacySport === 'string' && legacySport.trim().length > 0
    ? legacySport.trim()
    : undefined;
}

function hasPrimarySportPositions(userData: FirebaseFirestore.DocumentData): boolean {
  const positions = getPrimarySportProfile(userData)?.['positions'];
  if (Array.isArray(positions)) {
    return positions.length > 0;
  }

  const legacyPositions = userData['positions'];
  return Array.isArray(legacyPositions) && legacyPositions.length > 0;
}
