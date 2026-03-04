/**
 * @fileoverview Marketing Components Barrel Export
 * @module apps/web/features/marketing/components
 *
 * Marketing-only section components extracted from @nxt1/ui.
 * These components are used exclusively by persona landing pages
 * and sport-landing pages within the web app.
 *
 * Components that remain in @nxt1/ui (shared across features):
 * - stats-bar, feature-showcase, audience-section, site-footer (used by feature landing pages)
 * - cta-banner, faq-section, hero-section (used by super-profiles, etc.)
 * - icon, section-header, app-store-badges, cta-button, logo (core primitives)
 */

// ============================================
// HERO SECTIONS
// ============================================
export { NxtD1DreamHeroComponent, type D1DreamHeadingLevel } from './d1-dream-hero';
export { NxtOpenDoorsHeroComponent } from './open-doors-hero';
export { NxtUnfairAdvantageHeroComponent } from './unfair-advantage-hero';

// ============================================
// AI / AGENT X SECTIONS
// ============================================
export { NxtAgentXHypeMachineSectionComponent } from './agent-x-hype-machine-section';
export {
  NxtSuccessSimulationSectionComponent,
  type SuccessSimulationScenario,
} from './success-simulation-section';
export { NxtLimitlessBoxSectionComponent, type LimitlessBurstNode } from './limitless-box-section';

// ============================================
// FEATURE SHOWCASE SECTIONS
// ============================================
export {
  NxtGetItDoneWorkflowSectionComponent,
  type GetItDoneWorkflow,
  type GetItDoneWorkflowStep,
} from './get-it-done-workflow-section';
export {
  NxtHighlightEngineActionSectionComponent,
  type HighlightEngineStep,
} from './highlight-engine-action-section';
export { NxtXpLeaderboardSectionComponent } from './xp-leaderboard-section';

// ============================================
// RECRUITING SECTIONS
// ============================================
export {
  NxtRecruitingEmailAssistantSectionComponent,
  type RecruitingEmailAssistantDraft,
} from './recruiting-email-assistant-section';
export {
  NxtRecruitingRadarSectionComponent,
  type RecruitingRadarEvent,
} from './recruiting-radar-section';
export { NxtRecruitingCommandCenterSectionComponent } from './recruiting-command-center-section';
export {
  NxtOpportunityRadarSectionComponent,
  type OpportunityRadarSchoolMatch,
} from './opportunity-radar-section';
export { NxtCommunicationCenterSectionComponent } from './communication-center-section';

// ============================================
// PAIN POINT / COMPARISON SECTIONS
// ============================================
export {
  NxtInvisibleAthletePainPointComponent,
  type InvisibleAthleteSignal,
} from './invisible-athlete-pain-point';
export {
  NxtKillerComparisonComponent,
  type KillerComparisonRow,
  KILLER_COMPARISON_DEFAULT_ROWS,
} from './nxt1-killer-comparison';

// ============================================
// SOCIAL PROOF / MARQUEE SECTIONS
// ============================================
export {
  NxtLockerRoomTalkMarqueeComponent,
  type LockerRoomReviewItem,
} from './locker-room-talk-marquee';
export { NxtDraftClassTickerComponent, type DraftClassAthleteCard } from './draft-class-ticker';

// ============================================
// COACHES / NETWORK SECTIONS
// ============================================
export { NxtCoachRolodexComponent, type CollegeLogo } from './coach-rolodex';
export {
  NxtCoachesNetworkAuthorityComponent,
  type CoachesNetworkLogo,
} from './coaches-network-authority';
