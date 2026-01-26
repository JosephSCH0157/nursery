import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AuthGate from "./components/AuthGate";
import Login from "./routes/Login";
import AppShell from "./routes/AppShell";
import AuthCallback from "./routes/AuthCallback";
import ResetPassword from "./routes/ResetPassword";
import ForgeHub from "./routes/ForgeHub";
import SettingsHome from "./routes/SettingsHome";
import SettingsLayout from "./routes/SettingsLayout";
import SettingsStorage from "./routes/SettingsStorage";

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 8 }}>
      <h2>{title}</h2>
      <p>Placeholder route.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/app"
          element={
            <AuthGate>
              <AppShell />
            </AuthGate>
          }
        >
          <Route index element={<ForgeHub />} />
          <Route path="anvil" element={<Placeholder title="Anvil" />} />
          <Route path="hearth" element={<Placeholder title="Hearth" />} />
          <Route path="hammer" element={<Placeholder title="Hammer" />} />
          <Route path="tongs" element={<Placeholder title="Tongs" />} />
          <Route path="quench" element={<Placeholder title="Quench" />} />
          <Route path="ledger" element={<Placeholder title="Ledger" />} />
          <Route path="barstock" element={<Placeholder title="Barstock" />} />
          <Route path="calendar" element={<Placeholder title="Calendar" />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHome />} />
            <Route path="storage" element={<SettingsStorage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
