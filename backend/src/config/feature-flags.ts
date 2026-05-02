/**
 * @fileoverview Backend feature flags
 * @module @nxt1/backend/config/feature-flags
 */

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Team Intel feature switch.
 * Defaults to false so Team Intel stays hidden until explicitly re-enabled.
 */
export function isTeamIntelEnabled(): boolean {
  return parseBooleanFlag(process.env['ENABLE_TEAM_INTEL'], false);
}
