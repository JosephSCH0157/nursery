import { Outlet, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import "./SettingsLayout.css";

export default function SettingsLayout() {
  const shell = useOutletContext<AppShellContext>();

  return (
    <section className="settings-layout">
      <header>
        <h2 className="settings-layout__title">Settings</h2>
        <p className="settings-layout__copy">
          Configure storage, identity, and workspace defaults in one place.
        </p>
      </header>
      <div className="settings-layout__content">
        <Outlet context={shell} />
      </div>
    </section>
  );
}
