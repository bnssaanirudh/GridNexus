/**
 * command-center/src/components/DashboardShell.tsx
 * ──────────────────────────────────────────────────
 * Top bar + collapsible sidebar + page content layout for the dashboard.
 * Updated with user profile, logout, and Kononenko light theme.
 */

import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_SECTIONS = [
  {
    label: "Monitoring",
    items: [
      { path: "/dashboard",              icon: "◈", label: "Overview",       end: true },
      { path: "/dashboard/workflow",     icon: "⎈", label: "System Workflow" },
      { path: "/dashboard/negotiations", icon: "⇄", label: "Negotiations" },
      { path: "/dashboard/coalitions",   icon: "◎", label: "Coalitions" },
      { path: "/dashboard/grid",         icon: "⟁", label: "Grid Topology" },
      { path: "/dashboard/oracle",       icon: "◉", label: "Oracle" },
    ],
  },
  {
    label: "Assets & Settlement",
    items: [
      { path: "/dashboard/ders",         icon: "⬡", label: "DER Assets" },
      { path: "/dashboard/settlements",  icon: "▣", label: "Settlements" },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/dashboard/audit",        icon: "⌁", label: "Audit Chain" },
      { path: "/dashboard/experiments",  icon: "⊗", label: "Experiments" },
      { path: "/dashboard/health",       icon: "◌", label: "System Health" },
    ],
  },
];

function useClock() {
  const [time, setTime] = useState(() => new Date().toUTCString().slice(17, 25));
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toUTCString().slice(17, 25)), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const MODE = (import.meta as any).env?.VITE_GRIDNEXUS_MODE ?? "simulation";

export default function DashboardShell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const clock = useClock();
  const isSimulation = MODE === "simulation";
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // User initials for avatar
  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "G";

  return (
    <div className="app-shell">
      {/* Simulation banner */}
      {isSimulation && (
        <div className="simulation-banner" role="alert" aria-live="polite">
          <span>⚠</span>
          <span>SIMULATION ENVIRONMENT — VALUES ARE NOT LIVE GRID DATA</span>
        </div>
      )}

      {/* Top bar */}
      <header className="topbar" role="banner">
        <button
          className="btn btn-ghost btn-icon-only"
          onClick={() => setCollapsed(c => !c)}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <span aria-hidden="true" style={{ fontSize: "16px" }}>☰</span>
        </button>

        <a className="topbar-logo" href="/" aria-label="GridNexus Home">
          <div className="topbar-logo-mark" aria-hidden="true" />
          <span className="topbar-logo-text">GridNexus</span>
        </a>

        <div className="topbar-divider" />

        <div
          className={`env-badge ${isSimulation ? "env-badge--simulation" : "env-badge--live"}`}
          aria-label={`Environment: ${MODE}`}
          title={`GRIDNEXUS_MODE=${MODE}`}
        >
          {MODE.toUpperCase()}
        </div>

        <div className="topbar-spacer" />

        <span className="topbar-clock" aria-label="UTC time">{clock} UTC</span>

        <div className="topbar-divider" />

        {/* User profile */}
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <div className="topbar-user" title={user.username}>
              <div className="topbar-avatar" aria-hidden="true">{initials}</div>
              <span className="topbar-username">{user.username}</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>
              ← Home
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate("/login")}>
              Sign In
            </button>
          </div>
        )}
      </header>

      <div className="main-body">
        {/* Sidebar */}
        <nav
          className={`sidebar${collapsed ? " collapsed" : ""}`}
          role="navigation"
          aria-label="Dashboard navigation"
        >
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-item-text">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          {/* Sidebar footer */}
          {!collapsed && (
            <div style={{
              marginTop: "auto",
              padding: "var(--space-4) var(--space-5)",
              borderTop: "1px solid var(--border-light)",
            }}>
              {user ? (
                <div style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
                  <div style={{ fontWeight: 500, color: "var(--fg-secondary)", marginBottom: "2px" }}>
                    {user.username}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.04em" }}>
                    {user.role ?? "researcher"}
                  </div>
                </div>
              ) : (
                <a href="/" style={{ fontSize: "11px", color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                  ← Back to landing
                </a>
              )}
            </div>
          )}
        </nav>

        {/* Page content */}
        <main className="page-content" role="main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
