import { useEffect } from "react";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";

export default function AnvilRoute() {
  useEffect(() => {
    window.location.replace(ANVIL_FULL_PAGE_URL);
  }, []);

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Anvil...</h2>
      <a href={ANVIL_FULL_PAGE_URL}>Continue to Anvil</a>
    </section>
  );
}
