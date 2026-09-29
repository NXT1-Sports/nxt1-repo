/**
 * Portable connector contracts shared by NXT1 clients and backend.
 */

export const CONNECTOR_IDS = {
  GOOGLE_DRIVE: 'google-drive',
  GOOGLE_DOCS: 'google-docs',
  GOOGLE_SHEETS: 'google-sheets',
  GOOGLE_SLIDES: 'google-slides',
  GOOGLE_GMAIL: 'google-gmail',
  GOOGLE_CALENDAR: 'google-calendar',
  GOOGLE_TASKS: 'google-tasks',
  GOOGLE_CONTACTS: 'google-contacts',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
  LINKEDIN: 'linkedin',
  X: 'x',
  YOUTUBE: 'youtube',
  PINTEREST: 'pinterest',
  NOTION: 'notion',
  SLACK: 'slack',
} as const;

export type ConnectorId = (typeof CONNECTOR_IDS)[keyof typeof CONNECTOR_IDS];
export type ConnectorStatus =
  | 'not-configured'
  | 'disconnected'
  | 'connected'
  | 'reauthorization-required'
  | 'unavailable';
export type ConnectorCapability = 'read' | 'create' | 'update' | 'publish' | 'delete' | 'analytics';

export interface ConnectorDefinition {
  readonly id: ConnectorId;
  readonly toolkit: string;
  readonly label: string;
  readonly group: 'google' | 'social' | 'productivity';
  readonly description: string;
  readonly capabilities: readonly ConnectorCapability[];
  readonly enabled: boolean;
}

export interface ConnectedConnectorAccount {
  readonly connectorId: ConnectorId;
  readonly toolkit: string;
  readonly status: ConnectorStatus;
  readonly accountId?: string;
  readonly accountLabel?: string;
  readonly connectedAt?: string;
  readonly lastUsedAt?: string;
  readonly reauthorizationUrl?: string;
}

export interface ConnectorCatalogResponse {
  readonly connectors: readonly ConnectorDefinition[];
  readonly accounts: readonly ConnectedConnectorAccount[];
}

export interface ConnectorAuthorizationResponse {
  readonly connectorId: ConnectorId;
  readonly authorizationUrl: string;
  readonly expiresAt?: string;
}

export interface ConnectorResourceReference {
  readonly connectorId: ConnectorId;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly title?: string;
  readonly url?: string;
}
