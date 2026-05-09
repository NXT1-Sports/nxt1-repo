import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { storage as defaultStorage } from '../../../../../utils/firebase.js';
import { stagingStorage } from '../../../../../utils/firebase-staging.js';
import { logger } from '../../../../../utils/logger.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import { MediaStagingService } from '../../media/media-staging.service.js';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import {
  ChartMcpOperationResultSchema,
  type ChartMcpOperationResult,
  type ChartType,
  type GenerateChartVisualizationInput,
} from './schemas.js';

const DEFAULT_TIMEOUT_MS = 90_000;
const TOKEN_HEADER = 'x-chart-mcp-token';
const DEFAULT_CHART_PALETTE = [
  '#2563eb',
  '#14b8a6',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#64748b',
] as const;

const CHART_TOOL_NAME_BY_TYPE = {
  area: 'generate_area_chart',
  bar: 'generate_bar_chart',
  boxplot: 'generate_boxplot_chart',
  column: 'generate_column_chart',
  district_map: 'generate_district_map',
  dual_axes: 'generate_dual_axes_chart',
  fishbone_diagram: 'generate_fishbone_diagram',
  flow_diagram: 'generate_flow_diagram',
  funnel: 'generate_funnel_chart',
  histogram: 'generate_histogram_chart',
  line: 'generate_line_chart',
  liquid: 'generate_liquid_chart',
  mind_map: 'generate_mind_map',
  network_graph: 'generate_network_graph',
  organization_chart: 'generate_organization_chart',
  path_map: 'generate_path_map',
  pie: 'generate_pie_chart',
  pin_map: 'generate_pin_map',
  radar: 'generate_radar_chart',
  sankey: 'generate_sankey_chart',
  scatter: 'generate_scatter_chart',
  spreadsheet: 'generate_spreadsheet',
  treemap: 'generate_treemap_chart',
  venn: 'generate_venn_chart',
  violin: 'generate_violin_chart',
  waterfall: 'generate_waterfall_chart',
  word_cloud: 'generate_word_cloud_chart',
} as const satisfies Record<Exclude<ChartType, 'auto'>, string>;

type ConcreteChartType = Exclude<ChartType, 'auto'>;

function getMetaRecord(result: McpToolCallResult): Record<string, unknown> | null {
  const unknownResult = result as unknown as Record<string, unknown>;
  const meta = unknownResult['_meta'];
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
}

function extractTextContent(result: McpToolCallResult): string[] {
  return result.content
    .flatMap((part) => {
      if (part.type === 'text' && typeof part.text === 'string') return [part.text.trim()];
      if (typeof part.data === 'string') return [part.data.trim()];
      return [] as string[];
    })
    .filter((value) => value.length > 0);
}

function extractImageUrl(result: McpToolCallResult): string {
  const blocks = extractTextContent(result);
  const firstUrl = blocks.find((value) => /^https?:\/\//i.test(value));
  if (firstUrl) return firstUrl;

  const meta = getMetaRecord(result);
  const metaUrl = meta?.['imageUrl'];
  if (typeof metaUrl === 'string' && /^https?:\/\//i.test(metaUrl)) {
    return metaUrl;
  }

  throw new AgentEngineError(
    'CHART_MCP_RESPONSE_EMPTY',
    'Chart MCP returned no image URL in the tool response'
  );
}

function extractErrorMessage(result: McpToolCallResult): string {
  const blocks = extractTextContent(result);
  if (blocks.length > 0) return blocks.join('\n');

  const meta = getMetaRecord(result);
  if (typeof meta?.['error'] === 'string') return meta['error'];
  return 'Unknown Chart MCP error';
}

function isDateLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\d{4}(-\d{1,2}(-\d{1,2})?)?$/.test(value) || /date|time|week|month|season/i.test(value);
}

function firstMatchingKey(
  row: Record<string, unknown>,
  candidates: readonly string[],
  predicate?: (value: unknown) => boolean
): string | null {
  for (const candidate of candidates) {
    if (!(candidate in row)) continue;
    if (!predicate || predicate(row[candidate])) return candidate;
  }
  return null;
}

function firstNumericKey(
  row: Record<string, unknown>,
  excluded: readonly string[] = []
): string | null {
  return (
    Object.keys(row).find(
      (key) => !excluded.includes(key) && typeof row[key] === 'number' && Number.isFinite(row[key])
    ) ?? null
  );
}

