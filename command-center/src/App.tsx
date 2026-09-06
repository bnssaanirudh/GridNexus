/**
 * command-center/src/App.tsx
 * ───────────────────────────
 * Root application with React Router v6 routing + Auth context.
 * Routes:
 *   /         → Landing page
 *   /login    → Auth page
 *   /dashboard/* → Protected dashboard
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useState, useEffect } from "react";

import LandingPage    from "./pages/LandingPage";
import LoginPage      from "./pages/LoginPage";
import DashboardShell from "./components/DashboardShell";
import OverviewPage   from "./pages/OverviewPage";
import AuthGuard      from "./components/AuthGuard";
import {
  AuthContext,
  useAuth,
  type AuthUser,
  getStoredUser,
  isAuthenticated,
  apiLogin,
  apiRegister,
  logout as doLogout,
  apiGetMe,
  getToken,
} from "./lib/auth";

// Lazy-loaded dashboard pages
const MyAgentPage         = lazy(() => import("./pages/MyAgentPage"));
const NegotiationFeedPage = lazy(() => import("./pages/NegotiationFeedPage"));
const CoalitionsPage      = lazy(() => import("./pages/CoalitionsPage"));
const GridPage            = lazy(() => import("./pages/GridPage"));
const OraclePage          = lazy(() => import("./pages/OraclePage"));
const DERAssetsPage       = lazy(() => import("./pages/DERAssetsPage"));
const SettlementsPage     = lazy(() => import("./pages/SettlementsPage"));
const AuditPage           = lazy(() => import("./pages/AuditPage"));
const ExperimentsPage     = lazy(() => import("./pages/ExperimentsPage"));
const SystemHealthPage    = lazy(() => import("./pages/SystemHealthPage"));
const WorkflowPage        = lazy(() => import("./pages/WorkflowPage"));
const AdminOnboardingPage = lazy(() => import("./pages/AdminOnboardingPage"));
const AdminOraclePage     = lazy(() => import("./pages/AdminOraclePage"));

function DashboardIndex() {
  const { user } = useAuth();
  if (user?.role?.toUpperCase() === "DER_OWNER") {
    return <Navigate to="/dashboard/my-agent" replace />;
  }
  return <OverviewPage />;
}

function PageLoader() {
  return (
    <div style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="skeleton" style={{ height: "24px", width: "200px", borderRadius: "var(--radius-sm)" }} />
      <div className="skeleton" style={{ height: "14px", width: "300px", borderRadius: "var(--radius-sm)" }} />
      <div className="kpi-grid" style={{ marginTop: "var(--space-4)" }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ padding: "var(--space-5)", background: "var(--bg-white)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="skeleton" style={{ height: "11px", width: "80%" }} />
            <div className="skeleton" style={{ height: "32px", width: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);

  useEffect(() => {
    if (!isAuthenticated()) {
      setUser(null);
      return;
    }
    const stored = getStoredUser();
    if (stored) setUser(stored);
    if (getToken() === "mock.jwt.token") return;

    let active = true;
    void apiGetMe()
      .then((verified) => { if (active) setUser(verified); })
      .catch(() => {
        if (!active) return;
        doLogout();
        setUser(null);
      });
    return () => { active = false; };
  }, []);

  const login = async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    setUser(result.user);
  };

  const register = async (username: string, email: string, password: string) => {
    const result = await apiRegister(username, email, password);
    setUser(result.user);
  };

  const logout = () => {
    doLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authenticated: isAuthenticated(),
        login,
        register,
        logout,
        setUser,
      }}
    >
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/"      element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected dashboard */}
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardShell />
              </AuthGuard>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="my-agent" element={
              <Suspense fallback={<PageLoader />}><MyAgentPage /></Suspense>
            } />
            <Route path="workflow" element={
              <Suspense fallback={<PageLoader />}><WorkflowPage /></Suspense>
            } />
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
            <Route path="trades" element={
              <Suspense fallback={<PageLoader />}><NegotiationFeedPage /></Suspense>
            } />
            <Route path="preferences" element={
              <Suspense fallback={<PageLoader />}><MyAgentPage /></Suspense>
            } />
            <Route path="topology" element={
              <Suspense fallback={<PageLoader />}><GridPage /></Suspense>
            } />
            <Route path="admin-onboarding" element={
              <Suspense fallback={<PageLoader />}><AdminOnboardingPage /></Suspense>
            } />
            <Route path="admin-oracle" element={
              <Suspense fallback={<PageLoader />}><AdminOraclePage /></Suspense>
            } />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
