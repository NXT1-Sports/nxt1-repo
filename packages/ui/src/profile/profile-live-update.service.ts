import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type { ProfileLiveUpdateMutation } from './profile-live-update.helpers';

@Injectable({ providedIn: 'root' })
export class ProfileLiveUpdateService {
  private readonly updatesSubject = new Subject<ProfileLiveUpdateMutation>();

  readonly updates$ = this.updatesSubject.asObservable();

  emit(update: ProfileLiveUpdateMutation): void {
    this.updatesSubject.next(update);
  }
}
