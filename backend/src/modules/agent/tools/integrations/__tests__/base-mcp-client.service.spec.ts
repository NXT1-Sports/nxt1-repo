import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BaseMcpClientService } from '../base-mcp-client.service.js';

class TestMcpClientService extends BaseMcpClientService {
  readonly serverName = 'test';
  connectMock?: ReturnType<typeof vi.fn>;

  protected getTransport(): Transport {
    return {} as Transport;
  }

  override async connect(): Promise<void> {
    if (this.connectMock) {
      await this.connectMock();
      return;
    }
    await super.connect();
  }

  setConnectedClient(callTool: ReturnType<typeof vi.fn>): void {
    (this as unknown as Record<string, unknown>)['client'] = {
      callTool,
      close: vi.fn(),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
    };
    (this as unknown as Record<string, unknown>)['connected'] = true;
  }
}

describe('BaseMcpClientService', () => {
  let service: TestMcpClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TestMcpClientService();
  });

  it('does not retry non-idempotent executions when retryOnTransportError is false', async () => {
    const callTool = vi
      .fn()
      .mockRejectedValue(new StreamableHTTPError(503, 'upstream unavailable'));
    service.setConnectedClient(callTool);

    await expect(
      service.executeTool('call-actor', { actor: 'apify/test' }, { retryOnTransportError: false })
    ).rejects.toThrow('upstream unavailable');

    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('retries read-only dependency failures once after reconnect', async () => {
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new StreamableHTTPError(503, 'upstream unavailable'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] });
    service.setConnectedClient(callTool);

    const disconnectSpy = vi.spyOn(service, 'disconnect').mockImplementation(async () => {
      (service as unknown as Record<string, unknown>)['connected'] = false;
      (service as unknown as Record<string, unknown>)['client'] = null;
    });
    const connectSpy = vi.spyOn(service, 'connect').mockImplementation(async () => {
      service.setConnectedClient(callTool);
    });

    const result = await service.executeTool('search-actors', { keywords: 'recruiting' });

    expect(result.content).toHaveLength(1);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated dependency failures', async () => {
    const callTool = vi.fn().mockRejectedValue(new StreamableHTTPError(503, 'dependency down'));
    service.setConnectedClient(callTool);

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'instagram' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('dependency down');
    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'instagram' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('dependency down');
    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'instagram' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('dependency down');

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'instagram' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('Circuit breaker OPEN');

    expect(callTool).toHaveBeenCalledTimes(3);
  });

  it('opens the circuit immediately on rate limit responses', async () => {
    const callTool = vi.fn().mockRejectedValue(new StreamableHTTPError(429, 'too many requests'));
    service.setConnectedClient(callTool);

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'football' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('too many requests');

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'football' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('Circuit breaker OPEN');

    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('does not retry or open the circuit for client-side 4xx errors', async () => {
    const callTool = vi.fn().mockRejectedValue(new StreamableHTTPError(400, 'bad actor input'));
    service.setConnectedClient(callTool);

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'football' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('bad actor input');

    await expect(
      service.executeTool(
        'search-actors',
        { keywords: 'football' },
        { retryOnTransportError: false }
      )
    ).rejects.toThrow('bad actor input');

    expect(callTool).toHaveBeenCalledTimes(2);
  });
});
