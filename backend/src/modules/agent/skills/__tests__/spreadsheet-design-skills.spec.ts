import { describe, expect, it } from 'vitest';
import { AdminCoordinatorAgent } from '../../agents/admin-coordinator.agent.js';
import { DataCoordinatorAgent } from '../../agents/data-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../../agents/performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../../agents/recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../../agents/strategy-coordinator.agent.js';
import { OpenpyxlSpreadsheetDesignSkill } from '../data/openpyxl-spreadsheet-design.skill.js';
import { TeamBudgetAndFinancialsSkill } from '../data/team-budget-and-financials.skill.js';
import { AthleticPerformanceAndCombineTrackerSkill } from '../evaluation/athletic-performance-and-combine-tracker.skill.js';
import { FootballCallsheetDesignSkill } from '../strategy/football-callsheet-design.skill.js';
import { PracticeScriptDesignSkill } from '../strategy/practice-script-design.skill.js';
import { QbWristbandInsertDesignSkill } from '../strategy/qb-wristband-insert-design.skill.js';
import { RecruitingBoardAndVisitTrackerSkill } from '../strategy/recruiting-board-and-visit-tracker.skill.js';
import { RosterAndDepthChartDesignSkill } from '../strategy/roster-and-depth-chart-design.skill.js';

describe('modular spreadsheet design skills', () => {
  it('exposes the base OpenPyXL design standards without forcing tabs or palettes', () => {
    const skill = new OpenpyxlSpreadsheetDesignSkill();
    const prompt = skill.getPromptContext();

    expect(skill.name).toBe('openpyxl_spreadsheet_design');
    expect(skill.category).toBe('data');
    expect(prompt).toContain('Follow the user');
    expect(prompt).toContain('Do not create extra tabs');
    expect(prompt).toContain('team or organization brand colors');
    expect(prompt).toContain('showGridLines = True');
    expect(prompt).toContain('fitToWidth = 1');
  });

  it('keeps callsheets and wristbands as separate physical-format skills', () => {
    const callsheetPrompt = new FootballCallsheetDesignSkill().getPromptContext();
    const wristbandPrompt = new QbWristbandInsertDesignSkill().getPromptContext();

    expect(callsheetPrompt).toContain('one unified sheet');
    expect(callsheetPrompt).toContain('Maumelle-Style Staff Callsheet');
    expect(callsheetPrompt).toContain('maumelle-callsheet-reference.png');
    expect(callsheetPrompt).toContain('If the runtime has this image attached or hosted as a URL');
    expect(callsheetPrompt).toContain('6-7 vertical panel lanes');
    expect(callsheetPrompt).toContain('1st Half Script');
    expect(callsheetPrompt).toContain('2nd Medium');
    expect(callsheetPrompt).toContain('Green Zone');
    expect(callsheetPrompt).toContain('Reminders');
    expect(callsheetPrompt).toContain('side-by-side panels');
    expect(callsheetPrompt).toContain('functional color-coded boards');
    expect(callsheetPrompt).toContain('compact data-driven renderer');
    expect(callsheetPrompt).toContain('resolve_section_fill');
    expect(callsheetPrompt).toContain('Red Zone');
    expect(callsheetPrompt).toContain('Primary Read');
    expect(
      new FootballCallsheetDesignSkill().getReferenceImages({
        agentRouteBase: 'https://api.example.com/api/v1/agent-x',
      })
    ).toEqual([
      expect.objectContaining({
        url: 'https://api.example.com/api/v1/agent-x/reference-assets/callsheet/maumelle-callsheet-reference.png',
        mimeType: 'image/png',
      }),
    ]);
    expect(wristbandPrompt).toContain('one tab');
    expect(wristbandPrompt).toContain('3 columns x 10 rows');
    expect(wristbandPrompt).toContain('functional color blocks');
    expect(wristbandPrompt).toContain('compact CALLS array');
    expect(wristbandPrompt).toContain('under two seconds');
  });

  it('covers practice, roster, budget, recruiting, and performance workbook shapes', () => {
    expect(new PracticeScriptDesignSkill().getPromptContext()).toContain('Period Script');
    expect(new RosterAndDepthChartDesignSkill().getPromptContext()).toContain('Depth Chart');
    expect(new TeamBudgetAndFinancialsSkill().getPromptContext()).toContain('variance percent');
    expect(new RecruitingBoardAndVisitTrackerSkill().getPromptContext()).toContain(
      'Visit Calendar'
    );
    expect(new AthleticPerformanceAndCombineTrackerSkill().getPromptContext()).toContain(
      'percent-of-max'
    );
  });

  it('wires spreadsheet skills into the coordinators that need them', () => {
    expect(new StrategyCoordinatorAgent().getSkills()).toEqual(
      expect.arrayContaining([
        'openpyxl_spreadsheet_design',
        'football_callsheet_design',
        'qb_wristband_insert_design',
        'practice_script_design',
        'roster_and_depth_chart_design',
        'recruiting_board_and_visit_tracker',
      ])
    );
    expect(new DataCoordinatorAgent().getSkills()).toEqual(
      expect.arrayContaining([
        'openpyxl_spreadsheet_design',
        'team_budget_and_financials',
        'athletic_performance_and_combine_tracker',
      ])
    );
    expect(new PerformanceCoordinatorAgent().getSkills()).toEqual(
      expect.arrayContaining([
        'openpyxl_spreadsheet_design',
        'athletic_performance_and_combine_tracker',
        'practice_script_design',
      ])
    );
    expect(new RecruitingCoordinatorAgent().getSkills()).toEqual(
      expect.arrayContaining(['openpyxl_spreadsheet_design', 'recruiting_board_and_visit_tracker'])
    );
    expect(new AdminCoordinatorAgent().getSkills()).toEqual(
      expect.arrayContaining(['openpyxl_spreadsheet_design', 'team_budget_and_financials'])
    );
  });
});
