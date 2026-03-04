/**
 * @fileoverview Team Profile — Main Barrel Export
 * @module @nxt1/ui/team-profile
 *
 * Auto-resolved via tsconfig wildcard: @nxt1/ui/team-profile → packages/ui/src/team-profile/index.ts
 */
export { TeamProfileService } from './team-profile.service';
export { TeamProfileApiClient, TEAM_PROFILE_API_BASE_URL } from './team-profile-api.client';
export { TeamProfileShellWebComponent } from './web';
export { TeamPageHeaderComponent } from './web';
export { TeamMobileHeroComponent } from './web';
export { TeamOverviewWebComponent } from './web';
export { TeamTimelineWebComponent } from './web';
export { TeamVideosWebComponent } from './web';
export { TeamRosterWebComponent } from './web';
export { TeamRecruitingWebComponent } from './web';
export { TeamContactWebComponent } from './web';
export {
  MOCK_TEAM,
  MOCK_TEAM_FOLLOW_STATS,
  MOCK_TEAM_QUICK_STATS,
  MOCK_TEAM_ROSTER,
  MOCK_TEAM_SCHEDULE,
  MOCK_TEAM_STATS,
  MOCK_TEAM_STAFF,
  MOCK_TEAM_RECRUITING,
  MOCK_TEAM_POSTS,
  MOCK_TEAM_PROFILE_PAGE_DATA,
  getMockAdminTeamData,
} from './team-profile.mock-data';