function firstStringKey(
  row: Record<string, unknown>,
  excluded: readonly string[] = []
): string | null {
  return (
    Object.keys(row).find((key) => !excluded.includes(key) && typeof row[key] === 'string') ?? null
  );
}

function normalizeFiniteNumber(value: unknown, fieldName: string): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Chart data field "${fieldName}" must contain numeric values.`
    );
  }
  return numberValue;
}

function normalizeCategoryLabel(value: unknown, fieldName: string): string {
  const label = String(value ?? '').trim();
  if (!label) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Chart data field "${fieldName}" must contain non-empty labels.`
    );
  }
  return label;
}

function humanizeFieldName(fieldName: string | null, fallback: string): string {
  if (!fieldName) return fallback;
  const normalized = fieldName
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  if (!normalized) return fallback;
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCategoryValueRows(
  input: GenerateChartVisualizationInput,
  fields: ReturnType<typeof normalizeCommonFields>
): Array<{ category: string; value: number; group?: string }> {
  const categoryField = fields.categoryField;
  const valueField = fields.valueField;
  if (!categoryField || !valueField) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      'Charts require a category/stage field and a numeric value/count field.'
    );
  }

  return input.data.map((row) => ({
    category: normalizeCategoryLabel(row[categoryField], categoryField),
    value: normalizeFiniteNumber(row[valueField], valueField),
    ...(fields.groupField && row[fields.groupField] != null
      ? { group: String(row[fields.groupField]) }
      : {}),
  }));
}

function normalizeCommonFields(input: GenerateChartVisualizationInput): {
  categoryField: string | null;
  valueField: string | null;
  xField: string | null;
  yField: string | null;
  groupField: string | null;
} {
  const firstRow = input.data[0] ?? {};
  const categoryField =
    input.categoryField ??
    input.xField ??
    firstMatchingKey(
      firstRow,
      ['category', 'label', 'name', 'time', 'date'],
      (value) => typeof value === 'string'
    ) ??
    firstStringKey(firstRow);
  const valueField =
    input.valueField ??
    input.yField ??
    firstMatchingKey(firstRow, ['value', 'count', 'total']) ??
    firstNumericKey(firstRow);
  const groupField =
    input.groupField ?? firstMatchingKey(firstRow, ['group', 'series', 'team', 'segment']);
  const xField = input.xField ?? firstMatchingKey(firstRow, ['x', 'time', 'date']);
  const yField =
    input.yField ??
    firstMatchingKey(firstRow, ['y', 'value']) ??
    firstNumericKey(firstRow, xField ? [xField] : []);

  return {
    categoryField: categoryField ?? null,
    valueField: valueField ?? null,
    xField: xField ?? null,
    yField: yField ?? null,
    groupField: groupField ?? null,
  };
}

function inferChartType(input: GenerateChartVisualizationInput): ConcreteChartType {
  if (input.rows?.length || input.values?.length || input.insightGoal === 'table') {
    return 'spreadsheet';
  }

  const fields = normalizeCommonFields(input);
  const firstRow = input.data[0] ?? {};
  const numericKeys = Object.keys(firstRow).filter(
    (key) => typeof firstRow[key] === 'number' && Number.isFinite(firstRow[key])
  );

  if (
    (fields.xField && fields.yField && numericKeys.includes(fields.xField)) ||
    numericKeys.length >= 2
  ) {
    return 'scatter';
  }

  if (input.insightGoal === 'composition' && (fields.categoryField || fields.valueField)) {
    return 'pie';
  }

  if (input.insightGoal === 'trend') {
    return 'line';
  }

  if (fields.categoryField && isDateLike(firstRow[fields.categoryField])) {
    return 'line';
  }

  if (input.preferredOrientation === 'horizontal') {
    return 'bar';
  }

  return 'column';
}

function resolveRenderableChartType(chartType: ConcreteChartType): ConcreteChartType {
  // AntV's native funnel renderer currently hardcodes Chinese conversion-rate
  // labels. Use a horizontal bar chart for funnel/pipeline requests so Agent X
  // returns polished English output while preserving the same stage/value data.
  if (chartType === 'funnel') return 'bar';
  return chartType;
}

