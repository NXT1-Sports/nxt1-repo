import { PLATFORM_REGISTRY } from '@nxt1/core/platforms';

const QUICK_LAUNCH_SIGNIN_HOSTS: Readonly<Record<string, readonly string[]>> = {
  '247sports': ['247sports.com'],
  hudl: ['hudl.com'],
  instagram: ['instagram.com'],
  maxpreps: ['maxpreps.com'],
  ncsa: ['ncsasports.org'],
  on3: ['on3.com'],
  rivals: ['rivals.com'],
  twitter: ['x.com'],
};

function matchesAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export interface ResolvedLiveViewLauncherPlatform {
  readonly platformKey: string;
  readonly url: string;
}

export function resolveLiveViewLauncherPlatform(
  platformKey: string,
  fallbackUrl: string
): ResolvedLiveViewLauncherPlatform {
  const signInPlatform = PLATFORM_REGISTRY.find(
    (platform) =>
      platform.platform === `${platformKey}_signin` &&
      platform.connectionType === 'signin' &&
      typeof platform.loginUrl === 'string' &&
      platform.loginUrl.trim().length > 0
  );

  const resolvedPlatformKey = signInPlatform?.platform ?? platformKey;

  if (!signInPlatform?.loginUrl) {
    return {
      platformKey: resolvedPlatformKey,
      url: fallbackUrl,
    };
  }

  const allowedHosts = QUICK_LAUNCH_SIGNIN_HOSTS[platformKey];
  if (!allowedHosts?.length) {
    return {
      platformKey: resolvedPlatformKey,
      url: fallbackUrl,
    };
  }

  try {
    const hostname = new URL(signInPlatform.loginUrl).hostname.toLowerCase();
    return {
      platformKey: resolvedPlatformKey,
      url: matchesAllowedHost(hostname, allowedHosts) ? signInPlatform.loginUrl : fallbackUrl,
    };
  } catch {
    return {
      platformKey: resolvedPlatformKey,
      url: fallbackUrl,
    };
  }
}
