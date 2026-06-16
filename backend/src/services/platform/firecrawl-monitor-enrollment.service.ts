import { normalizeConnectedPlatform } from '@nxt1/core/profile';
import { logger } from '../../utils/logger.js';
import {
  FirecrawlMonitorService,
  type FirecrawlMonitorOwner,
  type FirestoreLike,
} from '../../modules/agent/tools/integrations/firecrawl/browser/firecrawl-monitor.service.js';

interface MonitorableConnectedSource {
  readonly platform: string;
  readonly profileUrl: string;
}

const DEFAULT_FIRECRAWL_MONITOR_SCHEDULE = {
  cron: '0 0 */3 * *',
  timezone: 'UTC',
} as const;

const UNSUPPORTED_MONITOR_PLATFORMS = new Set(['google', 'microsoft']);
const CUSTOM_PLATFORM_PREFIX = 'custom::';

let firecrawlMonitorService: FirecrawlMonitorService | null = null;

function getFirecrawlMonitorService(): FirecrawlMonitorService {
  if (!firecrawlMonitorService) {
    firecrawlMonitorService = new FirecrawlMonitorService();
  }
  return firecrawlMonitorService;
}

function normalizeMonitorTargetUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildMonitorCandidates(
  linkedAccounts: readonly MonitorableConnectedSource[]
): Array<{ readonly platform: string; readonly targetUrl: string }> {
  const candidates = new Map<string, string>();

  for (const source of linkedAccounts) {
    const platform = normalizeConnectedPlatform(source.platform);
    if (!platform) continue;
    if (UNSUPPORTED_MONITOR_PLATFORMS.has(platform)) continue;
    if (platform.startsWith(CUSTOM_PLATFORM_PREFIX)) continue;

    const targetUrl = normalizeMonitorTargetUrl(source.profileUrl);
    if (!targetUrl) continue;

    if (!candidates.has(platform)) {
      candidates.set(platform, targetUrl);
    }
  }

  return Array.from(candidates.entries()).map(([platform, targetUrl]) => ({
    platform,
    targetUrl,
  }));
}

export async function ensureFirecrawlMonitorsForConnectedSources(options: {
  readonly db: FirestoreLike;
  readonly userId: string;
  readonly owner: FirecrawlMonitorOwner;
  readonly linkedAccounts: readonly MonitorableConnectedSource[];
  readonly source: 'onboarding' | 'add-sport';
}): Promise<void> {
  const candidates = buildMonitorCandidates(options.linkedAccounts);
  if (candidates.length === 0) {
    return;
  }

  let service: FirecrawlMonitorService;
  try {
    service = getFirecrawlMonitorService();
  } catch (error) {
    logger.warn('[FirecrawlMonitorEnrollment] Firecrawl monitor service unavailable', {
      userId: options.userId,
      ownerType: options.owner.ownerType,
      ownerId: options.owner.ownerId,
      source: options.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const candidate of candidates) {
    try {
      const existing = await service.getMonitorForOwner(
        options.db,
        options.owner,
        candidate.platform
      );
      if (existing) {
        await service.updateMonitorForOwner(options.db, options.owner, candidate.platform, {
          targetUrl: candidate.targetUrl,
          enabled: true,
        });
        continue;
      }

      await service.createMonitorForOwner(options.db, options.owner, {
        platform: candidate.platform,
        targetUrl: candidate.targetUrl,
        schedule: DEFAULT_FIRECRAWL_MONITOR_SCHEDULE,
        goal: `Monitor my ${candidate.platform} account for meaningful updates and notify me through Agent X.`,
        judgeEnabled: true,
        metadata: {
          source: options.source,
        },
      });
    } catch (error) {
      logger.warn('[FirecrawlMonitorEnrollment] Failed to ensure monitor for connected source', {
        userId: options.userId,
        ownerType: options.owner.ownerType,
        ownerId: options.owner.ownerId,
        source: options.source,
        platform: candidate.platform,
        targetUrl: candidate.targetUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
