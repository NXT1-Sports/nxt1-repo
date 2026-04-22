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

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_NAMES = 20;

const GetCollegeLogosInputSchema = z.object({
  colleges: z.array(z.string().trim().min(1)).min(1),
});

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

export class GetCollegeLogosTool extends BaseTool {
  readonly name = 'get_college_logos';

  readonly description =
    'Resolves college/university names to their official logo URLs from Firebase Storage. ' +
    'Use this before generating commitment graphics, offer announcements, or any visual that ' +
    'features a school — pass the returned logoUrl as subjectImageUrl to generate_graphic. ' +
    'Also use when writing recruiting activity (pass to collegeLogoUrl in write_recruiting_activity). ' +
    'If found: false is returned for a school, omit the logo or fall back to web_search. ' +
    'Max 20 names per call.';

  readonly parameters = GetCollegeLogosInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

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
        const filter: Record<string, unknown> =
          name.length >= 3
            ? { $text: { $search: name } }
            : { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } };

        const doc = await CollegeModel.findOne(filter, { logoUrl: 1, name: 1 }).lean().exec();

        if (doc?.logoUrl) {
          results.push({
            name,
            logoUrl: `https://storage.googleapis.com/${bucket}/Colleges/${encodeURIComponent(doc.logoUrl)}.png`,
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
