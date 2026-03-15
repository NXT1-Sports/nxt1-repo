/**
 * @fileoverview Database Tools
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Tools for reading and writing data in Firestore/MongoDB.
 *
 * Planned tools:
 * - FetchPlayerStatsTool     — Get verified stats by userId and sport
 * - FetchPlayerProfileTool   — Get full athlete profile
 * - SearchRosterTool         — Search team rosters
 * - QueryCollegeProgramsTool — Find colleges by division, conference, state
 * - GetRecruitingActivityTool — Get recent recruiting pings/activity
 */

export { UpdateAthleteProfileTool } from './update-athlete-profile.tool.js';
export { UpdateTeamProfileTool } from './update-team-profile.tool.js';
