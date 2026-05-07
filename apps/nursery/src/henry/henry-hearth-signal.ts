import {
  HENRY_HEARTH_SIGNAL_EVENT,
  type HearthHenrySignal,
} from "@forge/shared/henry";
import type { ForgeRouteContext } from "../lib/forge-route-context";

function isSameId(left: string | null, right: string | null): boolean {
  if (!left && !right) return true;
  return left === right;
}

export function emitHearthHenrySignal(signal: HearthHenrySignal): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HearthHenrySignal>(HENRY_HEARTH_SIGNAL_EVENT, { detail: signal }));
}

export function readHearthHenrySignal(event: Event): HearthHenrySignal | null {
  const custom = event as CustomEvent<HearthHenrySignal>;
  const detail = custom?.detail;
  if (!detail || detail.surface !== "hearth") return null;
  return detail;
}

export function matchesHearthSignalRoute(
  signal: HearthHenrySignal | null,
  routeContext: ForgeRouteContext,
): boolean {
  if (!signal) return false;
  const workspaceMatches = isSameId(signal.workspaceId, routeContext.workspaceId);
  const workpieceMatches = isSameId(signal.workpieceId, routeContext.workpieceId);
  return workspaceMatches && workpieceMatches;
}

