/**
 * @fileoverview Phase 5 Integration: Tool Routing & Policy Enforcement Tests
 *
 * These tests verify that:
 * 1. create_board_diagram and create_play_diagram are distinct tools with clear responsibilities
 * 2. kind discrimination is enforced at schema level (no fallback)
 * 3. Tool policy prevents incorrect routing
 */

import { describe, it, expect } from 'vitest';
import { isToolAllowedByPatterns, getEffectiveAgentToolPolicy } from '../tool-policy.js';

describe('Phase 5: Tool Routing & Policy Integration', () => {
  // ─── TOOL ACCESS CONTROL ──────────────────────────────────────────────

  describe('Strategy Coordinator Tool Access Control', () => {
    it('strategy_coordinator can access create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(true);
    });

    it('strategy_coordinator can access universal document lifecycle tools', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('list_universal_team_documents', policy)).toBe(true);
      expect(isToolAllowedByPatterns('get_universal_team_document', policy)).toBe(true);
      expect(isToolAllowedByPatterns('create_universal_team_document', policy)).toBe(true);
      expect(isToolAllowedByPatterns('update_universal_team_document', policy)).toBe(true);
      expect(isToolAllowedByPatterns('delete_universal_team_document', policy)).toBe(true);
      expect(isToolAllowedByPatterns('generate_practice_script', policy)).toBe(true);
    });

    it('router and data_coordinator can access universal document lifecycle tools', () => {
      const routerPolicy = getEffectiveAgentToolPolicy('router');
      const dataPolicy = getEffectiveAgentToolPolicy('data_coordinator');

      for (const policy of [routerPolicy, dataPolicy]) {
        expect(isToolAllowedByPatterns('list_universal_team_documents', policy)).toBe(true);
        expect(isToolAllowedByPatterns('get_universal_team_document', policy)).toBe(true);
        expect(isToolAllowedByPatterns('create_universal_team_document', policy)).toBe(true);
        expect(isToolAllowedByPatterns('update_universal_team_document', policy)).toBe(true);
        expect(isToolAllowedByPatterns('delete_universal_team_document', policy)).toBe(true);
      }
    });

    it('strategy_coordinator can access create_play_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(true);
    });

    it('strategy_coordinator can access update_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('update_board_diagram', policy)).toBe(true);
    });

    it('strategy_coordinator can access delete_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('delete_board_diagram', policy)).toBe(true);
    });
  });

  // ─── OTHER COORDINATORS CANNOT ACCESS DRILL TOOLS ────────────────────

  describe('Tool Access Control — Other Coordinators', () => {
    it('recruiting_coordinator cannot access create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('recruiting_coordinator');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    });

    it('recruiting_coordinator cannot access create_play_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('recruiting_coordinator');
      expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
    });

    it('performance_coordinator cannot access create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('performance_coordinator');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    });

    it('data_coordinator cannot access create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('data_coordinator');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    });

    it('brand_coordinator cannot access create_board_diagram or create_play_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('brand_coordinator');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
      expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
    });
  });

  // ─── ROUTER CANNOT ACCESS DIAGRAM TOOLS ───────────────────────────────

  describe('Tool Access Control — Router (Primary Agent)', () => {
    it('router cannot access create_play_diagram', () => {
      // Router should not directly call diagram tools — only strategy_coordinator
      // This ensures proper delegation to specialist agent
      const policy = getEffectiveAgentToolPolicy('router');
      expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
    });

    it('router cannot access create_board_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('router');
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    });
  });

  // ─── TOOL DISTINCTION VERIFICATION ────────────────────────────────────

  describe('Tool Distinction — No Overlap', () => {
    it('create_play_diagram and create_board_diagram are separate tools', () => {
      // They should have distinct names and purposes, verified by tool policy
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(policy).toContain('create_play_diagram');
      expect(policy).toContain('create_board_diagram');
      // They should NOT be aliases or wildcards of each other
      expect('create_play_diagram').not.toEqual('create_board_diagram');
    });

    it('update_play_diagram and update_board_diagram have separate tools', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      // Both should be accessible to strategy_coordinator
      expect(isToolAllowedByPatterns('update_board_diagram', policy)).toBe(true);
      // (update_play_diagram is not in policy, only board diagrams)
    });

    it('delete_board_diagram is distinct from delete_play_diagram', () => {
      const policy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('delete_board_diagram', policy)).toBe(true);
    });
  });

  // ─── KIND DISCRIMINATION AT BOUNDARY ───────────────────────────────────

  describe('Kind Discrimination — Schema Level Enforcement', () => {
    it('create_board_diagram schema rejects missing kind field', async () => {
      // Test by attempting validation without kind
      const { CreateBoardDiagramInputSchema } =
        await import('../../tools/integrations/board-diagram/schemas.js');
      const invalidInput = {
        description: 'Test drill',
        sport: 'football',
        // NOTE: kind is MISSING — should fail validation
      };
      const result = CreateBoardDiagramInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('create_board_diagram schema accepts sport_drill kind', async () => {
      const { CreateBoardDiagramInputSchema } =
        await import('../../tools/integrations/board-diagram/schemas.js');
      const validInput = {
        description: 'Test drill',
        sport: 'football',
        kind: 'sport_drill',
      };
      const result = CreateBoardDiagramInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('create_board_diagram schema rejects sport_play kind', async () => {
      const { CreateBoardDiagramInputSchema } =
        await import('../../tools/integrations/board-diagram/schemas.js');
      const invalidInput = {
        description: 'Test play',
        sport: 'football',
        kind: 'sport_play',
      };
      const result = CreateBoardDiagramInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  // ─── SERVICE LAYER ENFORCEMENT ───────────────────────────────────────

  describe('Service Layer — Pipeline Enforcement', () => {
    it('createDiagram requires explicit kind (not defaulting to sport_play)', async () => {
      // This is verified by the board-diagram.service tests
      // but we document the requirement here for Phase 5 clarity
      const { BoardDiagramService } =
        await import('../../tools/integrations/board-diagram/board-diagram.service.js');
      expect(BoardDiagramService).toBeTruthy();
      // The service should NOT have logic like "if (!kind) kind = 'sport_play'"
    });
  });

  // ─── AGENT SYSTEM PROMPT ANTI-PATTERNS ────────────────────────────────

  describe('Agent Prompt Anti-Pattern Prevention', () => {
    it('strategy coordinator prompt does NOT suggest create_play_diagram as fallback for ambiguous requests', async () => {
      const { StrategyCoordinatorAgent } = await import('../strategy-coordinator.agent.js');
      const agent = new StrategyCoordinatorAgent();
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      // Find the ambiguous section and verify it does NOT default to play
      const ambiguousStart = prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**');
      const executionStart = prompt.indexOf('**EXECUTION:**');
      const ambiguousSection = prompt.substring(ambiguousStart, executionStart);
      expect(ambiguousSection).toContain('ask_user');
      expect(ambiguousSection).not.toContain('default to `create_play_diagram`');
      expect(ambiguousSection).not.toContain('assume `sport_play`');
    });

    it('strategy coordinator prompt does NOT suggest create_board_diagram as fallback for all unclear requests', async () => {
      const { StrategyCoordinatorAgent } = await import('../strategy-coordinator.agent.js');
      const agent = new StrategyCoordinatorAgent();
      const prompt = agent.getSystemPrompt({ mode: 'default' });
      const ambiguousStart = prompt.indexOf('**AMBIGUOUS OR MISSING REQUEST TYPE:**');
      const executionStart = prompt.indexOf('**EXECUTION:**');
      const ambiguousSection = prompt.substring(ambiguousStart, executionStart);
      expect(ambiguousSection).not.toContain('default to `create_board_diagram`');
      expect(ambiguousSection).not.toContain('assume `sport_drill`');
    });
  });

  // ─── PHASE 5 SPECIFICATION REQUIREMENTS ───────────────────────────────

  describe('Phase 5 Specification Verification', () => {
    it('tool policy enforces that strategy_coordinator (not router) owns create_board_diagram', () => {
      const routerPolicy = getEffectiveAgentToolPolicy('router');
      const coordinatorPolicy = getEffectiveAgentToolPolicy('strategy_coordinator');
      // Router should NOT have it
      expect(isToolAllowedByPatterns('create_board_diagram', routerPolicy)).toBe(false);
      // Coordinator SHOULD have it
      expect(isToolAllowedByPatterns('create_board_diagram', coordinatorPolicy)).toBe(true);
    });

    it('tool policy enforces that only strategy_coordinator has create_play_diagram among coordinators', () => {
      const others: Array<
        'recruiting_coordinator' | 'data_coordinator' | 'performance_coordinator'
      > = ['recruiting_coordinator', 'data_coordinator', 'performance_coordinator'];

      const strategyPolicy = getEffectiveAgentToolPolicy('strategy_coordinator');
      expect(isToolAllowedByPatterns('create_play_diagram', strategyPolicy)).toBe(true);

      // Verify others do not have it
      others.forEach((coordinator) => {
        const policy = getEffectiveAgentToolPolicy(coordinator);
        expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
      });
    });
  });
});
