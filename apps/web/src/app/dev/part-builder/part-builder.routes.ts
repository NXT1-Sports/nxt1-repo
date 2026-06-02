import { type Routes } from '@angular/router';

export const PART_BUILDER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./part-builder.component').then((m) => m.PartBuilderComponent),
  },
];

export default PART_BUILDER_ROUTES;
