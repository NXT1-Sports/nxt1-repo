/**
 * @fileoverview Strategy coordinator diagram gating tests.
 *
 * The diagram tools are feature-flagged off by default until the artifact path
 * is ready. These tests verify that the coordinator prompt and filtered tool
 * policy both reflect that default-disabled state.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';
import { getAgentToolPolicy, getEffectiveAgentToolPolicy } from '../tool-policy.js';

describe('Strategy Coordinator diagram tool gating', () => {
  let agent: StrategyCoordinatorAgent;

  beforeEach(() => {
    agent = new StrategyCoordinatorAgent();
  });

  it('filters diagram tools out of the strategy coordinator policy by default', () => {
    const policy = getAgentToolPolicy('strategy_coordinator');
    const effectivePolicy = getEffectiveAgentToolPolicy('strategy_coordinator');

    for (const toolName of [
      'create_play_diagram',
      'create_board_diagram',
      'update_board_diagram',
      'delete_board_diagram',
    ]) {
      expect(policy).not.toContain(toolName);
      expect(effectivePolicy).not.toContain(toolName);
    }
  });

  it('replaces the play/drill runbook with a disabled message', () => {
    const prompt = agent.getSystemPrompt({ mode: 'default' });

    expect(prompt).toContain('Diagram generation is currently disabled behind a feature flag');
    expect(prompt).toContain(
      'Do NOT call `create_play_diagram`, `create_board_diagram`, `update_board_diagram`, or `delete_board_diagram`.'
    );
    expect(prompt).toContain('visual diagram generation is not enabled yet');
    expect(prompt).not.toContain('**PLAY DIAGRAMS (`create_play_diagram`):**');
    expect(prompt).not.toContain(
      '**DRILL BOARDS (`create_board_diagram` with `kind: "sport_drill"`):**'
    );
    expect(prompt).not.toContain('For EACH requested play, call `create_play_diagram` one time.');
  });

  it('keeps non-diagram strategy guidance intact', () => {
    const prompt = agent.getSystemPrompt({ mode: 'default' });

    expect(prompt).toContain('Film-review-to-game-plan ownership rule');
    expect(prompt).toContain('generate_chart_visualization');
    expect(prompt).toContain('create_universal_team_document');
    expect(prompt).toContain('NEVER substitute a single `generate_graphic` call');
  });

  it('teaches a written fallback for diagram requests', () => {
    const prompt = agent.getSystemPrompt({ mode: 'default' });

    expect(prompt).toContain('For play requests, offer a written concept breakdown');
    expect(prompt).toContain('For drill requests, offer a written drill setup');
    expect(prompt).toContain(
      'You explain that diagram generation is not enabled yet and provide a concise written breakdown instead'
    );
  });
});
