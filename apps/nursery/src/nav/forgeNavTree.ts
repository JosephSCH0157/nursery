// SSOT: Forge navigation tree.
// Do not hardcode tool links in shells/menus; render this tree instead.
export type ForgeNavItem = {
  id: string;
  label: string;
  to: string;
};

export type ForgeNavSection = {
  id: string;
  title?: string;
  items: ForgeNavItem[];
};

export const forgeNavTree: ForgeNavSection[] = [
  {
    id: "forge",
    title: "Nursery",
    items: [
      { id: "home", label: "Home", to: "/app" },
      { id: "tongs", label: "Tongs Calendar", to: "/app/tongs" },
      { id: "anvil", label: "Anvil", to: "/app/anvil" },
      { id: "hearth", label: "Hearth", to: "/app/hearth" },
      { id: "hammer", label: "Hammer", to: "/app/hammer" },
      { id: "barstock", label: "Barstock", to: "/app/barstock" },
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
