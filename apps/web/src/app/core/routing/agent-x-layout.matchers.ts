import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, TransferState } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { type CanMatchFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthFlowService } from '../services/auth/auth-flow.service';
import { AUTH_TRANSFER_STATE_KEY, type TransferredAuthState } from '../services/auth/ssr-tokens';

const EMPTY_TRANSFERRED_AUTH_STATE: TransferredAuthState = {
  user: null,
  firebaseUser: null,
};

function hasTransferredAuthUser(): boolean {
  return (
    inject(TransferState).get(AUTH_TRANSFER_STATE_KEY, EMPTY_TRANSFERRED_AUTH_STATE).user !== null
  );
}

function matchAgentXLayout(matchesAuthenticatedUser: boolean): ReturnType<CanMatchFn> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return hasTransferredAuthUser() === matchesAuthenticatedUser;
  }

  const authFlow = inject(AuthFlowService);

  if (authFlow.isAuthReady()) {
    return authFlow.isAuthenticated() === matchesAuthenticatedUser;
  }

  return toObservable(authFlow.isAuthReady).pipe(
    filter(Boolean),
    take(1),
    map(() => authFlow.isAuthenticated() === matchesAuthenticatedUser)
  );
}

export const matchLoggedOutAgentXLayout: CanMatchFn = () => matchAgentXLayout(false);
export const matchAuthenticatedAgentXLayout: CanMatchFn = () => matchAgentXLayout(true);
