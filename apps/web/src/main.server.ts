/**
 * @fileoverview Server Entry Point for Angular Universal SSR
 * @module @nxt1/web/server
 *
 * Bootstrap function for server-side rendering.
 * Uses server-specific configuration without Ionic/Firebase.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

/**
 * Bootstrap the Angular application for SSR
 */
const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
