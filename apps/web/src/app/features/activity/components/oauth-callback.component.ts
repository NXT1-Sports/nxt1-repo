/**
 * @fileoverview OAuth Callback Component
 * @module @nxt1/web/features/activity
 *
 * Simple callback page for OAuth redirects (Microsoft, Yahoo).
 * Shows loading state while parent window polls the URL and extracts code.
 * This page should never be seen by users as the popup closes immediately.
 */

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeoService } from '../../../core/services/seo.service';

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
export class OAuthCallbackComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'OAuth Callback',
      description: 'Authentication callback for account connection.',
      noIndex: true,
      noFollow: true,
    });

    const params = new URLSearchParams(window.location.search);

    // Backend-redirect success/error flow (/oauth/success?provider=...&success=true/false)
    if (params.has('success')) {
      const provider = params.get('provider') ?? 'google';
      const success = params.get('success') === 'true';
      const message = params.get('message') ?? undefined;

      // BroadcastChannel works regardless of COOP (unlike window.opener.postMessage)
      try {
        const channel = new BroadcastChannel('oauth-connect');
        channel.postMessage({ type: 'oauth-connected', provider, success, message });
        channel.close();
      } catch {
        // Fallback: try postMessage if BroadcastChannel not supported
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-connected', provider, success }, '*');
        }
      }

      if (success) {
        setTimeout(() => window.close(), 500);
      }
      return;
    }

    // Authorization code flow (/google/callback, /microsoft/callback, /yahoo/callback)
    // Used by Yahoo and any frontend-redirect flow
    if (window.opener) {
      const code = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const state = params.get('state');

      window.opener.postMessage(
        { type: 'oauth-callback', code, error, errorDescription, state },
        window.location.origin
      );
    }
  }
}
