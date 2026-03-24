/**
 * @fileoverview Analytics Tools
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * High-intent tools for athlete evaluation, prospect comparison,
 * roster analysis, and recruiting pipeline management.
 *
 * These tools serve both athlete-side and coach/director-side workflows:
 * - GenerateScoutReportTool  — Structured athlete evaluation data
 * - CompareAthletesTool      — Side-by-side prospect comparison
 * - AnalyzeRosterGapsTool    — Team depth chart gap analysis
 * - BuildRecruitingBoardTool — Prospect pipeline CRUD
 */

export { GenerateScoutReportTool } from './generate-scout-report.tool.js';
export { CompareAthletesTool } from './compare-athletes.tool.js';
export { AnalyzeRosterGapsTool } from './analyze-roster-gaps.tool.js';
export { BuildRecruitingBoardTool } from './build-recruiting-board.tool.js';
