/**
 * @fileoverview NetworkService - Offline Detection & Network Status
 * @module @nxt1/infrastructure/network
 *
 * Real-time network status monitoring with reactive signals.
 * Essential for offline-first mobile apps.
 *
 * Features:
 * - Real-time online/offline detection
 * - Connection type detection (wifi, cellular, none)
 * - Network quality estimation
 * - Reactive signals for template binding
 * - SSR-safe implementation
 *
 * Usage:
 * ```typescript
 * import { NetworkService } from '@nxt1/infrastructure/network';
 *
 * export class MyComponent {
 *   private readonly network = inject(NetworkService);
 *
 *   // In template: @if (network.isOffline()) { ... }
 *
 *   async loadData() {
 *     if (this.network.isOffline()) {
 *       return this.loadFromCache();
 *     }
 *     return this.api.fetchData();
 *   }
 * }
 * ```
 */

import {
  Injectable,
  inject,
  PLATFORM_ID,
  signal,
  computed,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';

/** Network connection types */
export type ConnectionType = 'wifi' | 'cellular' | '2g' | '3g' | '4g' | '5g' | 'unknown' | 'none';

/** Network status info */
export interface NetworkStatus {
  connected: boolean;
  connectionType: ConnectionType;
}

/** Network change event */
export interface NetworkChangeEvent {
  previousStatus: NetworkStatus;
  currentStatus: NetworkStatus;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class NetworkService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly ngZone = inject(NgZone);

  // ============================================
  // PRIVATE STATE
  // ============================================

  private _isOnline = signal(true);
  private _connectionType = signal<ConnectionType>('unknown');
  private _isInitialized = false;
  private networkListener: (() => void) | null = null;

  /** Network status change events */
  private readonly _networkChange = new Subject<NetworkChangeEvent>();

  // ============================================
  // PUBLIC SIGNALS
  // ============================================

  /** Whether device is online */
  readonly isOnline = computed(() => this._isOnline());

  /** Whether device is offline */
  readonly isOffline = computed(() => !this._isOnline());

  /** Current connection type */
  readonly connectionType = computed(() => this._connectionType());

  /** Whether on WiFi */
  readonly isWifi = computed(() => this._connectionType() === 'wifi');

  /** Whether on cellular data */
  readonly isCellular = computed(() => {
    const type = this._connectionType();
    return ['cellular', '2g', '3g', '4g', '5g'].includes(type);
  });

  /** Network status as object */
  readonly status = computed<NetworkStatus>(() => ({
    connected: this._isOnline(),
    connectionType: this._connectionType(),
  }));

  /** Network change events observable */
  readonly networkChange$ = this._networkChange.asObservable();

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initialize();
    }
  }

  ngOnDestroy(): void {
    this.networkListener?.();
    this._networkChange.complete();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  private async initialize(): Promise<void> {
    if (this._isInitialized) return;

    // Initial status from browser
    this._isOnline.set(navigator.onLine);

    // Detect initial connection type
    this.detectConnectionType();

    // Setup listeners
    await this.setupListeners();

    this._isInitialized = true;
    console.debug('[NetworkService] Initialized', this.status());
  }

  private async setupListeners(): Promise<void> {
    // Browser events (fallback)
    window.addEventListener('online', () => this.handleStatusChange(true));
    window.addEventListener('offline', () => this.handleStatusChange(false));

    // Use Capacitor Network plugin if available (more reliable on native)
    if (this.ionicPlatform.is('capacitor')) {
      try {
        const { Network } = await import('@capacitor/network');

        // Get initial status
        const status = await Network.getStatus();
        this.updateStatus(status.connected, this.mapConnectionType(status.connectionType));

        // Listen for changes
        const listener = await Network.addListener('networkStatusChange', (status) => {
          this.ngZone.run(() => {
            this.updateStatus(status.connected, this.mapConnectionType(status.connectionType));
          });
        });

        this.networkListener = () => listener.remove();
      } catch {
        console.debug('[NetworkService] Capacitor Network not available, using browser events');
      }
    }

    // Network Information API (where available)
    this.setupNetworkInformationAPI();
  }

  private setupNetworkInformationAPI(): void {
    // Check for Network Information API
    const connection = (navigator as NavigatorWithConnection).connection;

    if (connection) {
      connection.addEventListener('change', () => {
        this.ngZone.run(() => {
          this.detectConnectionType();
        });
      });
    }
  }

  // ============================================
  // STATUS HANDLING
  // ============================================

  private handleStatusChange(online: boolean): void {
    this.ngZone.run(() => {
      this.updateStatus(online, this._connectionType());
      this.detectConnectionType();
    });
  }

  private updateStatus(connected: boolean, connectionType: ConnectionType): void {
    const previousStatus = this.status();

    this._isOnline.set(connected);
    this._connectionType.set(connectionType);

    const currentStatus = this.status();

    // Emit change event
    if (
      previousStatus.connected !== currentStatus.connected ||
      previousStatus.connectionType !== currentStatus.connectionType
    ) {
      this._networkChange.next({
        previousStatus,
        currentStatus,
        timestamp: Date.now(),
      });

      console.debug('[NetworkService] Status changed:', currentStatus);
    }
  }

  // ============================================
  // CONNECTION TYPE DETECTION
  // ============================================

  private detectConnectionType(): void {
    const connection = (navigator as NavigatorWithConnection).connection;

    if (!connection) {
      this._connectionType.set(this._isOnline() ? 'unknown' : 'none');
      return;
    }

    const effectiveType = connection.effectiveType;
    const type = connection.type;

    // Map to our connection types
    if (!this._isOnline()) {
      this._connectionType.set('none');
    } else if (type === 'wifi') {
      this._connectionType.set('wifi');
    } else if (type === 'cellular') {
      // Use effective type for cellular quality
      this._connectionType.set(this.mapEffectiveType(effectiveType));
    } else if (effectiveType) {
      this._connectionType.set(this.mapEffectiveType(effectiveType));
    } else {
      this._connectionType.set('unknown');
    }
  }

  private mapEffectiveType(effectiveType?: string): ConnectionType {
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return '2g';
      case '3g':
        return '3g';
      case '4g':
        return '4g';
      default:
        return 'cellular';
    }
  }

  private mapConnectionType(type: string): ConnectionType {
    switch (type.toLowerCase()) {
      case 'wifi':
        return 'wifi';
      case 'cellular':
        return 'cellular';
      case 'none':
        return 'none';
      case '2g':
        return '2g';
      case '3g':
        return '3g';
      case '4g':
        return '4g';
      case '5g':
        return '5g';
      default:
        return 'unknown';
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check current network status (useful for one-time checks)
   */
  async checkStatus(): Promise<NetworkStatus> {
    if (this.ionicPlatform.is('capacitor')) {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        return {
          connected: status.connected,
          connectionType: this.mapConnectionType(status.connectionType),
        };
      } catch {
        // Fall through to browser check
      }
    }

    return {
      connected: navigator.onLine,
      connectionType: this._connectionType(),
    };
  }

  /**
   * Wait for network to be available
   *
   * @param timeout - Maximum time to wait (ms), 0 for no timeout
   * @returns Promise that resolves when online or rejects on timeout
   */
  async waitForNetwork(timeout = 30000): Promise<void> {
    if (this._isOnline()) return;

    return new Promise((resolve, reject) => {
      const subscription = this._networkChange.subscribe((event) => {
        if (event.currentStatus.connected) {
          subscription.unsubscribe();
          resolve();
        }
      });

      if (timeout > 0) {
        setTimeout(() => {
          subscription.unsubscribe();
          if (!this._isOnline()) {
            reject(new Error('Network timeout'));
          }
        }, timeout);
      }
    });
  }

  /**
   * Execute callback only if online, otherwise return fallback
   */
  async executeIfOnline<T>(
    onlineCallback: () => Promise<T>,
    offlineFallback: T | (() => T)
  ): Promise<T> {
    if (this._isOnline()) {
      return onlineCallback();
    }

    return typeof offlineFallback === 'function' ? (offlineFallback as () => T)() : offlineFallback;
  }
}

// ============================================
// TYPES FOR NETWORK INFORMATION API
// ============================================

interface NetworkInformation extends EventTarget {
  readonly effectiveType?: string;
  readonly type?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformation;
}
