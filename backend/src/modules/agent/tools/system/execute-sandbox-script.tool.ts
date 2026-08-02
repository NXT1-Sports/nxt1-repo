import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  resolveTeamFilmReviewRowOwnership,
  type TeamFilmReviewDoc,
  type TeamFilmReviewRowOwnership,
} from '@nxt1/core';
import { loadUniversalFilmReview } from '../../../../services/team/universal-film-reviews.service.js';
import { assertReviewAccess } from '../intel/team/film-review-compat.tool.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

const MAX_SCRIPT_CHARS = 12_000;
const MAX_INLINE_JSON_CHARS = 1_000_000;
const MAX_PAYLOAD_CHARS = 5_000_000;
const MAX_STDIO_CHARS = 2_000_000;
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 5_000;
const MAX_DATA_SOURCES = 6;

const RESERVED_ALIASES = new Set([
  'process',
  'require',
  'global',
  'globalThis',
  'Function',
  'eval',
  'module',
  'exports',
  '__proto__',
  'constructor',
  'prototype',
]);

const AliasSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/)
  .refine((alias) => !RESERVED_ALIASES.has(alias), 'Alias is reserved.');

const InlineJsonDataSourceSchema = z.object({
  sourceType: z.literal('inline_json'),
  alias: AliasSchema,
  value: z.unknown(),
});

const FilmReviewDataSourceSchema = z.object({
  sourceType: z.literal('film_review'),
  alias: AliasSchema,
  filmReviewId: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Film review ID to load from backend storage. Use this instead of pasting saved timeline rows inline when you need normalized ownership.'
    ),
  selectedSourceIds: z.array(z.string().trim().min(1)).max(500).optional(),
});

const ExecuteSandboxScriptInputSchema = z.object({
  script: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SCRIPT_CHARS)
    .describe(
      'Synchronous JavaScript body. Use return to output JSON-serializable analysis. No imports, require, network, filesystem, or async calls. For a single film_review data source, convenience globals like selectedTimeline, rowOwnership, ownershipSummary, timeline, and selectedSources are also injected when those names are not already used by another alias.'
    ),
  dataSources: z
    .array(
      z.discriminatedUnion('sourceType', [InlineJsonDataSourceSchema, FilmReviewDataSourceSchema])
    )
    .min(1)
    .max(MAX_DATA_SOURCES)
    .describe(
      'JSON inputs for the sandbox. Use sourceType "film_review" for saved film-review analysis, especially when you need selectedTimeline, rowOwnership, or ownershipSummary. Use sourceType "inline_json" only for generic tables/arrays you already fully control.'
    ),
  timeoutMs: z.number().int().min(250).max(MAX_TIMEOUT_MS).optional(),
});

type ExecuteSandboxScriptInput = z.infer<typeof ExecuteSandboxScriptInputSchema>;
type ResolvedSandboxDataSource = {
  readonly alias: string;
  readonly sourceType: 'inline_json' | 'film_review';
  readonly value: unknown;
  readonly summary: Record<string, unknown>;
};

type ResolveSandboxDataSourcesResult =
  | { readonly ok: true; readonly dataSources: readonly ResolvedSandboxDataSource[] }
  | { readonly ok: false; readonly result: ToolResult };

type SandboxRunnerResult = {
  readonly success: boolean;
  readonly result?: unknown;
  readonly logs?: readonly string[];
  readonly error?: string;
};

