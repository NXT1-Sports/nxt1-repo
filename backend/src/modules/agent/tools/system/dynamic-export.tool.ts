/**
 * @fileoverview Dynamic Export Tool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Fully unconstrained Agent X tool for generating PDF or CSV documents
 * from any structured data the LLM assembles on-the-fly.
 *
 * Unlike fixed-schema tools, this tool accepts dynamic columns/rows/body
 * content — enabling Agent X to produce exports for *any* user request:
 * workout plans, recruiting lists, film breakdowns, compliance checklists,
 * comparison tables, team rosters, budget reports, etc.
 *
 * Architecture:
 *   LLM assembles structured JSON payload (columns, rows, paragraphs)
 *       ↓
 *   DynamicExportTool validates & delegates to ExportService
 *       ↓
 *   ExportService generates Buffer (PDF or CSV)
 *       ↓
 *   Tool uploads Buffer to Firebase Storage (thread-scoped)
 *       ↓
 *   Returns durable Firebase download URL as AgentXAttachment-compatible result
 *
 * For massive datasets that exceed LLM output limits, the tool also accepts
 * a `query` object. When present, the tool bypasses the LLM-provided rows
 * and fetches data directly from MongoDB, assembling the document natively.
 */

import { getStorage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ExportService, type ExportColumn, type ExportRow } from '../../services/export.service.js';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { logger } from '../../../../utils/logger.js';
import { gcsObjectExists, uploadGcsObject } from '../../../../utils/gcs-json-api.js';
import { z } from 'zod';

const GOOGLE_AUTH_MAX_ATTEMPTS = 3;
const GOOGLE_AUTH_RETRY_DELAYS_MS = [500, 1_500] as const;

interface GoogleStorageRetryContext {
  readonly operation: 'firebase_storage_save' | 'firebase_storage_exists';
  readonly exportJobId: string;
  readonly exportType: 'pdf' | 'csv';
  readonly storagePath: string;
  readonly userId: string;
  readonly threadId: string;
  readonly environment?: ToolExecutionContext['environment'];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPrivateKeyDiagnostics(envName: string, label: string): Record<string, boolean> {
  const value = process.env[envName];
  const normalized = value?.replace(/\\n/g, '\n') ?? '';

  return {
    [`has${label}`]: !!value,
    [`${label}HasEscapedNewlines`]: !!value?.includes('\\n'),
    [`${label}HasRealNewlines`]: !!value?.includes('\n'),
    [`${label}LooksPem`]:
      normalized.includes('-----BEGIN PRIVATE KEY-----') &&
      normalized.includes('-----END PRIVATE KEY-----'),
  };
}

function getApplicationCredentialsDiagnostics(): Record<string, boolean> {
  const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  const diagnostics: Record<string, boolean> = {
    hasApplicationCredentials: !!credentialsPath,
    applicationCredentialsReadable: false,
    applicationCredentialsJsonValid: false,
    applicationCredentialsHasClientEmail: false,
    applicationCredentialsHasPrivateKey: false,
    applicationCredentialsPrivateKeyLooksPem: false,
    applicationCredentialsUsesLegacyTokenUri: false,
    applicationCredentialsUsesModernTokenUri: false,
  };

  if (!credentialsPath || !existsSync(credentialsPath)) {
    return diagnostics;
  }

  try {
    const data = JSON.parse(readFileSync(credentialsPath, 'utf8')) as Record<string, unknown>;
    const tokenUri = typeof data['token_uri'] === 'string' ? data['token_uri'] : '';
    const privateKey = typeof data['private_key'] === 'string' ? data['private_key'] : '';

    diagnostics['applicationCredentialsReadable'] = true;
    diagnostics['applicationCredentialsJsonValid'] = true;
    diagnostics['applicationCredentialsHasClientEmail'] =
      typeof data['client_email'] === 'string' && data['client_email'].trim().length > 0;
    diagnostics['applicationCredentialsHasPrivateKey'] = privateKey.length > 0;
    diagnostics['applicationCredentialsPrivateKeyLooksPem'] =
      privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
      privateKey.includes('-----END PRIVATE KEY-----');
    diagnostics['applicationCredentialsUsesLegacyTokenUri'] =
      tokenUri.includes('www.googleapis.com/oauth2/v4/token') ||
      tokenUri.includes('/oauth2/v4/token');
    diagnostics['applicationCredentialsUsesModernTokenUri'] =
      tokenUri === 'https://oauth2.googleapis.com/token';
  } catch {
    diagnostics['applicationCredentialsReadable'] = true;
  }

  return diagnostics;
}

function getGoogleCredentialPresence(): Record<string, boolean> {
  return {
    hasGoogleClientEmail: !!process.env['GOOGLE_CLIENT_EMAIL'],
    hasGoogleProjectId: !!process.env['GOOGLE_PROJECT_ID'],
    hasFirebaseClientEmail: !!process.env['FIREBASE_CLIENT_EMAIL'],
    hasFirebaseProjectId: !!process.env['FIREBASE_PROJECT_ID'],
    hasFirebaseStorageBucket: !!process.env['FIREBASE_STORAGE_BUCKET'],
    hasExportGoogleClientEmail: !!process.env['EXPORT_GOOGLE_CLIENT_EMAIL'],
    hasExportGoogleProjectId: !!process.env['EXPORT_GOOGLE_PROJECT_ID'],
    ...getPrivateKeyDiagnostics('GOOGLE_PRIVATE_KEY', 'GooglePrivateKey'),
    ...getPrivateKeyDiagnostics('FIREBASE_PRIVATE_KEY', 'FirebasePrivateKey'),
    ...getPrivateKeyDiagnostics('EXPORT_GOOGLE_PRIVATE_KEY', 'ExportGooglePrivateKey'),
    ...getApplicationCredentialsDiagnostics(),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  const code = record.code ?? record.status ?? record.statusCode;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

function sanitizeErrorMessage(error: unknown): string {
  return getErrorMessage(error)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/access_token[=:]\s*[^&\s,)]+/gi, 'access_token=[REDACTED]')
    .replace(/refresh_token[=:]\s*[^&\s,)]+/gi, 'refresh_token=[REDACTED]')
    .replace(/private_key[=:]\s*[^&\s,)]+/gi, 'private_key=[REDACTED]');
}

