import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../../base.tool.js';
import { ChartMcpBridgeService } from '../chart-mcp-bridge.service.js';
import { GenerateChartVisualizationTool } from '../generate-chart-visualization.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('GenerateChartVisualizationTool', () => {
  const bridge = {
    generateChart: vi.fn(),
  };

  let tool: GenerateChartVisualizationTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new GenerateChartVisualizationTool(bridge as never);
  });

  it('returns staged image artifacts when the bridge succeeds', async () => {
    bridge.generateChart.mockResolvedValue({
      imageUrl: 'https://storage.googleapis.com/test/chart.png',
      sourceImageUrl: 'https://example.com/upstream.png',
      chartToolName: 'generate_line_chart',
      chartType: 'line',
      chartSpec: { data: [{ time: '2025', value: 12 }] },
      description: 'Chart image URL response',
      storagePath: 'Users/user-1/threads/thread-1/media/staged/image/chart.png',
    });

    const result = await tool.execute(
      {
        chartType: 'line',
        data: [{ season: '2025', points: 12 }],
        xField: 'season',
        yField: 'points',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(bridge.generateChart).toHaveBeenCalledTimes(1);
    expect((result.data as Record<string, unknown>)['imageUrl']).toBe(
      'https://storage.googleapis.com/test/chart.png'
    );
    expect(result.markdown).toBeUndefined();
    expect((result.data as Record<string, unknown>)['markdown']).toContain('Generated chart');
    expect((result.data as Record<string, unknown>)['mimeType']).toBe('image/png');
    expect((result.data as Record<string, unknown>)['imageUrls']).toEqual([
      'https://storage.googleapis.com/test/chart.png',
    ]);
    expect((result.data as Record<string, unknown>)['files']).toEqual([
      expect.objectContaining({
        url: 'https://storage.googleapis.com/test/chart.png',
        type: 'image',
        mimeType: 'image/png',
      }),
    ]);
  });

  it('fails validation when data is empty', async () => {
    const result = await tool.execute({ chartType: 'line', data: [] }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('data');
    expect(bridge.generateChart).not.toHaveBeenCalled();
  });
});

describe('ChartMcpBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CHART_MCP_URL', 'https://chart-mcp.example.test/mcp');
  });

  it('normalizes funnel stage/count data into an English pipeline chart payload', async () => {
    const bridge = new ChartMcpBridgeService();
    const executeTool = vi.spyOn(bridge, 'executeTool').mockResolvedValue({
      content: [{ type: 'text', text: 'https://example.com/generated-chart.png' }],
    });

    const result = await bridge.generateChart({
      chartType: 'funnel',
      title: 'Ideal Football Team Recruiting Pipeline',
      categoryField: 'stage',
      valueField: 'count',
      data: [
        { stage: 'Initial Prospect Pool', count: 200 },
        { stage: 'Film Reviewed & Measured', count: 75 },
        { stage: 'Active Communications', count: 40 },
      ],
    });

    expect(executeTool).toHaveBeenCalledWith(
      'generate_bar_chart',
      expect.objectContaining({
        title: 'Ideal Football Team Recruiting Pipeline',
        axisXTitle: 'Count',
        axisYTitle: 'Pipeline Stage',
        data: [
          { category: 'Initial Prospect Pool', value: 200 },
          { category: 'Film Reviewed & Measured', value: 75 },
          { category: 'Active Communications', value: 40 },
        ],
      }),
      { timeoutMs: 90_000 }
    );
    expect(result.imageUrl).toBe('https://example.com/generated-chart.png');
    expect(result.chartType).toBe('bar');
    expect(result.requestedChartType).toBe('funnel');
    expect(result.renderFallbackReason).toContain('Native funnel output');
  });
});
