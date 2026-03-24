/**
 * @fileoverview Profile Metrics Tab Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Displays combine results and measurables with stat cards.
 */
import { Component, ChangeDetectionStrategy, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-metrics-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section madden-metrics" aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" class="sr-only">Measurable Metrics</h2>

      @if (profile.metrics().length === 0) {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="barbell-outline" [size]="40" />
          </div>
          <h3>No metrics recorded</h3>
          <p>
            @if (profile.isOwnProfile()) {
              Add your combine results and measurables to complete your profile.
            } @else {
              This athlete hasn't recorded any metrics yet.
            }
          </p>
          @if (profile.isOwnProfile()) {
            <button type="button" class="madden-cta-btn" (click)="onAddStats()">Add Metrics</button>
          }
        </div>
      } @else {
        @if (activeMetricCategory(); as cat) {
          <div class="madden-stat-group">
            <h3 class="ov-section-title">{{ cat.name }}</h3>
            @if (cat.measuredAt || cat.source) {
              <p class="madden-stat-group-meta">
                @if (cat.measuredAt) {
                  <time [attr.datetime]="cat.measuredAt"
                    >Measured {{ cat.measuredAt | date: 'MMM d, yyyy' }}</time
                  >
                }
                @if (cat.measuredAt && cat.source) {
                  <span aria-hidden="true"> · </span>
                }
                @if (cat.source) {
                  <span>{{ cat.source }}</span>
                }
              </p>
            }
            <div class="madden-stat-grid">
              @for (stat of cat.stats; track stat.label) {
                <div class="madden-stat-card">
                  <span class="madden-stat-value"
                    >{{ stat.value }}{{ stat.unit ? ' ' + stat.unit : '' }}</span
                  >
                  <span class="madden-stat-label">{{ stat.label }}</span>
                  @if (stat.verified) {
                    <span class="madden-stat-verified" aria-label="Verified">✓</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      .madden-stat-group {
        margin-bottom: 24px;
      }
      .madden-stat-group-meta {
        font-size: 13px;
        color: var(--m-text-3, #888);
        margin: -6px 0 14px;
        line-height: 1.4;
      }
      .madden-stat-group-meta time {
        font-weight: 500;
      }
      .madden-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 160px));
        gap: 10px;
      }
      .madden-stat-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-stat-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text);
      }
      .madden-stat-label {
        font-size: 12px;
        color: var(--m-text-2);
      }
      .madden-stat-verified {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
      }

      .ov-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class ProfileMetricsWebComponent {
  protected readonly profile = inject(ProfileService);

  /** Active side tab from parent, used for filtering metric categories */
  readonly activeSideTab = input<string>('');

  protected readonly activeMetricCategory = computed(() => {
    const cats = this.profile.metrics();
    if (cats.length === 0) return null;

    const sideTab = this.activeSideTab();
    if (!sideTab) return cats[0] ?? null;

    const matched = cats.find(
      (category) => category.name.toLowerCase().replace(/\s+/g, '-') === sideTab
    );
    return matched ?? cats[0] ?? null;
  });

  protected onAddStats(): void {
    // No-op — parent handles
  }
}
