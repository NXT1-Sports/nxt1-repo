/**
 * @fileoverview AI Coordinators — Barrel Export
 * @module @nxt1/backend/modules/agent/agents
 */

export { BaseAgent } from './base.agent.js';
export { AdminCoordinatorAgent } from './admin-coordinator.agent.js';
export { BrandCoordinatorAgent } from './brand-coordinator.agent.js';
export { DataCoordinatorAgent } from './data-coordinator.agent.js';
export { PerformanceCoordinatorAgent } from './performance-coordinator.agent.js';
export { RecruitingCoordinatorAgent } from './recruiting-coordinator.agent.js';
export { PlannerAgent } from './planner.agent.js';
export { StrategyCoordinatorAgent } from './strategy-coordinator.agent.js';
export {
  getAgentToolPolicy,
  getAllAgentToolPolicies,
  isToolAllowedByPatterns,
} from './tool-policy.js';

// Sub-agent extraction specialists (used by DispatchExtractionTool)
export { AthleteSpecialist, OrgSpecialist, MediaSpecialist } from './sub-agents/index.js';
