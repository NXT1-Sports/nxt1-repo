import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { type Signal, signal } from '@angular/core';
import {
  matchAuthenticatedAgentXLayout,
  matchLoggedOutAgentXLayout,
} from './agent-x-layout.matchers';
import { AuthFlowService } from '../services/auth/auth-flow.service';

interface AuthFlowStub {
  readonly user: Signal<{ uid: string } | null>;
  readonly firebaseUser: Signal<{ uid: string } | null>;
  readonly isAuthenticated: Signal<boolean>;
  readonly isAuthReady: Signal<boolean>;
}

function createAuthFlowStub(options?: {
  readonly userUid?: string | null;
  readonly firebaseUid?: string | null;
  readonly isAuthenticated?: boolean;
  readonly isAuthReady?: boolean;
}): AuthFlowStub {
  return {
    user: signal(options?.userUid ? { uid: options.userUid } : null),
    firebaseUser: signal(options?.firebaseUid ? { uid: options.firebaseUid } : null),
    isAuthenticated: signal(options?.isAuthenticated ?? false),
    isAuthReady: signal(options?.isAuthReady ?? false),
  };
}

function runAuthenticatedMatcher(): ReturnType<typeof matchAuthenticatedAgentXLayout> {
  return TestBed.runInInjectionContext(() =>
    matchAuthenticatedAgentXLayout({} as never, [], {} as never)
  );
}

function runLoggedOutMatcher(): ReturnType<typeof matchLoggedOutAgentXLayout> {
  return TestBed.runInInjectionContext(() =>
    matchLoggedOutAgentXLayout({} as never, [], {} as never)
  );
}

describe('agent-x-layout.matchers', () => {
  it('allows the authenticated Agent X layout when live auth says the user is signed in', () => {
    TestBed.configureTestingModule({
      providers: [
        TransferState,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthFlowService,
          useValue: createAuthFlowStub({
            userUid: 'user-1',
            isAuthenticated: true,
            isAuthReady: true,
          }),
        },
      ],
    });

    expect(runAuthenticatedMatcher()).toBe(true);
  });

  it('rejects the authenticated Agent X layout when live auth is definitively signed out', () => {
    TestBed.configureTestingModule({
      providers: [
        TransferState,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthFlowService,
          useValue: createAuthFlowStub({
            isAuthenticated: false,
            isAuthReady: true,
          }),
        },
      ],
    });

    expect(runAuthenticatedMatcher()).toBe(false);
    expect(runLoggedOutMatcher()).toBe(true);
  });

  it('falls back to browser storage heuristics while auth is still resolving', () => {
    const userProfileKey = 'nxt1_user_profile';
    localStorage.setItem(userProfileKey, '{"uid":"user-1"}');

    TestBed.configureTestingModule({
      providers: [
        TransferState,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthFlowService,
          useValue: createAuthFlowStub({
            isAuthenticated: false,
            isAuthReady: false,
          }),
        },
      ],
    });

    expect(runAuthenticatedMatcher()).toBe(true);
    localStorage.removeItem(userProfileKey);
  });
});
