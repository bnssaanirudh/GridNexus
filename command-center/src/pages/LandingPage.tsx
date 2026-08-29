/**
 * command-center/src/pages/LandingPage.tsx
 * ─────────────────────────────────────────
 * GridNexus public landing page.
 * Inspired by Sharplink.com: Archivo typeface, sharp geometry, pin-dot corners,
 * electric blue accent, mono labels, immersive hero with grid background.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ── Animated counter hook ──────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1800, suffix = "") {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
          else setValue(target);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { ref, display: `${value}${suffix}` };
}

/* ── Scroll reveal hook ─────────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Ticker items ───────────────────────────────────────────────────────── */
const TICKER = [
  "P2P Energy Trading", "Game-Theoretic Coalition Formation", "DQN Safety Guard",
  "LinDistFlow Power Verification", "LLM-Negotiated Contracts", "Cryptographic Audit Chain",
  "IEEE 33-Bus & 69-Bus Support", "MAPPO Oracle Inference", "Bayesian Belief Updates",
  "VPP Coordination", "Settlement Idempotency", "Least-Core Stability",
  "P2P Energy Trading", "Game-Theoretic Coalition Formation", "DQN Safety Guard",
  "LinDistFlow Power Verification", "LLM-Negotiated Contracts", "Cryptographic Audit Chain",
];

/* ── Features data ──────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: "⚡",
    title: "P2P Energy Negotiation",
    desc: "LLM-driven bilateral bargaining with Rubinstein alternating-offers, DQN safety override, and schema validation on every round."
  },
  {
    icon: "🔮",
    title: "Oracle Intelligence",
    desc: "REINFORCE-trained Oracle broadcasts market signals. RAG pipeline enriches context with verified external weather and grid data."
  },
  {
    icon: "🏛",
    title: "Coalition Stability",
    desc: "Network-aware VPP coalition value model with market revenue, congestion cost, battery degradation, and least-core epsilon bounds."
  },
  {
    icon: "⚙",
    title: "Grid Physics Certification",
    desc: "LinDistFlow power flow solver produces signed feasibility certificates. No settlement commits without passing grid verification."
  },
  {
    icon: "🔐",
    title: "Cryptographic Audit Chain",
    desc: "Every negotiation event appends to an immutable SHA-256 hash chain. Append-only DB trigger prevents deletion or mutation."
  },
  {
    icon: "📊",
    title: "Research Benchmark Suite",
    desc: "10 baselines, 10 scenarios, IEEE 33/69-bus configs, 5–250 DER scaling. Generates publication-grade plots and LaTeX tables."
  },
];

/* ── StatCounter ────────────────────────────────────────────────────────── */
function StatCounter({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, display } = useCountUp(value, 1800, suffix);
  return (
    <div className="hero-stat" ref={ref as any}>
      <span className="hero-stat-value">{display}</span>
      <span className="hero-stat-label">{label}</span>
    </div>
  );
}

