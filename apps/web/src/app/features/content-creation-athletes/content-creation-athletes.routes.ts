import { Routes } from '@angular/router';

export const CONTENT_CREATION_ATHLETES_ROUTES: Routes = [
  {
    path: '',
    title: 'Content Creation | NXT1',
    loadComponent: () =>
      import('./content-creation-athletes.component').then(
        (m) => m.ContentCreationAthletesComponent
      ),
  },
];

export default CONTENT_CREATION_ATHLETES_ROUTES;
