import { z } from 'zod';

export const ChartMcpThemeSchema = z.enum(['default', 'academy', 'dark']);
export const ChartMcpTextureSchema = z.enum(['default', 'rough']);

export const ChartTypeSchema = z.enum([
  'auto',
  'area',
  'bar',
  'boxplot',
  'column',
  'district_map',
  'dual_axes',
  'fishbone_diagram',
  'flow_diagram',
  'funnel',
  'histogram',
  'line',
  'liquid',
  'mind_map',
  'network_graph',
  'organization_chart',
  'path_map',
  'pie',
  'pin_map',
  'radar',
  'sankey',
  'scatter',
  'spreadsheet',
  'treemap',
  'venn',
  'violin',
  'waterfall',
  'word_cloud',
]);

export const InsightGoalSchema = z.enum([
  'comparison',
  'composition',
  'correlation',
  'distribution',
  'hierarchy',
  'process',
  'relationship',
  'trend',
  'table',
]);

export const GenericChartDataRowSchema = z.record(z.string(), z.unknown());

export const GenerateChartVisualizationInputSchema = z.object({
  chartType: ChartTypeSchema.default('auto'),
  data: z.array(GenericChartDataRowSchema).min(1, 'data must contain at least one row'),
  title: z.string().trim().min(1).optional(),
  insightGoal: InsightGoalSchema.optional(),
  xField: z.string().trim().min(1).optional(),
  yField: z.string().trim().min(1).optional(),
  categoryField: z.string().trim().min(1).optional(),
  valueField: z.string().trim().min(1).optional(),
  groupField: z.string().trim().min(1).optional(),
  rows: z.array(z.string().trim().min(1)).optional(),
  columns: z.array(z.string().trim().min(1)).optional(),
  values: z.array(z.string().trim().min(1)).optional(),
  preferredOrientation: z.enum(['horizontal', 'vertical']).optional(),
  stack: z.boolean().optional(),
  group: z.boolean().optional(),
  innerRadius: z.number().min(0).max(1).optional(),
  width: z.number().int().positive().max(2400).optional(),
  height: z.number().int().positive().max(2400).optional(),
  theme: ChartMcpThemeSchema.optional(),
  axisXTitle: z.string().trim().min(1).optional(),
  axisYTitle: z.string().trim().min(1).optional(),
  style: z
    .object({
      backgroundColor: z.string().trim().min(1).optional(),
      palette: z.array(z.string().trim().min(1)).optional(),
      texture: ChartMcpTextureSchema.optional(),
      startAtZero: z.boolean().optional(),
      lineWidth: z.number().positive().optional(),
    })
    .optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type ChartType = z.infer<typeof ChartTypeSchema>;
export type GenerateChartVisualizationInput = z.infer<typeof GenerateChartVisualizationInputSchema>;

export const ChartMcpOperationResultSchema = z.object({
  imageUrl: z.string().url(),
  sourceImageUrl: z.string().url(),
  chartToolName: z.string().trim().min(1),
  chartType: ChartTypeSchema.exclude(['auto']),
  requestedChartType: ChartTypeSchema.exclude(['auto']).optional(),
  renderFallbackReason: z.string().optional(),
  chartSpec: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
  storagePath: z.string().optional(),
});

export type ChartMcpOperationResult = z.infer<typeof ChartMcpOperationResultSchema>;
