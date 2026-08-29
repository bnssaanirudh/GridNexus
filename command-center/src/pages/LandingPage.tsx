/**
 * command-center/src/pages/LandingPage.tsx
 * ─────────────────────────────────────────
 * GridNexus public landing page.
 * Design inspired by Kononenko Architectural Bureau:
 * editorial serif typography, full-bleed photography,
 * dramatic scale contrast, generous white space.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ── Animated counter hook ──────────────────────────────────────────────── */
function useCountUp(target: number, duration = 2000, suffix = "") {
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
    const els = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
      },
      { threshold: 0.08 }
    );
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
    num: "01",
    icon: "⚡",
    title: "P2P Energy Negotiation",
    desc: "LLM-driven bilateral bargaining with Rubinstein alternating-offers, DQN safety override, and schema validation on every round.",
  },
  {
    num: "02",
    icon: "🔮",
    title: "Oracle Intelligence",
    desc: "REINFORCE-trained Oracle broadcasts market signals. RAG pipeline enriches context with verified external weather and grid data.",
  },
  {
    num: "03",
    icon: "🏛",
    title: "Coalition Stability",
    desc: "Network-aware VPP coalition value model with market revenue, congestion cost, battery degradation, and least-core epsilon bounds.",
  },
  {
    num: "04",
    icon: "⚙",
    title: "Grid Physics Certification",
    desc: "LinDistFlow power flow solver produces signed feasibility certificates. No settlement commits without passing grid verification.",
  },
  {
    num: "05",
    icon: "🔐",
    title: "Cryptographic Audit Chain",
    desc: "Every negotiation event appends to an immutable SHA-256 hash chain. Append-only DB trigger prevents deletion or mutation.",
  },
  {
    num: "06",
    icon: "📊",
    title: "Research Benchmark Suite",
    desc: "10 baselines, 10 scenarios, IEEE 33/69-bus configs, 5–250 DER scaling. Generates publication-grade plots and LaTeX tables.",
  },
];

/* ── Pipeline stages ────────────────────────────────────────────────────── */
const PIPELINE = [
  { num: "01", stage: "Oracle Signal",    desc: "Market intelligence via RAG + REINFORCE policy" },
  { num: "02", stage: "LLM Negotiation",  desc: "Privacy-preserving Rubinstein bilateral bargaining" },
  { num: "03", stage: "DQN Safety Gate",  desc: "Trained action-value guard prevents unsafe commits" },
  { num: "04", stage: "Grid Certification", desc: "LinDistFlow power flow with signed certificate" },
  { num: "05", stage: "Atomic Settlement", desc: "Idempotent commit with SHA-256 audit chain" },
];

/* ── StatCounter ────────────────────────────────────────────────────────── */
function StatCounter({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, display } = useCountUp(value, 2000, suffix);
  return (
    <div className="hero-stat" ref={ref as any}>
      <span className="hero-stat-value">{display}</span>
      <span className="hero-stat-label">{label}</span>
    </div>
  );
}

/* ── Terminal Line ──────────────────────────────────────────────────────── */
function TerminalLine({ prefix, text, color = "rgba(244,242,238,0.55)", delay = false }: {
  prefix: string; text: string; color?: string; delay?: boolean;
}) {
  const [visible, setVisible] = useState(!delay);
  useEffect(() => {
    if (delay) {
      const t = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(t);
    }
  }, [delay]);
  if (!visible) return null;
  return (
    <div style={{ display: "flex", gap: "12px", lineHeight: "1.9" }}>
      <span style={{ color: "rgba(244,242,238,0.3)", minWidth: "40px", flexShrink: 0 }}>[{prefix}]</span>
      <span style={{ color }}>{text}</span>
    </div>
  );
}

