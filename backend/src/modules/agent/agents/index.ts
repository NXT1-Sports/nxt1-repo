/**
 * @fileoverview AI Coordinators — Barrel Export
 * @module @nxt1/backend/modules/agent/agents
 */

export { BaseAgent } from './base.agent.js';
export { DataCoordinatorAgent } from './data-coordinator.agent.js';
export { PerformanceCoordinatorAgent } from './performance-coordinator.agent.js';
export { RecruitingCoordinatorAgent } from './recruiting-coordinator.agent.js';
export { BrandMediaCoordinatorAgent } from './brand-media-coordinator.agent.js';
export { ComplianceCoordinatorAgent } from './compliance-coordinator.agent.js';
export { GeneralAgent } from './general.agent.js';
export { PlannerAgent } from './planner.agent.js';

// Sub-agent extraction specialists (used by DispatchExtractionTool)
export { AthleteSpecialist, OrgSpecialist, MediaSpecialist } from './sub-agents/index.js';
