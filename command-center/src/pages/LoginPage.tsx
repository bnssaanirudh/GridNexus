/**
 * command-center/src/pages/LoginPage.tsx
 * ──────────────────────────────────────────
 * Premium login/register page — Kononenko-inspired split layout.
 * Left: Full-bleed energy grid image with serif tagline.
 * Right: Auth form with animated tab switch.
 */

import { useState, FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiLogin, apiRegister, useAuth, persistSession } from "../lib/auth";

/* ── Password strength indicator ────────────────────────────────────────── */
function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#D63A3A", "#E8A020", "#00C9A7", "#00C9A7"];

  if (!password) return null;
  return (
    <div style={{ marginTop: "6px" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              flex: 1, height: "3px",
              borderRadius: "2px",
              background: i <= score ? colors[score] : "var(--border-medium)",
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: "11px", color: colors[score], fontFamily: "var(--font-mono)" }}>
        {labels[score]}
      </span>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login form
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail]       = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm]   = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await apiLogin(loginUsername.trim(), loginPassword);
      setUser(result.user);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (regPassword !== regConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await apiRegister(regUsername.trim(), regEmail.trim(), regPassword);
      setUser(result.user);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ── Left panel: image/video + tagline ── */}
      <div className="auth-left">
        <video
          className="auth-left-image"
          src="/videos/auth_background.mp4"
          poster="/auth_background.jpg"
          autoPlay loop muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <div className="auth-left-overlay" />
        <div className="auth-left-content">
          {/* Logo */}
          <div className="auth-brand">
            <div className="auth-brand-mark" />
            <span className="auth-brand-name">GridNexus</span>
          </div>

          {/* Tagline */}
          <div>
            <p className="auth-tagline">
              The future of energy<br />
              <em>is negotiated.</em>
            </p>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.45)", marginTop: "24px", fontWeight: 300, lineHeight: 1.8 }}>
              Join the platform powering game-theoretic<br />
              VPP coordination at grid scale.
            </p>
          </div>

          {/* Stats strip */}
          <div style={{
            display: "flex",
            gap: "32px",
            borderTop: "1px solid rgba(255,255,255,0.10)",
            paddingTop: "24px",
          }}>
            {[
              { val: "250+", lbl: "DER Agents" },
              { val: "100%", lbl: "Audit Chain" },
              { val: "10",   lbl: "Baselines" },
            ].map(s => (
              <div key={s.lbl}>
                <div style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "28px",
                  fontWeight: 400,
                  color: "#fff",
                  lineHeight: 1,
                  marginBottom: "4px",
                }}>
                  {s.val}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.4)",
                }}>
                  {s.lbl}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel: auth form ── */}
      <div className="auth-right">
        <div className="auth-card">
          {/* Back to landing */}
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--fg-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              marginBottom: "32px",
              transition: "color 0.2s",
              textDecoration: "none",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--fg-primary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--fg-muted)")}
          >
            ← Back to home
          </a>

          <h1 className="auth-card-title">
            {tab === "login" ? "Welcome back." : "Create account."}
          </h1>
          <p className="auth-card-subtitle">
            {tab === "login"
              ? "Sign in to access the Command Center."
              : "Join GridNexus and start coordinating."}
          </p>

          {/* Tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab${tab === "login" ? " active" : ""}`}
              onClick={() => { setTab("login"); setError(""); }}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-tab${tab === "register" ? " active" : ""}`}
              onClick={() => { setTab("register"); setError(""); }}
              type="button"
            >
              Create Account
            </button>
          </div>

          {/* Error alert */}
          {error && (
            <div style={{
              padding: "12px 16px",
              background: "var(--status-error-dim)",
              border: "1px solid rgba(214,58,58,0.2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
              color: "var(--status-error)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Login Form ── */}
          {tab === "login" && (
            <form className="auth-form" onSubmit={handleLogin} id="login-form">
              <div className="form-group">
                <label className="form-label" htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  type="text"
                  className="form-input"
                  placeholder="your_username"
                  autoComplete="username"
                  autoFocus
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="form-submit"
                disabled={loading}
                id="login-submit"
              >
                {loading && <span className="loading-spinner" />}
                {loading ? "Signing in…" : "Sign In →"}
              </button>

              <div className="auth-divider">
                <div className="auth-divider-line" />
                <span className="auth-divider-text">or</span>
                <div className="auth-divider-line" />
              </div>

              <button
                type="button"
                onClick={() => {
                  const guest = { id: "demo-user", username: "Guest Demo", email: "guest@gridnexus.test", role: "demo" };
                  persistSession("mock.jwt.token", guest);
                  setUser(guest);
                  navigate("/dashboard");
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "13px",
                  fontFamily: "var(--font-sans)",
                  background: "var(--bg-warm)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--fg-secondary)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                id="demo-access-btn"
              >
                Continue as Guest (Demo Mode)
              </button>
            </form>
          )}

          {/* ── Register Form ── */}
          {tab === "register" && (
            <form className="auth-form" onSubmit={handleRegister} id="register-form">
              <div className="form-group">
                <label className="form-label" htmlFor="reg-username">Username</label>
                <input
                  id="reg-username"
                  type="text"
                  className="form-input"
                  placeholder="choose_a_username"
                  autoComplete="username"
                  autoFocus
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-email">Email address</label>
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  className="form-input"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                />
                <PasswordStrength password={regPassword} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-confirm">Confirm password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  className={`form-input${regConfirm && regConfirm !== regPassword ? " error" : ""}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={regConfirm}
                  onChange={e => setRegConfirm(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="form-submit"
                disabled={loading}
                id="register-submit"
              >
                {loading && <span className="loading-spinner" />}
                {loading ? "Creating account…" : "Create Account →"}
              </button>
            </form>
          )}

          <p className="auth-note" style={{ marginTop: "24px" }}>
            By continuing, you agree to the{" "}
            <span style={{ color: "var(--brand-teal)", cursor: "pointer" }}>Terms of Use</span>{" "}
            and{" "}
            <span style={{ color: "var(--brand-teal)", cursor: "pointer" }}>Privacy Policy</span>.
          </p>

          {/* Research badge */}
          <div style={{
            marginTop: "32px",
            padding: "12px 16px",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            gap: "12px",
            alignItems: "center",
          }}>
            <div style={{
              width: "8px", height: "8px",
              borderRadius: "50%",
              background: "var(--status-warn)",
              flexShrink: 0,
              animation: "pulse 2s ease-in-out infinite",
            }} />
            <span style={{ fontSize: "11px", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              SIMULATION ENVIRONMENT — NOT LIVE GRID DATA
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