/* ── Main Landing Page ──────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useScrollReveal();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div style={{ background: "var(--bg-void)", minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      {/* Noise texture */}
      <div className="noise-overlay" />

      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <nav className={`landing-nav${scrolled ? " scrolled" : ""}`} role="navigation">
        <a href="/" className="nav-logo" aria-label="GridNexus Home">
          <div className="nav-logo-mark" aria-hidden="true" />
          <span className="nav-logo-text">GridNexus</span>
        </a>
        <ul className="nav-links" aria-label="Navigation">
          <li><a href="#platform" className="nav-link">Platform</a></li>
          <li><a href="#features" className="nav-link">Features</a></li>
          <li><a href="#research" className="nav-link">Research</a></li>
          <li><a href="#audit" className="nav-link">Audit</a></li>
        </ul>
        <div className="nav-cta">
          <div className="env-badge env-badge--simulation">Simulation Mode</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/dashboard")}>
            Open Dashboard →
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero" id="hero" aria-label="Hero">
        <div className="grid-bg" />
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-glow-secondary" aria-hidden="true" />

        {/* Animated particles */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="particle"
            aria-hidden="true"
            style={{
              left: `${10 + i * 12}%`,
              top: `${20 + (i % 3) * 20}%`,
              animationDuration: `${4 + i * 0.7}s`,
              animationDelay: `${i * 0.5}s`,
              opacity: 0.3 + (i % 3) * 0.2,
            }}
          />
        ))}

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            <span className="text-mono" style={{ color: "var(--brand-blue)", fontSize: "11px" }}>
              Energy 5.0 · VPP Coordination Platform
            </span>
          </div>

          <h1 className="hero-title">
            The Grid<br />
            <span className="hero-title-accent">Renegotiated.</span>
          </h1>

          <p className="hero-subtitle">
            GridNexus is a research-grade Virtual Power Plant coordination platform
            combining game-theoretic negotiation, AI safety enforcement, and
            cryptographically auditable settlement on real distribution networks.
          </p>

          <div className="hero-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate("/dashboard")}
              id="hero-open-dashboard"
            >
              Open Command Center
              <span aria-hidden="true">→</span>
            </button>
            <a href="#features" className="btn btn-outline btn-lg">
              Explore Platform
            </a>
          </div>

          {/* Stats strip */}
          <div className="hero-stats" aria-label="Platform statistics">
            <StatCounter value={250} suffix="+" label="DER Agents Supported" />
            <StatCounter value={10} suffix="" label="Negotiation Baselines" />
            <StatCounter value={33} suffix="-Bus" label="IEEE Network Configs" />
            <StatCounter value={100} suffix="%" label="Audit Immutability" />
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────────────── */}
      <div className="ticker-wrap" aria-hidden="true">
        <div className="ticker-track">
          {TICKER.map((item, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-dot" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Platform Overview ─────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
        <div className="section reveal" id="platform">
          <div className="section-label">Platform</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-16)", alignItems: "center" }}>
            <div>
              <h2 className="section-title">
                From negotiation<br />to settlement,<br />cryptographically.
              </h2>
              <p className="section-subtitle" style={{ marginBottom: "var(--space-8)" }}>
                Every DER trade flows through a rigorous multi-stage pipeline:
                Oracle signal → Bayesian belief update → LLM proposal → DQN safety gate → 
                LinDistFlow verification → atomic committed settlement with full hash-chain audit.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {[
                  ["Oracle Signal", "Market intelligence via RAG + REINFORCE policy"],
                  ["LLM Negotiation", "Privacy-preserving Rubinstein bilateral bargaining"],
                  ["DQN Safety Gate", "Trained action-value guard prevents unsafe commits"],
                  ["Grid Certification", "LinDistFlow power flow with signed certificate"],
                  ["Atomic Settlement", "Idempotent commit with SHA-256 audit chain"],
                ].map(([stage, desc]) => (
                  <div key={stage} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius-sm)",
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: "6px", height: "6px",
                      background: "var(--brand-blue)", opacity: 0.6,
                    }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-primary)", marginBottom: "2px" }}>{stage}</div>
                      <div style={{ fontSize: "12px", color: "var(--fg-secondary)" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live terminal-style panel */}
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                background: "var(--bg-overlay)",
                padding: "12px var(--space-4)",
                borderBottom: "1px solid var(--border-dim)",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
              }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  {["#FF5F57","#FEBC2E","#28C840"].map(c => (
                    <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />
                  ))}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-muted)", letterSpacing: "0.05em" }}>
                  gridnexus — negotiation pipeline
                </span>
              </div>
              <div style={{ padding: "var(--space-5)", fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.8", color: "var(--fg-secondary)" }}>
                <TerminalLine color="#8C94A8" prefix="SYS"  text="Oracle signal received: HIGH_RENEWABLE" />
                <TerminalLine color="#0057FF" prefix="BLIF" text="Bayesian posterior: 0.847 (TRADE_NOW)" />
                <TerminalLine color="#8C94A8" prefix="LLM"  text="Proposal: COUNTER_OFFER @0.089/kWh, 42kWh" />
                <TerminalLine color="#8C94A8" prefix="VAL"  text="Schema: ✓  Economic: ✓  Resource: ✓" />
                <TerminalLine color="#00E57A" prefix="DQN"  text="Action permitted (q=0.923, margin=0.41)" />
                <TerminalLine color="#FFB800" prefix="STAB" text="Coalition core feasible, ε=0.12" />
                <TerminalLine color="#00E57A" prefix="GRID" text="LinDistFlow: FEASIBLE, max load 74.3%" />
                <TerminalLine color="#00E57A" prefix="SETL" text="COMMITTED — hash: a3f9...2c1d" delay />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <div className="section reveal" id="features">
        <div className="section-label">Features</div>
        <h2 className="section-title" style={{ marginBottom: "var(--space-10)" }}>
          Built for research.<br />Hardened for operations.
        </h2>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="feature-card">
              <div className="feature-card-icon" aria-hidden="true">{f.icon}</div>
              <div className="feature-card-title">{f.title}</div>
              <div className="feature-card-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Research Section ──────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
        <div className="section reveal" id="research">
          <div className="section-label">Research Platform</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-16)" }}>
            <div>
              <h2 className="section-title">Reproducible.<br />Publishable.</h2>
              <p className="section-subtitle" style={{ marginBottom: "var(--space-8)" }}>
                A complete evaluation suite with 10 scenario types, 10 baselines (B0–FULL),
                IEEE standard network configs, and deterministic seed management for valid scientific comparisons.
              </p>
              <button className="btn btn-primary" onClick={() => navigate("/dashboard/experiments")}>
                View Experiment Suite →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--border-dim)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              {[
                { label: "Scenarios", value: "10" },
                { label: "Baselines", value: "11" },
                { label: "DER Scale", value: "5–250" },
                { label: "Seeds", value: "≥5" },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-card)", padding: "var(--space-6)", position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: "6px", height: "6px", background: "var(--brand-blue)" }} />
                  <div style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--fg-primary)", lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
                  <div className="text-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Audit Section ─────────────────────────────────────────────── */}
      <div className="section reveal" id="audit">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-16)", alignItems: "center" }}>
          <div>
            <div className="section-label">Audit & Security</div>
            <h2 className="section-title">Every event.<br />Immutably recorded.</h2>
            <p className="section-subtitle" style={{ marginBottom: "var(--space-8)" }}>
              An append-only SHA-256 hash chain ties every negotiation event, settlement, 
              and belief update together. Postgres-level delete triggers make tampering 
              cryptographically detectable.
            </p>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <div className="badge badge--live">Append-Only DB</div>
              <div className="badge badge--info">SHA-256 Chain</div>
              <div className="badge badge--neutral">JWT + RBAC</div>
              <div className="badge badge--neutral">AES-GCM AAD</div>
            </div>
          </div>

          {/* Hash chain mockup */}
          <div className="card" style={{ borderRadius: "var(--radius-md)" }}>
            <div className="card-header">
              <span className="card-title">Audit Event Chain</span>
              <div className="badge badge--live"><span className="badge-dot badge-dot--pulse" />Verified</div>
            </div>
            <div style={{ padding: "0" }}>
              {[
                { seq: "#482", type: "SETTLEMENT_COMMITTED", hash: "a3f9c2...2c1d", verified: true },
                { seq: "#481", type: "GRID_CERTIFIED", hash: "8e4b1a...9f3c", verified: true },
                { seq: "#480", type: "STABILITY_CHECKED", hash: "d7c3e8...4a2f", verified: true },
                { seq: "#479", type: "OFFER_MADE", hash: "2b8f5d...1e7a", verified: true },
              ].map((evt) => (
                <div key={evt.seq} className="hash-event">
                  <div className="hash-seq">{evt.seq}</div>
                  <div className="hash-body">
                    <div className="hash-event-type">{evt.type}</div>
                    <div className="hash-value">{evt.hash}</div>
                  </div>
                  <div className={`hash-integrity hash-integrity--${evt.verified ? "verified" : "broken"}`}>
                    {evt.verified ? "✓" : "✗"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-dim)",
        padding: "var(--space-20) var(--space-8)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div className="hero-glow" style={{ top: "-300px", opacity: 0.5 }} aria-hidden="true" />
        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="section-label" style={{ justifyContent: "center", marginBottom: "var(--space-6)" }}>Ready</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 400, letterSpacing: "-0.03em", color: "var(--fg-primary)", marginBottom: "var(--space-6)", lineHeight: 1 }}>
            Open the Command Center.
          </h2>
          <p style={{ fontSize: "16px", color: "var(--fg-secondary)", marginBottom: "var(--space-8)", maxWidth: "480px", margin: "0 auto var(--space-8)" }}>
            Monitor live negotiations, inspect coalition stability, verify grid certificates, and trace the full cryptographic audit chain — all in one place.
          </p>
          <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={() => navigate("/dashboard")} id="cta-open-dashboard">
              Open Dashboard →
            </button>
            <a
              href="https://github.com"
              className="btn btn-outline btn-lg"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--border-dim)",
        padding: "var(--space-6) var(--space-8)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "var(--space-4)",
      }} role="contentinfo">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{ width: "18px", height: "18px", background: "var(--brand-blue)", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} aria-hidden="true" />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-primary)" }}>GridNexus</span>
          <span style={{ fontSize: "12px", color: "var(--fg-muted)" }}>Energy 5.0 VPP Platform</span>
        </div>
        <div className="env-badge env-badge--simulation">
          Simulation Environment — Values Are Not Live Grid Data
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-muted)", letterSpacing: "0.05em" }}>
          MIT LICENSE · RESEARCH USE
        </div>
      </footer>
    </div>
  );
}

/* ── Terminal Line helper ────────────────────────────────────────────────── */
function TerminalLine({ prefix, text, color = "var(--fg-secondary)", delay = false }: {
  prefix: string; text: string; color?: string; delay?: boolean;
}) {
  const [visible, setVisible] = useState(!delay);
  useEffect(() => {
    if (delay) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [delay]);

  if (!visible) return null;
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", lineHeight: "1.8" }}>
      <span style={{ color: "var(--fg-muted)", minWidth: "36px", flexShrink: 0 }}>[{prefix}]</span>
      <span style={{ color }}>{text}</span>
    </div>
  );
}