function buildPayload(
  input: GenerateChartVisualizationInput,
  chartType: ConcreteChartType
): Record<string, unknown> {
  const merged = { ...(input.config ?? {}) };
  if (merged['data'] === undefined) {
    merged['data'] = input.data;
  }

  if (input.title && merged['title'] === undefined) merged['title'] = input.title;
  if (input.axisXTitle && merged['axisXTitle'] === undefined)
    merged['axisXTitle'] = input.axisXTitle;
  if (input.axisYTitle && merged['axisYTitle'] === undefined)
    merged['axisYTitle'] = input.axisYTitle;
  if (merged['theme'] === undefined) merged['theme'] = input.theme ?? 'default';
  if (merged['width'] === undefined) merged['width'] = input.width ?? 900;
  if (merged['height'] === undefined) {
    merged['height'] =
      input.height ??
      (chartType === 'bar' ? Math.min(900, Math.max(520, input.data.length * 72 + 180)) : 560);
  }
  if (merged['style'] === undefined) {
    merged['style'] = input.style ?? {
      backgroundColor: '#ffffff',
      palette: [...DEFAULT_CHART_PALETTE],
    };
  }

  const fields = normalizeCommonFields(input);

  if (chartType === 'spreadsheet') {
    if (input.rows && merged['rows'] === undefined) merged['rows'] = input.rows;
    if (input.columns && merged['columns'] === undefined) merged['columns'] = input.columns;
    if (input.values && merged['values'] === undefined) merged['values'] = input.values;
    return merged;
  }

  if (chartType === 'scatter') {
    const xField = fields.xField ?? fields.categoryField;
    const yField = fields.yField ?? fields.valueField;
    if (!xField || !yField) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'Scatter charts require xField and yField (or two numeric columns in data).'
      );
    }
    merged['data'] = input.data.map((row) => ({
      x: Number(row[xField]),
      y: Number(row[yField]),
      ...(fields.groupField && typeof row[fields.groupField] === 'string'
        ? { group: String(row[fields.groupField]) }
        : {}),
    }));
    return merged;
  }

  if (chartType === 'pie') {
    merged['data'] = normalizeCategoryValueRows(input, fields).map(({ category, value }) => ({
      category,
      value,
    }));
    if (input.innerRadius !== undefined && merged['innerRadius'] === undefined) {
      merged['innerRadius'] = input.innerRadius;
    }
    return merged;
  }

  if (chartType === 'line' || chartType === 'area') {
    const timeField = fields.categoryField;
    const valueField = fields.valueField;
    if (!timeField || !valueField) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        `${chartType} charts require a time/category field and a numeric value field.`
      );
    }
    merged['data'] = input.data.map((row) => ({
      time: String(row[timeField]),
      value: normalizeFiniteNumber(row[valueField], valueField),
      ...(fields.groupField && row[fields.groupField] != null
        ? { group: String(row[fields.groupField]) }
        : {}),
    }));
    if (input.stack !== undefined && merged['stack'] === undefined) merged['stack'] = input.stack;
    return merged;
  }

  if (chartType === 'bar' || chartType === 'column') {
    merged['data'] = normalizeCategoryValueRows(input, fields);
    const isPipelineFallback = input.chartType === 'funnel';
    const categoryTitle = isPipelineFallback
      ? 'Pipeline Stage'
      : humanizeFieldName(fields.categoryField, 'Category');
    const valueTitle = isPipelineFallback ? 'Count' : humanizeFieldName(fields.valueField, 'Value');
    if (merged['axisXTitle'] === undefined) {
      merged['axisXTitle'] = chartType === 'bar' ? valueTitle : categoryTitle;
    }
    if (merged['axisYTitle'] === undefined) {
      merged['axisYTitle'] = chartType === 'bar' ? categoryTitle : valueTitle;
    }
    if (input.group !== undefined && merged['group'] === undefined) merged['group'] = input.group;
    if (input.stack !== undefined && merged['stack'] === undefined) merged['stack'] = input.stack;
    return merged;
  }

  if (chartType === 'funnel') {
    merged['data'] = normalizeCategoryValueRows(input, fields).map(({ category, value }) => ({
      category,
      value,
    }));
    return merged;
  }

  return merged;
}

