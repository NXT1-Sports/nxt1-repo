import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedSource } from '@nxt1/core';
import { ConnectedAccountsWebModalComponent } from '@nxt1/ui/components/connected-sources';
import { ConnectedAccountsResyncService } from '@nxt1/ui/components/connected-sources/resync';
import { ConnectedAccountsComponent } from '../connected-accounts.component';
import {
  AUTH_SERVICE,
  type AppUser,
  type FirebaseUserInfo,
  type IAuthService,
} from '../../../core/services/auth/auth.interface';
import { EditProfileApiService, SeoService } from '../../../core/services';
import { WebEmailConnectionService } from '../../../core/services/web/email-connection.service';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';

@Component({
  selector: 'nxt1-connected-accounts-web-modal',
  standalone: true,
  template: '',
})
class StubConnectedAccountsWebModalComponent {
  readonly role = input<unknown>();
  readonly selectedSports = input<readonly string[]>([]);
  readonly linkSourcesData = input<unknown>();
  readonly scope = input<string>('athlete');
  readonly close = output<unknown>();
  readonly oauthConnectRequest = output<unknown>();
}

describe('ConnectedAccountsComponent', () => {
  let fixture: ComponentFixture<ConnectedAccountsComponent>;
  let component: ConnectedAccountsComponent;

  const authUser = signal<AppUser | null>(null);
  const firebaseUser = signal<FirebaseUserInfo | null>(null);
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  beforeEach(async () => {
    authUser.set(null);
    firebaseUser.set(null);
    logger.child.mockReturnValue(logger);
    logger.info.mockReset();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.debug.mockReset();
    logger.fatal.mockReset();

    await TestBed.configureTestingModule({
      imports: [ConnectedAccountsComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: AUTH_SERVICE,
          useValue: {
            user: authUser,
            firebaseUser,
            refreshUserProfile: vi.fn(),
          } satisfies Partial<IAuthService>,
        },
        { provide: SeoService, useValue: { updatePage: vi.fn() } },
        {
          provide: NxtToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
        { provide: NxtLoggingService, useValue: logger },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: EditProfileApiService, useValue: { updateSection: vi.fn() } },
        {
          provide: WebEmailConnectionService,
          useValue: { connectForLinkedAccounts: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: ConnectedAccountsResyncService,
          useValue: { request: vi.fn().mockResolvedValue(true) },
        },
      ],
    })
      .overrideComponent(ConnectedAccountsComponent, {
        remove: { imports: [ConnectedAccountsWebModalComponent] },
        add: {
          imports: [StubConnectedAccountsWebModalComponent],
          schemas: [CUSTOM_ELEMENTS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ConnectedAccountsComponent);
    component = fixture.componentInstance;
  });

  it('falls back to sports when selectedSports is missing', () => {
    authUser.set({
      uid: 'user-1',
      email: 'athlete@nxt1.com',
      displayName: 'Billy Baca',
      role: 'athlete',
      hasCompletedOnboarding: true,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
      sports: [{ sport: 'Football' }],
      connectedSources: [
        {
          platform: 'maxpreps',
          profileUrl: 'https://www.maxpreps.com/athlete/example',
          scopeType: 'sport',
          scopeId: 'football',
        } satisfies ConnectedSource,
      ],
    });

    fixture.detectChanges();

    expect((component as unknown as { userSports: () => readonly string[] }).userSports()).toEqual([
      'Football',
    ]);
    expect(
      (
        component as unknown as {
          linkSourcesData: () => { links: Array<{ platform: string }> } | null;
        }
      )
        .linkSourcesData()
        ?.links.map((link) => link.platform)
    ).toContain('maxpreps');
  });
});
