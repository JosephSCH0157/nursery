import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import "./styles/mobile-primitives.css";

import Login from "./routes/Login";
import Signup from "./routes/Signup";
import AppShell from "./routes/AppShell";
import AuthCallback from "./routes/AuthCallback";
import ResetPassword from "./routes/ResetPassword";
import ForgeHub from "./routes/ForgeHub";
import SettingsHome from "./routes/SettingsHome";
import SettingsLayout from "./routes/SettingsLayout";
import SettingsOrg from "./routes/SettingsOrg";
import SettingsOrgTeams from "./routes/SettingsOrgTeams";
import SettingsStorage from "./routes/SettingsStorage";
import TongsRoute from "./routes/Tongs";
import BarstockRoute from "./routes/Barstock";
import Placeholder from "./routes/Placeholder";
import AnvilRoute from "./routes/Anvil";
import HearthRoute from "./routes/Hearth";
import HearthStandalone from "./routes/HearthStandalone";
import IronMineRoute from "./routes/IronMine";
import MobilePrimitivesDemo from "./routes/MobilePrimitivesDemo";
import QuenchRoute from "./routes/Quench";
import SubscriptionsRoute from "./routes/Subscriptions";
import HammerRoute from "./routes/Hammer";
import HammerDevCardsRoute from "./routes/HammerDevCards";
import HammerEditorRoute from "./routes/HammerEditor";
import HammerEditorHarnessRoute from "./routes/HammerEditorHarness";
import HammerLaunchStubRoute from "./routes/HammerLaunchStub";
import HammerRelinkRoute from "./routes/HammerRelink";
import HammerStandalone from "./routes/HammerStandalone";
import { seedTongsRequestTokenBridge } from "./lib/tongs-request-token";

seedTongsRequestTokenBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
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
          <Route path="tongs" element={<TongsRoute />} />
          <Route path="quench" element={<QuenchRoute />} />
          <Route path="ledger" element={<Placeholder name="Ledger" />} />
          <Route path="iron-mine" element={<IronMineRoute />} />
          <Route path="barstock/*" element={<BarstockRoute />} />
          <Route path="bar-stock/*" element={<BarstockRoute />} />
          <Route path="calendar" element={<Placeholder name="Calendar" />} />
          <Route path="subscriptions" element={<SubscriptionsRoute />} />
          <Route path="billing/success" element={<Placeholder name="Billing Success" />} />
          <Route path="billing/cancel" element={<Placeholder name="Billing Cancel" />} />
          <Route path="mobile-demo" element={<MobilePrimitivesDemo />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsHome />} />
            <Route path="org" element={<SettingsOrg />} />
            <Route path="org/teams" element={<SettingsOrgTeams />} />
            <Route path="org/teams/:teamId" element={<SettingsOrgTeams />} />
            <Route path="storage" element={<SettingsStorage />} />
          </Route>
        </Route>

        <Route path="/app/hammer" element={<HammerStandalone />}>
          <Route index element={<HammerRoute />} />
          <Route path="editor" element={<HammerEditorRoute />} />
          <Route path="dev/editor" element={<HammerEditorHarnessRoute />} />
          <Route path="dev/launch" element={<HammerLaunchStubRoute />} />
          <Route path="dev/cards" element={<HammerDevCardsRoute />} />
          <Route path="dev/relink" element={<HammerRelinkRoute />} />
        </Route>

        <Route path="/apps/hearth" element={<HearthStandalone />} />
        <Route path="/hearth" element={<Navigate to="/apps/hearth" replace />} />

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
