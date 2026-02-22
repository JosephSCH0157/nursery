// SSOT: Forge navigation tree.
// Do not hardcode tool links in shells/menus; render this tree instead.
export type ForgeNavItem = {
  id: string;
  label: string;
  to?: string;
  href?: string;
};

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
    title: "Nursery",
    items: [
      { id: "home", label: "Home", to: "/app" },
      { id: "barstock", label: "Barstock", to: "/app/barstock" },
      { id: "hearth", label: "Hearth", href: "/apps/hearth" },
      { id: "tongs", label: "Tongs Calendar", to: "/app/tongs" },
      { id: "anvil", label: "Anvil", href: "/anvil/teleprompter_pro.html" },
      { id: "hammer", label: "Hammer", to: "/app/hammer" },
      { id: "quench", label: "Quench", to: "/app/quench" },
      { id: "ledger", label: "Ledger", to: "/app/ledger" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      { id: "settings-home", label: "Settings home", to: "/app/settings" },
      { id: "storage", label: "Storage (Mounts)", to: "/app/settings/storage" },
    ],
  },
];
