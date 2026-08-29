/**
 * command-center/src/components/DashboardShell.tsx
 * ──────────────────────────────────────────────────
 * Top bar + collapsible sidebar + page content layout for the dashboard.
 */

import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

const NAV_SECTIONS = [
  {
    label: "Monitoring",
    items: [
      { path: "/dashboard", icon: "◈", label: "Overview", end: true },
      { path: "/dashboard/negotiations", icon: "⇄", label: "Negotiations" },
      { path: "/dashboard/coalitions", icon: "◎", label: "Coalitions" },
      { path: "/dashboard/grid", icon: "⟁", label: "Grid Topology" },
      { path: "/dashboard/oracle", icon: "◉", label: "Oracle" },
    ],
  },
  {
    label: "Assets & Settlement",
    items: [
      { path: "/dashboard/ders", icon: "⬡", label: "DER Assets" },
      { path: "/dashboard/settlements", icon: "▣", label: "Settlements" },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/dashboard/audit", icon: "⌁", label: "Audit Chain" },
      { path: "/dashboard/experiments", icon: "⊗", label: "Experiments" },
      { path: "/dashboard/health", icon: "◌", label: "System Health" },
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

        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>
          ← Landing
        </button>
      </header>

      <div className="main-body">
        {/* Sidebar */}
        <nav className={`sidebar${collapsed ? " collapsed" : ""}`} role="navigation" aria-label="Dashboard navigation">
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
        </nav>

        {/* Page content */}
        <main className="page-content" role="main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