function isRetryableGoogleAuthError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (typeof code === 'number' && [408, 429, 500, 502, 503, 504].includes(code)) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('premature close') ||
    message.includes('invalid response body') ||
    message.includes('oauth2/v4/token') ||
    message.includes('oauth2.googleapis.com/token') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('fetch failed') ||
    message.includes('aborted') ||
    message.includes('tls')
  );
}

async function runGoogleStorageStepWithRetry<T>(
  retryContext: GoogleStorageRetryContext,
  action: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= GOOGLE_AUTH_MAX_ATTEMPTS; attempt += 1) {
    logger.info('[DynamicExport] Google auth/storage step starting', {
      stage: 'google_token_fetch_start',
      attempt,
      maxAttempts: GOOGLE_AUTH_MAX_ATTEMPTS,
      ...retryContext,
      ...getGoogleCredentialPresence(),
    });

    try {
      return await action();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableGoogleAuthError(error);
      const isFinalAttempt = attempt >= GOOGLE_AUTH_MAX_ATTEMPTS;

      logger[isFinalAttempt || !retryable ? 'error' : 'warn'](
        '[DynamicExport] Google auth/storage step failed',
        {
          stage: 'google_token_fetch_failed',
          attempt,
          maxAttempts: GOOGLE_AUTH_MAX_ATTEMPTS,
          retryable,
          errorCode: getErrorCode(error),
          error: sanitizeErrorMessage(error),
          finalFailureReason:
            isFinalAttempt || !retryable ? sanitizeErrorMessage(error) : undefined,
          ...retryContext,
          ...getGoogleCredentialPresence(),
        }
      );

      if (isFinalAttempt || !retryable) throw error;
      await delay(GOOGLE_AUTH_RETRY_DELAYS_MS[attempt - 1] ?? 1_500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class DynamicExportTool extends BaseTool {
  readonly name = 'dynamic_export';
  readonly description =
    'Generates a downloadable PDF or CSV document from any structured data. ' +
    'Use this tool whenever the user asks to export, download, save, create a spreadsheet, ' +
    'create a report, produce a document, or needs data in a portable file format. ' +
    'You supply the columns, rows, and/or body text — the tool handles formatting, ' +
    'branding, and cloud hosting. The generated file opens cleanly in Excel, Google Sheets, ' +
    'Numbers, Word, Preview, and all standard desktop/mobile viewers. ' +
    'Works for: recruiting lists, scout reports, workout plans, compliance checklists, ' +
    'comparison tables, analytics summaries, team rosters, film breakdowns, budgets, ' +
    'schedules, or literally anything the user asks for.';

  readonly parameters = z.object({
    format: z.enum(['pdf', 'csv']),
    fileName: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    columns: z
      .array(
        z.object({
          key: z.string().trim().min(1),
          label: z.string().trim().min(1),
        })
      )
      .optional(),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
    bodyParagraphs: z.array(z.string()).optional(),
    bulletPoints: z.array(z.string()).optional(),
    imageUrls: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Optional diagram/image URLs to embed directly inside PDF exports.'),
    theme: z.enum(['dark', 'light']).optional(),
    brandPrimaryColor: z
      .string()
      .trim()
      .optional()
      .describe('Optional team/organization primary color (hex like #0055AA).'),
    organizationName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional organization/team display name for PDF header branding.'),
    logoUrl: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional logo URL (https or data:image/*) rendered in PDF header.'),
  });

  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  /** All agents can generate exports. */
  override readonly allowedAgents = ['*'] as const;

  private readonly exportService: ExportService;

  constructor(exportService?: ExportService) {
    super();
    this.exportService = exportService ?? new ExportService();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Validate required params ──────────────────────────────────────
    const format = this.str(input, 'format');
    if (!format || (format !== 'pdf' && format !== 'csv')) {
      return { success: false, error: 'Parameter "format" must be "pdf" or "csv".' };
    }

    const fileName = this.str(input, 'fileName');
    if (!fileName) {
      return this.paramError('fileName');
    }

    // Sanitize fileName to prevent path traversal
    const safeName =
      fileName
        .replace(/[^\w\s\-().]/g, '')
        .replace(/\.{2,}/g, '.') // collapse runs of dots (prevents traversal artefacts)
        .trim() || 'export';

    // ── Extract optional structured data ──────────────────────────────
    const columns = this.parseColumns(input);
    const rows = this.parseRows(input);
    const title = this.str(input, 'title') ?? safeName;
    const description = this.str(input, 'description') ?? undefined;
    const bodyParagraphs = this.parseStringArray(input, 'bodyParagraphs');
    const bulletPoints = this.parseStringArray(input, 'bulletPoints');
    const imageUrls = this.resolvePdfImageUrls(input, description, bodyParagraphs, bulletPoints);
    const theme = this.str(input, 'theme');
    const brandPrimaryColor = this.str(input, 'brandPrimaryColor') ?? undefined;
    const organizationName = this.str(input, 'organizationName') ?? undefined;
    const logoUrl = this.str(input, 'logoUrl') ?? undefined;

    // ── Format-specific validation ────────────────────────────────────
    if (format === 'csv') {
      if (!columns?.length || !rows?.length) {
        return {
          success: false,
          error: 'CSV exports require non-empty "columns" and "rows" arrays.',
        };
      }
    }

    if (format === 'pdf') {
      const hasTable = columns?.length && rows?.length;
      const hasBody =
        bodyParagraphs?.length || bulletPoints?.length || description || imageUrls.length > 0;
      if (!hasTable && !hasBody) {
        return {
          success: false,
          error:
            'PDF exports require at least one of: columns+rows (table), bodyParagraphs, bulletPoints, or description.',
        };
      }
    }

    // ── Generate document ─────────────────────────────────────────────
    try {
      const emitStage = context?.emitStage;
      let buffer: Buffer;
      let mimeType: string;
      let extension: string;

      if (format === 'csv') {
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount: rows!.length,
          format: 'csv',
          phase: 'format_export',
        });
        buffer = this.exportService.generateCsv({ columns: columns!, rows: rows! });
        mimeType = 'text/csv';
        extension = 'csv';
      } else {
        const rowCount = rows?.length ?? 0;
        emitStage?.('submitting_job', {
          icon: 'document',
          rowCount,
          format: 'pdf',
          phase: rowCount > 0 ? 'build_pdf_table' : 'build_pdf_document',
        });
        buffer = await this.exportService.generatePdf({
          title,
          description,
          includeTable: !!(columns?.length && rows?.length),
          columns: columns ?? undefined,
          rows: rows ?? undefined,
          bodyParagraphs: bodyParagraphs ?? undefined,
          bulletPoints: bulletPoints ?? undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          theme: theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : undefined,
          brandPrimaryColor,
          organizationName,
          logoUrl,
        });
        mimeType = 'application/pdf';
        extension = 'pdf';
      }

      // ── Upload to Firebase Storage ────────────────────────────────
      emitStage?.('uploading_assets', {
        icon: 'upload',
        format,
        phase: 'upload_export',
      });
      const userId = context?.userId ?? 'anonymous';
      const threadId = context?.threadId;
      const timestamp = Date.now();
      const hash = createHash('md5').update(buffer).digest('hex').slice(0, 8);

      // Thread-scoped path (auto-cleanup on thread deletion). threadId required.
      if (!threadId) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          'Export cannot be saved — no threadId in context'
        );
      }
      const storagePath = `Users/${userId}/threads/${threadId}/exports/${timestamp}-${hash}.${extension}`;
      const downloadToken = randomUUID();
      const exportJobId = context?.operationId ?? context?.sessionId ?? `${timestamp}-${hash}`;

      const bucket = getStorage().bucket();
      const bucketName = bucket.name || process.env['FIREBASE_STORAGE_BUCKET'];
      if (!bucketName) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          'Export upload failed — Firebase Storage bucket is not configured'
        );
      }
      const retryContext: GoogleStorageRetryContext = {
        operation: 'firebase_storage_save',
        exportJobId,
        exportType: format,
        storagePath,
        userId,
        threadId,
        environment: context?.environment,
      };

      await runGoogleStorageStepWithRetry(retryContext, () =>
        uploadGcsObject(bucketName, storagePath, buffer, {
          contentType: mimeType,
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${safeName}.${extension}"`,
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        })
      );

      // Verify the object exists before returning a download URL.
      emitStage?.('persisting_result', {
        icon: 'document',
        format,
        phase: 'create_download_link',
      });
      const exists = await runGoogleStorageStepWithRetry(
        { ...retryContext, operation: 'firebase_storage_exists' },
        () => gcsObjectExists(bucketName, storagePath)
      );
      if (!exists) {
        throw new AgentEngineError(
          'AGENT_PIPELINE_FAILED',
          'Export upload verification failed — file was not found in storage'
        );
      }

      const downloadUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
        `${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

      return {
        success: true,
        data: {
          downloadUrl,
          storagePath,
          fileName: `${safeName}.${extension}`,
          mimeType,
          format: extension,
          sizeBytes: buffer.length,
          rowCount: rows?.length ?? 0,
          columnCount: columns?.length ?? 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document generation failed';
      return { success: false, error: message };
    }
  }

  // ── Input Parsing Helpers ───────────────────────────────────────────

  private parseColumns(input: Record<string, unknown>): ExportColumn[] | null {
    const raw = input['columns'];
    if (!Array.isArray(raw) || raw.length === 0) return null;

    return raw
      .filter(
        (c): c is { key: string; label: string } =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>)['key'] === 'string' &&
          typeof (c as Record<string, unknown>)['label'] === 'string'
      )
      .map((c) => ({ key: c.key, label: c.label }));
  }

  private parseRows(input: Record<string, unknown>): ExportRow[] | null {
    const raw = input['rows'];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.filter(Array.isArray) as ExportRow[];
  }

  private parseStringArray(input: Record<string, unknown>, key: string): string[] | null {
    const raw = input[key];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private resolvePdfImageUrls(
    input: Record<string, unknown>,
    description?: string,
    bodyParagraphs?: readonly string[] | null,
    bulletPoints?: readonly string[] | null
  ): string[] {
    const urls = new Set<string>();

    const explicit = this.parseStringArray(input, 'imageUrls') ?? [];
    for (const url of explicit) {
      if (this.isSupportedImageUrl(url)) urls.add(url.trim());
    }

    const textCandidates: string[] = [];
    if (description) textCandidates.push(description);
    if (bodyParagraphs?.length) textCandidates.push(...bodyParagraphs);
    if (bulletPoints?.length) textCandidates.push(...bulletPoints);

    for (const text of textCandidates) {
      for (const url of this.extractHttpUrls(text)) {
        if (this.isSupportedImageUrl(url)) {
          urls.add(url);
        }
      }
    }

    return [...urls];
  }

  private extractHttpUrls(text: string): string[] {
    const match = text.match(/https?:\/\/\S+/gi);
    if (!match) return [];
    return match.map((url) => url.replace(/[),.;!?]+$/, ''));
  }

  private isSupportedImageUrl(url: string): boolean {
    const value = url.trim();
    if (value.startsWith('data:image/')) return true;
    if (!/^https?:\/\//i.test(value)) return false;
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || /\/media\//i.test(value);
  }
}
