/**
 * @fileoverview Diagram tool policy tests for the default-disabled rollout state.
 */

import { describe, expect, it } from 'vitest';
import { getEffectiveAgentToolPolicy, isToolAllowedByPatterns } from '../tool-policy.js';

describe('Diagram tool policy gating', () => {
  it('keeps universal document lifecycle tools available to strategy', () => {
    const policy = getEffectiveAgentToolPolicy('strategy_coordinator');

    expect(isToolAllowedByPatterns('list_universal_team_documents', policy)).toBe(true);
    expect(isToolAllowedByPatterns('get_universal_team_document', policy)).toBe(true);
    expect(isToolAllowedByPatterns('create_universal_team_document', policy)).toBe(true);
    expect(isToolAllowedByPatterns('update_universal_team_document', policy)).toBe(true);
    expect(isToolAllowedByPatterns('delete_universal_team_document', policy)).toBe(true);
  });

  it('filters all diagram tools out of strategy by default', () => {
    const policy = getEffectiveAgentToolPolicy('strategy_coordinator');

    expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
    expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    expect(isToolAllowedByPatterns('update_board_diagram', policy)).toBe(false);
    expect(isToolAllowedByPatterns('delete_board_diagram', policy)).toBe(false);
  });

  it('does not expose diagram tools to router or other coordinators', () => {
    for (const agentId of [
      'router',
      'recruiting_coordinator',
      'performance_coordinator',
      'data_coordinator',
      'brand_coordinator',
    ] as const) {
      const policy = getEffectiveAgentToolPolicy(agentId);
      expect(isToolAllowedByPatterns('create_play_diagram', policy)).toBe(false);
      expect(isToolAllowedByPatterns('create_board_diagram', policy)).toBe(false);
    }
  });

  it('still enforces board diagram schema kind requirements', async () => {
    const { CreateBoardDiagramInputSchema } =
      await import('../../tools/integrations/board-diagram/schemas.js');

    expect(
      CreateBoardDiagramInputSchema.safeParse({
        description: 'Test drill',
        sport: 'football',
      }).success
    ).toBe(false);

    expect(
      CreateBoardDiagramInputSchema.safeParse({
        description: 'Test drill',
        sport: 'football',
        kind: 'sport_drill',
      }).success
    ).toBe(true);

    expect(
      CreateBoardDiagramInputSchema.safeParse({
        description: 'Test play',
        sport: 'football',
        kind: 'sport_play',
      }).success
    ).toBe(false);
  });
});
