/**
 * @fileoverview User trigger helpers
 * @module @nxt1/functions/user/helpers
 *
 * Shared helper functions for user-related triggers.
 */

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
