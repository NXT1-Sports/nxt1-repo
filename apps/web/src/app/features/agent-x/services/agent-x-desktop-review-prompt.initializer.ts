import {
  ENVIRONMENT_INITIALIZER,
  effect,
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { AuthFlowService } from '../../../core/services/auth/auth-flow.service';
import { AgentXDesktopReviewPromptService } from './agent-x-desktop-review-prompt.service';

let prompted = false;

export function provideAgentXDesktopReviewPrompt(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const authFlow = inject(AuthFlowService);
        const promptService = inject(AgentXDesktopReviewPromptService);

        effect(() => {
          const authReady = authFlow.isAuthReady();
          const authenticated = authFlow.isAuthenticated();
          const user = authFlow.user();

          if (!authReady || !authenticated || !user || prompted) {
            return;
          }

          prompted = true;
          void promptService.maybePrompt(user);
        });
      },
    },
  ]);
}
