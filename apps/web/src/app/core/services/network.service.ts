/**
 * @fileoverview NetworkService - Web Browser Implementation
 * @module @nxt1/web/core/services
 *
 * Professional-grade network connectivity monitoring for web browsers.
 * Uses standard Navigator and Window APIs for maximum compatibility.
 *
 * Features:
 * - Online/offline detection via Navigator API
 * - Window event listeners for connectivity changes
 * - Reactive signals for component consumption
 * - SSR-safe implementation
 * - Automatic cleanup on service destroy
 *
 * Browser Support:
 * - Chrome/Edge: Full support
 * - Firefox: Full support
 * - Safari: Full support (iOS 13+)
 *
 * Usage:
 * ```typescript
 * export class MyComponent {
 *   private readonly network = inject(NetworkService);
 *
 *   readonly showOfflineBanner = computed(() => !this.network.isOnline());
 *
 *   ngOnInit() {
 *     this.network.status$.subscribe(status => {
 *       console.log('Connection changed:', status);
 *     });
 *   }
 * }
 * ```
 */

import { Injectable, PLATFORM_ID, inject, signal, computed, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import type { NetworkStatus, NetworkChangeEvent, ConnectionType } from '@nxt1/core';

@Injectable({
  providedIn: 'root',
})
export class NetworkService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  
  // Private state
  private _isInitialized = false;
  private _onlineListener?: () => void;
  private _offlineListener?: () => void;
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
   * Current connection type
   * Note: Web browsers typically only return 'unknown' or 'none'
   */
  readonly connectionType = computed(() => this._connectionType());
  
  /**
   * Current network status snapshot
   */
  readonly status = computed<NetworkStatus>(() => ({
    connected: this._isOnline(),
    connectionType: this._connectionType(),
  }));
  
  // ============================================
  // PUBLIC API - Observables
  // ============================================
  
  /**
   * Observable stream of network status changes
   * Emits when connection state changes (online ↔ offline)
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
  
  private initialize(): void {
    if (this._isInitialized) return;
    
    // Initial status from Navigator API
    this._isOnline.set(navigator.onLine);
    this._connectionType.set(navigator.onLine ? 'unknown' : 'none');
    
    // Set up event listeners
    this._onlineListener = this.handleOnline.bind(this);
    this._offlineListener = this.handleOffline.bind(this);
    
    window.addEventListener('online', this._onlineListener);
    window.addEventListener('offline', this._offlineListener);
    
    this._isInitialized = true;
    
    console.debug('[NetworkService] Initialized', {
      isOnline: this._isOnline(),
      platform: 'web',
    });
  }
  
  // ============================================
  // EVENT HANDLERS
  // ============================================
  
  private handleOnline(): void {
    const wasConnected = this._isOnline();
    const previousType = this._connectionType();
    
    this._isOnline.set(true);
    this._connectionType.set('unknown');
    
    // Emit change event
    this._statusChange.next({
      wasConnected,
      isConnected: true,
      previousType,
      currentType: 'unknown',
      timestamp: Date.now(),
    });
    
    console.debug('[NetworkService] Connection restored');
  }
  
  private handleOffline(): void {
    const wasConnected = this._isOnline();
    const previousType = this._connectionType();
    
    this._isOnline.set(false);
    this._connectionType.set('none');
    
    // Emit change event
    this._statusChange.next({
      wasConnected,
      isConnected: false,
      previousType,
      currentType: 'none',
      timestamp: Date.now(),
    });
    
    console.debug('[NetworkService] Connection lost');
  }
  
  // ============================================
  // PUBLIC METHODS
  // ============================================
  
  /**
   * Manually check current network status
   * Useful for refreshing status after app resume
   */
  checkStatus(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const currentOnline = navigator.onLine;
    const wasOnline = this._isOnline();
    
    if (currentOnline !== wasOnline) {
      if (currentOnline) {
        this.handleOnline();
      } else {
        this.handleOffline();
      }
    }
  }
  
  // ============================================
  // CLEANUP
  // ============================================
  
  private cleanup(): void {
    if (this._onlineListener) {
      window.removeEventListener('online', this._onlineListener);
    }
    if (this._offlineListener) {
      window.removeEventListener('offline', this._offlineListener);
    }
  }
}
