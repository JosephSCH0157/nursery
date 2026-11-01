import { Link, useLocation } from "react-router-dom";
import "./Login.css";

function nextPath(search: string): string {
  const value = new URLSearchParams(search).get("next")?.trim();
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export default function Signup() {
  const location = useLocation();
  const next = nextPath(location.search);
  return (
    <main className="forge-login-page">
      <div className="forge-login-page__brand">Podcaster&apos;s <span>Forge</span></div>
      <section className="forge-login-page__video-shell" aria-label="Anvil intro video">
        <iframe
          src="https://www.youtube-nocookie.com/embed/lH1E6ojjSsg?rel=0&modestbranding=1"
          title="Anvil intro and demo"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </section>
      <section className="forge-login-page__panel">
        <div className="forge-login-card">
          <h1 className="forge-login-card__title">Forge is invitation-only</h1>
          <p className="forge-login-card__subtitle">
            New accounts are created from an approved beta invitation. Public account creation is retired.
          </p>
          <p className="forge-login-card__meta">Private beta · invitation required</p>
          <div className="forge-login-card__actions">
            <Link className="forge-login-card__back" to={`/login?next=${encodeURIComponent(next)}`}>
              Sign in
            </Link>
            <a className="forge-login-card__beta" href="/beta/index.html">Apply for beta</a>
          </div>
          <div className="forge-login-card__notice" role="status">
            Already approved? Open the invitation email sent by Forge to finish your account.
          </div>
        </div>
      </section>
    </main>
  );
}
