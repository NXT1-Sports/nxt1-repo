import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, TransferState } from '@angular/core';
import { type CanMatchFn } from '@angular/router';
import { STORAGE_KEYS } from '@nxt1/core';
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

function matchAgentXLayout(matchesAuthenticatedUser: boolean): ReturnType<CanMatchFn> {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return hasTransferredAuthUser() === matchesAuthenticatedUser;
  }

  return hasStoredBrowserAuthSnapshot() === matchesAuthenticatedUser;
}

export const matchLoggedOutAgentXLayout: CanMatchFn = () => matchAgentXLayout(false);
export const matchAuthenticatedAgentXLayout: CanMatchFn = () => matchAgentXLayout(true);
