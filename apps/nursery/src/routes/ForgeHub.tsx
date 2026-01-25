import { Link } from "react-router-dom";
import type { ForgeAppId } from "@forge/tongs";

type HubLink = {
  to: string;
  name: string;
  hint: string;
  desc: string;
};

const TOOL_META: Record<ForgeAppId, Omit<HubLink, "to">> = {
  nursery: {
    name: "Nursery",
    hint: "Authentication Hub",
    desc: "Sign in once to unlock the Forge tools.",
  },
  anvil: {
    name: "Anvil",
    hint: "Teleprompter & Recording",
    desc: "Read scripts, record clean audio/video, run sessions.",
  },
  hearth: {
    name: "Hearth",
    hint: "Script Builder",
    desc: "Draft, refine, and structure scripts.",
  },
  hammer: {
    name: "Hammer",
    hint: "Editing & Shorts",
    desc: "Edit episodes, pull clips, produce shorts.",
  },
  quench: {
    name: "Quench",
    hint: "Publishing & Distribution",
    desc: "Export, schedule, and publish to platforms.",
  },
  ledger: {
    name: "Ledger",
    hint: "Analytics & Growth",
    desc: "Track performance, CTR, retention, and insights.",
  },
  barstock: {
    name: "Barstock",
    hint: "Ideas & Captures",
    desc: "Catch sparks and turn them into real work.",
  },
};

function linkFor(appId: ForgeAppId): HubLink {
  return {
    to: `/app/${appId}`,
    ...TOOL_META[appId],
  };
}

const LINKS: HubLink[] = [
  linkFor("anvil"),
  linkFor("hearth"),
  linkFor("hammer"),
  { to: "/app/tongs", name: "Tongs", hint: "Storage & Workflow", desc: "Move work between tools, manage mounts & sessions." },
  linkFor("quench"),
  linkFor("ledger"),
  linkFor("barstock"),
  { to: "/app/calendar", name: "Calendar", hint: "Scheduling & Sessions", desc: "Plan recordings and workflow timing." },
];

export default function ForgeHub() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Segoe UI, Arial, sans-serif" }}>
      <h1 style={{ margin: 0 }}>Podcaster's Forge</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>Choose a tool to get started.</p>

      <div style={{ display: "grid", gap: 12, maxWidth: 820, marginTop: 18 }}>
        {LINKS.map((x) => (
          <Link
            key={x.to}
            to={x.to}
            title={x.hint}
            style={{
              display: "block",
              padding: "14px 16px",
              borderRadius: 12,
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.92)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget.style.background = "rgba(255,255,255,0.07)");
              (e.currentTarget.style.borderColor = "rgba(244,207,160,0.35)");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style.background = "rgba(255,255,255,0.04)");
              (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)");
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>{x.name}</div>
              <div style={{ opacity: 0.75, fontSize: 13 }}>{x.hint}</div>
            </div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 14, lineHeight: 1.35 }}>{x.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
