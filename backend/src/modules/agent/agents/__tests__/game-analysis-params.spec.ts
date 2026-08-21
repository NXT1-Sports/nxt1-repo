/**
 * @fileoverview Tests for Game Analysis Parameters in BaseAgent
 * @module @nxt1/backend/modules/agent/agents/__tests__
 *
 * Validates that:
 * 1. Team/game context is correctly extracted from user intent
 * 2. Parameters are passed to skills during buildPromptBlock()
 * 3. Skills receive and use team differentiation context
 * 4. Team colors and perspective are correctly handled
 */

import type { AgentSessionContext } from '@nxt1/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAgent } from '../base.agent.js';
import { CoachGamePlanAndAdjustmentsSkill } from '../../skills/strategy/coach-game-plan-and-adjustments.skill.js';
import { PlayDesignSimulationSkill } from '../../skills/strategy/play-design-simulation.skill.js';
import { FilmBreakdownTaxonomySkill } from '../../skills/evaluation/film-breakdown-taxonomy.skill.js';

/**
 * Concrete test implementation of BaseAgent for testing purposes.
 */
class TestAgent extends BaseAgent {
  readonly id = 'test_agent';
  readonly name = 'Test Agent';

  getSystemPrompt(): string {
    return 'Test system prompt';
  }

  getAvailableTools(): readonly string[] {
    return [];
  }

  getModelRouting() {
    return {
      defaultModel: 'claude-3-5-sonnet',
      tier: 'mid',
    };
  }

  getSkills(): readonly string[] {
    return ['coach_game_plan_and_adjustments', 'play_design_simulation', 'film_breakdown_taxonomy'];
  }

  // Expose private methods for testing
  public testBuildGameAnalysisParams(intent: string, sessionContext?: AgentSessionContext) {
    const buildGameAnalysisParams = Reflect.get(this, 'buildGameAnalysisParams') as
      | ((value: string, sessionContext?: AgentSessionContext) => unknown)
      | undefined;

    if (typeof buildGameAnalysisParams !== 'function') {
      throw new Error('buildGameAnalysisParams is not available on TestAgent');
    }

    return buildGameAnalysisParams.call(this, intent, sessionContext);
  }
}

