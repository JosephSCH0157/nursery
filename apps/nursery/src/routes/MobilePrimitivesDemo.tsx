import { useState } from "react";
import { MobilePage, useLayoutMode } from "@forge/ui-mobile";
import "./MobilePrimitivesDemo.css";

export default function MobilePrimitivesDemo() {
  const layoutMode = useLayoutMode();
  const [title, setTitle] = useState("Sprint 1 mobile contract");

  return (
    <MobilePage
      title="Mobile Primitives Demo"
      rightAction={
        <button type="button" className="mpd-button mpd-button--ghost mobile-tap-target">
          Help
        </button>
      }
      bottomBar={
        <div className="mpd-bottom-actions">
          <button type="button" className="mpd-button mpd-button--ghost mobile-tap-target">
            Attach
          </button>
          <button type="button" className="mpd-button mpd-button--primary mobile-tap-target">
            Save
          </button>
        </div>
      }
    >
      <div className="mobile-stack">
        <section className="mpd-card">
          <h2 className="mpd-heading">Layout Mode</h2>
          <p className="mpd-copy">
            Current mode: <strong>{layoutMode}</strong>
          </p>
          <p className="mpd-copy">
            Resize between mobile, tablet, and desktop to verify the shared behavior updates on viewport changes.
          </p>
        </section>

        <section className="mpd-card">
          <h2 className="mpd-heading">16px Inputs + 44px Taps</h2>
          <label className="mpd-field">
            <span>Draft Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="mpd-field">
            <span>Status</span>
            <select defaultValue="open">
              <option value="open">Open</option>
              <option value="warming">Warming</option>
              <option value="forged">Forged</option>
            </select>
          </label>
          <button type="button" className="mpd-button mpd-button--ghost mobile-tap-target">
            Secondary Action
          </button>
        </section>
      </div>
    </MobilePage>
  );
}
