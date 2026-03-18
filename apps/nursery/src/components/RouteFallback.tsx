import "./RouteFallback.css";

export default function RouteFallback({ label }: { label: string }) {
  return (
    <section aria-live="polite" className="route-fallback">
      <div className="route-fallback__content">
        <h2 className="route-fallback__title">{label}</h2>
        <p className="route-fallback__copy">
          Bringing the tool online for this route.
        </p>
      </div>
    </section>
  );
}
