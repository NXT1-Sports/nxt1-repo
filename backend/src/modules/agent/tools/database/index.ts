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

export { WriteCoreIdentityTool } from './write-core-identity.tool.js';
export { WriteAwardsTool, AWARDS_COLLECTION } from './write-awards.tool.js';
export { WriteCombineMetricsTool } from './write-combine-metrics.tool.js';
export { WriteRankingsTool } from './write-rankings.tool.js';
export { WriteSeasonStatsTool } from './write-season-stats.tool.js';
export { WriteRecruitingActivityTool } from './write-recruiting-activity.tool.js';
export { WriteCalendarEventsTool } from './write-calendar-events.tool.js';
export { WriteAthleteVideosTool } from './write-athlete-videos.tool.js';
export { WriteIntelTool } from './write-intel.tool.js';
export { UpdateIntelTool } from './update-intel.tool.js';
export { SearchNxt1PlatformTool } from './search-nxt1-platform.tool.js';
export { QueryNxt1PlatformDataTool } from './query-nxt1-platform-data.tool.js';
export { SearchMemoryTool } from './search-memory.tool.js';
export { SearchCollegesTool } from './search-colleges.tool.js';
export { SearchCollegeCoachesTool } from './search-college-coaches.tool.js';
export { GetCollegeLogosTool } from './get-college-logos.tool.js';
export { GetConferenceLogosTool } from './get-conference-logos.tool.js';
export { TrackAnalyticsEventTool } from './track-analytics-event.tool.js';
export { GetAnalyticsSummaryTool } from './get-analytics-summary.tool.js';
export { DiscoverAnalyticsTemplatesTask } from './discover-analytics-templates.tool.js';
export { RegisterAnalyticsTemplateTask } from './register-analytics-template.tool.js';
export { SaveMemoryTool } from './save-memory.tool.js';
export { DeleteMemoryTool } from './delete-memory.tool.js';
export { WriteConnectedSourceTool } from './write-connected-source.tool.js';
export { WriteScheduleTool } from './write-schedule.tool.js';
export { WriteTeamStatsTool } from './write-team-stats.tool.js';
export { WriteTeamNewsTool } from './write-team-news.tool.js';
export { WriteTeamPostTool } from './write-team-post.tool.js';
export { WriteRosterEntriesTool } from './write-roster-entries.tool.js';
export { resolveCreatedAt, seasonToDate, yearToDate } from './doc-date-utils.js';
