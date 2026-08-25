export type HammerImagePlacementListScrollGeometry = {
  currentScrollTop: number;
  viewportHeight: number;
  itemTop: number;
  itemHeight: number;
};

export function resolveHammerImagePlacementListScrollTop(
  geometry: HammerImagePlacementListScrollGeometry,
): number {
  const itemBottom = geometry.itemTop + geometry.itemHeight;
  const viewportBottom = geometry.currentScrollTop + geometry.viewportHeight;
  if (geometry.itemTop < geometry.currentScrollTop) return Math.max(0, geometry.itemTop);
  if (itemBottom > viewportBottom) return Math.max(0, itemBottom - geometry.viewportHeight);
  return geometry.currentScrollTop;
}

export function useHammerImagePlacementListScroll(args: {
  active: boolean;
  cardRefs: RefObject<Map<string, HTMLElement>>;
  revealRequest: { placementId: string; nonce: number } | null;
}): void {
  useEffect(() => {
    if (!args.active) return;
    const cards = args.cardRefs.current;
    const requestedCard = args.revealRequest ? (cards.get(args.revealRequest.placementId) ?? null) : null;
    const card = requestedCard ?? cards.values().next().value ?? null;
    const container = card?.closest(".hammer-bay-body");
    if (!(container instanceof HTMLElement)) return;
    if (!requestedCard) {
      container.scrollTop = 0;
      return;
    }
    container.scrollTop = resolveHammerImagePlacementListScrollTop({
      currentScrollTop: container.scrollTop, viewportHeight: container.clientHeight,
      itemTop: requestedCard.offsetTop, itemHeight: requestedCard.offsetHeight,
    });
  }, [args.active, args.cardRefs, args.revealRequest]);
}
import { useEffect, type RefObject } from "react";
