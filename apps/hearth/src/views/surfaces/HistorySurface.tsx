import type { ReactNode } from "react";

type HistorySurfaceProps = {
  visible: boolean;
  children: ReactNode;
};

export default function HistorySurface({ visible, children }: HistorySurfaceProps) {
  if (!visible) return null;
  return <>{children}</>;
}
