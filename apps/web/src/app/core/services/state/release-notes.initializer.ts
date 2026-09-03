/**
 * @fileoverview Release Notes Initializer — Fires What's New modal on first auth
 * @module @nxt1/web/core/services/state
 *
 * Mirrors the badge-bridge pattern: an ENVIRONMENT_INITIALIZER that reacts
 * to auth state, fetches the latest release note, and shows the modal when
 * the user hasn't seen it yet.
 */

import {
  inject,
  effect,
  makeEnvironmentProviders,
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
} from '@angular/core';
import { RELEASE_NOTES_PROMPT_ENABLED } from '@nxt1/core/release-notes';
import { ReleaseNotesModalService } from '@nxt1/ui/release-notes';
import { ReleaseNotesApiService } from '../api/release-notes-api.service';
import { AuthFlowService } from '../auth/auth-flow.service';

let prompted = false; // session-level guard — only prompt once per page load

export function provideReleaseNotesCheck(): EnvironmentProviders {
  if (!RELEASE_NOTES_PROMPT_ENABLED) {
    return makeEnvironmentProviders([]);
  }

  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const modalService = inject(ReleaseNotesModalService);
        const api = inject(ReleaseNotesApiService);
        const authFlow = inject(AuthFlowService);

        effect(() => {
          const authReady = authFlow.isAuthReady();
          const authenticated = authFlow.isAuthenticated();
          const user = authFlow.user();

          if (!authReady || !authenticated || !user || prompted) return;
          prompted = true;

          const lastSeenVersion = (user as unknown as Record<string, unknown>)['preferences']
            ? ((
                (user as unknown as Record<string, unknown>)['preferences'] as Record<
                  string,
                  unknown
                >
              )['lastSeenReleaseVersion'] as string | undefined)
            : undefined;

          void modalService.checkAndPrompt(
            () => api.getLatest(),
            lastSeenVersion ?? null,
            (version) => api.markSeen(version)
          );
        });
      },
    },
  ]);
}
