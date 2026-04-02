export function resolveSelectedPlacementId(
  placementIds: string[],
  currentSelectedPlacementId: string | null,
): string | null {
  if (placementIds.length === 0) return null;
  if (currentSelectedPlacementId && placementIds.includes(currentSelectedPlacementId)) {
    return currentSelectedPlacementId;
  }
  return placementIds[0] ?? null;
}
