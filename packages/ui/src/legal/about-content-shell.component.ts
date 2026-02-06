/**
 * @fileoverview About Content Shell Component
 * @module @nxt1/ui/legal
 * @version 1.0.0
 *
 * Shared About page content component.
 * Platform-agnostic, reusable across web and mobile.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-about-content-shell />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ABOUT_CONTENT } from '@nxt1/core';

@Component({
  selector: 'nxt1-about-content-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="about-content">
      <!-- Mission -->
      <section class="section">
        <h2 class="section-title">{{ content.mission.title }}</h2>
        <p class="section-text">{{ content.mission.content }}</p>
      </section>

      <!-- What We Do -->
      <section class="section">
        <h2 class="section-title">{{ content.whatWeDo.title }}</h2>
        <ul class="feature-list">
          @for (item of content.whatWeDo.items; track $index) {
            <li>{{ item }}</li>
          }
        </ul>
      </section>

      <!-- Values -->
      <section class="section">
        <h2 class="section-title">{{ content.values.title }}</h2>
        <div class="values-grid">
          @for (value of content.values.cards; track value.title) {
            <div class="value-card">
              <h3 class="value-title">{{ value.title }}</h3>
              <p class="value-text">{{ value.description }}</p>
            </div>
          }
        </div>
      </section>

      <!-- Contact -->
      <section class="section">
        <h2 class="section-title">{{ content.contact.title }}</h2>
        <p class="section-text">
          Have questions or want to learn more? Contact us at
          <a [href]="'mailto:' + content.contact.email" class="email-link">
            {{ content.contact.email }}
          </a>
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      .about-content {
        width: 100%;
      }

      .section {
        margin-bottom: 2rem;
      }

      .section-title {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
        color: var(--nxt1-color-text-primary, #1a1a1a);
      }

      .section-text {
        font-size: 1rem;
        line-height: 1.6;
        margin-bottom: 1rem;
        color: var(--nxt1-color-text-secondary, #666);
      }

      .feature-list {
        list-style: disc;
        padding-left: 1.5rem;
        margin-bottom: 1.5rem;
      }

      .feature-list li {
        margin-bottom: 0.5rem;
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary, #666);
      }

      .values-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
      }

      .value-card {
        background: var(--nxt1-color-bg-secondary, #f5f5f5);
        border-radius: 12px;
        padding: 1.5rem;
      }

      .value-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--nxt1-color-text-primary, #1a1a1a);
      }

      .value-text {
        font-size: 0.95rem;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, #666);
        margin: 0;
      }

      .email-link {
        color: var(--nxt1-color-primary, #0066cc);
        text-decoration: none;
      }

      .email-link:hover {
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutContentShellComponent {
  protected readonly content = ABOUT_CONTENT;
}
