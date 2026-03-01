import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";

import Login from "./routes/Login";
import AppShell from "./routes/AppShell";
import AuthCallback from "./routes/AuthCallback";
import ResetPassword from "./routes/ResetPassword";
import ForgeHub from "./routes/ForgeHub";
import SettingsHome from "./routes/SettingsHome";
import SettingsLayout from "./routes/SettingsLayout";
import SettingsStorage from "./routes/SettingsStorage";
import TongsRoute from "./routes/Tongs";
import BarstockRoute from "./routes/Barstock";
import Placeholder from "./routes/Placeholder";
import AnvilRoute from "./routes/Anvil";
import HearthRoute from "./routes/Hearth";
import HearthStandalone from "./routes/HearthStandalone";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/app"
          element={<AppShell />}
        >
          <Route index element={<ForgeHub />} />
          <Route path="anvil" element={<AnvilRoute />} />
          <Route path="anvil/help" element={<Placeholder name="Anvil Help" />} />
          <Route path="anvil/settings" element={<Placeholder name="Anvil Settings" />} />
          <Route path="hearth" element={<HearthRoute />} />
          <Route path="hammer" element={<Placeholder name="Hammer" />} />
          <Route path="tongs" element={<TongsRoute />} />
          <Route path="quench" element={<Placeholder name="Quench" />} />
          <Route path="ledger" element={<Placeholder name="Ledger" />} />
          <Route path="barstock" element={<BarstockRoute />} />
          <Route path="calendar" element={<Placeholder name="Calendar" />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHome />} />
            <Route path="storage" element={<SettingsStorage />} />
          </Route>
        </Route>

        <Route path="/apps/hearth" element={<HearthStandalone />} />
        <Route path="/hearth" element={<Navigate to="/apps/hearth" replace />} />

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