const SANDBOX_RUNNER = String.raw`
const vm = require('node:vm');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > ${MAX_PAYLOAD_CHARS}) {
    process.stdout.write(JSON.stringify({ success: false, error: 'Sandbox payload exceeded maximum size.' }));
    process.exit(0);
  }
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const logs = [];
    const context = Object.create(null);
    context.Math = Math;
    context.JSON = JSON;
    context.Number = Number;
    context.String = String;
    context.Boolean = Boolean;
    context.Array = Array;
    context.Object = Object;
    context.Set = Set;
    context.Map = Map;
    context.Date = Date;
    context.console = {
      log: (...args) => {
        if (logs.length < 50) logs.push(args.map((arg) => String(arg)).join(' '));
      },
    };
    context.helpers = Object.freeze({
      sumBy: (items, selector) => items.reduce((total, item, index) => total + (Number(selector(item, index)) || 0), 0),
      countBy: (items, selector) => items.reduce((acc, item, index) => {
        const key = String(selector(item, index));
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      groupBy: (items, selector) => items.reduce((acc, item, index) => {
        const key = String(selector(item, index));
        (acc[key] ||= []).push(item);
        return acc;
      }, {}),
      unique: (items) => Array.from(new Set(items)),
      pct: (part, whole, digits = 1) => whole ? Number(((Number(part) / Number(whole)) * 100).toFixed(digits)) : 0,
    });
    context.dataSources = Object.freeze(payload.dataSources ?? {});
    for (const [alias, value] of Object.entries(payload.dataSources ?? {})) {
      context[alias] = value;
    }

    vm.createContext(context, {
      codeGeneration: { strings: false, wasm: false },
    });
    const wrappedScript = '"use strict";\n(() => {\n' + payload.script + '\n})()';
    const script = new vm.Script(wrappedScript, { filename: 'agent-sandbox.js' });
    const result = script.runInContext(context, {
      timeout: payload.timeoutMs,
      displayErrors: true,
      breakOnSigint: false,
    });
    process.stdout.write(JSON.stringify({ success: true, result, logs }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});
`;

function summarizeTimelineOwnership(ownership: readonly TeamFilmReviewRowOwnership[]) {
  const rowKindCounts: Record<TeamFilmReviewRowOwnership['rowKind'], number> = {
    offense_defense: 0,
    possession: 0,
    at_bat: 0,
    special_teams: 0,
    neutral: 0,
    unknown: 0,
  };
  const confidenceCounts: Record<TeamFilmReviewRowOwnership['confidence'], number> = {
    verified: 0,
    inferred: 0,
    ambiguous: 0,
  };
  const offensiveTagTeamCounts: Record<
    TeamFilmReviewRowOwnership['offensiveTagsDescribe'],
    number
  > = {
    our: 0,
    opponent: 0,
    unknown: 0,
  };
  const defensiveTagTeamCounts: Record<
    TeamFilmReviewRowOwnership['defensiveTagsDescribe'],
    number
  > = {
    our: 0,
    opponent: 0,
    unknown: 0,
  };
  const requiredClarifications = new Set<string>();

  for (const rowOwnership of ownership) {
    rowKindCounts[rowOwnership.rowKind] += 1;
    confidenceCounts[rowOwnership.confidence] += 1;
    offensiveTagTeamCounts[rowOwnership.offensiveTagsDescribe] += 1;
    defensiveTagTeamCounts[rowOwnership.defensiveTagsDescribe] += 1;
    if (rowOwnership.requiredClarification) {
      requiredClarifications.add(rowOwnership.requiredClarification);
    }
  }

  return {
    rowCount: ownership.length,
    rowKindCounts,
    confidenceCounts,
    offensiveTagTeamCounts,
    defensiveTagTeamCounts,
    requiredClarifications: [...requiredClarifications],
  };
}

function buildTimelineOwnership(review: TeamFilmReviewDoc) {
  return (review.timeline ?? []).map((row) =>
    resolveTeamFilmReviewRowOwnership({
      sport: review.sport,
      perspective: review.perspective,
      row,
    })
  );
}

function sanitizeSourceForSandbox(source: NonNullable<TeamFilmReviewDoc['sources']>[number]) {
  const {
    videoUrl: _videoUrl,
    downloadUrl: _downloadUrl,
    sourceUrl: _sourceUrl,
    ...safeSource
  } = source as NonNullable<TeamFilmReviewDoc['sources']>[number] & {
    readonly videoUrl?: unknown;
    readonly downloadUrl?: unknown;
    readonly sourceUrl?: unknown;
  };
  return safeSource;
}

