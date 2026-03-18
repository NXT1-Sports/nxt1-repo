/**
 * @fileoverview OAuth Callback Component
 * @module @nxt1/web/features/activity
 *
 * Simple callback page for OAuth redirects (Microsoft, Yahoo).
 * Shows loading state while parent window polls the URL and extracts code.
 * This page should never be seen by users as the popup closes immediately.
 */

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="oauth-callback">
      <div class="spinner"></div>
      <p>Connecting...</p>
    </div>
  `,
  styles: [
    `
      .oauth-callback {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #ffffff;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        color: #333;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      p {
        font-size: 16px;
        margin: 0;
      }
    `,
  ],
})
export class OAuthCallbackComponent {}
