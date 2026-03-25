import React, { Suspense, lazy } from "react";
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
import Placeholder from "./routes/Placeholder";
import AnvilRoute from "./routes/Anvil";
import IronMineRoute from "./routes/IronMine";
import MobilePrimitivesDemo from "./routes/MobilePrimitivesDemo";
import SubscriptionsRoute from "./routes/Subscriptions";
import { seedTongsRequestTokenBridge } from "./lib/tongs-request-token";
import ForgeNoticeProvider from "./shell/notices/ForgeNoticeProvider";
import RouteFallback from "./components/RouteFallback";
import { EpisodeWorkspaceProvider } from "./workspace/EpisodeWorkspaceContext";
import EpisodeWorkspaceShell from "./shell/EpisodeWorkspaceShell";
import { HenryProvider } from "./henry/HenryProvider";

const TongsRoute = lazy(() => import("./routes/Tongs"));
const BarstockRoute = lazy(() => import("./routes/Barstock"));
const BellowsJoin = lazy(() => import("./routes/BellowsJoin"));
const BellowsStandalone = lazy(() => import("./routes/BellowsStandalone"));
const HearthRoute = lazy(() => import("./routes/Hearth"));
const HearthStandalone = lazy(() => import("./routes/HearthStandalone"));
const QuenchRoute = lazy(() => import("./routes/Quench"));
const SettingsHome = lazy(() => import("./routes/SettingsHome"));
const SettingsLayout = lazy(() => import("./routes/SettingsLayout"));
const SettingsOrg = lazy(() => import("./routes/SettingsOrg"));
const SettingsOrgTeams = lazy(() => import("./routes/SettingsOrgTeams"));
const SettingsStorage = lazy(() => import("./routes/SettingsStorage"));
const HammerRoute = lazy(() => import("./routes/Hammer"));
const HammerDevCardsRoute = lazy(() => import("./routes/HammerDevCards"));
const HammerEditorRoute = lazy(() => import("./routes/HammerEditor"));
const HammerEditorHarnessRoute = lazy(() => import("./routes/HammerEditorHarness"));
const HammerLaunchStubRoute = lazy(() => import("./routes/HammerLaunchStub"));
const HammerRelinkRoute = lazy(() => import("./routes/HammerRelink"));
const HammerStandalone = lazy(() => import("./routes/HammerStandalone"));

seedTongsRequestTokenBridge();

function withRouteFallback(element: React.ReactNode, label: string) {
  return (
    <Suspense fallback={<RouteFallback label={label} />}>
      {element}
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <EpisodeWorkspaceProvider>
      <ForgeNoticeProvider>
      <HenryProvider>
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
            <Route path="bellows" element={<Navigate to="/apps/bellows" replace />} />
            <Route path="anvil/help" element={<Placeholder name="Anvil Help" />} />
            <Route path="anvil/settings" element={<Placeholder name="Anvil Settings" />} />
            <Route path="hearth" element={withRouteFallback(<HearthRoute />, "Loading Hearth...")} />
            <Route path="tongs" element={withRouteFallback(<TongsRoute />, "Loading Tongs...")} />
            <Route path="quench" element={withRouteFallback(<QuenchRoute />, "Loading Quench...")} />
            <Route path="ledger" element={<Placeholder name="Ledger" />} />
            <Route path="iron-mine" element={<IronMineRoute />} />
            <Route path="barstock/*" element={withRouteFallback(<BarstockRoute />, "Loading Barstock...")} />
            <Route path="bar-stock/*" element={withRouteFallback(<BarstockRoute />, "Loading Barstock...")} />
            <Route path="calendar" element={<Placeholder name="Calendar" />} />
            <Route path="subscriptions" element={<SubscriptionsRoute />} />
            <Route path="account" element={<SubscriptionsRoute />} />
            <Route path="mobile-demo" element={<MobilePrimitivesDemo />} />
            <Route path="settings" element={withRouteFallback(<SettingsLayout />, "Loading Settings...")}>
              <Route index element={withRouteFallback(<SettingsHome />, "Loading Settings...")} />
              <Route path="org" element={withRouteFallback(<SettingsOrg />, "Loading Organization Settings...")} />
              <Route path="org/teams" element={withRouteFallback(<SettingsOrgTeams />, "Loading Team Settings...")} />
              <Route path="org/teams/:teamId" element={withRouteFallback(<SettingsOrgTeams />, "Loading Team Settings...")} />
              <Route path="storage" element={withRouteFallback(<SettingsStorage />, "Loading Storage Settings...")} />
            </Route>
          </Route>

            <Route
              path="/app/hammer"
              element={withRouteFallback(
                <EpisodeWorkspaceShell><HammerStandalone /></EpisodeWorkspaceShell>,
                "Loading Hammer...",
              )}
            >
              <Route index element={withRouteFallback(<HammerRoute />, "Loading Hammer...")} />
              <Route path="editor" element={withRouteFallback(<HammerEditorRoute />, "Loading Hammer Editor...")} />
              {import.meta.env.DEV ? (
                <>
                  <Route path="dev/editor" element={withRouteFallback(<HammerEditorHarnessRoute />, "Loading Hammer Dev Harness...")} />
                  <Route path="dev/launch" element={withRouteFallback(<HammerLaunchStubRoute />, "Loading Hammer Dev Launch...")} />
                  <Route path="dev/cards" element={withRouteFallback(<HammerDevCardsRoute />, "Loading Hammer Dev Cards...")} />
                  <Route path="dev/relink" element={withRouteFallback(<HammerRelinkRoute />, "Loading Hammer Dev Relink...")} />
                </>
              ) : null}
            </Route>

          <Route
            path="/apps/hearth"
            element={withRouteFallback(
              <EpisodeWorkspaceShell><HearthStandalone /></EpisodeWorkspaceShell>,
              "Loading Hearth...",
            )}
          />
          <Route path="/apps/bellows/join/:sessionId" element={withRouteFallback(<BellowsJoin />, "Loading Bellows guest entry...")} />
          <Route path="/apps/bellows" element={withRouteFallback(<EpisodeWorkspaceShell><BellowsStandalone /></EpisodeWorkspaceShell>, "Loading Bellows...")} />
          <Route path="/bellows/join/:sessionId" element={withRouteFallback(<BellowsJoin />, "Loading Bellows guest entry...")} />
          <Route path="/bellows" element={<Navigate to="/apps/bellows" replace />} />
          <Route path="/hearth" element={<Navigate to="/apps/hearth" replace />} />

          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </HenryProvider>
      </ForgeNoticeProvider>
      </EpisodeWorkspaceProvider>
    </BrowserRouter>
  </React.StrictMode>
);
