import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthFlowService } from '../auth-flow.service';
import { FirebaseAuthService } from '../firebase-auth.service';
import { AuthApiService } from '../auth-api.service';
import { ProfileService } from '../../state/profile.service';

const authMocks = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const fallbackService = {
    isBrowser: vi.fn(() => false),
    setTokenProvider: vi.fn(),
    showLoading: vi.fn().mockResolvedValue(undefined),
    hideLoading: vi.fn().mockResolvedValue(undefined),
    navigateForward: vi.fn().mockResolvedValue(true),
    navigateBack: vi.fn().mockResolvedValue(true),
    navigateRoot: vi.fn().mockResolvedValue(true),
    setUser: vi.fn().mockResolvedValue(undefined),
    setCustomKeys: vi.fn().mockResolvedValue(undefined),
    clearUser: vi.fn().mockResolvedValue(undefined),
  };

  return {
    firebaseAuth: {
      signInWithApple: vi.fn(),
      getIdToken: vi.fn(),
      getLastAppleUserInfo: vi.fn(),
      getCurrentUser: vi.fn(),
      getProviderFromUser: vi.fn(),
      getFirebaseUserInfo: vi.fn(),
      waitForAuthReady: vi.fn(),
    },
    authApi: {
      getUserProfile: vi.fn(),
      createUser: vi.fn(),
    },
    profileService: {
      load: vi.fn(),
      user: vi.fn(),
      role: vi.fn(),
    },
    navController: {
      navigateForward: vi.fn(),
      navigateBack: vi.fn(),
      navigateRoot: vi.fn(),
    },
    platform: {
      isBrowser: vi.fn(),
    },
    httpAdapter: {
      setTokenProvider: vi.fn(),
    },
    modal: {
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
    },
    crashlytics: {
      setUser: vi.fn(),
      setCustomKeys: vi.fn(),
      clearUser: vi.fn(),
    },
    loggingService: {
      child: vi.fn(() => logger),
    },
    logger,
    fallbackService,
  };
});

// Mock dependencies
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn((token) => {
      if (token === FirebaseAuthService) return authMocks.firebaseAuth;
      if (token === AuthApiService) return authMocks.authApi;
      if (token === ProfileService) return authMocks.profileService;

      switch ((token as { name?: string })?.name) {
        case 'NavController':
          return authMocks.navController;
        case 'NxtPlatformService':
          return authMocks.platform;
        case 'CapacitorHttpAdapter':
          return authMocks.httpAdapter;
        case 'NxtModalService':
          return authMocks.modal;
        case 'NxtLoggingService':
          return authMocks.loggingService;
        default:
          return authMocks.fallbackService;
      }
    }),
  };
});

vi.mock('@angular/fire/auth', () => ({
  getAdditionalUserInfo: vi.fn(() => null),
}));

