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
const FORGE_NAV_POPUP_NAME = "forgeNavPopup";
const FORGE_NAV_POPUP_TITLE = "Nursery Menu";
const FORGE_NAV_TREE_ID = "tree";
const FORGE_NAV_POPUP_WIDTH = 420;
const FORGE_NAV_POPUP_HEIGHT = 720;

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

function showPopupBlockedNotice(): void {
  const message = "Nursery menu popup blocked. Allow popups for this site.";
  try {
    const win = window as any;
    if (typeof win.toast === "function") {
      win.toast(message, { type: "warn" });
      return;
    }
  } catch {}
  try { console.warn(`[forge-nav] ${message}`); } catch {}
}

function buildPopupPlacement() {
  const width = FORGE_NAV_POPUP_WIDTH;
  const height = FORGE_NAV_POPUP_HEIGHT;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  return { width, height, left, top, features };
}

function openNavPopupWindow(): Window | null {
  try {
    const placement = buildPopupPlacement();
    const popup = window.open("", FORGE_NAV_POPUP_NAME, placement.features);
    if (!popup) return null;
    try { popup.resizeTo(placement.width, placement.height); } catch {}
    try { popup.moveTo(placement.left, placement.top); } catch {}
    try { popup.focus(); } catch {}
    return popup;
  } catch {
    return null;
  }
}

function writePopupShell(popup: Window): HTMLDivElement | null {
  try {
    const doc = popup.document;
    doc.open();
    doc.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${FORGE_NAV_POPUP_TITLE}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; pointer-events: auto; }
    html, body, #root { margin: 0; padding: 0; height: 100vh; }
    body { background: #0b1020; color: #eaf0ff; font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #root { overflow: auto; }
    .forge-nav-popup { min-height: 100%; padding: 14px; }
    .forge-nav-popup h1 { margin: 0 0 10px; font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
    #${FORGE_NAV_TREE_ID} { position: relative; z-index: 2; }
    .forge-nav-popup button[data-forge-nav-link='1']:hover { background: rgba(90, 160, 255, 0.24) !important; }
    .forge-nav-popup hr { border: none; border-top: 1px solid rgba(255,255,255,0.16); margin: 12px 0; }
    .forge-nav-popup .loading { opacity: 0.8; font-size: 12px; }
    .forge-nav-popup .hint { margin-top: 10px; opacity: 0.72; font-size: 12px; }
  </style>
</head>
<body>
  <div id="root">
  <div class="forge-nav-popup">
    <h1>${FORGE_NAV_POPUP_TITLE}</h1>
    <div id="${FORGE_NAV_TREE_ID}" role="menu" aria-label="Forge navigation"></div>
    <div class="hint">Selecting an item opens it in the Anvil tab and closes this popup.</div>
  </div>
  </div>
</body>
</html>`);
    doc.close();
    return doc.getElementById(FORGE_NAV_TREE_ID) as HTMLDivElement | null;
  } catch {
    return null;
  }
}

function navigateFromPopup(popup: Window, targetHref: string): void {
  const openerWin = popup.opener && !popup.opener.closed ? popup.opener : null;
  try {
    if (openerWin) {
      // Access check first to avoid cross-origin throws during assign.
      void openerWin.location.href;
      openerWin.location.assign(targetHref);
      try { popup.close(); } catch {}
      return;
    }
  } catch {
    // fall through to new-tab fallback
  }

  try {
    popup.open(targetHref, "_blank", "noopener,noreferrer");
  } catch {
    try { window.open(targetHref, "_blank", "noopener,noreferrer"); } catch {}
  }
  try { popup.close(); } catch {}
}

function wirePopupLinks(panel: HTMLDivElement, popup: Window): void {
  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>("[data-forge-nav-href]");
    if (!action) return;
    event.preventDefault();
    const targetHref = readString(action.dataset.forgeNavHref) ?? null;
    if (!targetHref || targetHref === "#") return;
    navigateFromPopup(popup, targetHref);
  });
}

async function openForgeMenuPopup(): Promise<void> {
  const popup = openNavPopupWindow();
  if (!popup) {
    showPopupBlockedNotice();
    return;
  }

  const panel = writePopupShell(popup);
  if (!panel) return;

  const loading = popup.document.createElement("div");
  loading.className = "loading";
  loading.textContent = "Loading navigation...";
  panel.appendChild(loading);

  const payload = await loadForgeNav();
  if (popup.closed) return;

  renderNavPanel(panel, payload);
  wirePopupLinks(panel, popup);
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
  button.setAttribute("aria-label", "Open Nursery menu popup");
  button.setAttribute("aria-haspopup", "dialog");
  button.title = "Nursery menu popup";
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
    void openForgeMenuPopup();
  });
}

export function initForgeNavMenu(opts: ForgeMenuInitOptions = {}): void {
  initForgeMenu(opts);
}
