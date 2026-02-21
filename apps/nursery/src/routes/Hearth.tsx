import { useEffect } from "react";

const HEARTH_FULL_PAGE_URL = "/apps/hearth";

export default function HearthRoute() {
  useEffect(() => {
    window.location.replace(HEARTH_FULL_PAGE_URL);
  }, []);

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Hearth...</h2>
      <a href={HEARTH_FULL_PAGE_URL}>Continue to Hearth</a>
    </section>
  );
}