describe('Game Analysis Parameters in Skills', () => {
  let agent: TestAgent;
  let coachSkill: CoachGamePlanAndAdjustmentsSkill;
  let playSkill: PlayDesignSimulationSkill;
  let filmSkill: FilmBreakdownTaxonomySkill;

  beforeEach(() => {
    agent = new TestAgent();
    coachSkill = new CoachGamePlanAndAdjustmentsSkill();
    playSkill = new PlayDesignSimulationSkill();
    filmSkill = new FilmBreakdownTaxonomySkill();
  });

  describe('buildGameAnalysisParams extraction', () => {
    it('should extract own team name from intent', () => {
      const intent = 'Build a game plan. Team: Alabama. Opponent: Texas.';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.team?.ownTeamName).toBe('Alabama');
    });

    it('should extract opponent team name from intent', () => {
      const intent = 'Opponent: Texas State. Our team plays defense.';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.team?.opponentTeamName).toBe('Texas State');
    });

    it('should extract team colors for jersey differentiation', () => {
      const intent =
        'Alabama (crimson) vs Texas (burnt orange). Team Color: Crimson. Opponent Color: Burnt Orange.';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.team?.ownTeamColor).toBe('Crimson');
      expect(params.team?.opponentTeamColor).toBe('Burnt Orange');
    });

    it('should extract perspective (own vs opponent)', () => {
      const intent = 'Analyze from our perspective. Team: Alabama.';
      let params = agent.testBuildGameAnalysisParams(intent);
      expect(params.team?.perspectiveTeam).toBe('own');

      const scoutingIntent = 'Scout the opponent. Perspective: opponent.';
      params = agent.testBuildGameAnalysisParams(scoutingIntent);
      expect(params.team?.perspectiveTeam).toBe('opponent');
    });

    it('should extract sport and division', () => {
      const intent = 'Football game. Sport: Football. Division: College. Week: 3.';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.game?.sport).toBe('Football');
      expect(params.game?.division).toBe('College');
      expect(params.game?.week).toBe(3);
    });

    it('should extract game phase from intent', () => {
      const intent = 'Film review postgame. Game Phase: postgame.';
      let params = agent.testBuildGameAnalysisParams(intent);
      expect(params.game?.phase).toBe('postgame');

      const pregameIntent = 'Prepare the game plan. Phase: pregame.';
      params = agent.testBuildGameAnalysisParams(pregameIntent);
      expect(params.game?.phase).toBe('pregame');
    });

    it('should infer postgame phase from film review language', () => {
      const intent = 'Review film after the game';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.game?.phase).toBe('postgame');
    });

    it('should infer pregame phase from planning language', () => {
      const intent = 'Plan for this game ahead of time';
      const params = agent.testBuildGameAnalysisParams(intent);

      expect(params.game?.phase).toBe('pregame');
    });

    it('should use session default org/team colors when intent omits colors', () => {
      const params = agent.testBuildGameAnalysisParams('Review this film', {
        sessionId: 'session-1',
        userId: 'user-1',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        defaultGameAnalysisContext: {
          ownTeamId: 'team-1',
          ownTeamName: 'Crown Point',
          ownTeamColor: '#112233',
          ownTeamSecondaryColor: '#ddeeff',
          perspectiveTeam: 'own',
        },
      });

      expect(params.team?.ownTeamId).toBe('team-1');
      expect(params.team?.ownTeamName).toBe('Crown Point');
      expect(params.team?.ownTeamColor).toBe('#112233');
      expect(params.team?.perspectiveTeam).toBe('own');
    });

    it('should use selected film context metadata before visual-only inference', () => {
      const params = agent.testBuildGameAnalysisParams('Break down this play', {
        sessionId: 'session-2',
        userId: 'user-2',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        selectedContexts: [
          {
            id: 'film-play:1',
            kind: 'film_play',
            title: 'Play 7 @ 12.3',
            metadata: {
              teamId: 'team-own',
              teamColor: 'white',
              opponentName: 'Central',
              sport: 'football',
              perspective: 'own',
            },
          },
        ],
      });

      expect(params.team?.ownTeamId).toBe('team-own');
      expect(params.team?.ownTeamColor).toBe('white');
      expect(params.team?.opponentTeamName).toBe('Central');
      expect(params.game?.sport).toBe('football');
      expect(params.team?.perspectiveTeam).toBe('own');
    });

    it('should let neutral film context override own-team coach defaults', () => {
      const params = agent.testBuildGameAnalysisParams('Break down this play', {
        sessionId: 'session-3',
        userId: 'user-3',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        defaultGameAnalysisContext: {
          ownTeamId: 'team-1',
          ownTeamName: 'Crown Point',
          ownTeamColor: '#112233',
          perspectiveTeam: 'own',
        },
        selectedContexts: [
          {
            id: 'film-play:2',
            kind: 'film_play',
            title: 'Scout clip',
            metadata: {
              sport: 'football',
              perspective: 'neutral',
              opponentName: 'Central',
            },
          },
        ],
      });

      expect(params.team?.perspectiveTeam).toBe('neutral');
      expect(params.team?.opponentTeamName).toBe('Central');
    });

    it('should normalize own_team selected context perspective to own', () => {
      const params = agent.testBuildGameAnalysisParams('Break down this play', {
        sessionId: 'session-4',
        userId: 'user-4',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        selectedContexts: [
          {
            id: 'film-play:3',
            kind: 'film_play',
            title: 'Play 9 @ 21.0',
            metadata: {
              teamId: 'team-own',
              sport: 'football',
              perspective: 'own_team',
            },
          },
        ],
      });

      expect(params.team?.perspectiveTeam).toBe('own');
    });
  });

  describe('Coach Game Plan Skill with team context', () => {
    it('should include team names when provided', () => {
      const params = {
        team: {
          ownTeamName: 'Alabama',
          ownTeamColor: 'crimson',
          opponentTeamName: 'Texas',
          opponentTeamColor: 'burnt orange',
          perspectiveTeam: 'own' as const,
        },
      };

      const context = coachSkill.getPromptContext(params);

      expect(context).toContain('Alabama');
      expect(context).toContain('Texas');
      expect(context).toContain('crimson');
      expect(context).toContain('burnt orange');
      expect(context).toContain('offensive planning');
    });

    it('should show opponent perspective when applicable', () => {
      const params = {
        team: {
          ownTeamName: 'Alabama',
          opponentTeamName: 'Texas',
          perspectiveTeam: 'opponent' as const,
        },
      };

      const context = coachSkill.getPromptContext(params);

      expect(context).toContain('defensive analysis');
    });

    it('should include game phase context', () => {
      const params = {
        game: {
          sport: 'Football',
          division: 'College',
          phase: 'postgame' as const,
        },
      };

      const context = coachSkill.getPromptContext(params);

      expect(context).toContain('Football');
      expect(context).toContain('College');
      expect(context).toContain('learning and refinement');
    });

    it('should work without params (backwards compatibility)', () => {
      const context = coachSkill.getPromptContext();

      expect(context).toContain('Coach Game Plan And Adjustments');
      expect(context).toContain('Pre-Game Plan Structure');
    });
  });

  describe('Play Design Skill with team context', () => {
    it('should indicate offensive perspective for own team', () => {
      const params = {
        team: {
          ownTeamName: 'Alabama',
          perspectiveTeam: 'own' as const,
        },
      };

      const context = playSkill.getPromptContext(params);

      expect(context).toContain('OUR team');
      expect(context).toContain('offensive');
    });

    it('should indicate defensive/scouting perspective for opponent', () => {
      const params = {
        team: {
          opponentTeamName: 'Texas',
          perspectiveTeam: 'opponent' as const,
        },
      };

      const context = playSkill.getPromptContext(params);

      expect(context).toContain('OPPONENT');
      expect(context).toContain('scouting');
    });

    it('should include sport context', () => {
      const params = {
        game: {
          sport: 'Football',
          division: 'High School',
        },
      };

      const context = playSkill.getPromptContext(params);

      expect(context).toContain('Football');
      expect(context).toContain('High School');
    });
  });

  describe('Film Breakdown Skill with team context', () => {
    it('should identify teams by jersey color', () => {
      const params = {
        team: {
          ownTeamName: 'Alabama',
          ownTeamColor: 'crimson',
          opponentTeamName: 'Tennessee',
          opponentTeamColor: 'orange',
        },
      };

      const context = filmSkill.getPromptContext(params);

      expect(context).toContain('Alabama');
      expect(context).toContain('crimson');
      expect(context).toContain('Tennessee');
      expect(context).toContain('orange');
      expect(context).toContain('Jersey / Team Identification');
    });

    it('should differentiate analysis perspective for own team', () => {
      const params = {
        team: {
          ownTeamName: 'Alabama',
          perspectiveTeam: 'own' as const,
        },
      };

      const context = filmSkill.getPromptContext(params);

      expect(context).toContain('OUR athletes');
      expect(context).toContain('execution');
    });

    it('should differentiate analysis perspective for opponent scouting', () => {
      const params = {
        team: {
          opponentTeamName: 'Texas',
          perspectiveTeam: 'opponent' as const,
        },
      };

      const context = filmSkill.getPromptContext(params);

      expect(context).toContain('OPPONENT');
      expect(context).toContain('scouting');
    });

    it('should include sport context', () => {
      const params = {
        game: {
          sport: 'Basketball',
          division: 'NCAA Division I',
        },
      };

      const context = filmSkill.getPromptContext(params);

      expect(context).toContain('Basketball');
      expect(context).toContain('NCAA Division I');
    });
  });

  describe('End-to-end intent to skill context flow', () => {
    it('should flow from coach game plan intent through to skill context', () => {
      const coachIntent =
        'Build a game plan for Alabama (crimson) vs Texas (burnt orange). ' +
        'Team: Alabama. Opponent: Texas. ' +
        'Sport: Football. Division: College. ' +
        'Phase: postgame. ' +
        'Perspective: own.';

      const params = agent.testBuildGameAnalysisParams(coachIntent);
      const skillContext = coachSkill.getPromptContext(params);

      // Verify all contextual information flows through
      expect(skillContext).toContain('Alabama');
      expect(skillContext).toContain('Texas');
      expect(skillContext).toContain('crimson');
      expect(skillContext).toContain('burnt orange');
      expect(skillContext).toContain('Football');
      expect(skillContext).toContain('College');
      expect(skillContext).toContain('postgame');
      expect(skillContext).toContain('offensive');
    });

    it('should flow scouting context through film breakdown skill', () => {
      const scoutingIntent =
        'Review opponent film. ' +
        'Team: Alabama. ' +
        'Opponent: Texas (burnt orange). ' +
        'Sport: Football. ' +
        'Phase: scouting. ' +
        'Perspective: opponent.';

      const params = agent.testBuildGameAnalysisParams(scoutingIntent);
      const skillContext = filmSkill.getPromptContext(params);

      expect(skillContext).toContain('Texas');
      expect(skillContext).toContain('burnt orange');
      expect(skillContext).toContain('OPPONENT');
      expect(skillContext).toContain('scouting');
    });
  });

  describe('backwards compatibility', () => {
    it('skills should work without params', () => {
      const coachContext = coachSkill.getPromptContext();
      const playContext = playSkill.getPromptContext();
      const filmContext = filmSkill.getPromptContext();

      expect(coachContext).toBeTruthy();
      expect(playContext).toBeTruthy();
      expect(filmContext).toBeTruthy();

      expect(coachContext).toContain('Coach Game Plan');
      expect(playContext).toContain('Play Design');
      expect(filmContext).toContain('Film Breakdown');
    });

    it('skills should work with empty params object', () => {
      const coachContext = coachSkill.getPromptContext({});
      const playContext = playSkill.getPromptContext({});
      const filmContext = filmSkill.getPromptContext({});

      expect(coachContext).toBeTruthy();
      expect(playContext).toBeTruthy();
      expect(filmContext).toBeTruthy();
    });
  });
});
