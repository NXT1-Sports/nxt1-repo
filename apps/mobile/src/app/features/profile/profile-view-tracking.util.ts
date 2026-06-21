export interface ProfileViewTrackingInput {
  readonly explicitIsOwnProfile: boolean;
  readonly viewedUserId: string | null | undefined;
  readonly authUserId: string | null | undefined;
  readonly firebaseUserId: string | null | undefined;
  readonly isAuthenticated: boolean;
}

function normalizeUserId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function shouldTrackProfileView(input: ProfileViewTrackingInput): boolean {
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

  if (input.isAuthenticated && !authUserId && !firebaseUserId) {
    return false;
  }

  return true;
}
