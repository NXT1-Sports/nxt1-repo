/** Shared local types for the Agent X operation chat surface. */

import type { AgentXSelectedAction } from '@nxt1/core/ai';

/** Shape of a suggested quick action chip shown inside the chat. */
export interface OperationQuickAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description?: string;
  readonly promptText?: string;
  readonly selectedAction?: AgentXSelectedAction;
}
