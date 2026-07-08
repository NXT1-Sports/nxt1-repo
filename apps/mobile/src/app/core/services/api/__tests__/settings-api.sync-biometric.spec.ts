/**
 * @fileoverview Unit tests for SettingsApiService.syncBiometricPreference
 *
 * Verifies that the best-effort backend sync called after biometric enrollment
 * during signup correctly patches the backend and handles network failures
 * without throwing.
 */
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { SettingsApiService } from '../settings-api.service';
import { CapacitorHttpAdapter } from '../../../infrastructure';
import { BiometricService } from '../../auth/biometric.service';
import { FcmRegistrationService } from '../../native/fcm-registration.service';
import { AnalyticsService } from '../../infrastructure/analytics.service';
import { NxtLoggingService } from '@nxt1/ui';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import type { ILogger } from '@nxt1/core/logging';

// ── Shared mock factories ───────────────────────────────────────────────────

type MockLogger = { [K in keyof ILogger]: MockInstance } & { child: MockInstance };

function createMockLogger(): MockLogger {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as MockLogger;
  logger.child.mockReturnValue(logger);
  return logger;
}

const mockHttp = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const mockBreadcrumb = { trackStateChange: vi.fn(), initialize: vi.fn() };

function makeBiometricServiceMock() {
  return {
    initialize: vi.fn(),
    isEnrolled: vi.fn(),
    biometryName: vi.fn(),
    clearEnrollment: vi.fn(),
    promptDeviceUnlockEnrollment: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsApiService.syncBiometricPreference', () => {
  let service: SettingsApiService;
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();

    TestBed.configureTestingModule({
      providers: [
        SettingsApiService,
        { provide: CapacitorHttpAdapter, useValue: mockHttp },
        { provide: BiometricService, useValue: makeBiometricServiceMock() },
        { provide: FcmRegistrationService, useValue: { registerToken: vi.fn(), unregisterToken: vi.fn(), registerTokenIfPermissionGranted: vi.fn() } },
        { provide: AnalyticsService, useValue: { setEnabled: vi.fn() } },
        { provide: NxtLoggingService, useValue: mockLogger },
        { provide: NxtBreadcrumbService, useValue: mockBreadcrumb },
      ],
    });

    service = TestBed.inject(SettingsApiService);
  });

  it('PATCHes biometricLogin=true when enrolling', async () => {
    mockHttp.patch.mockResolvedValue({ success: true });

    await service.syncBiometricPreference(true);

    expect(mockHttp.patch).toHaveBeenCalledOnce();
    expect(mockHttp.patch).toHaveBeenCalledWith(
      expect.stringContaining('/settings/preferences/biometricLogin'),
      { value: true }
    );
  });

  it('PATCHes biometricLogin=false when clearing enrollment', async () => {
    mockHttp.patch.mockResolvedValue({ success: true });

    await service.syncBiometricPreference(false);

    expect(mockHttp.patch).toHaveBeenCalledOnce();
    expect(mockHttp.patch).toHaveBeenCalledWith(
      expect.stringContaining('/settings/preferences/biometricLogin'),
      { value: false }
    );
  });

  it('does NOT throw when the PATCH fails (best-effort)', async () => {
    mockHttp.patch.mockRejectedValue(new Error('Network error'));

    await expect(service.syncBiometricPreference(true)).resolves.toBeUndefined();
  });

  it('logs an error when the PATCH fails', async () => {
    const networkError = new Error('Network error');
    mockHttp.patch.mockRejectedValue(networkError);

    await service.syncBiometricPreference(true);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to sync biometric preference'),
      networkError,
      { enrolled: true }
    );
  });

  it('logs info and records breadcrumbs on successful sync', async () => {
    mockHttp.patch.mockResolvedValue({ success: true });

    await service.syncBiometricPreference(true);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Syncing biometric preference'),
      { enrolled: true }
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Biometric preference synced'),
      { enrolled: true }
    );
    expect(mockBreadcrumb.trackStateChange).toHaveBeenCalledWith(
      'settings', 'biometric-sync-initiated', { enrolled: true }
    );
    expect(mockBreadcrumb.trackStateChange).toHaveBeenCalledWith(
      'settings', 'biometric-sync-complete', { enrolled: true }
    );
  });

  it('records failure breadcrumb when the PATCH fails', async () => {
    mockHttp.patch.mockRejectedValue(new Error('Network error'));

    await service.syncBiometricPreference(true);

    expect(mockBreadcrumb.trackStateChange).toHaveBeenCalledWith(
      'settings', 'biometric-sync-failed', { enrolled: true }
    );
  });
});
