export interface ProfileViewTrackingInput {
  readonly explicitIsOwnProfile: boolean;
  readonly viewedUserId: string | null | undefined;
  readonly authUserId: string | null | undefined;
  readonly firebaseUserId: string | null | undefined;
  readonly isAuthenticated: boolean;
  /** False when the user has not yet completed onboarding — suppresses all profile-view tracking. */
  readonly hasCompletedOnboarding?: boolean;
}

function normalizeUserId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function shouldTrackProfileView(input: ProfileViewTrackingInput): boolean {
  // Never track when an authenticated user hasn't completed onboarding yet —
  // they are still setting up their account and any profile view is incidental.
  // Anonymous users (isAuthenticated=false) are always allowed through.
  if (input.isAuthenticated && input.hasCompletedOnboarding === false) {
    return false;
  }

  if (input.explicitIsOwnProfile) {
    return false;
  }

  const viewedUserId = normalizeUserId(input.viewedUserId);
  const authUserId = normalizeUserId(input.authUserId);
  const firebaseUserId = normalizeUserId(input.firebaseUserId);

  if (!viewedUserId) {
    return false;
  }

  if (viewedUserId === authUserId || viewedUserId === firebaseUserId) {
    return false;
  }

  // CTO Guard: If Firebase has a user (auth is in progress/hydrating)
  // but the application user context doesn't match yet, we are in a hydration race.
  // We must NOT track this as an "anonymous" view.
  if (firebaseUserId && !authUserId) {
    return false;
  }

  if (input.isAuthenticated && !authUserId && !firebaseUserId) {
    return false;
  }

  return true;
}
