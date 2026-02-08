type ForgeNavItem = {
  id: string;
  label: string;
  to?: string;
  href?: string;
};

type ForgeNavSection = {
  id: string;
  title?: string;
  items: ForgeNavItem[];
};

type ForgeNavPayload = {
  schema: number;
  generated_at: string | null;
  tree: ForgeNavSection[];
};

const FORGE_NAV_PANEL_ID = "forgeNavPanel";
const FORGE_NAV_BUTTON_ID = "forgeNavBtn";
const FORGE_NAV_WRAPPER_ID = "forgeNavWrap";
const DEFAULT_MOUNT_ID = "forge-menu-slot";
const FORGE_NAV_READY_SENTINEL = "__tpForgeNavReady";

type ForgeMenuInitOptions = {
  mountId?: string;
};
const FORGE_NAV_FALLBACK: ForgeNavPayload = {
  schema: 1,
  generated_at: null,
  tree: [
    {
      id: "forge",
      title: "Nursery",
      items: [
        { id: "home", label: "Home", to: "/app" },
        { id: "tongs", label: "Tongs Calendar", to: "/app/tongs" },
        { id: "anvil", label: "Anvil", href: "/anvil/teleprompter_pro.html" },
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
  ],
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function normalizePayload(raw: unknown): ForgeNavPayload | null {
  if (!isRecord(raw) || !Array.isArray(raw.tree)) return null;

  const tree: ForgeNavSection[] = [];
  for (const section of raw.tree) {
    if (!isRecord(section)) continue;
    const id = readString(section.id);
    const title = readString(section.title) ?? undefined;
    const rawItems = Array.isArray(section.items) ? section.items : [];
    if (!id || rawItems.length === 0) continue;

    const items: ForgeNavItem[] = [];
    for (const item of rawItems) {
      if (!isRecord(item)) continue;
      const itemId = readString(item.id);
      const label = readString(item.label);
      const to = readString(item.to) ?? undefined;
      const href = readString(item.href) ?? undefined;
      if (!itemId || !label || (!to && !href)) continue;
      items.push({ id: itemId, label, to, href });
    }

    if (!items.length) continue;
    tree.push({ id, title, items });
  }

  if (!tree.length) return null;
  return {
    schema: typeof raw.schema === "number" ? raw.schema : 1,
    generated_at: readString(raw.generated_at),
    tree,
  };
}

function getForgeHubOrigin(): string {
  const win = window as any;
  const fromEnv = readString(win.FORGE_HUB_ORIGIN);
  if (fromEnv) return fromEnv;
  const fromForgeConfig = readString(win.__forgeAppOrigin);
  if (fromForgeConfig) return fromForgeConfig;
  return "";
}

function getBuildId(): string | null {
  const win = window as any;
  const explicit = readString(win.FORGE_BUILD_ID);
  if (explicit) return explicit;
  return readString(win.APP_VERSION) ?? null;
}

function buildNavUrl(): string {
  const base = getForgeHubOrigin() || window.location.origin;
  const navUrl = new URL("/forge-nav.json", base);
  const buildId = getBuildId();
  if (buildId) {
    navUrl.searchParams.set("v", buildId);
  }
  return navUrl.toString();
}

function resolveItemHref(item: ForgeNavItem): string {
  if (item.href) {
    if (/^https?:\/\//i.test(item.href)) return item.href;
    if (item.href.startsWith("/")) {
      const hubOrigin = getForgeHubOrigin();
      if (!hubOrigin) return item.href;
      try {
        return new URL(item.href, hubOrigin).toString();
      } catch {
        return item.href;
      }
    }
    return item.href;
  }
  const to = item.to;
  if (!to) return "#";
  if (/^https?:\/\//i.test(to)) return to;
  if (!(to === "/app" || to.startsWith("/app/"))) return "#";

  const hubOrigin = getForgeHubOrigin();
  if (!hubOrigin) return "#";
  try {
    return new URL(to, hubOrigin).toString();
  } catch {
    return "#";
  }
}

export async function loadForgeNav(): Promise<ForgeNavPayload> {
  try {
    const response = await fetch(buildNavUrl(), { cache: "default" });
    if (!response.ok) {
      throw new Error(`nav fetch failed: ${response.status}`);
    }
    const raw = await response.json();
    const parsed = normalizePayload(raw);
    if (!parsed) {
      throw new Error("nav payload shape is invalid.");
    }
    return parsed;
  } catch (err) {
    try { console.warn("[forge-nav] using fallback", err); } catch {}
    return FORGE_NAV_FALLBACK;
  }
}

function createSectionTitle(section: ForgeNavSection): HTMLElement | null {
  if (!section.title) return null;
  const el = document.createElement(section.id === "forge" ? "h3" : "div");
  el.textContent = section.title;
  if (section.id === "forge") {
    el.style.margin = "0";
    el.style.fontSize = "1rem";
  } else {
    el.style.fontSize = "0.85rem";
    el.style.opacity = "0.8";
  }
  return el;
}

function renderNavPanel(panel: HTMLDivElement, payload: ForgeNavPayload): void {
  panel.innerHTML = "";
  payload.tree.forEach((section, idx) => {
    const sectionEl = document.createElement("div");
    sectionEl.style.marginTop = idx === 0 ? "0" : "12px";

    const titleEl = createSectionTitle(section);
    if (titleEl) sectionEl.appendChild(titleEl);

    const nav = document.createElement("nav");
    nav.style.display = "grid";
    nav.style.gap = section.id === "settings" ? "6px" : "8px";
    nav.style.marginTop = section.id === "settings" ? "4px" : "0";

    section.items.forEach((item) => {
      const link = document.createElement("a");
      link.textContent = item.label;
      link.href = resolveItemHref(item);
      link.dataset.forgeNavLink = "1";
      link.style.color = "inherit";
      link.style.textDecoration = "none";
      nav.appendChild(link);
    });
    sectionEl.appendChild(nav);

    if (section.id === "forge") {
      const hr = document.createElement("hr");
      hr.style.border = "none";
      hr.style.borderTop = "1px solid rgba(255,255,255,0.16)";
      hr.style.margin = "12px 0";
      sectionEl.appendChild(hr);
    }

    panel.appendChild(sectionEl);
  });
}

export function initForgeMenu(opts: ForgeMenuInitOptions = {}): void {
  const mountId = readString(opts.mountId) ?? DEFAULT_MOUNT_ID;
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const win = window as any;
  const readyKey = `${FORGE_NAV_READY_SENTINEL}:${mountId}`;
  if (win[readyKey]) return;
  win[readyKey] = true;

  if (document.getElementById(FORGE_NAV_BUTTON_ID) || document.getElementById(FORGE_NAV_PANEL_ID)) return;

  const wrapper = document.createElement("span");
  wrapper.id = FORGE_NAV_WRAPPER_ID;
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  mount.appendChild(wrapper);

  const button = document.createElement("button");
  button.id = FORGE_NAV_BUTTON_ID;
  button.className = "chip";
  button.type = "button";
  button.textContent = "Forge";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  wrapper.appendChild(button);

  const panel = document.createElement("div");
  panel.id = FORGE_NAV_PANEL_ID;
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", "Forge navigation");
  panel.hidden = true;
  panel.style.position = "absolute";
  panel.style.top = "calc(100% + 8px)";
  panel.style.right = "0";
  panel.style.zIndex = "1100";
  panel.style.width = "280px";
  panel.style.maxWidth = "calc(100vw - 24px)";
  panel.style.maxHeight = "min(72vh, calc(100vh - 24px))";
  panel.style.overflow = "auto";
  panel.style.padding = "12px";
  panel.style.borderRadius = "12px";
  panel.style.border = "1px solid rgba(255,255,255,0.2)";
  panel.style.background = "linear-gradient(180deg, rgba(20,28,44,0.98), rgba(12,18,31,0.98))";
  panel.style.color = "rgba(233,240,255,0.95)";
  panel.style.boxShadow = "0 16px 32px rgba(0,0,0,0.45)";

  const loading = document.createElement("div");
  loading.textContent = "Loading navigation...";
  loading.style.fontSize = "12px";
  loading.style.opacity = "0.75";
  panel.appendChild(loading);
  wrapper.appendChild(panel);

  let open = false;
  const setOpen = (next: boolean) => {
    open = next;
    panel.hidden = !next;
    button.setAttribute("aria-expanded", next ? "true" : "false");
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  });

  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-forge-nav-link='1']")) {
      setOpen(false);
    }
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapper.contains(target) || panel.contains(target)) return;
      setOpen(false);
    },
    { capture: true },
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  void loadForgeNav().then((payload) => {
    renderNavPanel(panel, payload);
  });
}

export function initForgeNavMenu(opts: ForgeMenuInitOptions = {}): void {
  initForgeMenu(opts);
}
