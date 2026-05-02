/**
 * @public @nxt1/core/platforms
 *
 * Authoritative platform definitions for NXT1 — types, registry, and favicon utilities.
 *
 * Used by: onboarding, profile, team, agent-x, backend intel, firecrawl
 *
 * @example
 * import { PLATFORM_REGISTRY, getPlatformFaviconUrl } from '@nxt1/core/platforms';
 */

export type {
  PlatformConnectionType,
  PlatformScope,
  PlatformCategory,
  PlatformDefinition,
} from './platform.types';

export { PLATFORM_REGISTRY, PLATFORM_CATEGORIES } from './platform-registry';

export {
  PLATFORM_FAVICON_DOMAINS,
  getPlatformFaviconUrl,
  getPlatformFaviconUrlFromUrl,
} from './platform-favicons';
