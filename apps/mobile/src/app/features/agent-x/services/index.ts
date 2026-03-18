/**
 * @fileoverview Agent X Services Barrel Export
 * @module @nxt1/mobile/features/agent-x/services
 * @version 2.0.0
 *
 * Re-exports the shared AgentXService from @nxt1/ui so all mobile consumers
 * (push-handler, activity, agent-x shell) resolve to the SAME providedIn:'root'
 * singleton. Using the local stub caused two separate DI instances, breaking
 * cross-surface coordination (queuePendingThread → shell effect).
 */

export { AgentXService } from '@nxt1/ui';
