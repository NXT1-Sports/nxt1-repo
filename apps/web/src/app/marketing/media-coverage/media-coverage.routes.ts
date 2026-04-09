import { Routes } from '@angular/router';

export const MEDIA_COVERAGE_ROUTES: Routes = [
  {
    path: '',
    title: 'Media & Coverage | NXT1',
    loadComponent: () => import('./media-coverage.component').then((m) => m.MediaCoverageComponent),
  },
];

export default MEDIA_COVERAGE_ROUTES;
