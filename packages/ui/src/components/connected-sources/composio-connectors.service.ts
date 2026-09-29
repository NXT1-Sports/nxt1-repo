import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ConnectorAuthorizationResponse,
  ConnectorCatalogResponse,
  ConnectorDefinition,
  ConnectedConnectorAccount,
  ConnectorId,
} from '@nxt1/core/connectors';
import { AGENT_X_API_BASE_URL } from '../../agent-x/services/agent-x-job.service';
import { NxtLoggingService } from '../../services/logging/logging.service';

interface ConnectorApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

@Injectable({ providedIn: 'root' })
export class ComposioConnectorsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/connectors`;
  private readonly logger = inject(NxtLoggingService).child('ComposioConnectorsService');
  private readonly _connectors = signal<readonly ConnectorDefinition[]>([]);
  private readonly _accounts = signal<readonly ConnectedConnectorAccount[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly connectors = computed(() => this._connectors());
  readonly accounts = computed(() => this._accounts());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const response = await firstValueFrom(
        this.http.get<ConnectorApiResponse<ConnectorCatalogResponse>>(this.baseUrl)
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Unable to load connectors.');
      }
      this._connectors.set(response.data.connectors);
      this._accounts.set(response.data.accounts);
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : 'Unable to load connectors.');
      this.logger.warn('Failed to load Composio connectors', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this._loading.set(false);
    }
  }

  async authorize(connectorId: ConnectorId): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectorApiResponse<ConnectorAuthorizationResponse>>(
          `${this.baseUrl}/${connectorId}/authorize`,
          {}
        )
      );
      if (!response.success || !response.data?.authorizationUrl) {
        throw new Error(response.error ?? 'Unable to start connector authorization.');
      }
      return response.data.authorizationUrl;
    } catch (error) {
      this.logger.error('Failed to authorize Composio connector', error, { connectorId });
      this._error.set(error instanceof Error ? error.message : 'Unable to authorize connector.');
      return null;
    }
  }

  accountFor(connectorId: ConnectorId): ConnectedConnectorAccount | undefined {
    return this._accounts().find((account) => account.connectorId === connectorId);
  }
}