function buildFilmReviewSandboxValue(
  review: TeamFilmReviewDoc,
  selectedSourceIds: readonly string[] | undefined
) {
  const selectedSourceSet = new Set(selectedSourceIds ?? []);
  const timeline = review.timeline ?? [];
  const sources = (review.sources ?? []).map(sanitizeSourceForSandbox);
  const rowOwnership = buildTimelineOwnership(review);
  const selectedTimeline = selectedSourceSet.size
    ? timeline.filter((row) => row.sourceId && selectedSourceSet.has(row.sourceId))
    : timeline;
  const selectedSources = selectedSourceSet.size
    ? sources.filter((source) => source.id && selectedSourceSet.has(source.id))
    : sources;

  return {
    filmReviewId: review.id,
    title: review.title,
    sport: review.sport,
    perspective: review.perspective,
    uploadMode: review.uploadMode,
    selectedSourceIds: [...selectedSourceSet],
    sources,
    selectedSources,
    timeline,
    selectedTimeline,
    rowOwnership,
    ownershipSummary: summarizeTimelineOwnership(rowOwnership),
  };
}

function jsonLength(value: unknown): number {
  return JSON.stringify(value).length;
}

function buildSandboxBindings(
  dataSources: readonly ResolvedSandboxDataSource[]
): Record<string, unknown> {
  const bindings: Record<string, unknown> = Object.create(null);

  for (const source of dataSources) {
    bindings[source.alias] = source.value;
  }

  const filmReviewSources = dataSources.filter((source) => source.sourceType === 'film_review');
  if (filmReviewSources.length !== 1) return bindings;

  const filmValue = filmReviewSources[0].value;
  if (!filmValue || typeof filmValue !== 'object' || Array.isArray(filmValue)) {
    return bindings;
  }

  const convenienceKeys = [
    'filmReviewId',
    'title',
    'sport',
    'perspective',
    'uploadMode',
    'selectedSourceIds',
    'sources',
    'selectedSources',
    'timeline',
    'selectedTimeline',
    'rowOwnership',
    'ownershipSummary',
  ] as const;

  for (const key of convenienceKeys) {
    if (bindings[key] !== undefined) continue;
    const value = (filmValue as Record<string, unknown>)[key];
    if (value !== undefined) {
      bindings[key] = value;
    }
  }

  return bindings;
}

function enhanceSandboxError(
  error: string | undefined,
  dataSources: readonly ResolvedSandboxDataSource[]
): string {
  if (!error) return 'Sandbox execution failed.';

  if (
    error.includes('rowOwnership is not defined') ||
    error.includes('ownershipSummary is not defined')
  ) {
    const hasFilmReviewSource = dataSources.some((source) => source.sourceType === 'film_review');
    if (hasFilmReviewSource) {
      return `${error}. Film-review ownership helpers are available only from a film_review data source. Access them through the injected convenience globals or the film-review alias object.`;
    }
    return `${error}. This analysis asked for normalized ownership data, but the sandbox only received generic inline JSON. Re-run with sourceType "film_review" so selectedTimeline, rowOwnership, and ownershipSummary are available from authoritative review data.`;
  }

  return error;
}

export class ExecuteSandboxScriptTool extends BaseTool {
  readonly name = 'execute_sandbox_script';
  readonly description =
    'Run synchronous JavaScript data analysis over backend-injected JSON data sources. Use for deterministic aggregation, filtering, math, summaries, and data-quality checks. For saved film-review analysis, prefer a film_review data source instead of pasting rows inline; that exposes authoritative selectedTimeline, rowOwnership, and ownershipSummary data. Do not use for network, filesystem, media watching, or mutations.';
  readonly parameters = ExecuteSandboxScriptInputSchema;
  readonly isMutation = false;
  readonly category = 'data' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly db: Firestore = getFirestore()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const duplicateAlias = findDuplicateAlias(
      parsed.data.dataSources.map((source) => source.alias)
    );
    if (duplicateAlias) {
      return {
        success: false,
        error: `Duplicate sandbox data source alias: ${duplicateAlias}`,
        isValidationError: true,
      };
    }

    const startedAt = performance.now();
    const resolved = await this.resolveDataSources(parsed.data, context);
    if (!resolved.ok) return resolved.result;

    const dataSources = buildSandboxBindings(resolved.dataSources);
    const payload = {
      script: parsed.data.script,
      timeoutMs: parsed.data.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      dataSources,
    };
    if (jsonLength(payload) > MAX_PAYLOAD_CHARS) {
      return {
        success: false,
        error: 'Sandbox input payload is too large. Narrow the data sources or selected IDs.',
        isValidationError: true,
      };
    }

