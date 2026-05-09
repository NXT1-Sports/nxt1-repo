import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { ChartMcpBridgeService } from './chart-mcp-bridge.service.js';
import { GenerateChartVisualizationInputSchema } from './schemas.js';

export class GenerateChartVisualizationTool extends BaseTool {
  readonly name = 'generate_chart_visualization';
  readonly description =
    'Generate a hosted chart image from structured data using AntV Chart MCP. ' +
    'Use this for stats comparisons, trend lines, recruiting summaries, analytics dashboards, ' +
    'leaderboards, pipeline charts, funnel charts, process maps, and tabular pivot views. ' +
    'Use this instead of generate_graphic when the user wants data shown visually or wants a recruiting pipeline/process chart. Returns an imageUrl for chat rendering and chartSpec ' +
    'for downstream reasoning. Supports auto chart selection for common categorical and time-series data.';
  readonly parameters = GenerateChartVisualizationInputSchema;

  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;

  constructor(private readonly bridge: ChartMcpBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GenerateChartVisualizationInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    context?.emitStage?.('processing_media', {
      icon: 'media',
      phase: 'generate_chart_visualization',
    });

    try {
      const result = await this.bridge.generateChart(parsed.data, context);
      const imageName = `${result.chartType}-chart.png`;
      const markdown = `![Generated chart](${result.imageUrl})`;
      return {
        success: true,
        data: {
          imageUrl: result.imageUrl,
          chartUrl: result.imageUrl,
          sourceImageUrl: result.sourceImageUrl,
          mimeType: 'image/png',
          imageUrls: [result.imageUrl],
          mediaUrls: [result.imageUrl],
          markdown,
          files: [
            {
              url: result.imageUrl,
              downloadUrl: result.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          attachments: [
            {
              url: result.imageUrl,
              type: 'image',
              mimeType: 'image/png',
              name: imageName,
            },
          ],
          mediaArtifact: {
            url: result.imageUrl,
            type: 'image',
            mimeType: 'image/png',
            name: imageName,
            source: 'chart_mcp',
            chartType: result.chartType,
          },
          chartType: result.chartType,
          ...(result.requestedChartType ? { requestedChartType: result.requestedChartType } : {}),
          ...(result.renderFallbackReason
            ? { renderFallbackReason: result.renderFallbackReason }
            : {}),
          chartToolName: result.chartToolName,
          chartSpec: result.chartSpec,
          ...(result.description ? { description: result.description } : {}),
          ...(result.storagePath ? { storagePath: result.storagePath } : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chart generation failed',
      };
    }
  }
}
