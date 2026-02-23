import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NxtColorPickerComponent } from '../color-picker';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';
import { NxtTeamLogoPickerComponent } from '../team-logo-picker';

let brandKitIntegrationInstanceCounter = 0;

@Component({
  selector: 'nxt1-brand-kit-integration-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent, NxtColorPickerComponent, NxtTeamLogoPickerComponent],
  template: `
    <section class="brand-kit-section" [attr.aria-labelledby]="titleId()">
      <div class="brand-kit-shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Brand Kit Integration"
          title="Your Personal Brand Identity."
          [headingLevel]="headingLevel()"
          variant="hero"
          align="center"
          subtitle="Set your colors and logo once, then generate graphics that stay true to your identity on every post."
        />

        <div class="brand-kit-input-grid">
          <section class="brand-kit-input-panel" [attr.aria-labelledby]="colorsTitleId()">
            <h4 class="brand-kit-input-panel__title" [id]="colorsTitleId()">Choose colors</h4>
            <p class="brand-kit-input-panel__text">
              Select your core palette so every generated design reflects your personal identity.
            </p>
            <nxt1-color-picker
              [colors]="selectedColors()"
              [maxColors]="4"
              label="Brand Colors"
              placeholder="Add up to 4 colors"
              testId="brand-kit-colors"
              (colorsChange)="onColorsChange($event)"
            />
          </section>

          <section class="brand-kit-input-panel" [attr.aria-labelledby]="logoTitleId()">
            <h4 class="brand-kit-input-panel__title" [id]="logoTitleId()">Choose logo</h4>
            <p class="brand-kit-input-panel__text">
              Upload your logo once and apply it automatically to all future post templates.
            </p>
            <div class="brand-kit-logo-picker-row">
              <nxt1-team-logo-picker
                [logoUrl]="selectedLogoUrl()"
                size="lg"
                testId="brand-kit-logo"
                (logoChange)="onLogoChange($event)"
              />
              <p class="brand-kit-logo-picker-row__hint">PNG, JPG, WebP, or GIF up to 5MB.</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .brand-kit-section {
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .brand-kit-shell {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      .brand-kit-input-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nxt1-spacing-4);
      }

      .brand-kit-input-panel {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
      }

      .brand-kit-input-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .brand-kit-input-panel__text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .brand-kit-logo-picker-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .brand-kit-logo-picker-row__hint {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      @media (min-width: 1024px) {
        .brand-kit-input-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtBrandKitIntegrationSectionComponent {
  private readonly instanceId = ++brandKitIntegrationInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);

  readonly selectedColors = signal<string[]>([]);
  readonly selectedLogoUrl = signal<string | null>(null);

  readonly titleId = computed(() => `brand-kit-integration-title-${this.instanceId}`);
  readonly colorsTitleId = computed(() => `brand-kit-integration-colors-title-${this.instanceId}`);
  readonly logoTitleId = computed(() => `brand-kit-integration-logo-title-${this.instanceId}`);

  onColorsChange(colors: string[]): void {
    this.selectedColors.set(colors);
  }

  onLogoChange(logoUrl: string | null): void {
    this.selectedLogoUrl.set(logoUrl);
  }
}
