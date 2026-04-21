/**
 * @fileoverview Get Conference Logos Tool — Firebase Storage URL Resolver
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Resolves one or more conference names to their official logo URLs stored
 * in Firebase Storage.
 *
 * Architecture:
 * - Queries the MongoDB `College` collection using an aggregation pipeline
 *   that unwinds the `sportInfo` Map and matches on the `conference` field.
 * - Extracts the `conferenceId` from the matching SportInfo sub-document
 *   (e.g. "GLIAC", "GoldenValleyConference", "SEC").
 * - Constructs the public Firebase Storage URL:
 *   `https://storage.googleapis.com/{BUCKET}/Conferences/{conferenceId}.png`
 *
 * Security:
 * - Read-only (isMutation = false).
 * - All agents can invoke this tool.
 * - Input strings sanitized to prevent regex injection.
 * - Hard cap of 20 names per call to prevent context-window bloat.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { CollegeModel } from '../../../../models/college.model.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_NAMES = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBucket(): string {
  const bucket =
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? process.env['FIREBASE_STORAGE_BUCKET'];
  if (!bucket) throw new Error('Firebase Storage bucket env var is not configured.');
  return bucket;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class GetConferenceLogosTool extends BaseTool {
  readonly name = 'get_conference_logos';

  readonly description =
    'Resolves conference names to their official logo URLs from Firebase Storage. ' +
    'Use this before generating conference-branded graphics, recruiting filters, or any ' +
    'visual that features a conference logo. ' +
    'If found: false is returned, fall back to web_search for the logo URL. ' +
    'Max 20 names per call.';

  readonly parameters = {
    type: 'object',
    properties: {
      conferences: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of conference names to resolve logos for. ' +
          'Examples: ["SEC", "Big Ten", "ACC", "GLIAC", "Big 12", "Pac-12"]. ' +
          'Matched case-insensitively against conference names in the college database.',
      },
    },
    required: ['conferences'],
  } as const;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const rawConferences = this.arr(input, 'conferences');
    if (!rawConferences) return this.paramError('conferences');

    const names = (
      rawConferences.filter((n) => typeof n === 'string' && n.trim().length > 0) as string[]
    ).slice(0, MAX_NAMES);

    if (names.length === 0) {
      return { success: false, error: 'All provided conference names were empty.' };
    }

    let bucket: string;
    try {
      bucket = getBucket();
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Storage config error.',
      };
    }

    context?.onProgress?.(`Resolving logos for ${names.length} conference(s)…`);

    const results: Array<{ name: string; logoUrl: string | null; found: boolean }> = [];
    const missing: string[] = [];

    for (const confName of names) {
      try {
        // Unwind the sportInfo Map and match on conference name, then extract
        // conferenceId from the first matching SportInfo entry.
        type AggResult = { _sportEntries: Array<{ k: string; v: { conferenceId?: string } }> };

        const pipeline = [
          {
            $addFields: {
              _sportEntries: { $objectToArray: { $ifNull: ['$sportInfo', {}] } },
            },
          },
          {
            $match: {
              '_sportEntries.v.conference': { $regex: escapeRegex(confName), $options: 'i' },
            },
          },
          {
            $project: {
              _sportEntries: {
                $filter: {
                  input: '$_sportEntries',
                  as: 'entry',
                  cond: {
                    $regexMatch: {
                      input: { $ifNull: ['$$entry.v.conference', ''] },
                      regex: escapeRegex(confName),
                      options: 'i',
                    },
                  },
                },
              },
            },
          },
          { $limit: 1 },
        ];

        const [doc] = await CollegeModel.aggregate<AggResult>(pipeline).exec();
        const conferenceId = doc?._sportEntries?.[0]?.v?.conferenceId;

        if (conferenceId) {
          results.push({
            name: confName,
            logoUrl: `https://storage.googleapis.com/${bucket}/Conferences/${encodeURIComponent(conferenceId)}.png`,
            found: true,
          });
        } else {
          results.push({ name: confName, logoUrl: null, found: false });
          missing.push(confName);
        }
      } catch {
        results.push({ name: confName, logoUrl: null, found: false });
        missing.push(confName);
      }
    }

    return {
      success: true,
      data: {
        found: results.filter((r) => r.found).length,
        requested: names.length,
        conferences: results,
        ...(missing.length > 0 && {
          _agent_hint:
            `Conference logo not found for: ${missing.join(', ')}. ` +
            'The conference may not be in the NXT1 database. Try web_search for the logo URL.',
        }),
      },
    };
  }
}
