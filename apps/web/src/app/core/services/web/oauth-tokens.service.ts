/**
 * @fileoverview OAuth Tokens Service - Web
 * @module @nxt1/web/core/services/web
 *
 * Client-side service that subscribes to the user's OAuth token subcollections
 * in Firestore to determine which email providers are already connected.
 *
 * Architecture:
 * - Reads `Users/{uid}/oauthTokens/{provider}` in real-time
 * - Falls back to legacy `Users/{uid}/emailTokens/{provider}` during migration
 * - Maps token doc ids to UI/email providers (for example `google` → `gmail`)
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
import {
  OAUTH_TOKEN_SUBCOLLECTION,
  LEGACY_EMAIL_TOKEN_SUBCOLLECTION,
  GOOGLE_OAUTH_TOKEN_DOC_ID,
} from '@nxt1/core/auth';

@Injectable({ providedIn: 'root' })
export class OAuthTokensService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(Auth, { optional: true });

  private firestoreUnsubs: Unsubscribe[] = [];
  private authUnsub?: () => void;
  private oauthTokenEmails: ConnectedEmail[] = [];
  private legacyTokenEmails: ConnectedEmail[] = [];

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
        this.subscribeToTokenCollections(user.uid);
      } else {
        this.connectedEmails.set([]);
      }
    });
  }

  private subscribeToTokenCollections(uid: string): void {
    try {
      const db = getFirestore(getApp());

      this.subscribeToTokenCollection(db, uid, OAUTH_TOKEN_SUBCOLLECTION, (emails) => {
        this.oauthTokenEmails = emails;
        this.publishConnectedEmails();
      });

      this.subscribeToTokenCollection(db, uid, LEGACY_EMAIL_TOKEN_SUBCOLLECTION, (emails) => {
        this.legacyTokenEmails = emails;
        this.publishConnectedEmails();
      });
    } catch {
      this.connectedEmails.set([]);
    }
  }

  private subscribeToTokenCollection(
    db: ReturnType<typeof getFirestore>,
    uid: string,
    collectionName: string,
    onUpdate: (emails: ConnectedEmail[]) => void
  ): void {
    const tokensRef = collection(db, 'Users', uid, collectionName);

    const unsubscribe = onSnapshot(
      tokensRef,
      (snapshot) => {
        const emails: ConnectedEmail[] = snapshot.docs
          .filter((doc) => doc.exists())
          .map((doc) => {
            const data = doc.data();

            return {
              provider: this.mapProviderDocId(doc.id),
              email: (data['email'] as string) || '',
              isActive: true,
              connectedAt: (data['lastRefreshedAt'] as string) || new Date().toISOString(),
            } satisfies ConnectedEmail;
          });

        onUpdate(emails);
      },
      () => {
        onUpdate([]);
        this.publishConnectedEmails();
      }
    );

    this.firestoreUnsubs.push(unsubscribe);
  }

  private mapProviderDocId(docId: string): ConnectedEmail['provider'] {
    return docId === GOOGLE_OAUTH_TOKEN_DOC_ID ? 'gmail' : (docId as ConnectedEmail['provider']);
  }

  private publishConnectedEmails(): void {
    const merged = new Map<string, ConnectedEmail>();

    for (const email of this.legacyTokenEmails) {
      merged.set(email.provider, email);
    }

    for (const email of this.oauthTokenEmails) {
      merged.set(email.provider, email);
    }

    this.connectedEmails.set(Array.from(merged.values()));
  }

  private cleanupFirestore(): void {
    for (const unsubscribe of this.firestoreUnsubs) {
      unsubscribe();
    }

    this.firestoreUnsubs = [];
    this.oauthTokenEmails = [];
    this.legacyTokenEmails = [];
  }

  ngOnDestroy(): void {
    this.cleanupFirestore();
    this.authUnsub?.();
  }
}
