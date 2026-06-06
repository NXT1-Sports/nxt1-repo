import { makeEnvironmentProviders, NgZone } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { TEAM_PROFILE_API_BASE_URL } from '@nxt1/ui/team-profile/tokens';
import { INTEL_API_BASE_URL } from '@nxt1/ui/intel/tokens';
import { MANAGE_TEAM_API_BASE_URL, TEAM_LOGO_UPLOADER } from '@nxt1/ui/manage-team/tokens';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  FIRESTORE_ADAPTER,
} from '@nxt1/ui/agent-x/tokens';
import {
  CONNECTED_ACCOUNTS_FIREBASE_USER,
  CONNECTED_ACCOUNTS_OAUTH_HANDLER,
} from '@nxt1/ui/components/connected-sources/tokens';
import {
  ACTIVITY_API_BASE_URL,
  ACTIVITY_API_ADAPTER,
  ACTIVITY_FIREBASE_CONTEXT,
} from '@nxt1/ui/activity/tokens';
import { INVITE_API_BASE_URL } from '@nxt1/ui/invite/tokens';
import { USAGE_API_BASE_URL, STRIPE_PUBLISHABLE_KEY } from '@nxt1/ui/usage/tokens';
import { BROWSER_TRACKING_BASE_URL } from '@nxt1/ui/services/browser';
import { HELP_CENTER_API } from '@nxt1/ui/help-center/tokens';
import { FEED_ENGAGEMENT } from '@nxt1/ui/feed/tokens';
import { SETTINGS_PERSISTENCE_ADAPTER, APP_VERSION } from '@nxt1/ui/settings/tokens';
import { AUTH_SERVICE, type IAuthService } from '../services/auth/auth.interface';
import { AuthFlowService } from '../services/auth/auth-flow.service';
import { FileUploadService } from '../services/web/file-upload.service';
import { WebEmailConnectionService } from '../services/web/email-connection.service';
import { provideBadgeBridge } from '../services/state/badge-bridge.initializer';
import { provideWebPush } from '../services/web/web-push.service';
import { HelpCenterApiService } from '../services/api/help-center-api.service';
import { FeedEngagementWebService } from '../services/web/feed-engagement.service';
import { ActivityApiService as WebActivityApiService } from '../services/api/activity-api.service';
import { SettingsApiService } from '../services/api/settings-api.service';
import { environment } from '../../../environments/environment';

function normalizeFirestoreSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFirestoreSnapshotValue(entry));
  }

  if (value && typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeFirestoreSnapshotValue(entry),
      ])
    );
  }

  return value;
}

function normalizeFirestoreSnapshotDoc(id: string, value: unknown): Record<string, unknown> {
  const data = normalizeFirestoreSnapshotValue(value) as Record<string, unknown>;
  return {
    ...data,
    id: typeof data['id'] === 'string' ? data['id'] : id,
    __id: id,
  };
}

function isSupportedFirestoreCollectionPath(path: string): boolean {
  return /^(AgentJobs\/[^/]+\/events|Users\/[^/]+\/activity)$/.test(path);
}

function isSupportedFirestoreDocumentPath(path: string): boolean {
  return /^AgentJobs\/[^/]+$/.test(path);
}

let firestoreRuntimePromise: Promise<
  typeof import('firebase/app') & typeof import('firebase/firestore')
> | null = null;

function loadFirestoreRuntime() {
  if (!firestoreRuntimePromise) {
    firestoreRuntimePromise = Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
    ]).then(([firebaseApp, firestore]) => ({
      ...firebaseApp,
      ...firestore,
    }));
  }

  return firestoreRuntimePromise;
}

