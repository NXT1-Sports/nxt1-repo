/**
 * @fileoverview Unit tests for SettingsApiService.syncBiometricPreference
 *
 * Verifies that the best-effort backend sync called after biometric enrollment
 * during signup correctly patches the backend and handles network failures
 * without throwing.
 */
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsApiService } from '../settings-api.service';
import { CapacitorHttpAdapter } from '../../../infrastructure';
import { BiometricService } from '../../auth/biometric.service';
import { FcmRegistrationService } from '../../native/fcm-registration.service';
import { AnalyticsService } from '../../infrastructure/analytics.service';
import { NxtLoggingService } from '@nxt1/ui';

const mockHttp = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
mockLogger.child.mockReturnValue(mockLogger);

describe('SettingsApiService.syncBiometricPreference', () => {
  let service: SettingsApiService;

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        SettingsApiService,
        { provide: CapacitorHttpAdapter, useValue: mockHttp },
        { provide: BiometricService, useValue: { initialize: vi.fn(), isEnrolled: vi.fn(), biometryName: vi.fn(), clearEnrollment: vi.fn(), promptDeviceUnlockEnrollment: vi.fn() } },
        { provide: FcmRegistrationService, useValue: { registerToken: vi.fn(), unregisterToken: vi.fn(), registerTokenIfPermissionGranted: vi.fn() } },
        { provide: AnalyticsService, useValue: { setEnabled: vi.fn() } },
        { provide: NxtLoggingService, useValue: mockLogger },
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

    // Must resolve without throwing so the signup flow is never blocked
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

  it('logs info on successful sync', async () => {
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
  });
});
