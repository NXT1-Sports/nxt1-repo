import type { Storage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Sandbox } from '@e2b/code-interpreter';
import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { AgentEphemeralStateService } from '../../services/agent-ephemeral-state.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';

const EXPORT_DOWNLOAD_URL_TTL_MS_NO_EXPIRE = 100 * 365 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_CODE_CHARS = 50_000;
const MAX_INLINE_JSON_CHARS = 2_000_000;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_ARTIFACTS = 8;
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const DATA_PATH = '/home/user/data.json';
const OUTPUT_DIR = '/home/user/outputs';

const ARTIFACT_TYPES: Readonly<
  Record<string, { readonly mimeType: string; readonly type: 'doc' | 'image' }>
> = {
  csv: { mimeType: 'text/csv', type: 'doc' },
  json: { mimeType: 'application/json', type: 'doc' },
  pdf: { mimeType: 'application/pdf', type: 'doc' },
  png: { mimeType: 'image/png', type: 'image' },
  jpg: { mimeType: 'image/jpeg', type: 'image' },
  jpeg: { mimeType: 'image/jpeg', type: 'image' },
  txt: { mimeType: 'text/plain', type: 'doc' },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    type: 'doc',
  },
};

const AliasSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/)
  .refine(
    (alias) =>
      !['__builtins__', '__import__', 'eval', 'exec', 'globals', 'locals', 'open'].includes(alias),
    'Alias is reserved.'
  );

const InlineJsonDataSourceSchema = z.object({
  sourceType: z.literal('inline_json'),
  alias: AliasSchema,
  value: z.unknown(),
});

const ExecutePythonCodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(MAX_CODE_CHARS)
    .describe(
      `Python code to execute in a sandbox. Use pandas/openpyxl/matplotlib for complex analysis and files. Write generated files to ${OUTPUT_DIR}; supported upload extensions are ${Object.keys(
        ARTIFACT_TYPES
      ).join(', ')}.`
    ),
  dataSources: z
    .array(InlineJsonDataSourceSchema)
    .max(6)
    .optional()
    .describe(
      'Optional JSON inputs injected into Python globals by alias and written to /home/user/data.json. Use for tables, rows, and other structured data already available to the agent.'
    ),
  timeoutMs: z.number().int().min(1_000).max(MAX_TIMEOUT_MS).optional(),
});

type ExecutePythonCodeInput = z.infer<typeof ExecutePythonCodeInputSchema>;

interface PythonExecutionResult {
  readonly logs?: {
    readonly stdout?: readonly string[];
    readonly stderr?: readonly string[];
  };
  readonly error?: {
    readonly name?: string;
    readonly value?: string;
    readonly traceback?: string;
  };
}

interface PythonSandboxFileEntry {
  readonly name: string;
  readonly path: string;
  readonly type?: string;
  readonly size?: number;
}

interface PythonSandboxClient {
  readonly files: {
    makeDir(path: string): Promise<boolean>;
    write(path: string, data: string | ArrayBuffer): Promise<unknown>;
    list(path: string): Promise<PythonSandboxFileEntry[]>;
    read(path: string, opts: { readonly format: 'bytes' }): Promise<Uint8Array>;
  };
  runCode(
    code: string,
    opts?: {
      readonly language?: 'python';
      readonly timeoutMs?: number;
      readonly signal?: AbortSignal;
    }
  ): Promise<PythonExecutionResult>;
  kill(opts?: { readonly signal?: AbortSignal }): Promise<boolean>;
}

interface PythonSandboxFactory {
  create(opts: {
    readonly apiKey: string;
    readonly timeoutMs: number;
    readonly allowInternetAccess: boolean;
    readonly metadata: Record<string, string>;
    readonly signal?: AbortSignal;
  }): Promise<PythonSandboxClient>;
}

const defaultSandboxFactory: PythonSandboxFactory = {
  create: (opts) => Sandbox.create(opts) as Promise<PythonSandboxClient>,
};

type UploadedArtifact = {
  readonly url: string;
  readonly downloadUrl: string;
  readonly storagePath: string;
  readonly name: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly type: 'doc' | 'image';
  readonly sizeBytes: number;
  readonly artifactRole: 'export';
};

function jsonLength(value: unknown): number {
  return JSON.stringify(value).length;
}

function truncateText(value: string, maxChars = MAX_OUTPUT_CHARS): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
}

function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._ -]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .slice(0, 120) || 'artifact'
  );
}

