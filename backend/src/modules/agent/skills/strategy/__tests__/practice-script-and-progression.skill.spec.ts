/**
 * @fileoverview Unit Tests — Practice Script & Progression Skill
 * @module @nxt1/backend/modules/agent/skills/strategy/__tests__
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PracticeScriptAndProgressionSkill } from '../practice-script-and-progression.skill.js';

describe('PracticeScriptAndProgressionSkill', () => {
  let skill: PracticeScriptAndProgressionSkill;

  beforeEach(() => {
    skill = new PracticeScriptAndProgressionSkill();
  });

  describe('Metadata', () => {
    it('should have correct name', () => {
      expect(skill.name).toBe('practice_script_and_progression');
    });

    it('should have correct description', () => {
      expect(skill.description).toContain('multi-day practice progressions');
      expect(skill.description).toContain('play installation');
      expect(skill.description).toContain('drill sequencing');
    });

    it('should have strategy category', () => {
      expect(skill.category).toBe('strategy');
    });
  });

  describe('Prompt Context Generation', () => {
    it('should generate prompt context without params', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Practice Script & Progression Framework');
      expect(context).toContain('Install Stage Definitions');
      expect(context).toContain('Progressive Teaching Sequence');
      expect(context).toContain('Day 1');
      expect(context).toContain('Day 5');
    });

    it('should include sport context when provided', () => {
      const context = skill.getPromptContext({ sport: 'football' });
      expect(context).toContain('football');
      expect(context).toContain('Sport: football');
    });

    it('should include division context when provided', () => {
      const context = skill.getPromptContext({ division: 'college' });
      expect(context).toContain('college');
      expect(context).toContain('Division: college');
    });

    it('should include install stage in context', () => {
      const context = skill.getPromptContext({ installStage: 'install' });
      expect(context).toContain('Install Stage: install');
      expect(context).toContain('Foundation teaching phase');
    });

    it('should include practice window minutes', () => {
      const context = skill.getPromptContext({ practiceWindowMinutes: 90 });
      expect(context).toContain('Practice Window: 90 minutes');
    });

    it('should include play name when provided', () => {
      const context = skill.getPromptContext({ playName: 'RPO Read Option' });
      expect(context).toContain('RPO Read Option');
    });

    it('should include position context when provided', () => {
      const context = skill.getPromptContext({ position: 'QB' });
      expect(context).toContain('QB');
      expect(context).toContain('Position Focus: QB');
    });

    it('should include roster size when provided', () => {
      const context = skill.getPromptContext({ rosterSize: 85 });
      expect(context).toContain('Roster Size: 85');
    });
  });

  describe('Rep Counts by Division', () => {
    it('should use appropriate rep counts for high school', () => {
      const context = skill.getPromptContext({ division: 'hs' });
      expect(context).toContain('8–10 individual');
      expect(context).toContain('10–13 coordinated');
      expect(context).toContain('12–17 live');
    });

    it('should use appropriate rep counts for college', () => {
      const context = skill.getPromptContext({ division: 'college' });
      expect(context).toContain('12–14 individual');
      expect(context).toContain('15–18 coordinated');
      expect(context).toContain('18–23 live');
    });

    it('should use appropriate rep counts for professional', () => {
      const context = skill.getPromptContext({ division: 'professional' });
      expect(context).toContain('15–17 individual');
      expect(context).toContain('18–21 coordinated');
      expect(context).toContain('20–25 live');
    });
  });

  describe('Install Stage Descriptions', () => {
    it('should describe install stage correctly', () => {
      const context = skill.getPromptContext({ installStage: 'install' });
      expect(context).toContain('Foundation teaching phase');
      expect(context).toContain('walkthrough pace');
      expect(context).toContain('50–60% of game speed');
    });

    it('should describe rep stage correctly', () => {
      const context = skill.getPromptContext({ installStage: 'rep' });
      expect(context).toContain('Repetition and integration phase');
      expect(context).toContain('75–85% of game speed');
      expect(context).toContain('unit coordination');
    });

    it('should describe game-ready stage correctly', () => {
      const context = skill.getPromptContext({ installStage: 'game-ready' });
      expect(context).toContain('Competition-intensity phase');
      expect(context).toContain('95–100% of game speed');
      expect(context).toContain('live pressure');
    });
  });

  describe('Daily Structure', () => {
    it('should include all 7 days of progression', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Day 1');
      expect(context).toContain('Day 2');
      expect(context).toContain('Day 3');
      expect(context).toContain('Day 4');
      expect(context).toContain('Day 5');
      expect(context).toContain('Day 6');
      expect(context).toContain('Day 7');
    });

    it('should include coaching cues for each day', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Coaching Cues');
      // Day 1
      expect(context).toContain('Feet first');
      expect(context).toContain('Eyes on read progression');
    });

    it('should include correction sequences', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Correction Sequences');
      expect(context).toContain('Common Busts');
    });

    it('should include drill references', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Drill A');
      expect(context).toContain('Drill B');
      expect(context).toContain('create_board_diagram');
    });
  });

  describe('Success Criteria', () => {
    it('should include success indicators at end of progression', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Success Indicators');
      expect(context).toContain('85%+ execution rate');
      expect(context).toContain('Communication clear');
      expect(context).toContain('Counter activates automatically');
    });
  });

  describe('Compressed Practice Format', () => {
    it('should indicate compressed format for short practice windows', () => {
      const context = skill.getPromptContext({ practiceWindowMinutes: 75 });
      expect(context).toContain('(compressed format)');
    });

    it('should not indicate compressed format for normal practice windows', () => {
      const context = skill.getPromptContext({ practiceWindowMinutes: 120 });
      expect(context).not.toContain('(compressed format)');
    });
  });

  describe('Tool Integration', () => {
    it('should mention create_board_diagram tool', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('create_board_diagram');
    });

    it('should specify sport_drill kind for board diagrams', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('kind: "sport_drill"');
    });

    it('should indicate tool is called for each day', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Coach will generate');
      expect(context).toContain('board diagrams');
    });
  });

  describe('Sport-Specific Guidance', () => {
    it('should include sport-agnostic framework', () => {
      const context = skill.getPromptContext({ sport: 'basketball' });
      expect(context).toContain('sport-agnostic');
    });

    it('should customize drill labels by sport', () => {
      const footballContext = skill.getPromptContext({
        sport: 'football',
        installStage: 'install',
      });
      expect(footballContext).toContain('footwork + read progression');

      const basketballContext = skill.getPromptContext({
        sport: 'basketball',
        installStage: 'install',
      });
      expect(basketballContext).toMatch(/spacing|Foundational/);
    });
  });

  describe('Delivery Format', () => {
    it('should describe daily practice playbook format', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Daily Practice Playbook');
      expect(context).toContain('Time block schedule');
      expect(context).toContain('Drill diagram URLs');
    });

    it('should describe weekly overview format', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Weekly Overview');
      expect(context).toContain('Teaching narrative');
      expect(context).toContain('Key decision points');
    });

    it('should describe coach checklist format', () => {
      const context = skill.getPromptContext();
      expect(context).toContain("Coach's Checklist");
      expect(context).toContain('Pre-practice setup');
      expect(context).toContain('Daily teaching points');
    });
  });

  describe('Rep Count Table', () => {
    it('should include rep count summary table', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Rep Count Summary');
      expect(context).toContain('Phase');
      expect(context).toContain('Individual');
      expect(context).toContain('Unit');
      expect(context).toContain('Team');
      expect(context).toContain('Total Per Day');
    });
  });

  describe('Customization Rules', () => {
    it('should include customization rules for high school', () => {
      const context = skill.getPromptContext({ division: 'hs' });
      expect(context).toContain('High School');
      expect(context).toContain('90-minute practices');
    });

    it('should include customization rules for college', () => {
      const context = skill.getPromptContext({ division: 'college' });
      expect(context).toContain('College');
      expect(context).toContain('120–150 minute practices');
    });

    it('should include customization rules for professional', () => {
      const context = skill.getPromptContext({ division: 'professional' });
      expect(context).toContain('Professional');
      expect(context).toContain('150+ minute practices');
    });
  });

  describe('Notes for Coach', () => {
    it('should include progression flexibility guidance', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Progression Flexibility');
      expect(context).toContain('do NOT skip a phase');
    });

    it('should include injury/fatigue adaptation guidance', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Injury/Fatigue Adaptation');
      expect(context).toContain('key players out');
    });

    it('should include escalation decision guidance', () => {
      const context = skill.getPromptContext();
      expect(context).toContain('Escalation Decision');
      expect(context).toContain('Ready to deploy');
    });
  });

  describe('Complex Scenario: Full College Football RPO Installation', () => {
    it('should generate complete installation script for D1 football', () => {
      const context = skill.getPromptContext({
        sport: 'football',
        division: 'college',
        installStage: 'install',
        playName: 'RPO Read Option',
        position: 'QB',
        practiceWindowMinutes: 120,
        rosterSize: 120,
      });

      // Verify all key sections exist
      expect(context).toContain('RPO Read Option');
      expect(context).toContain('College');
      expect(context).toContain('QB');
      expect(context).toContain('120 minutes');
      expect(context).toContain('120 athletes');

      // Verify 7-day structure
      expect(context).toContain('Day 1');
      expect(context).toContain('Day 7');

      // Verify college-specific rep counts
      expect(context).toContain('12–14 individual');
      expect(context).toContain('15–18 coordinated');
      expect(context).toContain('18–23 live');

      // Verify tool integration
      expect(context).toContain('create_board_diagram');
      expect(context).toContain('sport_drill');
    });
  });

  describe('Complex Scenario: Compressed High School Installation', () => {
    it('should generate compressed installation for HS with tight practice window', () => {
      const context = skill.getPromptContext({
        sport: 'football',
        division: 'hs',
        installStage: 'install',
        playName: 'Power Play',
        practiceWindowMinutes: 75,
        rosterSize: 50,
      });

      // Verify compressed indicator
      expect(context).toContain('(compressed format)');

      // Verify HS-specific guidance
      expect(context).toContain('High School');
      expect(context).toContain('90-minute practices');

      // Verify smaller rep counts
      expect(context).toContain('8–10 individual');
    });
  });

  describe('Complex Scenario: Game-Ready Phase', () => {
    it('should emphasize competition and situational mastery for game-ready', () => {
      const context = skill.getPromptContext({
        installStage: 'game-ready',
        sport: 'football',
      });

      // Verify game-ready emphasis
      expect(context).toContain('Competition-intensity phase');
      expect(context).toContain('95–100% of game speed');
      expect(context).toContain('live pressure');

      // Verify situational content in Days 6–7
      expect(context).toContain('Game Scenario');
      expect(context).toContain('Situational Mastery');
      expect(context).toContain('red zone');
      expect(context).toContain('2-minute');
    });
  });
});
