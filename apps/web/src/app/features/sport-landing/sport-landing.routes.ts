import { Routes } from '@angular/router';

/**
 * Sport-vertical landing routes.
 *
 * Uses a single :sport param so `/football` and `/basketball`
 * (and any future sport) all map to the same component. The
 * component resolves the config from @nxt1/core at runtime.
 */
export const SPORT_LANDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./sport-landing.component').then((m) => m.SportLandingComponent),
  },
];

export default SPORT_LANDING_ROUTES;
