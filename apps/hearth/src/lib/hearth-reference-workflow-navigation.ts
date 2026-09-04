export function nextUnresolvedReferenceOpportunityId<T extends { id: string }>(
  opportunities: T[],
  completedId: string,
  isResolved: (opportunity: T) => boolean,
  skippedIds: ReadonlySet<string>,
): string | null {
  if (!opportunities.length) return null;
  const start = Math.max(0, opportunities.findIndex((opportunity) => opportunity.id === completedId));
  for (let offset = 1; offset <= opportunities.length; offset += 1) {
    const opportunity = opportunities[(start + offset) % opportunities.length];
    if (opportunity && !isResolved(opportunity) && !skippedIds.has(opportunity.id)) return opportunity.id;
  }
  return null;
}
