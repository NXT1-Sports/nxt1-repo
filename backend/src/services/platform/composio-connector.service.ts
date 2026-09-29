import { Composio } from '@composio/core';
import type {
  ConnectorCatalogResponse,
  ConnectorDefinition,
  ConnectorId,
  ConnectorAuthorizationResponse,
  ConnectedConnectorAccount,
} from '@nxt1/core';
import { CONNECTOR_IDS } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { logger } from '../../utils/logger.js';

const CONNECTOR_DEFINITIONS: readonly ConnectorDefinition[] = [
  {
    id: CONNECTOR_IDS.GOOGLE_DRIVE,
    toolkit: 'googledrive',
    label: 'Google Drive',
    group: 'google',
    description: 'Files, folders, sharing, comments, and uploads.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_DOCS,
    toolkit: 'googledocs',
    label: 'Google Docs',
    group: 'google',
    description: 'Create, read, edit, format, and export documents.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_SHEETS,
    toolkit: 'googlesheets',
    label: 'Google Sheets',
    group: 'google',
    description: 'Read, write, format, and analyze spreadsheets.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_SLIDES,
    toolkit: 'googleslides',
    label: 'Google Slides',
    group: 'google',
    description: 'Create presentations and update slides from structured content.',
    capabilities: ['read', 'create', 'update'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_GMAIL,
    toolkit: 'gmail',
    label: 'Gmail',
    group: 'google',
    description: 'Search, draft, label, reply, and send email.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_CALENDAR,
    toolkit: 'googlecalendar',
    label: 'Google Calendar',
    group: 'google',
    description: 'Find availability and manage calendar events.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_TASKS,
    toolkit: 'googletasks',
    label: 'Google Tasks',
    group: 'google',
    description: 'Create, organize, update, and complete tasks.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.GOOGLE_CONTACTS,
    toolkit: 'googlecontacts',
    label: 'Google Contacts',
    group: 'google',
    description: 'Search and manage contacts and groups.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.INSTAGRAM,
    toolkit: 'instagram',
    label: 'Instagram',
    group: 'social',
    description: 'Publish eligible media, manage comments, messages, and insights.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.TIKTOK,
    toolkit: 'tiktok',
    label: 'TikTok',
    group: 'social',
    description: 'Upload and publish eligible video and photo content.',
    capabilities: ['read', 'create', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.FACEBOOK,
    toolkit: 'facebook',
    label: 'Facebook Pages',
    group: 'social',
    description: 'Manage eligible Pages, posts, comments, messages, and insights.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.LINKEDIN,
    toolkit: 'linkedin',
    label: 'LinkedIn',
    group: 'social',
    description: 'Publish supported member or organization content and view analytics.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.X,
    toolkit: 'twitter',
    label: 'X',
    group: 'social',
    description: 'Publish posts, upload media, manage replies, DMs, and analytics.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.YOUTUBE,
    toolkit: 'youtube',
    label: 'YouTube',
    group: 'social',
    description: 'Upload videos, manage metadata, comments, playlists, and analytics.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.PINTEREST,
    toolkit: 'pinterest',
    label: 'Pinterest',
    group: 'social',
    description: 'Create and manage Pins, boards, and analytics.',
    capabilities: ['read', 'create', 'update', 'delete', 'publish', 'analytics'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.NOTION,
    toolkit: 'notion',
    label: 'Notion',
    group: 'productivity',
    description: 'Search and manage workspace pages and databases.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
  {
    id: CONNECTOR_IDS.SLACK,
    toolkit: 'slack',
    label: 'Slack',
    group: 'productivity',
    description: 'Search and manage approved workspace communication.',
    capabilities: ['read', 'create', 'update', 'delete'],
    enabled: true,
  },
];

function environmentKey(environment: RuntimeEnvironment): string {
  return environment === 'staging' ? 'STAGING_COMPOSIO_API_KEY' : 'COMPOSIO_API_KEY';
}

function getClient(environment: RuntimeEnvironment): Composio | null {
  const key =
    process.env[environmentKey(environment)]?.trim() || process.env['COMPOSIO_API_KEY']?.trim();
  if (!key) return null;
  return new Composio({ apiKey: key });
}

function resolveConnector(toolkit: string): ConnectorDefinition | undefined {
  return CONNECTOR_DEFINITIONS.find((connector) => connector.toolkit === toolkit);
}

export class ComposioConnectorService {
  async getCatalog(
    userId: string,
    environment: RuntimeEnvironment
  ): Promise<ConnectorCatalogResponse> {
    const client = getClient(environment);
    if (!client) {
      return { connectors: CONNECTOR_DEFINITIONS, accounts: [] };
    }

    try {
      const response = await client.connectedAccounts.list({
        userIds: [userId],
        limit: 100,
      });
      const accounts: ConnectedConnectorAccount[] = response.items.flatMap((account) => {
        const connector = resolveConnector(account.toolkit.slug);
        if (!connector || !connector.enabled) return [];
        return [
          {
            connectorId: connector.id,
            toolkit: connector.toolkit,
            status: account.status === 'ACTIVE' ? 'connected' : 'reauthorization-required',
            accountId: account.id,
            accountLabel: account.alias ?? undefined,
            connectedAt: account.createdAt,
            lastUsedAt: account.updatedAt,
          },
        ];
      });
      return { connectors: CONNECTOR_DEFINITIONS, accounts };
    } catch (error) {
      logger.warn('[ComposioConnector] Failed to list connected accounts', {
        userId,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
      return { connectors: CONNECTOR_DEFINITIONS, accounts: [] };
    }
  }

  async authorize(
    userId: string,
    connectorId: ConnectorId,
    environment: RuntimeEnvironment
  ): Promise<ConnectorAuthorizationResponse> {
    const connector = CONNECTOR_DEFINITIONS.find((item) => item.id === connectorId && item.enabled);
    if (!connector) throw new Error('Connector is not available.');

    const client = getClient(environment);
    if (!client) throw new Error('Connector service is not configured for this environment.');

    const request = await client.toolkits.authorize(userId, connector.toolkit);
    if (!request.redirectUrl) throw new Error('Connector authorization URL was not returned.');

    return { connectorId, authorizationUrl: request.redirectUrl };
  }
}

export const composioConnectorService = new ComposioConnectorService();
