export interface ExecuteSavedPlanPayload {
  readonly planId: string;
}

export class ExecuteSavedPlanException extends Error {
  readonly isExecuteSavedPlan = true as const;
  readonly payload: ExecuteSavedPlanPayload;

  constructor(payload: ExecuteSavedPlanPayload) {
    super(`Primary requesting saved plan execution: ${payload.planId}`);
    this.name = 'ExecuteSavedPlanException';
    this.payload = payload;
  }
}

export function isExecuteSavedPlan(err: unknown): err is ExecuteSavedPlanException {
  return (
    err instanceof ExecuteSavedPlanException ||
    (err instanceof Error &&
      'isExecuteSavedPlan' in err &&
      (err as ExecuteSavedPlanException).isExecuteSavedPlan === true)
  );
}
