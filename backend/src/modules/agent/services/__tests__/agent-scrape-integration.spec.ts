import { describe, expect, it } from 'vitest';
import { buildLinkedAccountScrapeObjective } from '../agent-scrape.service.js';

interface LinkedAccount {
  readonly platform: string;
  readonly profileUrl: string;
}

function buildSingleJobIntent(accounts: readonly LinkedAccount[]): string {
  const platforms = accounts.map((account) => account.platform).join(', ');
  const list = accounts.map((account) => `- ${account.platform}: ${account.profileUrl}`).join('\n');
  return `Analyze my linked ${platforms} account${accounts.length > 1 ? 's' : ''}:\n${list}`;
}

describe('Agent Scrape Pipeline — Onboarding Single-Job Behavior', () => {
  it('keeps team scrape objectives scoped to team data and identifiable recruiting writes', () => {
    const objective = buildLinkedAccountScrapeObjective('coach');

    expect(objective).toContain('recruiting records for identifiable prospects');
    expect(objective).toContain('write a team-linked recruiting record');
    expect(objective).not.toContain('context only');
  });

  it('keeps athlete scrape objectives focused on athlete recruiting data', () => {
    const objective = buildLinkedAccountScrapeObjective('athlete');

    expect(objective).toContain('offers');
    expect(objective).not.toContain('context only');
  });

  it('keeps all linked accounts in one intent payload', () => {
    const accounts: LinkedAccount[] = [
      { platform: 'maxpreps', profileUrl: 'https://www.maxpreps.com/al/hoover/' },
      { platform: 'hudl', profileUrl: 'https://fan.hudl.com/usa/al/hoover/' },
      { platform: 'x', profileUrl: 'https://x.com/HooverBucsBBall' },
    ];

    const intent = buildSingleJobIntent(accounts);

    expect(intent).toContain('Analyze my linked maxpreps, hudl, x accounts');
    expect(intent).toContain('- maxpreps: https://www.maxpreps.com/al/hoover/');
    expect(intent).toContain('- hudl: https://fan.hudl.com/usa/al/hoover/');
    expect(intent).toContain('- x: https://x.com/HooverBucsBBall');
  });

  it('handles one linked account with singular wording', () => {
    const accounts: LinkedAccount[] = [{ platform: 'x', profileUrl: 'https://x.com/rockerlee229' }];

    const intent = buildSingleJobIntent(accounts);

    expect(intent).toContain('Analyze my linked x account:');
    expect(intent).toContain('- x: https://x.com/rockerlee229');
  });

  it('supports larger batches without splitting into multiple intents', () => {
    const accounts: LinkedAccount[] = Array.from({ length: 8 }, (_, index) => ({
      platform: `platform${index + 1}`,
      profileUrl: `https://example.com/profile-${index + 1}`,
    }));

    const intent = buildSingleJobIntent(accounts);

    expect(intent.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(8);
  });
});