export function provideWebShellProviders() {
  return makeEnvironmentProviders([
    {
      provide: FIRESTORE_ADAPTER,
      useFactory: (ngZone: NgZone) => ({
        onSnapshot: (
          path: string,
          orderByField: string,
          onNext: (docs: ReadonlyArray<Record<string, unknown>>) => void,
          onError: (error: Error) => void,
          options?: { readonly direction?: 'asc' | 'desc'; readonly limit?: number }
        ) => {
          if (!isSupportedFirestoreCollectionPath(path)) {
            throw new Error(`Unsupported Firestore subscription path: ${path}`);
          }

          let unsubscribe = () => {
            // intentionally empty
          };
          let disposed = false;

          void loadFirestoreRuntime()
            .then(({ getApp, getFirestore, collection, query, orderBy, limit, onSnapshot }) => {
              const firestore = getFirestore(getApp());
              const ref = collection(firestore, path);
              const boundedLimit =
                options?.limit === undefined
                  ? null
                  : Math.max(1, Math.min(100, Math.floor(options.limit)));
              const snapshotQuery =
                boundedLimit !== null
                  ? query(
                      ref,
                      orderBy(orderByField, options?.direction ?? 'asc'),
                      limit(boundedLimit)
                    )
                  : query(ref, orderBy(orderByField, options?.direction ?? 'asc'));
              const release = onSnapshot(
                snapshotQuery,
                (snap) => {
                  const docs = snap.docs.map((doc) =>
                    normalizeFirestoreSnapshotDoc(doc.id, doc.data())
                  );
                  ngZone.run(() => onNext(docs));
                },
                (error) => {
                  ngZone.run(() => onError(error));
                }
              );

              if (disposed) {
                release();
                return;
              }

              unsubscribe = release;
            })
            .catch((error: unknown) => {
              const firestoreError =
                error instanceof Error ? error : new Error('Failed to load Firestore runtime');
              ngZone.run(() => onError(firestoreError));
            });

          return () => {
            disposed = true;
            unsubscribe();
          };
        },
        getDocs: async (
          path: string,
          orderByField: string,
          options?: { readonly direction?: 'asc' | 'desc'; readonly limit?: number }
        ): Promise<ReadonlyArray<Record<string, unknown>>> => {
          if (!isSupportedFirestoreCollectionPath(path)) {
            throw new Error(`Unsupported Firestore query path: ${path}`);
          }

          const { getApp, getFirestore, collection, query, orderBy, limit, getDocs } =
            await loadFirestoreRuntime();
          const firestore = getFirestore(getApp());
          const ref = collection(firestore, path);
          const boundedLimit =
            options?.limit === undefined
              ? null
              : Math.max(1, Math.min(100, Math.floor(options.limit)));
          const snapshotQuery =
            boundedLimit !== null
              ? query(ref, orderBy(orderByField, options?.direction ?? 'asc'), limit(boundedLimit))
              : query(ref, orderBy(orderByField, options?.direction ?? 'asc'));
          const snap = await getDocs(snapshotQuery);
          return snap.docs.map((doc) => normalizeFirestoreSnapshotDoc(doc.id, doc.data()));
        },
        getDoc: async (path: string): Promise<Record<string, unknown> | null> => {
          if (!isSupportedFirestoreDocumentPath(path)) {
            throw new Error(`Unsupported Firestore document path: ${path}`);
          }

          const { getApp, getFirestore, doc, getDoc } = await loadFirestoreRuntime();
          const firestore = getFirestore(getApp());
          const snap = await getDoc(doc(firestore, path));
          return snap.exists() ? normalizeFirestoreSnapshotDoc(snap.id, snap.data()) : null;
        },
      }),
      deps: [NgZone],
    },

    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: INTEL_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: MANAGE_TEAM_API_BASE_URL, useFactory: () => environment.apiURL },
    {
      provide: TEAM_LOGO_UPLOADER,
      useFactory:
        (upload: FileUploadService, auth: IAuthService) => (teamId: string, file: File) => {
          const userId = auth.user?.()?.uid;
          if (!userId) return Promise.resolve(null);
          return upload.uploadTeamLogo(userId, teamId, file);
        },
      deps: [FileUploadService, AUTH_SERVICE],
    },
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: BROWSER_TRACKING_BASE_URL, useFactory: () => environment.apiURL },
    {
      provide: AGENT_X_AUTH_TOKEN_FACTORY,
      useFactory: (authFlow: AuthFlowService) => () => authFlow.getIdToken(),
      deps: [AuthFlowService],
    },
    {
      provide: CONNECTED_ACCOUNTS_FIREBASE_USER,
      useFactory: (auth: IAuthService) => () => {
        const fbUser = auth.firebaseUser();
        if (!fbUser) return [];
        return fbUser.providerData.map((p) => ({
          providerId: p.providerId,
          email: p.email ?? null,
          displayName: p.displayName,
        }));
      },
      deps: [AUTH_SERVICE],
    },
    {
      provide: CONNECTED_ACCOUNTS_OAUTH_HANDLER,
      useFactory:
        (emailSvc: WebEmailConnectionService, auth: IAuthService) =>
        (platform: 'google' | 'microsoft') => {
          const userId = auth.user?.()?.uid;
          if (!userId) return Promise.resolve({ success: false });
          return emailSvc.connectForLinkedAccounts(platform, userId);
        },
      deps: [WebEmailConnectionService, AUTH_SERVICE],
    },
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: ACTIVITY_API_ADAPTER, useExisting: WebActivityApiService },
    {
      provide: ACTIVITY_FIREBASE_CONTEXT,
      useFactory: (auth: Auth) => ({
        getCurrentUserId: () => auth.currentUser?.uid ?? null,
        getProjectId: () => auth.app.options.projectId ?? null,
        isAuthReady: () => auth.currentUser !== null,
      }),
      deps: [Auth],
    },
    provideBadgeBridge(),
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiURL },
    { provide: STRIPE_PUBLISHABLE_KEY, useFactory: () => environment.stripePublishableKey },
    { provide: HELP_CENTER_API, useExisting: HelpCenterApiService },
    { provide: FEED_ENGAGEMENT, useExisting: FeedEngagementWebService },
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },
    { provide: APP_VERSION, useFactory: () => environment.appVersion },
    provideWebPush(),
  ]);
}
