import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HenryProvider } from "./HenryProvider";

export function HenryRouteBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (location.pathname === "/app/hammer/acceptance") return children;
  return <HenryProvider>{children}</HenryProvider>;
}
