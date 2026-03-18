/**
 * @fileoverview Distillers — Barrel Export
 * @module @nxt1/backend/modules/agent/tools/scraping/distillers
 *
 * All profile extraction goes through the Universal AI Distiller.
 * Platform-specific TS distillers have been removed — LLM extraction
 * handles all sites (MaxPreps, Hudl, 247Sports, and 50+ others).
 */

export type {
  DistilledProfile,
  DistilledProfileIndex,
  DistilledSectionKey,
  DistilledIdentity,
  DistilledAcademics,
  DistilledSportInfo,
  DistilledTeam,
  DistilledCoach,
  DistilledMetric,
  DistilledSeasonStats,
  DistilledStatColumn,
  DistilledGameEntry,
  DistilledScheduleEvent,
  DistilledRecruitingActivity,
  DistilledAward,
} from './distiller.types.js';

export { distillWithAI, preprocessMarkdown } from './universal-ai.distiller.js';

// ─── buildProfileIndex ──────────────────────────────────────────────────────

import type {
  DistilledProfile,
  DistilledProfileIndex,
  DistilledSectionKey,
} from './distiller.types.js';

/**
 * Build a lightweight index/manifest from a DistilledProfile.
 * This is what the agent sees first — it decides which sections to read.
 */
export function buildProfileIndex(profile: DistilledProfile): DistilledProfileIndex {
  const sections: DistilledSectionKey[] = [];

  if (profile.identity) sections.push('identity');
  if (profile.academics) sections.push('academics');
  if (profile.sportInfo) sections.push('sportInfo');
  if (profile.team) sections.push('team');
  if (profile.coach) sections.push('coach');
  if (profile.metrics?.length) sections.push('metrics');
  if (profile.seasonStats?.length) sections.push('seasonStats');
  if (profile.schedule?.length) sections.push('schedule');
  if (profile.videos?.length) sections.push('videos');
  if (profile.recruiting?.length) sections.push('recruiting');
  if (profile.awards?.length) sections.push('awards');

  return {
    platform: profile.platform,
    profileUrl: profile.profileUrl,
    availableSections: sections,
    summary: {
      hasIdentity: !!profile.identity,
      hasAcademics: !!profile.academics,
      hasSportInfo: !!profile.sportInfo,
      hasTeam: !!profile.team,
      hasCoach: !!profile.coach,
      metricsCount: profile.metrics?.length ?? 0,
      seasonsCount: profile.seasonStats?.length ?? 0,
      scheduleEventsCount: profile.schedule?.length ?? 0,
      videosCount: profile.videos?.length ?? 0,
      recruitingActivitiesCount: profile.recruiting?.length ?? 0,
      awardsCount: profile.awards?.length ?? 0,
    },
  };
}
