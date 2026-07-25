/**
 * @fileoverview Get College Logos Tool — Firebase Storage URL Resolver
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Resolves one or more college/university names to their official logo URLs
 * stored in Firebase Storage.
 *
 * Architecture:
 * - Queries the MongoDB `College` collection by name (full-text search).
 * - Returns the `logoUrl` field (numeric ID, e.g. "104151").
 * - Constructs the public Firebase Storage URL:
 *   `https://storage.googleapis.com/{BUCKET}/Colleges/{id}.png`
 *
 * Security:
 * - Read-only (isMutation = false).
 * - All agents can invoke this tool.
 * - Input strings sanitized to prevent regex injection.
 * - Hard cap of 20 names per call to prevent context-window bloat.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { CollegeModel } from '../../../../models/core/college.model.js';
import { z } from 'zod';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_NAMES = 20;

const COLLEGE_NAME_ALIASES: Readonly<Record<string, string>> = {
  ucf: 'University of Central Florida',
  usf: 'University of South Florida',
  fau: 'Florida Atlantic University',
  fiu: 'Florida International University',
  fsu: 'Florida State University',
  'ucf knights': 'University of Central Florida',
  'usf bulls': 'University of South Florida',
  'fau owls': 'Florida Atlantic University',
  uf: 'University of Florida',
  florida: 'University of Florida',
};

const GetCollegeLogosInputSchema = z.object({
  colleges: z.array(z.string().trim().min(1)).min(1),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCollegeNameCandidates(name: string): readonly string[] {
  const normalized = name.trim();
  if (!normalized) return [];

  const alias = COLLEGE_NAME_ALIASES[normalized.toLowerCase()];
  if (!alias) return [normalized];

  return [normalized, alias];
}

function getBucket(): string {
  const bucket =
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? process.env['FIREBASE_STORAGE_BUCKET'];
  if (!bucket) {
    throw new AgentEngineError(
      'STORAGE_CONFIG_MISSING_BUCKET',
      'Firebase Storage bucket env var is not configured.'
    );
  }
  return bucket;
}

function buildCollegeLogoUrl(rawLogoValue: string, defaultBucket: string): string {
  const trimmed = rawLogoValue.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex <= 0) {
      return '';
    }

    const bucket = withoutScheme.slice(0, slashIndex).trim();
    const objectPath = withoutScheme.slice(slashIndex + 1).trim();
    if (!bucket || !objectPath) return '';

    return `https://storage.googleapis.com/${bucket}/${objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
  }

  const looksLikePath = trimmed.includes('/');
  const fileName = looksLikePath
    ? trimmed
    : trimmed.includes('.')
      ? `Colleges/${trimmed}`
      : `Colleges/${trimmed}.png`;

  return `https://storage.googleapis.com/${defaultBucket}/${fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class GetCollegeLogosTool extends BaseTool {
  readonly name = 'get_college_logos';

  readonly description =
    'Resolves college/university names to their official logo URLs from Firebase Storage. ' +
    'Use this before generating commitment graphics, offer announcements, or any visual that ' +
    'features a school — pass the returned logoUrl inside logoUrls to generate_graphic. ' +
    'Also use when writing recruiting activity (pass to collegeLogoUrl in write_recruiting_activity). ' +
    'If found: false is returned for a school, omit the logo or fall back to web_search. ' +
    'Max 20 names per call.';

  readonly parameters = GetCollegeLogosInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetCollegeLogosInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const names = parsed.data.colleges.slice(0, MAX_NAMES);

    let bucket: string;
    try {
      bucket = getBucket();
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Storage config error.',
      };
    }

    context?.emitStage?.('fetching_data', {
      icon: 'search',
      collegeCount: names.length,
      phase: 'resolve_college_logos',
    });

    const results: Array<{ name: string; logoUrl: string | null; found: boolean }> = [];
    const missing: string[] = [];

    for (const name of names) {
      try {
        let logoUrl: string | null = null;

        for (const candidate of buildCollegeNameCandidates(name)) {
          const exactNameFilter: Record<string, unknown> = {
            name: { $regex: `^${escapeRegex(candidate)}$`, $options: 'i' },
          };
          const searchFilters: readonly Record<string, unknown>[] =
            candidate.length >= 3
              ? [
                  { $text: { $search: `"${candidate}"` } },
                  exactNameFilter,
                  { $text: { $search: candidate } },
                  { name: { $regex: escapeRegex(candidate), $options: 'i' } },
                ]
              : [exactNameFilter, { name: { $regex: escapeRegex(candidate), $options: 'i' } }];

          let doc: { logoUrl?: unknown } | null = null;
          for (const filter of searchFilters) {
            doc = await CollegeModel.findOne(filter, { logoUrl: 1 })
              .lean<{ logoUrl?: unknown }>()
              .exec();
            if (doc) break;
          }

          const logoValue = typeof doc?.logoUrl === 'string' ? doc.logoUrl.trim() : '';
          if (!logoValue) continue;

          logoUrl = buildCollegeLogoUrl(logoValue, bucket);
          if (!logoUrl) continue;
          break;
        }

        if (logoUrl) {
          results.push({
            name,
            logoUrl,
            found: true,
          });
        } else {
          results.push({ name, logoUrl: null, found: false });
          missing.push(name);
        }
      } catch {
        results.push({ name, logoUrl: null, found: false });
        missing.push(name);
      }
    }

    return {
      success: true,
      data: {
        found: results.filter((r) => r.found).length,
        requested: names.length,
        colleges: results,
        ...(missing.length > 0 && {
          _agent_hint:
            `Logo not found for: ${missing.join(', ')}. ` +
            'Try web_search for the logo URL or omit the logo from the graphic.',
        }),
      },
    };
  }
}
