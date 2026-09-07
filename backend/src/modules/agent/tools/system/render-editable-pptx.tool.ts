import type { Storage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentEngineError } from '../../exceptions/agent-engine.error.js';
import { AgentEphemeralStateService } from '../../services/agent-ephemeral-state.service.js';
import {
  EditablePptxRendererService,
  type EditablePptxDeckSchema,
  type EditablePptxRenderResult,
} from '../../services/editable-pptx-renderer.service.js';
import { storage as defaultStorage } from '../../../../utils/firebase.js';
import { stagingStorage } from '../../../../utils/firebase-staging.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';

const EDITABLE_PPTX_DOWNLOAD_URL_TTL_MS_NO_EXPIRE = 100 * 365 * 24 * 60 * 60 * 1000;
const EDITABLE_PPTX_SCHEMA_VERSION = 'editable-pptx.v1';
const EDITABLE_PPTX_REVISION_HINT =
  'You can ask Agent X to revise this PowerPoint by describing the change. The editable slide schema JSON was saved beside the PPTX, so Agent X can update that schema and rerender native PowerPoint objects.';

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-f]{6}$/i, 'Color must be a 6-digit hex value such as #0F766E');

const GeometrySchema = z.object({
  x: z.number().min(0).max(20).describe('Left position in inches.'),
  y: z.number().min(0).max(20).describe('Top position in inches.'),
  w: z.number().positive().max(20).describe('Width in inches.'),
  h: z.number().positive().max(20).describe('Height in inches.'),
});

const ThemeSchema = z.object({
  fontFace: z.string().trim().min(1).optional(),
  headingFontFace: z.string().trim().min(1).optional(),
  backgroundColor: HexColorSchema.optional(),
  surfaceColor: HexColorSchema.optional(),
  primaryColor: HexColorSchema.optional(),
  secondaryColor: HexColorSchema.optional(),
  accentColor: HexColorSchema.optional(),
  textColor: HexColorSchema.optional(),
  mutedTextColor: HexColorSchema.optional(),
  borderColor: HexColorSchema.optional(),
});

const TextElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('text'),
  text: z.string(),
  fontSize: z.number().min(6).max(72).optional(),
  fontFace: z.string().trim().min(1).optional(),
  color: HexColorSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  valign: z.enum(['top', 'mid', 'bottom']).optional(),
  bullet: z.boolean().optional(),
  fit: z.enum(['shrink', 'resize']).optional(),
  margin: z.number().min(0).max(1).optional(),
});

const ShapeElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('shape'),
  shape: z.enum([
    'rect',
    'roundRect',
    'ellipse',
    'line',
    'arc',
    'triangle',
    'diamond',
    'chevron',
    'pentagon',
    'hexagon',
  ]),
  fillColor: HexColorSchema.optional(),
  lineColor: HexColorSchema.optional(),
  lineWidth: z.number().min(0).max(12).optional(),
  transparency: z.number().min(0).max(100).optional(),
  radius: z.number().min(0).max(1).optional(),
});

const ImageElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('image'),
  data: z.string().trim().min(1).optional().describe('Data URL image payload.'),
  path: z.string().trim().min(1).optional().describe('Local or accessible image path.'),
  altText: z.string().trim().min(1).optional(),
  transparency: z.number().min(0).max(100).optional(),
}).refine((element) => Boolean(element.data || element.path), {
  message: 'Image elements require data or path.',
});

const TableCellSchema = z.object({
  text: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  fillColor: HexColorSchema.optional(),
  color: HexColorSchema.optional(),
  bold: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

const TableElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('table'),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null(), TableCellSchema])))
    .min(1),
  headerRow: z.boolean().optional(),
  fontSize: z.number().min(5).max(24).optional(),
  borderColor: HexColorSchema.optional(),
  headerFillColor: HexColorSchema.optional(),
  headerTextColor: HexColorSchema.optional(),
  cellFillColor: HexColorSchema.optional(),
  color: HexColorSchema.optional(),
});

const StatCardElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('statCard'),
  label: z.string().trim().min(1),
  value: z.union([z.string(), z.number()]),
  caption: z.string().trim().min(1).optional(),
  fillColor: HexColorSchema.optional(),
  borderColor: HexColorSchema.optional(),
  accentColor: HexColorSchema.optional(),
});

const BadgeElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('badge'),
  label: z.string().trim().min(1),
  fillColor: HexColorSchema.optional(),
  textColor: HexColorSchema.optional(),
  borderColor: HexColorSchema.optional(),
});

