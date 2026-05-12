import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '../prompts/index.js';

describe('play diagram prompts', () => {
  it('builds sport-specific prompt sections', () => {
    const soccerPrompt = buildSystemPrompt('soccer');
    const baseballPrompt = buildSystemPrompt('baseball');

    expect(soccerPrompt).toContain('SOCCER POSITIONING RULES');
    expect(baseballPrompt).toContain('BASEBALL POSITIONING RULES');
  });
});
