/**
 * @fileoverview NetworkService - Mobile Native Implementation
 * @module @nxt1/mobile/services
 *
 * Professional-grade network connectivity monitoring for native mobile apps.
 * Uses Capacitor Network plugin for detailed connection information.
 *
 * Features:
 * - Real-time connectivity monitoring via Capacitor Network plugin
 * - Connection type detection (wifi, cellular, ethernet)
 * - Reactive signals for component consumption
 * - Background monitoring support
 * - Automatic cleanup on service destroy
 *
 * Platform Support:
 * - iOS: Full support (iOS 13+)
 * - Android: Full support (API 21+)
 * - Web: Falls back to browser APIs
 *
 * Usage:
 * ```typescript
 * export class MyComponent {
 *   private readonly network = inject(NetworkService);
 *
 *   readonly showOfflineBanner = computed(() => !this.network.isOnline());
 *   readonly connectionInfo = computed(() => this.network.connectionType());
 *
 *   ngOnInit() {
 *     this.network.status$.subscribe(event => {
 *       if (!event.isConnected) {
 *         this.queueForLater();
 *       }
 *     });
 *   }
 * }
 * ```
 */

import { Injectable, PLATFORM_ID, inject, signal, computed, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Network, ConnectionStatus } from '@capacitor/network';
import { Subject } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import type { NetworkStatus, NetworkChangeEvent, ConnectionType } from '@nxt1/core';

@Injectable({
  providedIn: 'root',
})
export class NetworkService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger: ILogger = inject(NxtLoggingService).child('NetworkService');

  // Private state
  private _isInitialized = false;
  private _networkListener?: () => void;
  private readonly _statusChange = new Subject<NetworkChangeEvent>();

  // Reactive state
  private readonly _isOnline = signal(true);
  private readonly _connectionType = signal<ConnectionType>('unknown');

  // ============================================
  // PUBLIC API - Signals
  // ============================================

  /**
   * Current online status
   * @returns true if connected, false if offline
   */
  readonly isOnline = computed(() => this._isOnline());

  /**
   * Current offline status (convenience)
   * @returns true if offline, false if connected
   */
  readonly isOffline = computed(() => !this._isOnline());

  /**
   * Current connection type (wifi, cellular, etc.)
   * More detailed than web - native platforms provide accurate connection type
   */
  readonly connectionType = computed(() => this._connectionType());

  /**
   * Current network status snapshot
   */
  readonly status = computed<NetworkStatus>(() => ({
    connected: this._isOnline(),
    connectionType: this._connectionType(),
  }));

  /**
   * Is connected via WiFi
   */
  readonly isWifi = computed(() => this._connectionType() === 'wifi');

  /**
   * Is connected via cellular data
   */
  readonly isCellular = computed(() => this._connectionType() === 'cellular');

  // ============================================
  // PUBLIC API - Observables
  // ============================================

  /**
   * Observable stream of network status changes
   * Emits detailed change events with previous/current state
   */
  readonly status$ = this._statusChange.asObservable();

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initialize();
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
    this._statusChange.complete();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  private async initialize(): Promise<void> {
    if (this._isInitialized) return;

    try {
      // Get initial status from Capacitor Network plugin
      const status = await Network.getStatus();
      this.updateStatus(status);

      // Set up listener for network changes
      const listener = await Network.addListener('networkStatusChange', (status) => {
        this.handleNetworkChange(status);
      });

      this._networkListener = () => listener.remove();

      this._isInitialized = true;

      this.logger.debug('Initialized', {
        isOnline: this._isOnline(),
        connectionType: this._connectionType(),
        platform: 'mobile',
      });
    } catch {
      // Capacitor Network not available, fall back to browser APIs
      this.fallbackToBrowserAPIs();
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private handleNetworkChange(status: ConnectionStatus): void {
    const wasConnected = this._isOnline();
    const previousType = this._connectionType();

    this.updateStatus(status);

    // Emit detailed change event
    this._statusChange.next({
      wasConnected,
      isConnected: this._isOnline(),
      previousType,
      currentType: this._connectionType(),
      timestamp: Date.now(),
    });

    this.logger.debug('Connection changed', {
      from: { connected: wasConnected, type: previousType },
      to: { connected: this._isOnline(), type: this._connectionType() },
    });
  }

  private updateStatus(status: ConnectionStatus): void {
    this._isOnline.set(status.connected);
    this._connectionType.set(this.mapConnectionType(status.connectionType));
  }

  /**
   * Map Capacitor connection type to our standard ConnectionType
   */
  private mapConnectionType(capacitorType: string): ConnectionType {
    switch (capacitorType.toLowerCase()) {
      case 'wifi':
        return 'wifi';
      case 'cellular':
      case '2g':
      case '3g':
      case '4g':
      case '5g':
        return 'cellular';
      case 'ethernet':
        return 'ethernet';
      case 'bluetooth':
        return 'bluetooth';
      case 'wimax':
        return 'wimax';
      case 'vpn':
        return 'vpn';
      case 'none':
        return 'none';
      default:
        return 'unknown';
    }
  }

  // ============================================
  // FALLBACK (Web)
  // ============================================

  private fallbackToBrowserAPIs(): void {
    this.logger.debug('Using browser fallback');

    this._isOnline.set(navigator.onLine);
    this._connectionType.set(navigator.onLine ? 'unknown' : 'none');

    window.addEventListener('online', () => {
      this._isOnline.set(true);
      this._connectionType.set('unknown');
    });

    window.addEventListener('offline', () => {
      this._isOnline.set(false);
      this._connectionType.set('none');
    });

    this._isInitialized = true;
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Manually check current network status
   * Useful for refreshing status after app resume
   */
  async checkStatus(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const status = await Network.getStatus();
      this.updateStatus(status);
    } catch {
      // Fallback to browser API
      this._isOnline.set(navigator.onLine);
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  private cleanup(): void {
    if (this._networkListener) {
      this._networkListener();
    }
  }
}
