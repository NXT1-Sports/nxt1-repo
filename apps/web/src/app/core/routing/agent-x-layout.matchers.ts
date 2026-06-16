import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, TransferState } from '@angular/core';
import { type CanMatchFn } from '@angular/router';
import { STORAGE_KEYS } from '@nxt1/core';
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

function hasStoredBrowserAuthSnapshot(): boolean {
  if (hasTransferredAuthUser()) {
    return true;
  }

  try {
    return [STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.AUTH_TOKEN].some((key) => {
      const value = localStorage.getItem(key);
      return typeof value === 'string' && value.length > 0;
    });
  } catch {
    return false;
  }
}

function getLiveBrowserAuthMatch(): boolean | null {
  try {
    const authFlow = inject(AuthFlowService);
    if (authFlow.isAuthenticated()) {
      return true;
    }

    if (authFlow.firebaseUser()?.uid || authFlow.user()?.uid) {
      return true;
    }

    if (authFlow.isAuthReady()) {
      return false;
    }
  } catch {
    // Fall through to storage heuristics when live auth is unavailable.
  }

  return null;
}

function matchAgentXLayout(matchesAuthenticatedUser: boolean): ReturnType<CanMatchFn> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return hasTransferredAuthUser() === matchesAuthenticatedUser;
  }

  const liveAuthMatch = getLiveBrowserAuthMatch();
  if (liveAuthMatch !== null) {
    return liveAuthMatch === matchesAuthenticatedUser;
  }

  return hasStoredBrowserAuthSnapshot() === matchesAuthenticatedUser;
}

export const matchLoggedOutAgentXLayout: CanMatchFn = () => matchAgentXLayout(false);
export const matchAuthenticatedAgentXLayout: CanMatchFn = () => matchAgentXLayout(true);