const DividerElementSchema = GeometrySchema.extend({
  id: z.string().trim().min(1).optional(),
  type: z.literal('divider'),
  color: HexColorSchema.optional(),
  thickness: z.number().min(0.25).max(8).optional(),
});

type ElementSchemaType = z.ZodType<unknown>;

const ElementSchema: ElementSchemaType = z.lazy(() =>
  z.discriminatedUnion('type', [
    TextElementSchema,
    ShapeElementSchema,
    ImageElementSchema,
    TableElementSchema,
    StatCardElementSchema,
    BadgeElementSchema,
    DividerElementSchema,
    GeometrySchema.extend({
      id: z.string().trim().min(1).optional(),
      type: z.literal('group'),
      children: z.array(ElementSchema).min(1),
    }),
  ])
);

const SlideSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  backgroundColor: HexColorSchema.optional(),
  notes: z.string().optional(),
  elements: z
    .array(ElementSchema)
    .min(1)
    .max(160)
    .describe('Every visible title, label, paragraph, card, badge, divider, table cell, and shape should be represented as native PowerPoint objects.'),
});

const RenderEditablePptxInputSchema = z.object({
  fileName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  schemaVersion: z.string().trim().min(1).default(EDITABLE_PPTX_SCHEMA_VERSION),
  aspectRatio: z.enum(['widescreen_16_9', 'standard_4_3']).default('widescreen_16_9'),
  theme: ThemeSchema.optional(),
  slides: z.array(SlideSchema).min(1).max(80),
  relatedDocumentId: z.string().trim().min(1).optional(),
  sourceDocumentIds: z.array(z.string().trim().min(1)).optional(),
  sourceAttachmentIds: z.array(z.string().trim().min(1)).optional(),
  artifactGroupId: z.string().trim().min(1).optional(),
});

type RenderEditablePptxInput = z.infer<typeof RenderEditablePptxInputSchema>;

export class RenderEditablePptxTool extends BaseTool {
  readonly name = 'render_editable_pptx';
  readonly description =
    'Renders a native editable PowerPoint deck from a structured slide schema and persists the schema JSON beside the PPTX. ' +
    'Use this for custom, manual, or revision-friendly PowerPoint decks where every title, label, paragraph, stat card, badge, divider, table cell, and shape should be a moveable native PPTX object. ' +
    'Gamma remains the dynamic_export path for quick AI-styled draft decks; this tool is for deterministic editable PowerPoint decks. ' +
    'Images such as logos, photos, and chart snapshots are allowed, but they render as separate moveable/resizable PPTX image elements rather than flattened screenshots.';

  readonly parameters = RenderEditablePptxInputSchema;
  readonly isMutation = true;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  constructor(
    private readonly renderer: Pick<EditablePptxRendererService, 'render'> = new EditablePptxRendererService()
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RenderEditablePptxInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    try {
      const normalized = this.normalizeInput(parsed.data, context);
      const renderResult = await this.renderer.render(normalized.deckSchema);
      return await this.uploadResult(normalized, renderResult, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Editable PPTX render failed';
      return { success: false, error: message };
    }
  }

  private normalizeInput(input: RenderEditablePptxInput, context?: ToolExecutionContext) {
    const safeName = this.sanitizeFileName(input.fileName);
    const fileName = safeName.toLowerCase().endsWith('.pptx') ? safeName : `${safeName}.pptx`;
    const artifactGroupId = input.artifactGroupId ?? context?.operationId ?? undefined;
    const deckSchema: EditablePptxDeckSchema = {
      schemaVersion: input.schemaVersion,
      title: input.title,
      aspectRatio: input.aspectRatio,
      ...(input.theme ? { theme: input.theme } : {}),
      slides: input.slides as EditablePptxDeckSchema['slides'],
    };

    return {
      ...input,
      fileName,
      artifactGroupId,
      deckSchema,
      sourceJson: JSON.stringify(deckSchema, null, 2),
    };
  }

  private async uploadResult(
    input: ReturnType<RenderEditablePptxTool['normalizeInput']>,
    renderResult: EditablePptxRenderResult,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = context?.userId ?? 'anonymous';
    const threadId = context?.threadId;
    if (!threadId) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'Editable PPTX export cannot be saved — no threadId in context'
      );
    }

    const timestamp = Date.now();
    const hash = createHash('md5').update(renderResult.buffer).digest('hex').slice(0, 8);
    const outputBaseName = `${timestamp}-${hash}`;
    const storagePath = `Users/${userId}/threads/${threadId}/exports/${outputBaseName}.pptx`;
    const sourceStoragePath = `Users/${userId}/threads/${threadId}/exports/${outputBaseName}.json`;
    const sourceFileName = input.fileName.replace(/\.pptx$/i, '.editable-source.json');
    const bucket = this.resolveStorage(context).bucket();
    const file = bucket.file(storagePath);
    const sourceFile = bucket.file(sourceStoragePath);

