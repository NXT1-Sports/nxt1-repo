/**
 * @fileoverview SettingsApiService — biometric reconciliation tests
 *
 * Verifies that loadPreferences() reconciles the biometricLogin preference
 * with the device's local enrollment state. The auth/signup flow stores
 * enrollment locally (Capacitor Preferences) without updating the backend,
 * so the Settings toggle must reflect the device state as the source of truth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsApiService } from '../settings-api.service';
import { BiometricService } from '../../auth/biometric.service';
import { FcmRegistrationService } from '../../native/fcm-registration.service';
import { AnalyticsService } from '../../infrastructure/analytics.service';
import { CapacitorHttpAdapter } from '../../../infrastructure';

// ---------------------------------------------------------------------------
// Hoist shared mock factories so vi.mock() can reference them
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const biometricService = {
    loadEnrollmentStatus: vi.fn().mockResolvedValue(undefined),
    isEnrolled: vi.fn().mockReturnValue(false),
    biometryName: vi.fn().mockReturnValue('Face ID'),
    initialize: vi.fn().mockResolvedValue({ available: true }),
    promptDeviceUnlockEnrollment: vi.fn(),
    clearEnrollment: vi.fn(),
  };

  const httpAdapter = {
    get: vi.fn(),
    patch: vi.fn().mockResolvedValue({ success: true }),
  };

  const analyticsService = {
    setEnabled: vi.fn(),
  };

  const fcmRegistration = {
    registerToken: vi.fn(),
    unregisterToken: vi.fn(),
    registerTokenIfPermissionGranted: vi.fn(),
  };

  return { biometricService, httpAdapter, analyticsService, fcmRegistration };
});

// ---------------------------------------------------------------------------
// Mock Angular's inject() — resolves services by class reference (token)
// ---------------------------------------------------------------------------
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn((token: unknown) => {
      if (token === BiometricService) return mocks.biometricService;
      if (token === FcmRegistrationService) return mocks.fcmRegistration;
      if (token === AnalyticsService) return mocks.analyticsService;
      if (token === CapacitorHttpAdapter) return mocks.httpAdapter;
      return undefined;
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock environment so the service has a stable base URL in tests
// ---------------------------------------------------------------------------
vi.mock('../../../../environments/environment', () => ({
  environment: { apiUrl: 'http://localhost:3000/api/v1' },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal backend UserPreferences payload */
const backendPrefs = {
  notifications: { push: true, email: true, marketing: false },
  activityTracking: true,
  analyticsTracking: true,
  biometricLogin: false,
};

/** Build a successful backend response */
function successResponse(data: unknown) {
  return { success: true, data };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsApiService — biometric reconciliation in loadPreferences()', () => {
  let service: SettingsApiService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: backend says OFF, device says NOT enrolled
    mocks.httpAdapter.get.mockResolvedValue(successResponse(backendPrefs));
    mocks.httpAdapter.patch.mockResolvedValue({ success: true });
    mocks.biometricService.loadEnrollmentStatus.mockResolvedValue(undefined);
    mocks.biometricService.isEnrolled.mockReturnValue(false);

    service = new SettingsApiService();
  });

  it('returns biometricLogin=false when backend and device both say OFF', async () => {
    const prefs = await service.loadPreferences();

    expect(prefs.biometricLogin).toBe(false);
    // No patch needed — sources are in sync
    expect(mocks.httpAdapter.patch).not.toHaveBeenCalled();
  });

  it('returns biometricLogin=true when device is enrolled but backend says false (signup bug)', async () => {
    // Simulate: user enabled Face ID during signup — device enrolled, backend not updated
    mocks.biometricService.isEnrolled.mockReturnValue(true);

    const prefs = await service.loadPreferences();

    expect(prefs.biometricLogin).toBe(true);
  });

  it('silently syncs backend to true when device is enrolled but backend says false', async () => {
    mocks.biometricService.isEnrolled.mockReturnValue(true);

    await service.loadPreferences();

    expect(mocks.httpAdapter.patch).toHaveBeenCalledWith(
      expect.stringContaining('/settings/preferences/biometricLogin'),
      { value: true }
    );
  });

  it('returns biometricLogin=false and syncs backend when device is NOT enrolled but backend says true', async () => {
    // Simulate: user cleared app data / revoked biometric credentials on device
    mocks.httpAdapter.get.mockResolvedValue(
      successResponse({ ...backendPrefs, biometricLogin: true })
    );
    mocks.biometricService.isEnrolled.mockReturnValue(false);

    const prefs = await service.loadPreferences();

    expect(prefs.biometricLogin).toBe(false);
    expect(mocks.httpAdapter.patch).toHaveBeenCalledWith(
      expect.stringContaining('/settings/preferences/biometricLogin'),
      { value: false }
    );
  });

  it('returns biometricLogin=true when backend and device both say enrolled', async () => {
    mocks.httpAdapter.get.mockResolvedValue(
      successResponse({ ...backendPrefs, biometricLogin: true })
    );
    mocks.biometricService.isEnrolled.mockReturnValue(true);

    const prefs = await service.loadPreferences();

    expect(prefs.biometricLogin).toBe(true);
    // No patch needed — sources are in sync
    expect(mocks.httpAdapter.patch).not.toHaveBeenCalled();
  });

  it('does not throw when the backend sync patch fails', async () => {
    // Device says enrolled, backend says false → need to patch
    mocks.biometricService.isEnrolled.mockReturnValue(true);
    mocks.httpAdapter.patch.mockRejectedValue(new Error('Network error'));

    // loadPreferences should still resolve with the corrected value
    await expect(service.loadPreferences()).resolves.toMatchObject({
      biometricLogin: true,
    });
  });

  it('falls back to backend value when loadEnrollmentStatus throws', async () => {
    // Backend says biometricLogin=true; device status read fails
    mocks.httpAdapter.get.mockResolvedValue(
      successResponse({ ...backendPrefs, biometricLogin: true })
    );
    mocks.biometricService.loadEnrollmentStatus.mockRejectedValue(new Error('Permissions denied'));

    const prefs = await service.loadPreferences();

    // Falls back to backend value — no patch, Settings still loads
    expect(prefs.biometricLogin).toBe(true);
    expect(mocks.httpAdapter.patch).not.toHaveBeenCalled();
  });

  it('calls loadEnrollmentStatus to refresh local state before reading isEnrolled', async () => {
    await service.loadPreferences();

    expect(mocks.biometricService.loadEnrollmentStatus).toHaveBeenCalledOnce();
  });

  it('applies analytics tracking preference on load', async () => {
    mocks.httpAdapter.get.mockResolvedValue(
      successResponse({ ...backendPrefs, analyticsTracking: false })
    );

    await service.loadPreferences();

    expect(mocks.analyticsService.setEnabled).toHaveBeenCalledWith(false);
  });
});
