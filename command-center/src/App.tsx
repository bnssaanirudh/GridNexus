/**
 * command-center/src/App.tsx
 * ───────────────────────────
 * Root application with React Router v6 routing.
 * Routes:
 *   /              → Landing page
 *   /dashboard     → Dashboard shell
 *   /dashboard/*   → Nested pages
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";

// Immediately loaded
import LandingPage from "./pages/LandingPage";
import DashboardShell from "./components/DashboardShell";
import OverviewPage from "./pages/OverviewPage";

// Lazy-loaded dashboard pages
const NegotiationFeedPage = lazy(() => import("./pages/NegotiationFeedPage"));
const CoalitionsPage      = lazy(() => import("./pages/CoalitionsPage"));
const GridPage            = lazy(() => import("./pages/GridPage"));
const OraclePage          = lazy(() => import("./pages/OraclePage"));
const DERAssetsPage       = lazy(() => import("./pages/DERAssetsPage"));
const SettlementsPage     = lazy(() => import("./pages/SettlementsPage"));
const AuditPage           = lazy(() => import("./pages/AuditPage"));
const ExperimentsPage     = lazy(() => import("./pages/ExperimentsPage"));
const SystemHealthPage    = lazy(() => import("./pages/SystemHealthPage"));

function PageLoader() {
  return (
    <div style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="skeleton" style={{ height: "24px", width: "200px", borderRadius: "var(--radius-sm)" }} />
      <div className="skeleton" style={{ height: "14px", width: "300px", borderRadius: "var(--radius-sm)" }} />
      <div className="kpi-grid" style={{ marginTop: "var(--space-4)" }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ padding: "var(--space-5)", background: "var(--bg-card)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="skeleton" style={{ height: "11px", width: "80%" }} />
            <div className="skeleton" style={{ height: "32px", width: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Dashboard shell with nested pages */}
        <Route path="/dashboard" element={<DashboardShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="negotiations" element={
            <Suspense fallback={<PageLoader />}><NegotiationFeedPage /></Suspense>
          } />
          <Route path="coalitions" element={
            <Suspense fallback={<PageLoader />}><CoalitionsPage /></Suspense>
          } />
          <Route path="grid" element={
            <Suspense fallback={<PageLoader />}><GridPage /></Suspense>
          } />
          <Route path="oracle" element={
            <Suspense fallback={<PageLoader />}><OraclePage /></Suspense>
          } />
          <Route path="ders" element={
            <Suspense fallback={<PageLoader />}><DERAssetsPage /></Suspense>
          } />
          <Route path="settlements" element={
            <Suspense fallback={<PageLoader />}><SettlementsPage /></Suspense>
          } />
          <Route path="audit" element={
            <Suspense fallback={<PageLoader />}><AuditPage /></Suspense>
          } />
          <Route path="experiments" element={
            <Suspense fallback={<PageLoader />}><ExperimentsPage /></Suspense>
          } />
          <Route path="health" element={
            <Suspense fallback={<PageLoader />}><SystemHealthPage /></Suspense>
          } />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
