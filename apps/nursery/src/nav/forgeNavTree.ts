// SSOT: Forge navigation tree.
// Do not hardcode tool links in shells/menus; render this tree instead.
export type ForgeNavItem = {
  id: string;
  label: string;
  to?: string;
  href?: string;
  actionId?: string;
};

export const FORGE_NAV_ACTION_AI_CONTROLS = "ai-controls";

export type ForgeNavSection = {
  id: string;
  title?: string;
  items: ForgeNavItem[];
};

export function composeNav(base: ForgeNavSection[], extras?: ForgeNavSection[]) {
  return extras?.length ? [...base, ...extras] : base;
}

export const forgeNavTree: ForgeNavSection[] = [
  {
    id: "forge",
    title: "The Forge",
    items: [
      { id: "home", label: "Home", to: "/app" },
      { id: "barstock", label: "Barstock", to: "/app/barstock" },
      { id: "hearth", label: "Hearth", to: "/app/hearth" },
      { id: "tongs", label: "Tongs", to: "/app/tongs" },
      { id: "anvil", label: "Anvil", to: "/app/anvil" },
      { id: "hammer", label: "Hammer", to: "/app/hammer" },
      { id: "quench", label: "Quench", to: "/app/quench" },
      { id: "ledger", label: "Ledger", to: "/app/ledger" },
      { id: "iron-mine", label: "Iron Mine", to: "/app/iron-mine" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      { id: "settings-home", label: "Settings home", to: "/app/settings" },
      { id: "org", label: "Organization", to: "/app/settings/org" },
      { id: "storage", label: "Storage (Mounts)", to: "/app/settings/storage" },
      { id: "mobile-demo", label: "Mobile Demo", to: "/app/mobile-demo" },
    ],
  },
];
