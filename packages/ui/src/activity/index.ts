/**
 * @fileoverview Activity Module - Barrel Export
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Exports all Activity/Notifications feature components and services.
 */

// Components
export { ActivityShellComponent, type ActivityUser } from './activity-shell.component';
export { ActivityListComponent } from './activity-list.component';
export { ActivityItemComponent } from './activity-item.component';
export { ActivitySkeletonComponent } from './activity-skeleton.component';

// Services
export { ActivityService } from './activity.service';
export { ActivityApiService, ACTIVITY_API_BASE_URL } from './activity-api.service';
