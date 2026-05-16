/**
 * @fileoverview Live View Session History Service
 * @module @nxt1/ui/agent-x
 *
 * Persists recent live-view sessions across panel opens/closes.
 * Users can recover previous sessions (up to 2 at a time) without losing them.
 *
 * Architecture:
 * - Stores sessions in browser sessionStorage (cleared on tab close)
 * - Max 2 concurrent sessions
 * - Tracks expiration time (1 hour TTL from backend)
 * - Auto-removes expired sessions
 * - Provides signals for UI integration
 */

import { Injectable, signal, computed } from '@angular/core';
import type { LiveViewSession } from '@nxt1/core';

/**
 * Session history entry wrapping the backend session with storage metadata.
 */
export interface StoredLiveViewSession {
  readonly session: LiveViewSession;
  readonly storedAt: number; // timestamp
  readonly expiresAt: number; // timestamp (1 hour from backend creation)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nxt1:live-view-sessions';
const MAX_STORED_SESSIONS = 2;

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class LiveViewHistoryService {
  private readonly _storedSessions = signal<StoredLiveViewSession[]>([]);

  /** All valid (non-expired) stored sessions, ordered by most recent first. */
  readonly availableSessions = computed(() => {
    const now = Date.now();
    return this._storedSessions()
      .filter((entry) => entry.expiresAt > now)
      .sort((a, b) => b.storedAt - a.storedAt);
  });

  /** Number of available sessions user can reconnect to. */
  readonly availableCount = computed(() => this.availableSessions().length);

  /** Whether user has at least one recoverable session. */
  readonly hasRecoverableSessions = computed(() => this.availableCount() > 0);

  constructor() {
    // Load from storage on init
    this.loadFromStorage();
  }

  /**
   * Record a newly started live-view session for recovery.
   * Automatically removes oldest session if at max capacity.
   */
  recordSession(session: LiveViewSession): void {
    const entry: StoredLiveViewSession = {
      session,
      storedAt: Date.now(),
      expiresAt: new Date(session.expiresAt).getTime(),
    };

    const current = this._storedSessions();
    // De-duplicate by sessionId so the same session always has a single slot.
    const withoutDuplicate = current.filter((e) => e.session.sessionId !== session.sessionId);
    const updated = [entry, ...withoutDuplicate];

    // Enforce max sessions limit
    if (updated.length > MAX_STORED_SESSIONS) {
      updated.pop(); // Remove oldest
    }

    this._storedSessions.set(updated);
    this.saveToStorage(updated);
  }

  /**
   * Get a stored session by session ID (for reconnection).
   */
  getSessionById(sessionId: string): LiveViewSession | null {
    const now = Date.now();
    const match = this._storedSessions().find((entry) => entry.session.sessionId === sessionId);
    if (!match) return null;
    return match.expiresAt > now ? match.session : null;
  }

  /**
   * Remove a stored session (e.g. after user explicitly closes it).
   */
  removeSession(sessionId: string): void {
    const updated = this._storedSessions().filter((e) => e.session.sessionId !== sessionId);
    this._storedSessions.set(updated);
    this.saveToStorage(updated);
  }

  /**
   * Clear all stored sessions (e.g. on logout).
   */
  clearAll(): void {
    this._storedSessions.set([]);
    this.saveToStorage([]);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private loadFromStorage(): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as StoredLiveViewSession[];
      this._storedSessions.set(parsed);
    } catch {
      // Silently fail on parse error
    }
  }

  private saveToStorage(sessions: StoredLiveViewSession[]): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Silently fail if storage is full or blocked
    }
  }
}
