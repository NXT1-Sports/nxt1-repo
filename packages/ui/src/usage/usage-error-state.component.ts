import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxtStateViewComponent } from '../components/state-view';

@Component({
  selector: 'nxt1-usage-error-state',
  standalone: true,
  imports: [NxtStateViewComponent],
  template: `
    <nxt1-state-view
      variant="error"
      title="Something went wrong"
      [message]="message()"
      actionLabel="Try Again"
      actionIcon="refresh"
      (action)="retry.emit()"
    />
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageErrorStateComponent {
  readonly message = input('Failed to load usage data');
  readonly retry = output<void>();
}
