export default function RouteFallback({ label }: { label: string }) {
  return (
    <section
      aria-live="polite"
      style={{
        minHeight: "32vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 24px",
      }}
    >
      <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>{label}</h2>
        <p style={{ margin: 0, opacity: 0.72 }}>
          Bringing the tool online for this route.
        </p>
      </div>
    </section>
  );
}