describe('AuthFlowService - Apple Sign-In', () => {
  let service: AuthFlowService;
  const mockFirebaseAuth = authMocks.firebaseAuth;
  const mockAuthApi = authMocks.authApi;
  const mockProfileService = authMocks.profileService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFirebaseAuth.waitForAuthReady.mockResolvedValue(undefined);
    mockFirebaseAuth.getIdToken.mockResolvedValue('test-token');
    mockProfileService.load.mockResolvedValue(undefined);
    mockProfileService.user.mockReturnValue(null);
    mockProfileService.role.mockReturnValue('athlete');
    authMocks.navController.navigateForward.mockResolvedValue(true);
    authMocks.navController.navigateBack.mockResolvedValue(true);
    authMocks.navController.navigateRoot.mockResolvedValue(true);
    authMocks.platform.isBrowser.mockReturnValue(false);
    authMocks.modal.showLoading.mockResolvedValue(undefined);
    authMocks.modal.hideLoading.mockResolvedValue(undefined);
    authMocks.crashlytics.setUser.mockResolvedValue(undefined);
    authMocks.crashlytics.setCustomKeys.mockResolvedValue(undefined);
    authMocks.crashlytics.clearUser.mockResolvedValue(undefined);

    service = new AuthFlowService();
  });

  describe('First-time Apple Sign-In', () => {
    it('should pass Apple firstName/lastName to createUser when available', async () => {
      // Arrange
      const mockFirebaseUser = {
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
        providerData: [{ providerId: 'apple.com' }],
        metadata: { creationTime: new Date().toISOString() },
      };

      const mockCredential = {
        user: mockFirebaseUser,
        providerId: 'apple.com',
        operationType: 'signIn',
        nativeAppleUser: {
          givenName: 'John',
          familyName: 'Doe',
          displayName: 'John Doe',
        },
      };

      mockFirebaseAuth.signInWithApple.mockResolvedValue(mockCredential);
      mockFirebaseAuth.getCurrentUser.mockReturnValue(mockFirebaseUser);
      mockFirebaseAuth.getProviderFromUser.mockReturnValue('apple');
      mockFirebaseAuth.getFirebaseUserInfo.mockReturnValue({
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
      });

      mockAuthApi.getUserProfile.mockRejectedValue({ status: 404 });
      mockAuthApi.createUser.mockResolvedValue({ success: true });

      // Act
      const result = await service.signInWithApple();

      // Assert
      expect(result).toBe(true);
      expect(mockAuthApi.createUser).toHaveBeenCalledWith({
        uid: 'test-uid-123',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
      });
    });

    it('should create the user without name fields when Apple returns no profile name', async () => {
      // Arrange - Apple returns no provider-specific name payload
      const mockFirebaseUser = {
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
        providerData: [{ providerId: 'apple.com' }],
        metadata: { creationTime: new Date().toISOString() },
      };

      const mockCredential = {
        user: mockFirebaseUser,
        providerId: 'apple.com',
        operationType: 'signIn',
      };

      mockFirebaseAuth.signInWithApple.mockResolvedValue(mockCredential);
      mockFirebaseAuth.getCurrentUser.mockReturnValue(mockFirebaseUser);
      mockFirebaseAuth.getProviderFromUser.mockReturnValue('apple');
      mockFirebaseAuth.getFirebaseUserInfo.mockReturnValue({
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
      });

      mockAuthApi.getUserProfile.mockRejectedValue({ status: 404 });
      mockAuthApi.createUser.mockResolvedValue({ success: true });

      // Act
      const result = await service.signInWithApple();

      // Assert
      expect(result).toBe(true);
      expect(mockAuthApi.createUser).toHaveBeenCalledWith({
        uid: 'test-uid-123',
        email: 'john@example.com',
      });
    });
  });

  describe('Subsequent Apple Sign-In', () => {
    it('should not call createUser for existing users', async () => {
      // Arrange - User already exists in backend
      const mockFirebaseUser = {
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
        providerData: [{ providerId: 'apple.com' }],
        metadata: { creationTime: new Date().toISOString() },
      };

      const mockCredential = {
        user: mockFirebaseUser,
        providerId: 'apple.com',
        operationType: 'signIn',
      };

      const existingProfile = {
        uid: 'test-uid-123',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'athlete',
        hasCompletedOnboarding: true,
      };

      mockFirebaseAuth.signInWithApple.mockResolvedValue(mockCredential);
      mockFirebaseAuth.getLastAppleUserInfo.mockReturnValue(null); // Subsequent login - no name
      mockFirebaseAuth.getCurrentUser.mockReturnValue(mockFirebaseUser);
      mockFirebaseAuth.getProviderFromUser.mockReturnValue('apple');
      mockFirebaseAuth.getFirebaseUserInfo.mockReturnValue({
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        emailVerified: true,
      });

      mockAuthApi.getUserProfile.mockResolvedValue({ data: existingProfile });
      mockProfileService.user.mockReturnValue(existingProfile);

      // Act
      const result = await service.signInWithApple();

      // Assert
      expect(result).toBe(true);
      expect(mockAuthApi.createUser).not.toHaveBeenCalled();
      expect(mockProfileService.load).toHaveBeenCalledWith('test-uid-123');
    });
  });

  describe('Apple Sign-In with partial name', () => {
    it('should handle firstName only (no lastName)', async () => {
      // Arrange
      const mockFirebaseUser = {
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John',
        emailVerified: true,
        providerData: [{ providerId: 'apple.com' }],
        metadata: { creationTime: new Date().toISOString() },
      };

      const mockCredential = {
        user: mockFirebaseUser,
        providerId: 'apple.com',
        operationType: 'signIn',
        nativeAppleUser: {
          givenName: 'John',
          familyName: null,
          displayName: 'John',
        },
      };

      mockFirebaseAuth.signInWithApple.mockResolvedValue(mockCredential);
      mockFirebaseAuth.getCurrentUser.mockReturnValue(mockFirebaseUser);
      mockFirebaseAuth.getProviderFromUser.mockReturnValue('apple');
      mockFirebaseAuth.getFirebaseUserInfo.mockReturnValue({
        uid: 'test-uid-123',
        email: 'john@example.com',
        displayName: 'John',
        emailVerified: true,
      });

      mockAuthApi.getUserProfile.mockRejectedValue({ status: 404 });
      mockAuthApi.createUser.mockResolvedValue({ success: true });

      // Act
      const result = await service.signInWithApple();

      // Assert
      expect(result).toBe(true);
      expect(mockAuthApi.createUser).toHaveBeenCalledWith({
        uid: 'test-uid-123',
        email: 'john@example.com',
        firstName: 'John',
        displayName: 'John',
      });
    });
  });
});
