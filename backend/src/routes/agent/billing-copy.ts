export function buildOrganizationBudgetFollowUpCopy(userRole = 'athlete'): string {
  const role = userRole.trim().toLowerCase();

  if (role === 'director' || role === 'admin') {
    return 'You can update the organization budget in Settings → Usage to continue.';
  }

  if (role === 'coach') {
    return 'Ask your athletic director to raise the organization budget in Settings → Usage.';
  }

  return 'Ask your coach or athletic director to raise the organization budget in Settings → Usage.';
}
