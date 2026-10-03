import { describe, expect, it } from 'vitest';
import { getSportThinkingPhrase, getSportThinkingPhrases } from './agent-x-sport-phrases';
import { getSportThinkingPhrase as getPhraseFromPresentation } from './agent-x-agent-presentation';

describe('Agent X sport thinking phrases', () => {
  it('returns phrases for known sports regardless of casing and punctuation', () => {
    expect(getSportThinkingPhrases('Football').length).toBeGreaterThan(0);
    expect(getSportThinkingPhrases('Track & Field')).toEqual(getSportThinkingPhrases('track'));
  });

  it('returns null for unknown or missing sports', () => {
    expect(getSportThinkingPhrase('curling')).toBeNull();
    expect(getSportThinkingPhrase(null)).toBeNull();
    expect(getSportThinkingPhrase(undefined, 3)).toBeNull();
  });

  it('rotates by variant and wraps around, including negative values', () => {
    const phrases = getSportThinkingPhrases('basketball');
    expect(getSportThinkingPhrase('basketball', 0)).toBe(phrases[0]);
    expect(getSportThinkingPhrase('basketball', phrases.length + 1)).toBe(phrases[1]);
    expect(getSportThinkingPhrase('basketball', -1)).toBe(phrases[phrases.length - 1]);
  });

  it('is re-exported from the presentation module', () => {
    expect(getPhraseFromPresentation('soccer', 0)).toBe(getSportThinkingPhrase('soccer', 0));
  });
});
