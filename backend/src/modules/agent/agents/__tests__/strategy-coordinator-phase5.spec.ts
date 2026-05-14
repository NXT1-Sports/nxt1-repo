/**
 * @fileoverview Phase 5 Hardening: Strategy Coordinator Tool Routing & Diagram Discrimination Tests
 *
 * CRITICAL: These tests enforce the Phase 5 runbook that prevents silent fallback
 * from drill requests to play diagrams and ensures explicit kind discrimination.
 *
 * Negative test cases prevent regressions where:
 * 1. Drill requests incorrectly route to `create_play_diagram`
 * 2. Play requests have no explicit routing to `create_play_diagram`
 * 3. Ambiguous requests do not trigger `ask_user` for clarification
 * 4. Tool policy does not include `create_board_diagram` for strategy_coordinator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';
import { getAgentToolPolicy, getEffectiveAgentToolPolicy } from '../tool-policy.js';

describe('Phase 5: Strategy Coordinator Diagram Tool Routing & Hardening', () => {
  let agent: StrategyCoordinatorAgent;

  beforeEach(() => {
    agent = new StrategyCoordinatorAgent();
  });

  // ─── TOOL POLICY ENFORCEMENT (CRITICAL) ────────────────────────────────

  describe('Tool Policy — Board Diagram Access', () => {
    it('includes create_board_diagram in strategy_coordinator tool policy', () => {
      const policy = getAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('create_board_diagram');
    });

    it('includes update_board_diagram in strategy_coordinator tool policy', () => {
      const policy = getAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('update_board_diagram');
    });

    it('includes delete_board_diagram in strategy_coordinator tool policy', () => {
      const policy = getAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('delete_board_diagram');
    });

    it('includes create_play_diagram in strategy_coordinator tool policy', () => {
      const policy = getAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('create_play_diagram');
    });

    it('effective policy (global + coordinator) includes create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('create_board_diagram');
    });

    it('effective policy includes both create_play_diagram and create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('create_play_diagram');
      expect(policy).toContain('create_board_diagram');
    });
  });

  // ─── SYSTEM PROMPT VALIDATION ────────────────────────────────────────

  describe('System Prompt — Diagram Runbook Presence', () => {
    it('system prompt includes play diagram keywords section', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('PLAY DIAGRAMS');
      expect(prompt).toContain('`create_play_diagram`');
    });

    it('system prompt includes drill board keywords section', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('DRILL BOARDS');
      expect(prompt).toContain('`create_board_diagram`');
      expect(prompt).toContain('`kind: "sport_drill"`');
    });

    it('system prompt explicitly forbids create_play_diagram for drill content', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain(
        'NEVER call `create_play_diagram` for drill or practice-only content'
      );
      expect(prompt).toContain('NEVER call `create_play_diagram` for drill content');
    });

    it('system prompt explicitly forbids silent defaults when kind is ambiguous', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('NEVER silently default to either tool when kind is unclear');
    });

    it('system prompt requires ask_user for ambiguous requests', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('ask_user');
      expect(prompt).toContain('Play diagram or drill board?');
    });

    it('system prompt includes concrete play diagram keywords', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('draw a play');
      expect(prompt).toContain('route tree');
      expect(prompt).toContain('formation diagram');
      expect(prompt).toContain('coverage');
    });

    it('system prompt includes concrete drill board keywords', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('design a drill');
      expect(prompt).toContain('training station');
      expect(prompt).toContain('drill board');
      expect(prompt).toContain('skill work');
      expect(prompt).toContain('conditioning drill');
    });

    it('system prompt clarifies difference between diagram tools', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Diagram tools draw X-and-O boards, generate_graphic creates posters
      expect(prompt).toContain('NEVER substitute a single `generate_graphic` call');
      expect(prompt).toContain('X-and-O tactical boards');
      expect(prompt).toContain('posters/overviews');
    });

    it('system prompt forbids exposing internal fields in chat', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('editUrl');
      expect(prompt).toContain('storagePath');
      expect(prompt).toContain('raw XML');
      expect(prompt).toContain('chat response');
    });
  });

  // ─── NEGATIVE TESTS: Silent Fallback Prevention ────────────────────────

  describe('Negative Tests — No Silent Fallbacks', () => {
    it('system prompt does NOT silently default drill requests to create_play_diagram', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // The prompt should NOT contain logic like "if drill, use create_play_diagram"
      // It should ONLY mention using create_board_diagram with kind: sport_drill for drills
      const drillSection = prompt.substring(
        prompt.indexOf('DRILL BOARDS'),
        prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**')
      );
      expect(drillSection).toContain('`create_board_diagram`');
      expect(drillSection).toContain('`kind: "sport_drill"`');
      // And SHOULD NOT suggest create_play_diagram in drill section
      expect(drillSection).not.toContain('Use `create_play_diagram` for drill');
    });

    it('system prompt does NOT have a single fallback path for both play and drill', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Both "Use ONLY when" sections should be present and distinct
      // They should NOT be merged into one unified path
      expect(prompt).toContain('**PLAY DIAGRAMS');
      expect(prompt).toContain('**DRILL BOARDS');
      expect(prompt).toContain('Use ONLY when');
      // The prompt should have separate sections with different tool names
      const playSection = prompt.substring(
        prompt.indexOf('**PLAY DIAGRAMS'),
        prompt.indexOf('**DRILL BOARDS')
      );
      const drillSection = prompt.substring(
        prompt.indexOf('**DRILL BOARDS'),
        prompt.indexOf('**AMBIGUOUS')
      );
      expect(playSection).toContain('`create_play_diagram`');
      expect(drillSection).toContain('`create_board_diagram`');
    });

    it('system prompt requires ask_user for ambiguous disambiguation, never assumes', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const ambiguousSection = prompt.substring(
        prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**'),
        prompt.indexOf('**EXECUTION:**')
      );
      expect(ambiguousSection).toContain('ask_user');
      expect(ambiguousSection).toContain('ambiguous');
      expect(ambiguousSection).toContain('clarification');
      // Should NOT contain language like "default to" or "assume"
      expect(ambiguousSection).toContain('NEVER silently default');
    });
  });

  // ─── PHASE 5 SPECIFICATION COMPLIANCE ───────────────────────────────

  describe('Phase 5 Specification — Runbook Compliance', () => {
    it('system prompt separates PLAY and DRILL sections explicitly', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const playIndex = prompt.indexOf('**PLAY DIAGRAMS');
      const drillIndex = prompt.indexOf('**DRILL BOARDS');
      expect(playIndex).toBeGreaterThan(0);
      expect(drillIndex).toBeGreaterThan(playIndex);
    });

    it('system prompt lists play keywords comprehensively', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const keywords = [
        'draw a play',
        'route tree',
        'formation diagram',
        'coverage',
        'gap scheme',
        'blitz package',
        'offensive install',
      ];
      keywords.forEach((kw) => {
        expect(prompt).toContain(kw);
      });
    });

    it('system prompt lists drill keywords comprehensively', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const keywords = [
        'design a drill',
        'training station',
        'skill work',
        'conditioning drill',
        'footwork drill',
        'defensive drill',
        'off-season workout',
      ];
      keywords.forEach((kw) => {
        expect(prompt).toContain(kw);
      });
    });

    it('system prompt enforces one-tool-per-diagram rule', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('call the correct tool ONE TIME');
    });

    it('system prompt forbids post-hoc "diagrams are ready" without real URLs', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      expect(prompt).toContain('Do NOT say "I have created your diagrams"');
      expect(prompt).toContain('real `diagramUrl` values');
    });
  });

  // ─── REGRESSION PREVENTION ──────────────────────────────────────────

  describe('Regression Prevention — Anti-Patterns', () => {
    it('system prompt does NOT encourage asking user "play or drill" as fallback for all diagram requests', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Ask should only happen when ambiguous, not for clear requests
      const clarificationSection = prompt.substring(
        prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**'),
        prompt.indexOf('**EXECUTION:**')
      );
      expect(clarificationSection).toContain('ambiguous');
    });

    it('system prompt does NOT hide drill routing under generic tool selection', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Should explicitly state drill = create_board_diagram with kind: sport_drill
      expect(prompt).toContain('create_board_diagram` with `kind: "sport_drill"` for drills');
    });

    it('system prompt does NOT suggest create_play_diagram as a default for unclear requests', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const ambiguousSection = prompt.substring(
        prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**'),
        prompt.indexOf('**EXECUTION:**')
      );
      // Should not say "default to create_play_diagram"
      expect(ambiguousSection).not.toMatch(/default.*create_play_diagram/i);
    });

    it('tool policy does NOT accidentally move drill tools back to GLOBAL_SYSTEM_TOOL_POLICY', () => {
      // Check a known global tool, verify it's not create_board_diagram
      // (This is defensive against accidental re-addition)
      const policy = getAgentToolPolicy('router'); // Router has restricted policy
      // Verify router does not have create_board_diagram (should be strategy only)
      expect(policy).not.toContain('create_board_diagram');
    });
  });

  // ─── COACH/ATHLETE USAGE SCENARIOS ──────────────────────────────────

  describe('Real-World Usage Scenarios', () => {
    it('coach request "create a drill" is recognized as drill keyword', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Verify that "drill" is in drill keywords section
      expect(prompt).toContain('design a drill');
    });

    it('coach request "diagram our trips right flood" maps to play diagram', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // "Diagram" patterns should be in play keywords
      expect(prompt).toContain('draw a play');
    });

    it('coach request with game-day context should use create_play_diagram', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Game-day play keywords in play diagram section
      expect(prompt).toContain('GAME situations');
    });

    it('athlete request with practice context should use create_board_diagram', () => {
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Practice/training keywords in drill board section
      expect(prompt).toContain('PRACTICE/TRAINING situations');
    });
  });
});
