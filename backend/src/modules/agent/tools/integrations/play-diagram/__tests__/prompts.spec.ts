import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '../prompts/index.js';

describe('play diagram prompts', () => {
  it('builds sport-specific prompt sections', () => {
    const soccerPrompt = buildSystemPrompt('soccer');
    const baseballPrompt = buildSystemPrompt('baseball');
    const footballPrompt = buildSystemPrompt('football');

    expect(soccerPrompt).toContain('SOCCER POSITIONING RULES');
    expect(baseballPrompt).toContain('BASEBALL POSITIONING RULES');
    expect(footballPrompt).toContain('ELITE FOOTBALL GEOMETRY');
    expect(footballPrompt).toContain('Deep routes (Post/Corner/Vert/Go/Fade)');
  });

  it('includes QB route restriction rule in football prompt', () => {
    const footballPrompt = buildSystemPrompt('football');
    expect(footballPrompt).toContain('QB ROUTE RULE');
    expect(footballPrompt).toContain('DO NOT create a QB route unless the play explicitly involves QB movement');
    expect(footballPrompt).toContain('QB routes are ONLY needed for: scrambles, QB runs, rollouts');
    expect(footballPrompt).toContain('QB is stationary in pocket by default');
  });

  it('requires per-route color selection from the approved palette', () => {
    const footballPrompt = buildSystemPrompt('football');
    expect(footballPrompt).toContain('COLOR RULES (REQUIRED)');
    expect(footballPrompt).toContain('every route MUST include a "color" value');
    expect(footballPrompt).toContain('"#00ff00"|"#0099ff"|"#ffdd00"|"#ff3333"');
    expect(footballPrompt).toContain('DISTRIBUTION RULE');
  });

  it('includes mandatory OL blocking scheme instructions for run/protection concepts', () => {
    const footballPrompt = buildSystemPrompt('football');
    expect(footballPrompt).toContain('BLOCKING SCHEME RULES');
    expect(footballPrompt).toContain('include explicit blocking assignments for OL: LT, LG, C, RG, RT');
    expect(footballPrompt).toContain('OL assignments MUST use type: "block"');
  });
});
