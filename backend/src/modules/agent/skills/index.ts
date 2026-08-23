/**
 * @fileoverview Skills System — Barrel Export
 * @module @nxt1/backend/modules/agent/skills
 */

export {
  BaseSkill,
  type SkillCategory,
  type SkillReferenceImage,
  cosineSimilarity,
  DEFAULT_SKILL_THRESHOLD,
} from './base.skill.js';
export { SkillRegistry, type MatchedSkill } from './skill-registry.js';

// Evaluation
export { AthleteScoutingSkill } from './evaluation/athlete-scouting.skill.js';
export { TeamScoutingSkill } from './evaluation/team-scouting.skill.js';
export { FilmIngestionSkill } from './evaluation/video-analysis.skill.js';
export { ClipDerivedMetricsFrameworkSkill } from './evaluation/clip-derived-metrics-framework.skill.js';
export { ImageAnalysisSkill } from './evaluation/image-analysis.skill.js';
export { FilmBreakdownTaxonomySkill } from './evaluation/film-breakdown-taxonomy.skill.js';
export { OpponentScoutingPacketSkill } from './evaluation/opponent-scouting-packet.skill.js';
export { PredictivePerformanceAnalysisSkill } from './evaluation/predictive-performance-analysis.skill.js';
export { DocumentAnalysisSkill } from './evaluation/document-analysis.skill.js';
export { AthleticPerformanceAndCombineTrackerSkill } from './evaluation/athletic-performance-and-combine-tracker.skill.js';
export { PlayerScoutCardDesignSkill } from './evaluation/player-scout-card-design.skill.js';

// Copywriting
export { OutreachCopywritingSkill } from './copywriting/outreach-copywriting.skill.js';

// Compliance
export { ComplianceRulebookSkill } from './compliance/compliance-rulebook.skill.js';
export { NilAndBrandComplianceSkill } from './compliance/nil-and-brand-compliance.skill.js';
export { CommunicationApprovalAndSafetySkill } from './compliance/communication-approval-and-safety.skill.js';

// Brand
export { MediaCreativeIntentSkill } from './brand/media-creative-intent.skill.js';
export { MediaPipelinePlaybooksSkill } from './brand/media-pipeline-playbooks.skill.js';
export { HtmlCssDesignEngineeringSkill } from './brand/html-css-design-engineering.skill.js';
export { StaticGraphicStyleSkill } from './brand/static-graphic-style.skill.js';
export { VideoHighlightStyleSkill } from './brand/video-highlight-style.skill.js';
export { SocialCaptionStyleSkill } from './brand/social-caption-style.skill.js';

// Strategy
export { StrategyGameplanFrameworkSkill } from './strategy/strategy-gameplan-framework.skill.js';
export { RecruitingFitScoringSkill } from './strategy/recruiting-fit-scoring.skill.js';
export { IntelReportQualitySkill } from './strategy/intel-report-quality.skill.js';
export { NilDealEvaluationSkill } from './strategy/nil-deal-evaluation.skill.js';
export { SocialMediaGrowthStrategySkill } from './strategy/social-media-growth-strategy.skill.js';
export { CollegeVisitPlanningSkill } from './strategy/college-visit-planning.skill.js';
export { CoachGamePlanAndAdjustmentsSkill } from './strategy/coach-game-plan-and-adjustments.skill.js';
export { LineupRotationOptimizerSkill } from './strategy/lineup-rotation-optimizer.skill.js';
export { PlayDesignSimulationSkill } from './strategy/play-design-simulation.skill.js';
export { PlayDiagramVerificationWorkflowSkill } from './strategy/play-diagram-verification-workflow.skill.js';
export { PracticeScriptAndProgressionSkill } from './strategy/practice-script-and-progression.skill.js';
export { FootballCallsheetDesignSkill } from './strategy/football-callsheet-design.skill.js';
export { QbWristbandInsertDesignSkill } from './strategy/qb-wristband-insert-design.skill.js';
export { ScoutTeamCardDesignSkill } from './strategy/scout-team-card-design.skill.js';
export { PracticeScriptDesignSkill } from './strategy/practice-script-design.skill.js';
export { RosterAndDepthChartDesignSkill } from './strategy/roster-and-depth-chart-design.skill.js';
export { RecruitingBoardAndVisitTrackerSkill } from './strategy/recruiting-board-and-visit-tracker.skill.js';
export { FilmComparisonFrameworkSkill } from './strategy/film-comparison-framework.skill.js';
export { GameBreakdownAutomationSkill } from './strategy/game-breakdown-automation.skill.js';
export { FilmViewingBatchProcessingWorkflowSkill } from './strategy/film-viewing-batch-processing-workflow.skill.js';
export { FilmReportSkill } from './strategy/film-report.skill.js';

// Data
export { DataNormalizationAndEntityResolutionSkill } from './data/data-normalization-and-entity-resolution.skill.js';
export { ReportFormattingAndExportSkill } from './data/report-formatting-and-export.skill.js';
export { OpenpyxlSpreadsheetDesignSkill } from './data/openpyxl-spreadsheet-design.skill.js';
export { TeamBudgetAndFinancialsSkill } from './data/team-budget-and-financials.skill.js';

// Knowledge (dynamic vector retrieval)
export { GlobalKnowledgeSkill } from './knowledge/global-knowledge.skill.js';
