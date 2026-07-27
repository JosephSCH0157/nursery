import HearthMobileOverlays from "../../views/modes/HearthMobileOverlays";
import type { HearthMobileNavigationViewModel } from "./hearth-mobile-navigation-contracts";

export default function HearthMobileNavigation(
  props: HearthMobileNavigationViewModel,
) {
  return <HearthMobileOverlays {...props} />;
}