export class ChartMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'chart-mcp';

  private readonly baseUrl: string;
  private readonly apiToken: string | null;
  private readonly mediaStaging = new MediaStagingService();

  constructor() {
    super();

    const baseUrl = process.env['CHART_MCP_URL'];
    if (!baseUrl) {
      throw new AgentEngineError(
        'CHART_MCP_CONFIG_MISSING_URL',
        'CHART_MCP_URL environment variable is required for ChartMcpBridgeService'
      );
    }

    this.baseUrl = baseUrl;
    this.apiToken = process.env['CHART_MCP_API_TOKEN'] ?? null;
  }

  protected override getTransport(): Transport {
    const headers: Record<string, string> = {};
    if (this.apiToken) {
      headers[TOKEN_HEADER] = this.apiToken;
    }

    return new StreamableHTTPClientTransport(new URL(this.baseUrl), {
      requestInit: {
        headers,
      },
    });
  }

  async generateChart(
    input: GenerateChartVisualizationInput,
    context?: ToolExecutionContext
  ): Promise<ChartMcpOperationResult> {
    const requestedChartType = input.chartType === 'auto' ? inferChartType(input) : input.chartType;
    const chartType = resolveRenderableChartType(requestedChartType);
    const chartToolName = CHART_TOOL_NAME_BY_TYPE[chartType];
    const chartSpec = buildPayload(input, chartType);
    const result = await this.executeTool(chartToolName, chartSpec, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    if (result.isError) {
      throw new AgentEngineError('CHART_MCP_REQUEST_FAILED', extractErrorMessage(result), {
        metadata: { chartToolName, chartType },
      });
    }

    const sourceImageUrl = extractImageUrl(result);
    const meta = getMetaRecord(result);
    const description = typeof meta?.['description'] === 'string' ? meta['description'] : undefined;
    const metaSpec = meta?.['spec'];
    const resolvedChartSpec =
      metaSpec && typeof metaSpec === 'object' && !Array.isArray(metaSpec)
        ? (metaSpec as Record<string, unknown>)
        : chartSpec;

    const staged = await this.stageChartImage(sourceImageUrl, chartToolName, context);
    const parsed = ChartMcpOperationResultSchema.safeParse({
      imageUrl: staged.imageUrl,
      sourceImageUrl,
      chartToolName,
      chartType,
      chartSpec: resolvedChartSpec,
      ...(requestedChartType !== chartType
        ? {
            requestedChartType,
            renderFallbackReason:
              'Native funnel output uses non-English conversion labels, so NXT1 rendered a polished horizontal pipeline chart instead.',
          }
        : {}),
      description,
      ...(staged.storagePath ? { storagePath: staged.storagePath } : {}),
    });

    if (!parsed.success) {
      logger.error('[ChartMCP] Invalid normalized response payload', {
        chartToolName,
        chartType,
        issues: parsed.error.issues,
      });
      throw new AgentEngineError(
        'CHART_MCP_INVALID_RESPONSE',
        `Chart MCP returned invalid payload for ${chartToolName}`,
        { metadata: { chartToolName, chartType } }
      );
    }

    return parsed.data;
  }

  private async stageChartImage(
    sourceImageUrl: string,
    chartToolName: string,
    context?: ToolExecutionContext
  ): Promise<{ imageUrl: string; storagePath?: string }> {
    if (!context?.userId) {
      return { imageUrl: sourceImageUrl };
    }

    try {
      const staged = await this.mediaStaging.stageFromUrl({
        sourceUrl: sourceImageUrl,
        staging: {
          userId: context.userId,
          threadId: context.threadId ?? 'agent-x',
        },
        environment: context.environment,
        mediaKind: 'image',
      });

      const bucket =
        context.environment === 'staging'
          ? stagingStorage.bucket()
          : context.environment === 'production'
            ? defaultStorage.bucket()
            : process.env['NODE_ENV'] === 'staging'
              ? stagingStorage.bucket()
              : defaultStorage.bucket();
      const file = bucket.file(staged.storagePath);
      await file.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${staged.storagePath}`;

      return {
        imageUrl: publicUrl,
        storagePath: staged.storagePath,
      };
    } catch (error) {
      logger.warn('[ChartMCP] Failed to stage chart image — falling back to source URL', {
        chartToolName,
        error: error instanceof Error ? error.message : String(error),
      });
      return { imageUrl: sourceImageUrl };
    }
  }
}
