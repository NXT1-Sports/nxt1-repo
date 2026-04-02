/**
 * @fileoverview Barrel export for @nxt1/ui usage feature.
 * @module @nxt1/ui/usage
 */

// Shell Components
/** Mobile shell (Ionic) — For web SSR, use UsageShellWebComponent instead */
export { UsageShellComponent, type UsageUser } from './usage-shell.component';

// Web-optimized shell (semantic HTML, design tokens, Grade A+ SEO)
export { UsageShellWebComponent } from './web/usage-shell-web.component';

// Landing Page (public marketing)
export { NxtUsageLandingComponent } from './usage-landing.component';
export { NxtUsageDashboardPreviewComponent } from './usage-dashboard-preview.component';

// Skeleton
export { UsageSkeletonComponent } from './usage-skeleton.component';
export { UsageErrorStateComponent } from './usage-error-state.component';

// Help Content
export { UsageHelpContentComponent } from './usage-help-content.component';

// Service
export { UsageService, USAGE_SECTION_NAVS } from './usage.service';
export type { UsageSection, UsageSectionNav } from './usage.service';

// API Service
export { UsageApiService, USAGE_API_BASE_URL } from './usage-api.service';

// Bottom Sheet
export { UsageBottomSheetService } from './usage-bottom-sheet.service';
export type { UsageBottomSheetResult } from './usage-bottom-sheet.service';

// Section Components
export {
  UsageOverviewComponent,
  UsageSubscriptionsComponent,
  UsageChartComponent,
  UsageBreakdownTableComponent,
  UsagePaymentHistoryComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
} from './sections';

// Stripe
export { STRIPE_PUBLISHABLE_KEY } from './stripe-config';
export { AddPaymentMethodComponent } from './add-payment-method.component';
