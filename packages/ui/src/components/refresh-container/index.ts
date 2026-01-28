/**
 * Refresh container component barrel export
 * @module @nxt1/ui/components/refresh-container
 *
 * Provides two components for pull-to-refresh:
 * - NxtRefresherComponent: Standalone refresher (use inside your own ion-content)
 * - NxtRefreshContainerComponent: Full container with ion-content wrapper
 *
 * @example Basic usage with container
 * ```html
 * <nxt-refresh-container (onRefresh)="loadData($event)">
 *   <ion-list>...</ion-list>
 * </nxt-refresh-container>
 * ```
 *
 * @example Standalone refresher in existing ion-content
 * ```html
 * <ion-content>
 *   <nxt-refresher (onRefresh)="loadData($event)" />
 *   <!-- content -->
 * </ion-content>
 * ```
 */

// Components
export { NxtRefresherComponent, NxtRefreshContainerComponent } from './refresh-container.component';

// Types
export {
  type RefreshEvent,
  type RefreshPullEvent,
  type RefresherSpinner,
  type RefreshContainerConfig,
  DEFAULT_REFRESH_CONFIG,
} from './refresh-container.component';
