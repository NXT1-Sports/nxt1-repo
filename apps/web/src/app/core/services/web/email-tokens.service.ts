/**
 * @fileoverview Email Tokens Service - Web
 * @module @nxt1/web/core/services/web
 *
 * Client-side service that subscribes to the user's `emailTokens` subcollection
 * in Firestore to determine which email providers are already connected.
 *
 * Architecture:
 * - Reads `Users/{uid}/emailTokens/{provider}` collection in real-time
 * - Document IDs are the provider names: 'gmail', 'microsoft', 'yahoo'
 * - Uses onSnapshot for live updates immediately after a provider connects
 * - Cleans up listeners on auth sign-out to prevent permission errors
 *
 * Security:
 * - Firestore rules restrict access to `isOwner(userId)` — owner reads only
 * - Writes remain blocked on the client (only Cloud Functions / Admin SDK)
 */

import { Injectable, inject, signal, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import type { ConnectedEmail } from '@nxt1/core';

@Injectable({ providedIn: 'root' })
export class EmailTokensService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(Auth, { optional: true });

  private firestoreUnsub?: Unsubscribe;
  private authUnsub?: () => void;

  /** Connected email provider objects derived from emailTokens subcollection */
  readonly connectedEmails = signal<readonly ConnectedEmail[]>([]);

  constructor() {
    if (isPlatformBrowser(this.platformId) && this.auth) {
      this.watchAuthState();
    }
  }

  private watchAuthState(): void {
    this.authUnsub = onAuthStateChanged(this.auth!, (user) => {
      this.cleanupFirestore();
      if (user) {
        this.subscribeToEmailTokens(user.uid);
      } else {
        this.connectedEmails.set([]);
      }
    });
  }

  private subscribeToEmailTokens(uid: string): void {
    try {
      const db = getFirestore(getApp());
      const tokensRef = collection(db, 'Users', uid, 'emailTokens');

      this.firestoreUnsub = onSnapshot(
        tokensRef,
        (snapshot) => {
          const emails: ConnectedEmail[] = snapshot.docs
            .filter((d) => d.exists())
            .map((d) => {
              const data = d.data();
              return {
                provider: d.id as ConnectedEmail['provider'],
                email: (data['email'] as string) || '',
                isActive: true,
                connectedAt: (data['lastRefreshedAt'] as string) || new Date().toISOString(),
              } satisfies ConnectedEmail;
            });

          this.connectedEmails.set(emails);
        },
        (_error) => {
          // Permission denied or offline — treat as no connections
          this.connectedEmails.set([]);
        }
      );
    } catch {
      this.connectedEmails.set([]);
    }
  }

  private cleanupFirestore(): void {
    this.firestoreUnsub?.();
    this.firestoreUnsub = undefined;
  }

  ngOnDestroy(): void {
    this.cleanupFirestore();
    this.authUnsub?.();
  }
}
