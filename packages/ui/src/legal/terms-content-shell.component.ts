import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TERMS_CONTENT } from '@nxt1/core';

@Component({
  selector: 'nxt1-terms-content-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="legal-content">
      <p class="last-updated">Last updated: {{ content.lastUpdated }}</p>
      <p class="intro">{{ content.intro }}</p>

      @for (section of content.sections; track section.id) {
        <section class="section">
          <h2 class="section-title">{{ section.title }}</h2>

          @for (p of section.paragraphs ?? []; track $index) {
            <p class="section-text">{{ p }}</p>
          }

          @if (section.items && section.items.length > 0) {
            <ul class="item-list">
              @for (item of section.items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          }
        </section>
      }

      <section class="section contact-section">
        <p class="section-text">
          Questions? Contact us at
          <a [href]="'mailto:' + content.contactEmail" class="email-link">
            {{ content.contactEmail }}
          </a>
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      .legal-content {
        max-width: 800px;
        margin: 0 auto;
        padding: 1.5rem;
        width: 100%;
      }
      .last-updated {
        font-size: 0.875rem;
        color: var(--nxt1-color-text-tertiary, #999);
        margin-bottom: 1.5rem;
      }
      .intro {
        font-size: 1rem;
        line-height: 1.7;
        color: var(--nxt1-color-text-secondary, #555);
        margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--nxt1-color-border, #e5e5e5);
      }
      .section {
        margin-bottom: 2rem;
      }
      .section-title {
        font-size: 1.125rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
        color: var(--nxt1-color-text-primary, #1a1a1a);
      }
      .section-text {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--nxt1-color-text-secondary, #555);
        margin-bottom: 0.75rem;
      }
      .item-list {
        list-style: disc;
        padding-left: 1.5rem;
        margin-top: 0.5rem;
      }
      .item-list li {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--nxt1-color-text-secondary, #555);
        margin-bottom: 0.4rem;
      }
      .contact-section {
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--nxt1-color-border, #e5e5e5);
      }
      .email-link {
        color: var(--nxt1-color-primary, #007aff);
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsContentShellComponent {
  protected readonly content = TERMS_CONTENT;
}
