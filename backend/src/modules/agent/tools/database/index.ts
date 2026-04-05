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
export { WriteCoreIdentityTool } from './write-core-identity.tool.js';
export { WriteCombineMetricsTool } from './write-combine-metrics.tool.js';
export { WriteSeasonStatsTool } from './write-season-stats.tool.js';
export { WriteRecruitingActivityTool } from './write-recruiting-activity.tool.js';
export { WriteCalendarEventsTool } from './write-calendar-events.tool.js';
export { WriteAthleteVideosTool } from './write-athlete-videos.tool.js';
export { SearchKnowledgeBaseTool } from './search-knowledge-base.tool.js';
export { SearchCollegesTool } from './search-colleges.tool.js';