    const sandbox = await runSandboxProcess(payload, context.signal);
    if (!sandbox.success) {
      return {
        success: false,
        error: enhanceSandboxError(sandbox.error, resolved.dataSources),
        isValidationError: true,
        data: {
          dataSources: resolved.dataSources.map((source) => source.summary),
          logs: sandbox.logs ?? [],
        },
      };
    }

    return {
      success: true,
      markdown: 'Completed sandbox data analysis.',
      data: {
        result: sandbox.result,
        logs: sandbox.logs ?? [],
        executionMs: Math.round(performance.now() - startedAt),
        dataSources: resolved.dataSources.map((source) => source.summary),
      },
    };
  }

  private async resolveDataSources(
    input: ExecuteSandboxScriptInput,
    context: ToolExecutionContext
  ): Promise<ResolveSandboxDataSourcesResult> {
    const resolved: ResolvedSandboxDataSource[] = [];

    for (const source of input.dataSources) {
      if (source.sourceType === 'inline_json') {
        if (jsonLength(source.value) > MAX_INLINE_JSON_CHARS) {
          return {
            ok: false,
            result: {
              success: false,
              error: `Inline JSON source ${source.alias} is too large. Use a backend data source instead.`,
              isValidationError: true,
            },
          };
        }
        resolved.push({
          alias: source.alias,
          sourceType: source.sourceType,
          value: source.value,
          summary: {
            alias: source.alias,
            sourceType: source.sourceType,
            jsonBytes: jsonLength(source.value),
          },
        });
        continue;
      }

      const review = await loadUniversalFilmReview(this.db, source.filmReviewId);
      if (!review) {
        return {
          ok: false,
          result: { success: false, error: `Film review ${source.filmReviewId} was not found.` },
        };
      }
      const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
      if (!permission.ok) {
        return { ok: false, result: { success: false, error: permission.error } };
      }

      const value = buildFilmReviewSandboxValue(review, source.selectedSourceIds);
      resolved.push({
        alias: source.alias,
        sourceType: source.sourceType,
        value,
        summary: {
          alias: source.alias,
          sourceType: source.sourceType,
          filmReviewId: review.id,
          title: review.title,
          timelineRows: review.timeline?.length ?? 0,
          sources: review.sources?.length ?? 0,
          selectedSourceIds: source.selectedSourceIds?.length ?? 0,
          selectedTimelineRows: value.selectedTimeline.length,
        },
      });
    }

    return { ok: true, dataSources: resolved };
  }
}

function findDuplicateAlias(aliases: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const alias of aliases) {
    if (seen.has(alias)) return alias;
    seen.add(alias);
  }
  return null;
}

function runSandboxProcess(
  payload: {
    readonly script: string;
    readonly timeoutMs: number;
    readonly dataSources: Record<string, unknown>;
  },
  signal?: AbortSignal
): Promise<SandboxRunnerResult> {
  return new Promise((resolve) => {
    const timeoutMs = Math.min(Math.max(payload.timeoutMs, 250), MAX_TIMEOUT_MS);
    const child = spawn(process.execPath, ['--max-old-space-size=64', '-e', SANDBOX_RUNNER], {
      cwd: '/tmp',
      env: {},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: SandboxRunnerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortHandler);
      if (!child.killed) child.kill('SIGKILL');
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ success: false, error: `Sandbox execution timed out after ${timeoutMs}ms.` });
    }, timeoutMs + 500);
    const abortHandler = () => finish({ success: false, error: 'Sandbox execution cancelled.' });
    signal?.addEventListener('abort', abortHandler, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_STDIO_CHARS) {
        finish({ success: false, error: 'Sandbox stdout exceeded maximum size.' });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_STDIO_CHARS) {
        finish({ success: false, error: 'Sandbox stderr exceeded maximum size.' });
      }
    });
    child.on('error', (error) => finish({ success: false, error: error.message }));
    child.on('close', () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout || '{}') as SandboxRunnerResult;
        finish(parsed.success ? parsed : { ...parsed, error: parsed.error ?? stderr });
      } catch {
        finish({ success: false, error: stderr || 'Sandbox did not return valid JSON.' });
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}