    context?.emitStage?.('uploading_assets', {
      icon: 'upload',
      format: 'pptx',
      phase: 'upload_editable_pptx_export',
    });

    await Promise.all([
      file.save(renderResult.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: `attachment; filename="${input.fileName}"`,
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      }),
      sourceFile.save(input.sourceJson, {
        contentType: 'application/json; charset=utf-8',
        resumable: false,
        validation: false,
        metadata: {
          cacheControl: 'private, max-age=0, no-cache',
          contentDisposition: `attachment; filename="${sourceFileName}"`,
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      }),
    ]);

    context?.emitStage?.('persisting_result', {
      icon: 'document',
      format: 'pptx',
      phase: 'create_editable_pptx_download_links',
    });

    const [[exists], [sourceExists]] = await Promise.all([file.exists(), sourceFile.exists()]);
    if (!exists || !sourceExists) {
      throw new AgentEngineError(
        'AGENT_PIPELINE_FAILED',
        'Editable PPTX upload verification failed — rendered PPTX or editable source schema was not found in storage'
      );
    }

    const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const sourceMimeType = 'application/json';
    const downloadUrl = this.buildExportDownloadUrl(
      { storagePath, fileName: input.fileName, mimeType },
      context
    );
    const sourceDownloadUrl = this.buildExportDownloadUrl(
      { storagePath: sourceStoragePath, fileName: sourceFileName, mimeType: sourceMimeType },
      context
    );

    const commonArtifactMetadata = {
      ...(input.relatedDocumentId ? { relatedDocumentId: input.relatedDocumentId } : {}),
      ...(input.sourceDocumentIds?.length ? { sourceDocumentIds: input.sourceDocumentIds } : {}),
      ...(input.sourceAttachmentIds?.length
        ? { sourceAttachmentIds: input.sourceAttachmentIds }
        : {}),
      ...(input.artifactGroupId ? { artifactGroupId: input.artifactGroupId } : {}),
    };
    const pptxAttachment = {
      url: downloadUrl,
      storagePath,
      name: input.fileName,
      mimeType,
      type: 'doc',
      sizeBytes: renderResult.buffer.length,
      artifactRole: 'export',
      ...commonArtifactMetadata,
    };
    const sourceAttachment = {
      url: sourceDownloadUrl,
      storagePath: sourceStoragePath,
      name: sourceFileName,
      mimeType: sourceMimeType,
      type: 'doc',
      sizeBytes: Buffer.byteLength(input.sourceJson, 'utf8'),
      artifactRole: 'source' as const,
      ...commonArtifactMetadata,
    };

    return {
      success: true,
      data: {
        downloadUrl,
        storagePath,
        fileName: input.fileName,
        mimeType,
        format: 'pptx',
        sizeBytes: renderResult.buffer.length,
        artifactRole: 'export',
        schemaVersion: renderResult.metadata.schemaVersion,
        warnings: renderResult.metadata.warnings,
        renderMetadata: renderResult.metadata,
        editableSource: sourceAttachment,
        revisionHint: EDITABLE_PPTX_REVISION_HINT,
        ...commonArtifactMetadata,
        attachments: [pptxAttachment, sourceAttachment],
      },
    };
  }

  private sanitizeFileName(fileName: string): string {
    return (
      fileName
        .replace(/[^\w\s\-().]/g, '')
        .replace(/\.{2,}/g, '.')
        .trim() || 'editable-deck.pptx'
    );
  }

  private resolveStorage(context?: ToolExecutionContext): Storage {
    return context?.environment === 'staging' ? stagingStorage : defaultStorage;
  }

  private buildExportDownloadUrl(
    params: { readonly storagePath: string; readonly fileName: string; readonly mimeType: string },
    context?: ToolExecutionContext
  ): string {
    const agentRouteBase =
      context?.agentRouteBase ??
      `${(process.env['BACKEND_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1${context?.environment === 'staging' ? '/staging' : ''}/agent-x`;

    return AgentEphemeralStateService.buildSignedExportDownloadUrl({
      storagePath: params.storagePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      routeBase: agentRouteBase,
      ttlMs: EDITABLE_PPTX_DOWNLOAD_URL_TTL_MS_NO_EXPIRE,
    }).url;
  }
}