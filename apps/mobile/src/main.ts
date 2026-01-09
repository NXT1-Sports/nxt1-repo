/**
 * @fileoverview Mobile App Entry Point
 * @module @nxt1/mobile
 *
 * Bootstrap the Angular application for mobile.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
