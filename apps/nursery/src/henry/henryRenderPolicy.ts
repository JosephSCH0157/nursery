import type { LayoutMode } from "@forge/ui-mobile";

export function shouldRenderHenryForPath(pathname: string): boolean {
  return pathname.startsWith("/app")
    || pathname.startsWith("/apps/hearth")
    || pathname.startsWith("/apps/bellows");
}

export function canRenderHenrySurface(args: {
  pathname: string;
  layoutMode: LayoutMode;
}): boolean {
  return args.layoutMode !== "mobile" && shouldRenderHenryForPath(args.pathname);
}
