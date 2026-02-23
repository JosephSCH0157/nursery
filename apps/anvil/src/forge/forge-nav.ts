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

const FORGE_NAV_BUTTON_ID = "forgeNavBtn";
const FORGE_NAV_WRAPPER_ID = "forgeNavWrap";
const DEFAULT_MOUNT_ID = "forge-menu-slot";
const FORGE_NAV_READY_SENTINEL = "__tpForgeNavReady";
const FORGE_NAV_POPUP_TITLE = "Nursery Menu";
const FORGE_NAV_TREE_ID = "forgeNavTree";
const FORGE_NAV_OVERLAY_ROOT_ID = "forgeNavOverlayRoot";
const FORGE_NAV_OVERLAY_STYLE_ID = "forgeNavOverlayStyles";
const FORGE_NAV_OVERLAY_TITLE_ID = "forgeNavOverlayTitle";

type ForgeNavOverlayState = {
  root: HTMLDivElement;
  onKeydown: (event: KeyboardEvent) => void;
};

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
        { id: "hearth", label: "Hearth", href: "/apps/hearth" },
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
      const href = resolveItemHref(item);
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = item.label;
      action.dataset.forgeNavLink = "1";
      action.dataset.forgeNavHref = href;
      action.style.display = "block";
      action.style.width = "100%";
      action.style.padding = "6px 8px";
      action.style.borderRadius = "8px";
      action.style.border = "1px solid rgba(255,255,255,0.12)";
      action.style.background = "rgba(255,255,255,0.03)";
      action.style.color = "inherit";
      action.style.textAlign = "left";
      action.style.cursor = href === "#" ? "not-allowed" : "pointer";
      action.disabled = href === "#";
      nav.appendChild(action);
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

function getOverlayState(): ForgeNavOverlayState | null {
  const win = window as any;
  const state = win.__forgeNavOverlayState as ForgeNavOverlayState | null | undefined;
  if (!state || !state.root) return null;
  return state;
}

function setOverlayState(state: ForgeNavOverlayState | null): void {
  const win = window as any;
  win.__forgeNavOverlayState = state;
}

function closeForgeMenuOverlay(): boolean {
  const state = getOverlayState();
  if (state) {
    try { document.removeEventListener("keydown", state.onKeydown, true); } catch {}
    try { state.root.remove(); } catch {}
    setOverlayState(null);
    return true;
  }

  const staleRoot = document.getElementById(FORGE_NAV_OVERLAY_ROOT_ID);
  if (staleRoot) {
    try { staleRoot.remove(); } catch {}
    return true;
  }
  return false;
}

function ensureOverlayStyles(): void {
  if (document.getElementById(FORGE_NAV_OVERLAY_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FORGE_NAV_OVERLAY_STYLE_ID;
  style.textContent = `
#${FORGE_NAV_OVERLAY_ROOT_ID} {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  margin: 0;
  padding: 0;
  background: rgba(5, 10, 18, 0.58);
  pointer-events: auto;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  bottom: 12px;
  width: min(360px, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: #0b1020;
  color: #eaf0ff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: forge-nav-overlay-in 140ms ease-out;
  font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-close {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px 14px;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .forge-nav-overlay-hint {
  padding: 0 14px 12px;
  opacity: 0.74;
  font-size: 12px;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} .loading {
  opacity: 0.8;
  font-size: 12px;
}
#${FORGE_NAV_OVERLAY_ROOT_ID} button[data-forge-nav-link='1']:hover {
  background: rgba(90, 160, 255, 0.24) !important;
}
@keyframes forge-nav-overlay-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
`;
  document.head.appendChild(style);
}

function openNavOverlayShell(): { panel: HTMLDivElement; closeOverlay: () => void } | null {
  try {
    ensureOverlayStyles();
    closeForgeMenuOverlay();

    const root = document.createElement("div");
    root.id = FORGE_NAV_OVERLAY_ROOT_ID;

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "forge-nav-overlay-backdrop";
    backdrop.dataset.forgeNavClose = "1";
    backdrop.setAttribute("aria-label", "Close Nursery menu");
    root.appendChild(backdrop);

    const panelShell = document.createElement("section");
    panelShell.className = "forge-nav-overlay-panel";
    panelShell.setAttribute("role", "dialog");
    panelShell.setAttribute("aria-modal", "true");
    panelShell.setAttribute("aria-labelledby", FORGE_NAV_OVERLAY_TITLE_ID);

    const head = document.createElement("div");
    head.className = "forge-nav-overlay-head";

    const title = document.createElement("h2");
    title.id = FORGE_NAV_OVERLAY_TITLE_ID;
    title.textContent = FORGE_NAV_POPUP_TITLE;
    head.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "forge-nav-overlay-close";
    closeBtn.dataset.forgeNavClose = "1";
    closeBtn.setAttribute("aria-label", "Close Nursery menu");
    closeBtn.textContent = "×";
    head.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "forge-nav-overlay-body";

    const tree = document.createElement("div");
    tree.id = FORGE_NAV_TREE_ID;
    tree.setAttribute("role", "menu");
    tree.setAttribute("aria-label", "Forge navigation");
    body.appendChild(tree);

    const hint = document.createElement("div");
    hint.className = "forge-nav-overlay-hint";
    hint.textContent = "Select an item to navigate.";

    panelShell.appendChild(head);
    panelShell.appendChild(body);
    panelShell.appendChild(hint);
    root.appendChild(panelShell);

    const closeOverlay = () => {
      const state = getOverlayState();
      if (state && state.root !== root) return;
      try { document.removeEventListener("keydown", onKeydown, true); } catch {}
      try { root.remove(); } catch {}
      setOverlayState(null);
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeOverlay();
    };

    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-forge-nav-close='1']")) return;
      event.preventDefault();
      closeOverlay();
    });

    document.addEventListener("keydown", onKeydown, true);
    setOverlayState({ root, onKeydown });
    document.body.appendChild(root);
    try { closeBtn.focus(); } catch {}
    return { panel: tree, closeOverlay };
  } catch {
    return null;
  }
}

