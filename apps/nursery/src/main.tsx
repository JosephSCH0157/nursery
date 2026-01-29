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
import TongsCalendar from "./routes/TongsCalendar";
import BarstockRoute from "./routes/Barstock";
import Placeholder from "./routes/Placeholder";

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
          <Route path="anvil" element={<Placeholder name="Anvil" />} />
          <Route path="hearth" element={<Placeholder name="Hearth" />} />
          <Route path="hammer" element={<Placeholder name="Hammer" />} />
          <Route path="tongs" element={<TongsCalendar />} />
          <Route path="quench" element={<Placeholder name="Quench" />} />
          <Route path="ledger" element={<Placeholder name="Ledger" />} />
          <Route path="barstock" element={<BarstockRoute />} />
          <Route path="calendar" element={<Placeholder name="Calendar" />} />
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
