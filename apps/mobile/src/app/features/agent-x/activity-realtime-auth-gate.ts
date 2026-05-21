export interface ActivityRealtimeAuthGate {
  readonly isAuthInitialized: boolean;
  readonly appUserId: string | null | undefined;
  readonly firebaseUserId: string | null | undefined;
}

export function shouldStartActivityRealtimeListener({
  isAuthInitialized,
  appUserId,
  firebaseUserId,
}: ActivityRealtimeAuthGate): boolean {
  const normalizedAppUserId = appUserId?.trim() ?? null;
  const normalizedFirebaseUserId = firebaseUserId?.trim() ?? null;

  return (
    !!normalizedAppUserId && isAuthInitialized && normalizedFirebaseUserId === normalizedAppUserId
  );
}
