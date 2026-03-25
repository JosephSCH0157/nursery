import type { HenryContext, HenrySurface } from "@forge/shared/henry";
import { resolvePhaseFromPathname } from "../workspace/episodePhases";
import type { EpisodeWorkspaceState } from "../workspace/EpisodeWorkspaceContext";
import type { ForgeRouteContext } from "../lib/forge-route-context";

export function resolveHenrySurface(pathname: string): HenrySurface {
  if (pathname === "/app") return "forge-hub";
  if (pathname.startsWith("/app/barstock") || pathname.startsWith("/app/bar-stock")) return "bar-stock";
  if (pathname.startsWith("/app/hearth") || pathname.startsWith("/apps/hearth")) return "hearth";
  if (pathname.startsWith("/app/tongs") || pathname.startsWith("/app/calendar")) return "tongs";
  if (pathname.startsWith("/app/anvil")) return "anvil";
  if (pathname.startsWith("/app/hammer")) return "hammer";
  if (pathname.startsWith("/app/quench")) return "quench";
  if (pathname.startsWith("/app/ledger")) return "ledger";
  if (pathname.startsWith("/app/settings")) return "settings";
  return "unknown";
}

export function buildHenryContext(args: {
  pathname: string;
  routeContext: ForgeRouteContext;
  episode: EpisodeWorkspaceState | null;
}): HenryContext {
  const surface = resolveHenrySurface(args.pathname);
  const phase = resolvePhaseFromPathname(args.pathname);
  const episode = args.episode;
  const workspaceResolutionState = args.routeContext.hasInvalidWorkspaceId
    ? "missing"
    : args.routeContext.workspaceId
    ? "ready"
    : "missing";

  return {
    surface,
    routePath: args.pathname,
    workspaceId: args.routeContext.workspaceId,
    workpieceId: args.routeContext.workpieceId,
    episodeTitle: episode?.title?.trim() || null,
    phase,
    displayStatus: episode?.displayStatus ?? null,
    episodeContextState: episode?.contextState ?? "none",
    workspaceResolutionState,
  };
}

export function resolveStagePurpose(surface: HenrySurface): string {
  switch (surface) {
    case "bar-stock":
      return "Capture raw ideas quickly without structure pressure.";
    case "hearth":
      return "Shape ideas into recordable scripts.";
    case "tongs":
      return "Coordinate schedules, sessions, and storage context.";
    case "anvil":
      return "Record from approved script context.";
    case "hammer":
      return "Edit recorded material into publishable outputs.";
    case "quench":
      return "Package and publish prepared outputs.";
    case "ledger":
      return "Review outcomes and progress signals.";
    case "forge-hub":
      return "Choose the next tool in your current workflow.";
    case "settings":
      return "Adjust workspace and system behavior safely.";
    default:
      return "Orient to the current Forge surface.";
  }
}
