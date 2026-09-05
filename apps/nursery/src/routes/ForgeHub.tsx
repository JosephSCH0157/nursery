import { Link, useOutletContext } from "react-router-dom";
import type { ForgeAppId } from "@forge/tongs";
import type { AppShellContext } from "./AppShell";
import "./ForgeHub.css";

type HubLink = {
  to?: string;
  href?: string;
  name: string;
  hint: string;
  desc: string;
  underConstruction?: boolean;
};

const TOOL_META: Record<ForgeAppId, Omit<HubLink, "to" | "href">> = {
  nursery: {
    name: "The Forge",
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
  linkFor("barstock"),
  {
    to: "/app/hearth",
    ...TOOL_META.hearth,
  },
  {
    to: "/app/tongs",
    name: "Tongs (Calendar)",
    hint: "Storage & Sessions",
    desc: "Plan recordings, manage mounts, and move work between tools.",
  },
  {
    to: "/app/anvil",
    ...TOOL_META.anvil,
  },
  {
    to: "/apps/bellows",
    name: "Bellows",
    hint: "Remote Production Studio",
    desc: "Record locally with recovery custody and verified Hammer handoff. Desktop Chromium certification is in progress.",
    underConstruction: false,
  },
  {
    ...linkFor("hammer"),
    underConstruction: true,
  },
  {
    ...linkFor("quench"),
  },
  {
    ...linkFor("ledger"),
    underConstruction: true,
  },
  {
    to: "/app/iron-mine",
    name: "Iron Mine",
    hint: "Community forum (Discord)",
    desc: "Join the Podcaster's Forge community in Discord.",
  },
];

export default function ForgeHub() {
  const shell = useOutletContext<AppShellContext>();
  const session = shell?.session ?? null;
  const showBackdrop = !!session;

  return (
    <div className={`forge-hub${showBackdrop ? " is-backed" : ""}`}>
      {showBackdrop ? (
        <div aria-hidden className="forge-hub__backdrop" />
      ) : null}
      <div className="forge-hub__content">
      <h1 className="forge-hub__title">Podcaster's Forge</h1>
      <p className="forge-hub__subtitle">Choose a tool to get started.</p>
      {!session ? (
        <div className="forge-hub__trial-banner">
          Anonymous trial mode: explore the workspace and tools with limited access.{" "}
          <Link to={`/login?next=${encodeURIComponent("/app")}`}>Sign in</Link> to unlock full features.
        </div>
      ) : null}

      <div className="forge-hub__grid">
        {LINKS.map((x) => (
          x.href ? (
            <a
              key={x.href}
              href={x.href}
              title={x.hint}
              className="forge-hub__card"
            >
              <div className="forge-hub__card-header">
                <div className="forge-hub__card-title">{x.name}</div>
                <div className="forge-hub__card-hint">{x.hint}</div>
              </div>
              {x.underConstruction ? (
                <div className="forge-hub__card-status" aria-label="Under Construction" title="Under Construction">UC</div>
              ) : null}
              <div className="forge-hub__card-desc">{x.desc}</div>
            </a>
          ) : (
            <Link
              key={x.to}
              to={x.to ?? "/app"}
              title={x.hint}
              className="forge-hub__card"
            >
              <div className="forge-hub__card-header">
                <div className="forge-hub__card-title">{x.name}</div>
                <div className="forge-hub__card-hint">{x.hint}</div>
              </div>
              {x.underConstruction ? (
                <div className="forge-hub__card-status" aria-label="Under Construction" title="Under Construction">UC</div>
              ) : null}
              <div className="forge-hub__card-desc">{x.desc}</div>
            </Link>
          )
        ))}
      </div>
      </div>
    </div>
  );
}
