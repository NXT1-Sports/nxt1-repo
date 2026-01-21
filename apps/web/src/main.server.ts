/**
 * @fileoverview Server Entry Point for Angular Universal SSR
 * @module @nxt1/web/server
 *
 * Bootstrap function for server-side rendering.
 * Uses server-specific configuration without Ionic/Firebase.
 *
 * Angular 21 SSR Pattern:
 * The bootstrap function receives a BootstrapContext from CommonEngine
 * which contains a pre-created platformRef. This context MUST be passed
 * to bootstrapApplication to avoid NG0401 errors.
 */
import { ApplicationRef } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

/**
 * Bootstrap the Angular application for SSR
 *
 * @param context - BootstrapContext provided by CommonEngine containing platformRef
 * @returns Promise<ApplicationRef> - The bootstrapped application reference
 */
const bootstrap = (context: BootstrapContext): Promise<ApplicationRef> => {
  return bootstrapApplication(AppComponent, config, context);
};

export default bootstrap;
