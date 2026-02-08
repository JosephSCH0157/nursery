import type { ForgeNavSection } from "./forgeNavTree";

// Anvil-only items live here; do not edit forgeNavTree for Anvil-specific links.
export const anvilNavExtras: ForgeNavSection[] = [
  {
    id: "anvil-native",
    title: "Anvil",
    items: [
      { id: "anvil-help", label: "Help", to: "/app/anvil/help" },
      { id: "anvil-settings", label: "Anvil Settings", to: "/app/anvil/settings" },
    ],
  },
];
