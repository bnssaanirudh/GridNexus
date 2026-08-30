import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ── Hooks ────────────────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 2500, suffix = "", prefix = "") {
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
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { ref, display: `${prefix}${value}${suffix}` };
}

function useParallax() {
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;
      document.querySelectorAll(".parallax-bg").forEach((el) => {
        const speed = (el as HTMLElement).dataset.speed || "0.5";
        const yPos = -(scrolled * parseFloat(speed));
        (el as HTMLElement).style.transform = `translateY(${yPos}px)`;
      });
      document.querySelectorAll(".parallax-el").forEach((el) => {
        const speed = (el as HTMLElement).dataset.speed || "0.2";
        const yPos = -(scrolled * parseFloat(speed));
        (el as HTMLElement).style.transform = `translateY(${yPos}px)`;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
}

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    document.querySelectorAll(".reveal, .reveal-up, .reveal-left, .reveal-right").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Data ───────────────────────────────────────────────────────────────── */
const TICKER = [
  "P2P ENERGY TRADING", "GAME-THEORETIC COALITION FORMATION", "DQN SAFETY GUARD",
  "LINDISTFLOW POWER VERIFICATION", "LLM-NEGOTIATED CONTRACTS", "CRYPTOGRAPHIC AUDIT CHAIN",
  "IEEE 33-BUS & 69-BUS SUPPORT", "MAPPO ORACLE INFERENCE", "BAYESIAN BELIEF UPDATES",
];

const FEATURES = [
  { num: "01", title: "P2P NEGOTIATION", desc: "LLM-driven bilateral bargaining with Rubinstein alternating-offers, DQN safety override, and strict schema validation on every interaction round.", img: "/assets/pexels-china-yu-200611083-35454188.jpg" },
  { num: "02", title: "ORACLE INTELLIGENCE", desc: "REINFORCE-trained Oracle broadcasts market signals. RAG pipeline enriches context with verified external weather, pricing, and topology data.", img: "/assets/pexels-kindelmedia-9800005.jpg" },
  { num: "03", title: "PHYSICS CERTIFICATION", desc: "LinDistFlow power flow solver produces cryptographically signed feasibility certificates. No settlement commits without passing grid verification.", img: "/assets/pexels-kindelmedia-9875676.jpg" },
];

/* ── Components ─────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  
  useScrollReveal();
  useParallax();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const agentsCount = useCountUp(1000, 2500, "+");
  const latencyCount = useCountUp(12, 2500, "ms");
  const certCount = useCountUp(100, 2500, "%");

  return (
    <div style={{ background: "var(--bg-cream)", minHeight: "100vh", position: "relative", overflowX: "hidden", color: "var(--fg-primary)" }}>
      
      {/* ── Custom Styles for Likova Animations ── */}
      <style>{`
        .reveal, .reveal-up, .reveal-left, .reveal-right {
          opacity: 0;
          transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-up { transform: translateY(60px); }
        .reveal-left { transform: translateX(-60px); }
        .reveal-right { transform: translateX(60px); }
        .visible { opacity: 1; transform: translate(0) !important; }
        
        .img-mask {
          overflow: hidden;
          position: relative;
        }
        .img-mask img, .img-mask video {
          transition: transform 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .img-mask:hover img, .img-mask:hover video {
          transform: scale(1.05);
        }

        .outline-text {
          -webkit-text-stroke: 1px rgba(255,255,255,0.2);
          color: transparent;
        }
        
        .likova-btn {
          position: relative;
          overflow: hidden;
          transition: color 0.4s;
        }
        .likova-btn::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: var(--fg-primary);
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: -1;
        }
        .likova-btn:hover { color: var(--bg-cream); }
        .likova-btn:hover::before { transform: scaleX(1); transform-origin: left; }
      `}</style>

      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <nav className={`landing-nav${scrolled ? " scrolled" : ""}`} style={{ 
        background: scrolled ? "var(--bg-cream)" : "transparent", 
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.1)" : "none",
        transition: "all 0.4s ease"
      }}>
        <div className="likova-heading" style={{ fontSize: "24px", color: "var(--fg-primary)", cursor: "pointer", letterSpacing: "0.2em" }}>
          GRIDNEXUS
        </div>
        <ul className="nav-links likova-heading" style={{ fontSize: "11px", gap: "3vw" }}>
          {["PLATFORM", "FEATURES", "RESEARCH", "AUDIT"].map(item => (
            <li key={item} style={{ cursor: "pointer", color: "var(--fg-secondary)" }}>{item}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          <button className="likova-heading likova-btn" style={{ fontSize: "11px", background: "transparent", border: "1px solid var(--border-medium)", color: "var(--fg-primary)", padding: "10px 24px", cursor: "pointer", letterSpacing: "0.15em" }} onClick={() => navigate("/login")}>
            SIGN IN
          </button>
          <button className="likova-heading" style={{ fontSize: "11px", background: "var(--fg-primary)", border: "none", color: "var(--bg-cream)", padding: "11px 24px", cursor: "pointer", letterSpacing: "0.15em" }} onClick={() => navigate("/dashboard")}>
            COMMAND CENTER
          </button>
        </div>
      </nav>

      {/* ── Hero Section (Full bleed video) ─────────────────────────── */}
      <section style={{ height: "100vh", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }} className="img-mask">
          <video className="parallax-bg" data-speed="0.3" src="/assets/14754684_3840_2160_60fps.mp4" autoPlay loop muted playsInline style={{ width: "100%", height: "130%", objectFit: "cover", filter: "brightness(0.6) saturate(1.2)" }} />
        </div>
        
        {/* Likova specific "stepped" blocks floating over the video */}
        <div className="parallax-el reveal-up" data-speed="0.1" style={{ position: "absolute", bottom: "10vh", left: "5vw", zIndex: 2, background: "var(--bg-cream)", padding: "var(--space-8)", maxWidth: "800px" }}>
          <h1 className="likova-heading" style={{ fontSize: "clamp(48px, 8vw, 120px)", color: "var(--fg-primary)", lineHeight: 0.9, letterSpacing: "0.08em", margin: 0 }}>
            GRID<br />NEXUS
          </h1>
          <div className="likova-line" style={{ margin: "var(--space-6) 0", background: "var(--border-medium)" }} />
          <p className="likova-heading" style={{ fontSize: "13px", color: "var(--fg-secondary)", maxWidth: "400px", lineHeight: 1.8, letterSpacing: "0.15em" }}>
            WHERE FUTURE ENERGY VPP COORDINATION GAINS MOMENTUM. A TRUE NETWORK OF INTELLIGENT AGENTS.
          </p>
        </div>

        <div className="parallax-el reveal-up" data-speed="0.15" style={{ position: "absolute", bottom: "15vh", right: "5vw", zIndex: 2, background: "var(--fg-primary)", padding: "var(--space-6)", width: "300px" }}>
           <p className="likova-heading" style={{ fontSize: "12px", color: "var(--bg-cream)", lineHeight: 1.6 }}>
             THE BUSINESS CENTER ON THE EDGE OF THE CAPITAL. INNOVATIVE APPROACH AND BOLD ARCHITECTURAL FORMS.
           </p>
        </div>
      </section>

      {/* ── Architectural Typographic Statement ──────────────────────── */}
      <section className="likova-block-navy" style={{ padding: "20vh 5vw", position: "relative" }}>
        <div className="reveal-up">
          <h2 className="likova-heading" style={{ fontSize: "clamp(32px, 5vw, 64px)", lineHeight: 1.2, maxWidth: "1200px", margin: "0 auto", letterSpacing: "0.1em", color: "var(--fg-primary)", textAlign: "center" }}>
            LIKE A STRIKING WORK OF ART, THIS PLATFORM TURNS HEADS AND TRANSFORMS THE <span className="outline-text">CITYSCAPE</span>. GRIDNEXUS WILL BECOME A LAUNCHING PAD FOR DOZENS OF AMBITIOUS <span className="outline-text">PROJECTS</span>.
          </h2>
        </div>
        
        {/* Staggered overlapping architectural images */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)", marginTop: "15vh", position: "relative" }}>
          <div className="img-mask reveal-up parallax-el" data-speed="0.05" style={{ height: "500px", marginTop: "100px" }}>
            <img src="/assets/pexels-mohamed-b-2151113020-33661084.jpg" alt="Architecture" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(20%)" }} />
          </div>
          <div className="img-mask reveal-up" style={{ height: "600px", zIndex: 2 }}>
            <video src="/assets/9875909-uhd_3840_2160_30fps.mp4" autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.7)" }} />
          </div>
          <div className="img-mask reveal-up parallax-el" data-speed="-0.05" style={{ height: "400px", marginTop: "200px" }}>
            <img src="/assets/pexels-oguzcobn-37824217.jpg" alt="Architecture 2" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(20%)" }} />
          </div>
        </div>
      </section>

      {/* ── Platform Explanation ──────────────────────────────────────── */}
      <section className="likova-block-white" style={{ padding: "15vh 5vw", borderTop: "1px solid rgba(0,0,0,0.1)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10vw" }}>
          <div>
            <h2 className="likova-heading reveal-up" style={{ fontSize: "24px", color: "var(--fg-dark-primary)", marginBottom: "var(--space-6)" }}>
              WHAT IS GRIDNEXUS?
            </h2>
            <div className="likova-line" style={{ background: "rgba(0,0,0,0.1)" }} />
          </div>
          <div className="reveal-up">
            <p className="likova-heading" style={{ fontSize: "clamp(20px, 3vw, 28px)", color: "var(--fg-dark-primary)", lineHeight: 1.4, marginBottom: "var(--space-8)" }}>
              GRIDNEXUS IS A VIRTUAL POWER PLANT (VPP) COORDINATION PLATFORM. WE BRIDGE THE GAP BETWEEN THEORETICAL AI RESEARCH AND REAL-WORLD ENERGY PHYSICS.
            </p>
            <p className="likova-heading" style={{ fontSize: "16px", color: "var(--fg-dark-secondary)", lineHeight: 1.8, marginBottom: "var(--space-6)", maxWidth: "800px" }}>
              AS RENEWABLE DISTRIBUTED ENERGY RESOURCES (DER) LIKE SOLAR PANELS, BATTERIES, AND ELECTRIC VEHICLES BECOME UBIQUITOUS, COORDINATING THEM AT SCALE REQUIRES MORE THAN JUST SIMPLE HEURISTICS. GRIDNEXUS INTRODUCES A TRULY INTELLIGENT ENERGY BROKER. IT USES ADVANCED LLM-DRIVEN NEGOTIATION FOR BILATERAL ENERGY TRADING BETWEEN PROSUMERS, REINFORCEMENT LEARNING ORACLES FOR DYNAMIC PRICING SIGNALS, AND STRICT LINDISTFLOW SOLVERS TO MATHEMATICALLY GUARANTEE THAT EVERY SINGLE TRADE IS PHYSICALLY POSSIBLE ON THE ACTUAL GRID TOPOLOGY.
            </p>
            <p className="likova-heading" style={{ fontSize: "16px", color: "var(--fg-dark-secondary)", lineHeight: 1.8, maxWidth: "800px" }}>
              EVERY NEGOTIATION ROUND, BAYESIAN BELIEF UPDATE, AND SETTLEMENT IS LOGGED TO AN APPEND-ONLY SHA-256 HASH CHAIN. THIS CREATES A FULLY AUDITABLE, IDEMPOTENT, AND TAMPER-PROOF RECORD OF THE ENTIRE COALITION.
            </p>
          </div>
        </div>
      </section>

      {/* ── Giant Likova Numbers (Stats) ─────────────────────────────── */}
      <section style={{ background: "var(--bg-white)", position: "relative", overflow: "hidden", borderTop: "1px solid var(--border-light)" }}>
        {/* Faded background image mimicking the wireframes from Likova */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.1, zIndex: 0 }}>
          <img src="/assets/pexels-china-yu-200611083-35454188.jpg" alt="bg" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        
        <div style={{ position: "relative", zIndex: 1, padding: "15vh 5vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--border-light)" }}>
           
           <div className="reveal-up" style={{ borderRight: "1px solid var(--border-light)", paddingRight: "var(--space-8)" }}>
             <div className="likova-heading" style={{ fontSize: "11px", color: "var(--fg-secondary)", marginBottom: "var(--space-4)" }}>VARIABLE NUMBER OF</div>
             <div className="likova-line" style={{ background: "var(--border-medium)", marginBottom: "var(--space-8)" }} />
             <div className="likova-huge-number" ref={agentsCount.ref as any}>{agentsCount.display}</div>
             <div className="likova-heading" style={{ fontSize: "32px", marginTop: "var(--space-4)", color: "var(--fg-primary)" }}>AGENTS</div>
           </div>
           
           <div className="reveal-up" style={{ borderRight: "1px solid var(--border-light)", padding: "0 var(--space-8)" }}>
             <div className="likova-heading" style={{ fontSize: "11px", color: "var(--fg-secondary)", marginBottom: "var(--space-4)" }}>SETTLEMENT LATENCY UNDER</div>
             <div className="likova-line" style={{ background: "var(--border-medium)", marginBottom: "var(--space-8)" }} />
             <div className="likova-huge-number" ref={latencyCount.ref as any}>{latencyCount.display}</div>
             <div className="likova-heading" style={{ fontSize: "32px", marginTop: "var(--space-4)", color: "var(--fg-primary)" }}>MILLISECONDS</div>
           </div>
           
           <div className="reveal-up" style={{ paddingLeft: "var(--space-8)" }}>
             <div className="likova-heading" style={{ fontSize: "11px", color: "var(--fg-secondary)", marginBottom: "var(--space-4)" }}>LINDISTFLOW CERTIFICATION</div>
             <div className="likova-line" style={{ background: "var(--border-medium)", marginBottom: "var(--space-8)" }} />
             <div className="likova-huge-number" ref={certCount.ref as any}>{certCount.display}</div>
             <div className="likova-heading" style={{ fontSize: "32px", marginTop: "var(--space-4)", color: "var(--fg-primary)" }}>GUARANTEE</div>
           </div>

        </div>
      </section>

      {/* ── Asymmetric Layout (Features) ──────────────────────────────── */}
      <section style={{ position: "relative" }}>
        {FEATURES.map((feature, i) => (
          <div key={feature.num} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "55% 45%" : "45% 55%", minHeight: "80vh", borderBottom: "1px solid var(--border-light)" }}>
            
            {/* Image Block */}
            <div style={{ position: "relative", order: i % 2 === 0 ? 1 : 2, borderLeft: i % 2 === 0 ? "none" : "1px solid var(--border-light)", borderRight: i % 2 === 0 ? "1px solid var(--border-light)" : "none" }}>
              <div className="img-mask" style={{ width: "100%", height: "100%" }}>
                 <img src={feature.img} alt={feature.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              {/* Floating offset number box */}
              <div className="parallax-el" data-speed="0.1" style={{ position: "absolute", top: "10%", [i % 2 === 0 ? "right" : "left"]: "-40px", background: "var(--fg-primary)", color: "var(--bg-cream)", padding: "20px 30px", zIndex: 10 }}>
                <span className="likova-heading" style={{ fontSize: "40px", margin: 0 }}>{feature.num}</span>
              </div>
            </div>

            {/* Text Block */}
            <div style={{ padding: "10vw", display: "flex", flexDirection: "column", justifyContent: "center", order: i % 2 === 0 ? 2 : 1, background: i % 2 === 0 ? "var(--bg-cream)" : "var(--bg-white)" }}>
              <h2 className="likova-heading reveal-up" style={{ fontSize: "clamp(32px, 4vw, 56px)", marginBottom: "var(--space-8)", color: "var(--fg-primary)", lineHeight: 1.1 }}>
                {feature.title}
              </h2>
              <div className="likova-line" style={{ background: "var(--border-strong)", marginBottom: "var(--space-8)" }} />
              <p className="likova-heading reveal-up" style={{ fontSize: "14px", color: "var(--fg-secondary)", lineHeight: 2, maxWidth: "500px" }}>
                {feature.desc}
              </p>
            </div>
            
          </div>
        ))}
      </section>

      {/* ── Academic Research Highlights ─────────────────────────────── */}
      <section id="research" className="likova-block-navy" style={{ padding: "15vh 5vw", position: "relative" }}>
        <h2 className="likova-heading reveal-up" style={{ fontSize: "clamp(32px, 5vw, 64px)", color: "var(--fg-primary)", marginBottom: "var(--space-8)", letterSpacing: "0.1em" }}>
          THEORETICAL FOUNDATIONS
        </h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-6)" }}>
          {[
            {
              title: "SOCP AC POWER FLOW",
              desc: "Replaces traditional LinDistFlow with Second-Order Cone Programming (SOCP) relaxations, guaranteeing exact bounds for voltage and active/reactive power in radial microgrids.",
              ref: "[1] Low, S. H. (2014). 'Convex Relaxation of Optimal Power Flow.' IEEE Transactions on Control of Network Systems."
            },
            {
              title: "FEDERATED MAPPO (FedMAPPO)",
              desc: "Implements privacy-preserving Multi-Agent PPO. Agents train local actor networks and sync via FedAvg, keeping cost curves and surplus proprietary from the centralized critic.",
              ref: "[2] Yu, C. et al. (2022). 'The Surprising Effectiveness of PPO in Cooperative Multi-Agent Games.' NeurIPS."
            },
            {
              title: "AGENTIC LLM ORACLE",
              desc: "A Retrieval-Augmented Generation (RAG) Oracle ingest real-time exogenous weather (cloud cover, temp) to broadcast Bayesian persuasion signals, optimally steering coalitional behavior.",
              ref: "[3] Kamenica, E., & Gentzkow, M. (2011). 'Bayesian Persuasion.' American Economic Review."
            }
          ].map((item, i) => (
            <div key={i} className="reveal-up" style={{ background: "rgba(255,255,255,0.05)", padding: "var(--space-6)", borderLeft: "2px solid var(--border-medium)" }}>
              <h3 className="likova-heading" style={{ fontSize: "20px", color: "var(--fg-primary)", marginBottom: "var(--space-4)" }}>{item.title}</h3>
              <p className="likova-heading" style={{ fontSize: "14px", color: "var(--fg-secondary)", lineHeight: 1.8, marginBottom: "var(--space-4)" }}>{item.desc}</p>
              <div className="likova-line" style={{ background: "rgba(255,255,255,0.1)", marginBottom: "var(--space-4)" }} />
              <p style={{ fontSize: "12px", color: "var(--fg-muted)", fontStyle: "italic" }}>{item.ref}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────────────── */}
      <div style={{ padding: "var(--space-6) 0", overflow: "hidden", whiteSpace: "nowrap", borderBottom: "1px solid var(--border-light)", background: "var(--fg-primary)" }}>
        <div style={{ display: "inline-block", animation: "ticker 40s linear infinite" }}>
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="likova-heading" style={{ fontSize: "16px", color: "var(--bg-cream)", margin: "0 40px" }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── CTA / Footer ─────────────────────────────────────────────── */}
      <section style={{ padding: "20vh 5vw 5vh", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden" }}>
        
        <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.05 }} className="img-mask">
          <img className="parallax-bg" data-speed="0.2" src="/assets/pexels-kindelmedia-9875676.jpg" alt="bg" style={{ width: "100%", height: "150%", objectFit: "cover" }} />
        </div>
        
        <h2 className="likova-heading reveal-up" style={{ position: "relative", zIndex: 1, fontSize: "clamp(48px, 10vw, 160px)", marginBottom: "var(--space-8)", letterSpacing: "0.15em", color: "var(--fg-primary)" }}>
          GRIDNEXUS
        </h2>
        <div className="likova-line" style={{ position: "relative", zIndex: 1, background: "var(--border-medium)", marginBottom: "var(--space-16)", maxWidth: "800px" }} />
        
        <div className="reveal-up" style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "1200px", flexWrap: "wrap", gap: "var(--space-6)" }}>
          <div className="likova-heading" style={{ fontSize: "11px", color: "var(--fg-secondary)" }}>© 2026, GRIDNEXUS</div>
          <div className="likova-heading likova-btn" style={{ fontSize: "11px", color: "var(--fg-secondary)", cursor: "pointer", border: "1px solid var(--border-medium)", padding: "10px 20px" }} onClick={() => navigate("/dashboard")}>
            ENTER COMMAND CENTER
          </div>
          <div className="likova-heading" style={{ fontSize: "11px", color: "var(--fg-secondary)" }}>WEBSITE BY GRIDNEXUS CORE</div>
        </div>
        
        <div className="likova-heading" style={{ position: "relative", zIndex: 1, fontSize: "10px", color: "var(--fg-muted)", marginTop: "var(--space-12)", maxWidth: "800px", lineHeight: 1.8 }}>
          ALL INFORMATION PRESENTED ON THIS WEBSITE IS FOR INFORMATIONAL PURPOSES ONLY AND UNDER NO CIRCUMSTANCES CONSTITUTES A PUBLIC OFFER. COMPLETED PROPERTIES MAY DIFFER FROM 3D VISUALIZATIONS. ALL MATERIALS ARE APPROPRIATE AND SUBJECT TO CHANGE.
        </div>
      </section>

    </div>
  );
}
