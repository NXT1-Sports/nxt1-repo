import { describe, expect, it } from 'vitest';
import { resolveLiveViewLauncherPlatform } from './live-view-launcher.utils';

describe('resolveLiveViewLauncherPlatform', () => {
  it('uses the auth-aware sign-in url and sign-in platform key for Hudl quick launch', () => {
    expect(resolveLiveViewLauncherPlatform('hudl', 'https://www.hudl.com')).toEqual({
      platformKey: 'hudl_signin',
      url: 'https://www.hudl.com/login',
    });
  });

  it('uses the auth-aware sign-in url and sign-in platform key for X quick launch', () => {
    expect(resolveLiveViewLauncherPlatform('twitter', 'https://x.com')).toEqual({
      platformKey: 'twitter_signin',
      url: 'https://x.com/i/flow/login',
    });
  });

  it('keeps the sign-in platform key but falls back to the launcher url when shared metadata points to the wrong host', () => {
    expect(resolveLiveViewLauncherPlatform('rivals', 'https://www.rivals.com')).toEqual({
      platformKey: 'rivals_signin',
      url: 'https://www.rivals.com',
    });
  });

  it('falls back when no sign-in metadata exists', () => {
    expect(resolveLiveViewLauncherPlatform('unknown', 'https://example.com')).toEqual({
      platformKey: 'unknown',
      url: 'https://example.com',
    });
  });
});