/* ── Main Landing Page ──────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useScrollReveal();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div style={{ background: "var(--bg-cream)", minHeight: "100vh", position: "relative", overflowX: "hidden" }}>

      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <nav className={`landing-nav${scrolled ? " scrolled" : ""}`} role="navigation">
        <a href="/" className="nav-logo" aria-label="GridNexus Home">
          <div className="nav-logo-mark" aria-hidden="true" />
          <span className="nav-logo-text" style={{ color: scrolled ? undefined : "#fff" }}>GridNexus</span>
        </a>

        <ul className="nav-links" aria-label="Navigation">
          {["Platform", "Features", "Research", "Audit"].map(item => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                className={`nav-link${scrolled ? "" : " light"}`}
              >
                {item}
              </a>
            </li>
          ))}
        </ul>

        <div className="nav-cta">
          <button
            className={`btn btn-sm${scrolled ? " btn-outline" : " btn-outline-white"}`}
            onClick={() => navigate("/login")}
          >
            Sign In
          </button>
          <button
            className="btn btn-teal btn-sm"
            onClick={() => navigate("/login")}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero" id="hero" aria-label="Hero">
        <video
          className="hero-bg-video"
          src="/videos/hero_video.mp4"
          poster="/hero_solar_city.jpg"
          autoPlay loop muted playsInline
          aria-label="Aerial view of smart city with solar panels and electric grid"
        />
        <div className="hero-overlay" />

        {/* Particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="particle"
            aria-hidden="true"
            style={{
              left: `${8 + i * 15}%`,
              top: `${25 + (i % 3) * 18}%`,
              animationDuration: `${5 + i * 0.8}s`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}

        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brand-teal)" }}>
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
              className="btn btn-teal btn-lg"
              onClick={() => navigate("/login")}
              id="hero-get-started"
            >
              Get Started →
            </button>
            <a href="#platform" className="btn btn-outline-white btn-lg">
              Explore Platform
            </a>
          </div>

          <div className="hero-stats" aria-label="Platform statistics">
            <StatCounter value={250} suffix="+"  label="DER Agents Supported" />
            <StatCounter value={10}  suffix=""   label="Negotiation Baselines" />
            <StatCounter value={33}  suffix="-Bus" label="IEEE Network Configs" />
            <StatCounter value={100} suffix="%"  label="Audit Immutability" />
          </div>
        </div>

        {/* Scroll cue */}
        <div className="hero-scroll-cue" aria-hidden="true">
          <div className="hero-scroll-line" />
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
      <div style={{ background: "var(--bg-white)", borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
        <div className="section reveal" id="platform">
          <div className="section-label">Platform</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-20)", alignItems: "center" }}>
            {/* Left: text */}
            <div>
              <h2 className="section-title">
                From negotiation<br />to settlement,<br />
                <em style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>cryptographically.</em>
              </h2>
              <p className="section-subtitle" style={{ marginBottom: "var(--space-8)" }}>
                Every DER trade flows through a rigorous multi-stage pipeline:
                Oracle signal → Bayesian belief update → LLM proposal → DQN safety gate →
                LinDistFlow verification → atomic committed settlement with full hash-chain audit.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {PIPELINE.map(p => (
                  <div key={p.stage} className="pipeline-step">
                    <span className="pipeline-step-num">{p.num}</span>
                    <div>
                      <div className="pipeline-step-title">{p.stage}</div>
                      <div className="pipeline-step-desc">{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: terminal */}
            <div className="terminal-panel">
              <div className="terminal-bar">
                <div className="terminal-dots">
                  {["#FF5F57", "#FEBC2E", "#28C840"].map(c => (
                    <div key={c} className="terminal-dot" style={{ background: c }} />
                  ))}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "rgba(244,242,238,0.3)", letterSpacing: "0.05em" }}>
                  gridnexus — negotiation pipeline
                </span>
              </div>
              <div className="terminal-body">
                <TerminalLine color="rgba(244,242,238,0.45)" prefix="SYS"  text="Oracle signal received: HIGH_RENEWABLE" />
                <TerminalLine color="#00C9A7"                 prefix="BLIF" text="Bayesian posterior: 0.847 (TRADE_NOW)" />
                <TerminalLine color="rgba(244,242,238,0.45)" prefix="LLM"  text="Proposal: COUNTER_OFFER @0.089/kWh, 42kWh" />
                <TerminalLine color="rgba(244,242,238,0.45)" prefix="VAL"  text="Schema: ✓  Economic: ✓  Resource: ✓" />
                <TerminalLine color="#00C9A7"                 prefix="DQN"  text="Action permitted (q=0.923, margin=0.41)" />
                <TerminalLine color="#E8A020"                 prefix="STAB" text="Coalition core feasible, ε=0.12" />
                <TerminalLine color="#00C9A7"                 prefix="GRID" text="LinDistFlow: FEASIBLE, max load 74.3%" />
                <TerminalLine color="#00C9A7"                 prefix="SETL" text="COMMITTED — hash: a3f9...2c1d" delay />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Full-bleed Grid Towers Image Section ─────────────────────── */}
      <div
        className="fullbleed-section"
        style={{ height: "60vh", minHeight: "440px", display: "flex", alignItems: "center" }}
      >
        <video
          className="section-bg-img"
          src="/videos/grid_towers.mp4"
          poster="/grid_towers.jpg"
          autoPlay loop muted playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div className="overlay-dark" />
        <div className="content section" style={{ padding: "var(--space-16) var(--space-10)" }}>
          <div className="section-label" style={{ color: "var(--brand-teal)" }}>
            <span style={{ width: "24px", height: "1px", background: "var(--brand-teal)", display: "inline-block" }} />
            Infrastructure
          </div>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(40px, 6vw, 88px)",
            fontWeight: 300,
            color: "#fff",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            maxWidth: "700px",
          }}>
            The physical grid,<br />
            <em style={{ fontStyle: "italic", color: "var(--brand-teal)" }}>mathematically verified.</em>
          </h2>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-cream)", borderBottom: "1px solid var(--border-light)" }}>
        <div className="section reveal" id="features">
          <div className="section-label">Features</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--space-12)" }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Built for research.<br />
              Hardened for operations.
            </h2>
            <p style={{ fontSize: "14px", color: "var(--fg-muted)", maxWidth: "280px", textAlign: "right", lineHeight: 1.7 }}>
              Six core capabilities powering every Virtual Power Plant deployment.
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card">
                <div className="feature-card-corner" />
                <div className="feature-card-num">{f.num}</div>
                <div className="feature-card-title">{f.title}</div>
                <div className="feature-card-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Solar Building Full-bleed section ──────────────────────────── */}
      <div className="fullbleed-section" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "560px" }}>
          {/* Image/Video left */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            <video
              src="/videos/solar_building.mp4"
              poster="/solar_building.jpg"
              autoPlay loop muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", transition: "transform 0.6s ease" }}
            />
          </div>
          {/* Content right */}
          <div style={{
            background: "var(--brand-navy)",
            padding: "var(--space-16) var(--space-12)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div className="section-label" style={{ color: "var(--brand-teal)" }}>
              <span style={{ width: "24px", height: "1px", background: "var(--brand-teal)", display: "inline-block" }} />
              Integration
            </div>
            <h2 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(32px, 4vw, 56px)",
              fontWeight: 300,
              color: "#fff",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: "var(--space-6)",
            }}>
              Buildings as<br />active grid participants.
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: "var(--space-8)", fontWeight: 300 }}>
              GridNexus coordinates solar arrays, battery storage, and EV chargers
              across commercial buildings — transforming static consumers into
              intelligent prosumers in a dynamic energy marketplace.
            </p>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <span className="badge badge--live">Solar Integration</span>
              <span className="badge badge--live">Battery Storage</span>
              <span className="badge badge--live">EV Charging</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Research Section ──────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-white)", borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
        <div className="section reveal" id="research">
          <div className="section-label">Research Platform</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-20)" }}>
            <div>
              <h2 className="section-title">
                Reproducible.<br />
                <em style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>Publishable.</em>
              </h2>
              <p className="section-subtitle" style={{ marginBottom: "var(--space-8)" }}>
                A complete evaluation suite with 10 scenario types, 10 baselines (B0–FULL),
                IEEE standard network configs, and deterministic seed management for valid
                scientific comparisons.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/dashboard/experiments")}
              >
                View Experiment Suite →
              </button>
            </div>

            {/* Research stats grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1px",
              background: "var(--border-medium)",
              border: "1px solid var(--border-medium)",
            }}>
              {[
                { label: "Scenarios", value: "10" },
                { label: "Baselines", value: "11" },
                { label: "DER Scale", value: "5–250" },
                { label: "Seeds",     value: "≥ 5" },
              ].map(s => (
                <div key={s.label} className="stat-cell">
                  <div className="stat-cell-corner" />
                  <div className="stat-cell-value">{s.value}</div>
                  <div className="stat-cell-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Control Room Full-bleed ──────────────────────────────────── */}
      <div
        className="fullbleed-section"
        style={{ height: "55vh", minHeight: "400px", display: "flex", alignItems: "center" }}
      >
        <video
          className="section-bg-img"
          src="/videos/vpp_control_room.mp4"
          poster="/vpp_control_room.jpg"
          autoPlay loop muted playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div className="overlay-dark" style={{ background: "rgba(12,11,9,0.7)" }} />
        <div className="content" style={{ padding: "0 var(--space-10)", maxWidth: "var(--section-max)", margin: "0 auto", width: "100%" }}>
          <p style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(18px, 2.5vw, 28px)",
            fontWeight: 300,
            fontStyle: "italic",
            color: "rgba(255,255,255,0.6)",
            maxWidth: "560px",
            lineHeight: 1.5,
            letterSpacing: "-0.01em",
          }}>
            "Every negotiation event appended to an immutable SHA-256 hash chain.
            Tamper detection at the cryptographic level."
          </p>
        </div>
      </div>

      {/* ── Audit Section ─────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-cream)", borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
        <div className="section reveal" id="audit">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-20)", alignItems: "center" }}>
            <div>
              <div className="section-label">Audit & Security</div>
              <h2 className="section-title">
                Every event.<br />
                <em style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>Immutably recorded.</em>
              </h2>
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
            <div className="card">
              <div className="card-header">
                <span className="card-title">Audit Event Chain</span>
                <div className="badge badge--live">
                  <span className="badge-dot badge-dot--pulse" />
                  Verified
                </div>
              </div>
              {[
                { seq: "#482", type: "SETTLEMENT_COMMITTED", hash: "a3f9c2...2c1d", verified: true },
                { seq: "#481", type: "GRID_CERTIFIED",       hash: "8e4b1a...9f3c", verified: true },
                { seq: "#480", type: "STABILITY_CHECKED",    hash: "d7c3e8...4a2f", verified: true },
                { seq: "#479", type: "OFFER_MADE",           hash: "2b8f5d...1e7a", verified: true },
              ].map(evt => (
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

      {/* ── CTA Section ───────────────────────────────────────────────── */}
      <div className="cta-section">
        <div style={{ position: "relative", zIndex: 2, maxWidth: "var(--section-max)", margin: "0 auto" }}>
          <div className="section-label" style={{ justifyContent: "center", marginBottom: "var(--space-6)" }}>
            <span style={{ width: "24px", height: "1px", background: "var(--brand-teal)", display: "inline-block" }} />
            Ready
            <span style={{ width: "24px", height: "1px", background: "var(--brand-teal)", display: "inline-block" }} />
          </div>
          <h2 className="cta-title">
            Open the<br />Command Center.
          </h2>
          <p className="cta-subtitle">
            Monitor live negotiations, inspect coalition stability, verify grid certificates,
            and trace the full cryptographic audit chain — all in one place.
          </p>
          <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-teal btn-xl"
              onClick={() => navigate("/login")}
              id="cta-get-started"
            >
              Get Started →
            </button>
            <a
              href="https://github.com"
              className="btn btn-outline-white btn-xl"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="site-footer" role="contentinfo">
        <div className="footer-top">
          <div>
            <div className="footer-brand-name">
              <div style={{
                width: "22px", height: "22px",
                background: "var(--brand-teal)",
                clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
              }} aria-hidden="true" />
              GridNexus
            </div>
            <p className="footer-tagline">
              Energy 5.0 VPP Coordination Platform.<br />
              Game-theoretic, AI-safe, cryptographically auditable.
            </p>
          </div>
          <div>
            <div className="footer-col-title">Platform</div>
            <a href="#platform" className="footer-link">How It Works</a>
            <a href="#features"  className="footer-link">Features</a>
            <a href="#research"  className="footer-link">Research Suite</a>
            <a href="#audit"     className="footer-link">Audit Chain</a>
          </div>
          <div>
            <div className="footer-col-title">Dashboard</div>
            <a href="/login"             className="footer-link">Sign In</a>
            <a href="/dashboard"         className="footer-link">Overview</a>
            <a href="/dashboard/grid"    className="footer-link">Grid Topology</a>
            <a href="/dashboard/oracle"  className="footer-link">Oracle</a>
          </div>
          <div>
            <div className="footer-col-title">Resources</div>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
            <a href="/dashboard/experiments" className="footer-link">Experiments</a>
            <a href="/dashboard/audit"       className="footer-link">Audit Log</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">
            © 2026 GridNexus · MIT License · Research Use
          </div>
          <div className="env-badge env-badge--simulation">
            Simulation Environment — Values Are Not Live Grid Data
          </div>
          <div className="footer-copy">
            Energy 5.0 · VPP Platform
          </div>
        </div>
      </footer>
    </div>
  );
}
