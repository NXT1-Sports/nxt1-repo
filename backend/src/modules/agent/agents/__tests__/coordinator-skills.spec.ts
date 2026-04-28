import { describe, expect, it } from 'vitest';
import { AdminCoordinatorAgent } from '../admin-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../brand-coordinator.agent.js';
import { DataCoordinatorAgent } from '../data-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';

describe('coordinator skill bindings', () => {
  it('loads the video analysis skill for the performance coordinator', () => {
    const agent = new PerformanceCoordinatorAgent();

    expect(agent.getSkills()).toContain('video_analysis');
    expect(agent.getSkills()).toContain('film_breakdown_taxonomy');
    expect(agent.getSkills()).toContain('opponent_scouting_packet');
    expect(agent.getSkills()).toContain('coach_game_plan_and_adjustments');
    expect(agent.getSkills()).toContain('intel_report_quality');
    expect(agent.getSkillBudget()).toBe(5);
  });

  it('loads the video analysis skill for the strategy coordinator', () => {
    const agent = new StrategyCoordinatorAgent();

    expect(agent.getSkills()).toContain('video_analysis');
    expect(agent.getSkills()).toContain('strategy_gameplan_framework');
    expect(agent.getSkills()).toContain('coach_game_plan_and_adjustments');
    expect(agent.getSkills()).toContain('lineup_rotation_optimizer');
    expect(agent.getSkills()).toContain('recruiting_fit_scoring');
    expect(agent.getSkills()).toContain('college_visit_planning');
    expect(agent.getSkills()).toContain('nil_deal_evaluation');
    expect(agent.getSkillBudget()).toBe(5);
  });

  it('loads data normalization skills for the data coordinator', () => {
    const agent = new DataCoordinatorAgent();

    expect(agent.getSkills()).toContain('data_normalization_and_entity_resolution');
    expect(agent.getSkills()).toContain('report_formatting_and_export');
    expect(agent.getSkills()).toContain('global_knowledge');
    expect(agent.getSkillBudget()).toBe(3);
  });

  it('loads recruiting safety and fit skills for the recruiting coordinator', () => {
    const agent = new RecruitingCoordinatorAgent();

    expect(agent.getSkills()).toContain('recruiting_fit_scoring');
    expect(agent.getSkills()).toContain('college_visit_planning');
    expect(agent.getSkills()).toContain('nil_deal_evaluation');
    expect(agent.getSkills()).toContain('communication_approval_and_safety');
    expect(agent.getSkills()).toContain('nil_and_brand_compliance');
    expect(agent.getSkillBudget()).toBe(5);
  });

  it('loads brand compliance skills for the brand coordinator', () => {
    const agent = new BrandCoordinatorAgent();

    expect(agent.getSkills()).toContain('static_graphic_style');
    expect(agent.getSkills()).toContain('social_media_growth_strategy');
    expect(agent.getSkills()).toContain('nil_deal_evaluation');
    expect(agent.getSkills()).toContain('nil_and_brand_compliance');
    expect(agent.getSkills()).toContain('communication_approval_and_safety');
    expect(agent.getSkillBudget()).toBe(5);
  });

  it('loads communication and NIL compliance skills for the admin coordinator', () => {
    const agent = new AdminCoordinatorAgent();

    expect(agent.getSkills()).toContain('compliance_rulebook');
    expect(agent.getSkills()).toContain('communication_approval_and_safety');
    expect(agent.getSkills()).toContain('nil_and_brand_compliance');
  });
});
