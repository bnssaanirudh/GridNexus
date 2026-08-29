/**
 * command-center/src/theme/tokens.ts
 * ────────────────────────────────────
 * Design System Tokens.
 *
 * Single source of truth for the GridNexus Command Center design system.
 * CSS custom properties are applied in index.css; this file exports the same
 * values as typed TypeScript constants so components can reference them safely.
 *
 * Palette spec :
 *   Background : #232629   – dark charcoal
 *   Accent     : #2AA9FF   – electric blue
 *   Alert      : #F5A623   – amber/ochre  (ONLY for alerts / instability states)
 *   Positive   : #22C55E   – emerald green (stable / ok states)
 *   Negative   : #EF4444   – red           (down / critical states)
 */

export const colors = {
  /** Dark charcoal — primary background */
  bgPrimary: "#232629",
  /** Slightly lighter surface for panels */
  bgSurface: "#2B2F33",
  /** Card / glass surface */
  bgCard: "rgba(43, 47, 51, 0.75)",
  /** Card border */
  bgCardBorder: "rgba(42, 169, 255, 0.15)",

  /** Electric blue — primary accent */
  accentBlue: "#2AA9FF",
  /** Muted electric blue for secondary elements */
  accentBlueMuted: "rgba(42, 169, 255, 0.18)",

  /** Ochre / amber — ONLY for alerts and instability states */
  alert: "#F5A623",
  /** Muted alert background */
  alertMuted: "rgba(245, 166, 35, 0.15)",

  /** Stable / OK state */
  ok: "#22C55E",
  /** Down / critical state */
  down: "#EF4444",
  /** Degraded / loading state */
  degraded: "#F59E0B",

  /** Primary text */
  textPrimary: "#E8EAED",
  /** Secondary text */
  textSecondary: "#9AA0A6",
  /** Disabled / muted text */
  textMuted: "#5F6368",
} as const;

export const typography = {
  /** Monospace stack for numeric/code values */
  fontMono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  /** Sans-serif stack for UI text */
  fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "40px",
} as const;

/** WebSocket reconnect configuration used by wsClient.ts */
export const wsConfig = {
  /** Initial backoff in ms */
  initialBackoffMs: 500,
  /** Maximum backoff cap in ms */
  maxBackoffMs: 30_000,
  /** Backoff multiplier per failure */
  backoffMultiplier: 2,
} as const;
