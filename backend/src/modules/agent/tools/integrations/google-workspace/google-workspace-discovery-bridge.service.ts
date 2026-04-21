import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BaseMcpClientService } from '../base-mcp-client.service.js';

export class GoogleWorkspaceDiscoveryBridgeService extends BaseMcpClientService {
  readonly serverName = 'google-workspace-discovery';

  constructor(private readonly endpointUrl: string) {
    super();
  }

  protected getTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(this.endpointUrl));
  }
}