function navigateFromOverlay(targetHref: string): void {
  try {
    window.location.assign(targetHref);
    return;
  } catch {}
  try { window.open(targetHref, "_blank", "noopener,noreferrer"); } catch {}
}

function wireOverlayLinks(panel: HTMLDivElement, closeOverlay: () => void): void {
  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLElement>("[data-forge-nav-href]");
    if (!action) return;
    event.preventDefault();
    const targetHref = readString(action.dataset.forgeNavHref) ?? null;
    if (!targetHref || targetHref === "#") return;
    closeOverlay();
    navigateFromOverlay(targetHref);
  });
}

async function openForgeMenuOverlay(): Promise<void> {
  const shell = openNavOverlayShell();
  if (!shell) return;

  const { panel, closeOverlay } = shell;
  const loading = document.createElement("div");
  loading.className = "loading";
  loading.textContent = "Loading navigation...";
  panel.appendChild(loading);

  const payload = await loadForgeNav();
  if (!panel.isConnected) return;

  renderNavPanel(panel, payload);
  wireOverlayLinks(panel, closeOverlay);
}

export function initForgeMenu(opts: ForgeMenuInitOptions = {}): void {
  const mountId = readString(opts.mountId) ?? DEFAULT_MOUNT_ID;
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const win = window as any;
  const readyKey = `${FORGE_NAV_READY_SENTINEL}:${mountId}`;
  if (win[readyKey]) return;
  win[readyKey] = true;

  if (document.getElementById(FORGE_NAV_BUTTON_ID)) return;

  const wrapper = document.createElement("span");
  wrapper.id = FORGE_NAV_WRAPPER_ID;
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.flex = "0 0 auto";
  mount.appendChild(wrapper);

  const button = document.createElement("button");
  button.id = FORGE_NAV_BUTTON_ID;
  button.className = "forge-nav-btn";
  button.type = "button";
  button.textContent = "☰";
  button.setAttribute("aria-label", "Open Nursery menu");
  button.setAttribute("aria-haspopup", "dialog");
  button.title = "Nursery menu";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.width = "34px";
  button.style.height = "34px";
  button.style.minWidth = "34px";
  button.style.minHeight = "34px";
  button.style.padding = "0";
  button.style.boxSizing = "border-box";
  button.style.flex = "0 0 auto";
  button.style.border = "1px solid rgba(255,255,255,0.28)";
  button.style.borderRadius = "10px";
  button.style.background = "rgba(14,20,32,0.92)";
  button.style.color = "rgba(233,240,255,0.96)";
  button.style.cursor = "pointer";
  button.style.fontSize = "18px";
  button.style.fontWeight = "700";
  button.style.lineHeight = "1";
  wrapper.appendChild(button);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (closeForgeMenuOverlay()) return;
    void openForgeMenuOverlay();
  });
}

export function initForgeNavMenu(opts: ForgeMenuInitOptions = {}): void {
  initForgeMenu(opts);
}
