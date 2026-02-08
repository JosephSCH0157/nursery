import { useMemo, useState } from "react";
import { ForgeNav } from "../nav/ForgeNav";
import { anvilNavExtras } from "../nav/anvilNavExtras";
import { composeNav, forgeNavTree } from "../nav/forgeNavTree";

export default function AnvilRoute() {
  const [open, setOpen] = useState(false);
  const anvilMenuTree = useMemo(() => composeNav(forgeNavTree, anvilNavExtras), []);

  return (
    <div style={{ padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Anvil</h2>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-expanded={open}
            aria-label="Toggle Anvil menu"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
          {open && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                zIndex: 20,
                width: 280,
                maxWidth: "min(280px, calc(100vw - 48px))",
                border: "1px solid var(--forge-border)",
                borderRadius: 12,
                background: "var(--forge-bg-elevated)",
                padding: 12,
                boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
              }}
            >
              <ForgeNav tree={anvilMenuTree} onNavigate={() => setOpen(false)} />
            </div>
          )}
        </div>
      </div>

      <p style={{ margin: 0, opacity: 0.78 }}>
        Embedded Anvil placeholder. This page now uses the shared Forge navigation renderer plus Anvil-only menu extras.
      </p>
    </div>
  );
}
