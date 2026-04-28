import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { BaseMcpClientService } from '../base-mcp-client.service.js';

function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1_000;

  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return null;

  return Math.max(dateMs - Date.now(), 0);
}

export class Microsoft365McpBridgeService extends BaseMcpClientService {
  readonly serverName = 'microsoft-365';

  private rateLimitDelayMs: number | null = null;

  constructor(
    private readonly endpointUrl: string,
    private readonly accessToken: string
  ) {
    super();
  }

  protected getTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(this.endpointUrl), {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        this.rateLimitDelayMs =
          response.status === 429
            ? parseRetryAfterHeader(response.headers.get('retry-after'))
            : null;
        return response;
      },
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    });
  }

  protected override consumeRateLimitDelayMs(): number | null {
    const delayMs = this.rateLimitDelayMs;
    this.rateLimitDelayMs = null;
    return delayMs;
  }
}