function getExtension(fileName: string): string | null {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

function normalizeDataSources(input: ExecutePythonCodeInput):
  | {
      readonly bindings: Record<string, unknown>;
      readonly summaries: readonly Record<string, unknown>[];
    }
  | ToolResult {
  const dataSources = input.dataSources ?? [];
  const aliases = new Set<string>();
  const bindings: Record<string, unknown> = Object.create(null);
  const summaries: Record<string, unknown>[] = [];

  for (const source of dataSources) {
    if (aliases.has(source.alias)) {
      return {
        success: false,
        error: `Duplicate Python data source alias: ${source.alias}`,
        isValidationError: true,
      };
    }
    aliases.add(source.alias);

    const bytes = jsonLength(source.value);
    if (bytes > MAX_INLINE_JSON_CHARS) {
      return {
        success: false,
        error: `Inline JSON source ${source.alias} is too large. Use a backend data source or a smaller derived table.`,
        isValidationError: true,
      };
    }

    bindings[source.alias] = source.value;
    summaries.push({ alias: source.alias, sourceType: source.sourceType, jsonBytes: bytes });
  }

  return { bindings, summaries };
}

function buildPythonPrelude(): string {
  return [
    'import json, os',
    `DATA_PATH = ${JSON.stringify(DATA_PATH)}`,
    `OUTPUT_DIR = ${JSON.stringify(OUTPUT_DIR)}`,
    'os.makedirs(OUTPUT_DIR, exist_ok=True)',
    'with open(DATA_PATH, "r", encoding="utf-8") as __nxt1_data_file:',
    '    __nxt1_payload = json.load(__nxt1_data_file)',
    'data_sources = __nxt1_payload.get("dataSources", {})',
    'globals().update(data_sources)',
    '',
  ].join('\n');
}

function isLikelyIncompletePythonInput(error: PythonExecutionResult['error']): boolean {
  const text = [error?.name, error?.value, error?.traceback].filter(Boolean).join('\n');
  return /IncompleteInputError|incomplete input|unexpected EOF|was never closed|EOL while scanning string literal|EOF while scanning triple-quoted string literal/i.test(
    text
  );
}

function buildPythonExecutionError(error: PythonExecutionResult['error']): {
  readonly message: string;
  readonly isValidationError?: boolean;
} {
  if (isLikelyIncompletePythonInput(error)) {
    return {
      message:
        'Python code was incomplete or truncated before execution. Rebuild a shorter, data-driven script: define compact rows/sections arrays, reusable render helper functions, and loops. Do not paste hundreds of manual cell writes or long inline row literals in one tool call. Ensure all brackets, quotes, and save calls are complete before retrying.',
      isValidationError: true,
    };
  }

  return {
    message: [error?.name, error?.value].filter(Boolean).join(': ') || 'Python execution failed.',
  };
}

export class ExecutePythonCodeTool extends BaseTool {
  readonly name = 'execute_python_code';
  readonly description =
    'Run sandboxed Python code for advanced data analysis and generated artifacts. Use this tool when the user explicitly asks for spreadsheets, Excel files, XLSX, workbooks, trackers, matrices, editable schedules, editable callsheets, budgets, dashboards, or another editable grid deliverable because Python/openpyxl can create cleaner multi-sheet workbooks with formulas, frozen panes, formatting, charts, and professional layouts. Do not use this as the primary lane for printable PDFs; use render_html_pdf for printable/share-ready artifacts unless the user asks for an editable sheet. Also use it for pandas transformations, matplotlib chart files, and custom analysis artifacts. Write files to /home/user/outputs so they can be uploaded and returned as thread-scoped attachments.';
  readonly parameters = ExecutePythonCodeInputSchema;
  readonly isMutation = true;
  readonly category = 'data' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly sandboxFactory: PythonSandboxFactory = defaultSandboxFactory,
    private readonly apiKey: string | undefined = process.env['E2B_API_KEY']?.trim(),
    private readonly storageOverride?: Storage
  ) {
    super();
  }

  static isConfigured(): boolean {
    return Boolean(process.env['E2B_API_KEY']?.trim());
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = this.parameters.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };
    if (!context.threadId)
      return {
        success: false,
        error:
          'Python artifacts require a threadId so files can be saved to thread-scoped exports.',
      };
    if (!this.apiKey) return { success: false, error: 'E2B_API_KEY is not configured.' };
    const uploadContext = context as ToolExecutionContext & { readonly threadId: string };

    const normalized = normalizeDataSources(parsed.data);
    if ('success' in normalized) return normalized;

    const timeoutMs = parsed.data.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = performance.now();
    let sandbox: PythonSandboxClient | null = null;

    try {
      context.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'start_python_sandbox',
      });

      sandbox = await this.sandboxFactory.create({
        apiKey: this.apiKey,
        timeoutMs: timeoutMs + 10_000,
        allowInternetAccess: false,
        metadata: {
          tool: this.name,
          userId: context.userId,
          threadId: context.threadId,
          ...(context.operationId ? { operationId: context.operationId } : {}),
        },
        signal: context.signal,
      });

      await sandbox.files.makeDir(OUTPUT_DIR);
      await sandbox.files.write(
        DATA_PATH,
        JSON.stringify({ dataSources: normalized.bindings }, null, 2)
      );

      const execution = await sandbox.runCode(`${buildPythonPrelude()}\n${parsed.data.code}`, {
        language: 'python',
        timeoutMs,
        signal: context.signal,
      });

      const stdout = truncateText((execution.logs?.stdout ?? []).join('\n'));
      const stderr = truncateText((execution.logs?.stderr ?? []).join('\n'));

      if (execution.error) {
        const executionError = buildPythonExecutionError(execution.error);
        return {
          success: false,
          error: executionError.message,
          ...(executionError.isValidationError ? { isValidationError: true } : {}),
          data: {
            stdout,
            stderr,
            traceback: execution.error.traceback,
          },
        };
      }

      context.emitStage?.('uploading_assets', {
        icon: 'upload',
        phase: 'upload_python_artifacts',
      });
      const artifacts = await this.uploadGeneratedArtifacts(sandbox, uploadContext);

      return {
        success: true,
        markdown:
          artifacts.length > 0
            ? `Python analysis completed and generated ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}.`
            : 'Python analysis completed.',
        data: {
          stdout,
          stderr,
          executionMs: Math.round(performance.now() - startedAt),
          dataSources: normalized.summaries,
          artifactCount: artifacts.length,
          artifacts,
          attachments: artifacts,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Python sandbox execution failed';
      return { success: false, error: message };
    } finally {
      if (sandbox) {
        try {
          await sandbox.kill({ signal: context?.signal });
        } catch {
          // Best-effort cleanup; execution result is more important than kill telemetry.
        }
      }
    }
  }

  private async uploadGeneratedArtifacts(
    sandbox: PythonSandboxClient,
    context: ToolExecutionContext & { readonly threadId: string }
  ): Promise<UploadedArtifact[]> {
    const entries = await sandbox.files.list(OUTPUT_DIR);
    const files = entries.filter((entry) => entry.type === 'file');
    const uploadable = files
      .map((entry) => ({ entry, extension: getExtension(entry.name) }))
      .filter(
        (
          item
        ): item is {
          readonly entry: PythonSandboxFileEntry;
          readonly extension: keyof typeof ARTIFACT_TYPES;
        } => Boolean(item.extension && ARTIFACT_TYPES[item.extension])
      )
      .slice(0, MAX_ARTIFACTS);
    const uploaded: UploadedArtifact[] = [];

    for (const [index, item] of uploadable.entries()) {
      const bytes = await sandbox.files.read(item.entry.path, { format: 'bytes' });
      const buffer = Buffer.from(bytes);
      if (buffer.length > MAX_ARTIFACT_BYTES) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          `Python artifact ${item.entry.name} exceeds the ${MAX_ARTIFACT_BYTES} byte upload limit.`
        );
      }

      const artifactType = ARTIFACT_TYPES[item.extension];
      const safeName = sanitizeFileName(item.entry.name);
      const timestamp = Date.now();
      const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);
      const storagePath = `Users/${context.userId}/threads/${context.threadId}/exports/${timestamp}-${index}-${hash}.${item.extension}`;
      const downloadToken = randomUUID();
      const bucket = this.resolveStorage(context).bucket();
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        contentType: artifactType.mimeType,
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${safeName}"`,
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      const [exists] = await file.exists();
      if (!exists) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          `Python artifact upload verification failed for ${safeName}`
        );
      }

      const downloadUrl = this.buildExportDownloadUrl(
        { storagePath, fileName: safeName, mimeType: artifactType.mimeType },
        context
      );

      uploaded.push({
        url: downloadUrl,
        downloadUrl,
        storagePath,
        name: safeName,
        fileName: safeName,
        mimeType: artifactType.mimeType,
        type: artifactType.type,
        sizeBytes: buffer.length,
        artifactRole: 'export',
      });
    }

    return uploaded;
  }

  private buildExportDownloadUrl(
    params: {
      readonly storagePath: string;
      readonly fileName: string;
      readonly mimeType: string;
    },
    context: ToolExecutionContext
  ): string {
    const agentRouteBase =
      context.agentRouteBase ??
      `${(process.env['BACKEND_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1${context.environment === 'staging' ? '/staging' : ''}/agent-x`;

    return AgentEphemeralStateService.buildSignedExportDownloadUrl({
      storagePath: params.storagePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      routeBase: agentRouteBase,
      ttlMs: EXPORT_DOWNLOAD_URL_TTL_MS_NO_EXPIRE,
    }).url;
  }

  private resolveStorage(context?: ToolExecutionContext): Storage {
    if (this.storageOverride) return this.storageOverride;
    return context?.environment === 'staging' ? stagingStorage : defaultStorage;
  }
}
