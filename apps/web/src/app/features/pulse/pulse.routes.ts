/**
 * @fileoverview News Feature Routes - Web
 * @module @nxt1/web/features/pulse
 * @version 1.0.0
 *
 * Route configuration for the News feature.
 */

import { Routes } from '@angular/router';
import { NEWS_API_ADAPTER } from '@nxt1/ui/news';
import { PulseApiAdapterService } from '../../core/services/api/pulse-api-adapter.service';

export const PULSE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pulse.component').then((m) => m.PulseComponent),
    providers: [
      PulseApiAdapterService,
      { provide: NEWS_API_ADAPTER, useExisting: PulseApiAdapterService },
    ],
  },
  {
    path: ':id',
    loadComponent: () => import('./pulse-detail.component').then((m) => m.PulseDetailComponent),
    providers: [
      PulseApiAdapterService,
      { provide: NEWS_API_ADAPTER, useExisting: PulseApiAdapterService },
    ],
  },
];

export default PULSE_ROUTES;
