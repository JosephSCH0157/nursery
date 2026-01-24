import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import Login from "./routes/Login";
import AppShell from "./routes/AppShell";
import Placeholder from "./routes/Placeholder";
import { AuthGate } from "./components/AuthGate";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/app"
          element={
            <AuthGate>
              <AppShell />
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="/app/barstock" replace />} />
          <Route path="barstock" element={<Placeholder name="Bar-Stock" />} />
          <Route path="anvil" element={<Placeholder name="Anvil" />} />
          <Route path="hearth" element={<Placeholder name="Hearth" />} />
          <Route path="hammer" element={<Placeholder name="Hammer" />} />
          <Route path="quench" element={<Placeholder name="Quench" />} />
          <Route path="ironmine" element={<Placeholder name="IronMine" />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
