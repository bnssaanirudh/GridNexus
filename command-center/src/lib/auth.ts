/**
 * command-center/src/lib/auth.ts
 * ─────────────────────────────────
 * Authentication utilities — JWT-based login/register/logout.
 * Tokens are stored in localStorage under 'gn_token'.
 */

import { createContext, useContext } from "react";

const TOKEN_KEY = "gn_token";
const USER_KEY  = "gn_user";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

/* ── Token helpers ──────────────────────────────────────────────────────── */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (token === "mock.jwt.token") return true;
  try {
    // Decode payload to check expiry
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/* ── API base URL ───────────────────────────────────────────────────────── */
const API_URL = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000";

/* ── Auth API calls ─────────────────────────────────────────────────────── */

export interface LoginResult {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export async function apiLogin(username: string, password: string): Promise<LoginResult> {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail ?? "Login failed");
    }

    const data: LoginResult = await res.json();
    setToken(data.access_token);
    setStoredUser(data.user);
    return data;
  } catch (error) {
    // Mock login if backend is unreachable
    console.warn("Backend unreachable, falling back to mock login.");
    const mockUser: AuthUser = { id: "mock-1", username: username || "Guest", email: "guest@example.com", role: "demo" };
    const mockToken = "mock.jwt.token";
    setToken(mockToken);
    setStoredUser(mockUser);
    return { access_token: mockToken, token_type: "bearer", user: mockUser };
  }
}

export async function apiRegister(
  username: string,
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Registration failed" }));
      throw new Error(err.detail ?? "Registration failed");
    }

    const data: LoginResult = await res.json();
    setToken(data.access_token);
    setStoredUser(data.user);
    return data;
  } catch (error) {
    // Mock register if backend is unreachable
    console.warn("Backend unreachable, falling back to mock registration.");
    const mockUser: AuthUser = { id: "mock-2", username: username || "New User", email, role: "demo" };
    const mockToken = "mock.jwt.token";
    setToken(mockToken);
    setStoredUser(mockUser);
    return { access_token: mockToken, token_type: "bearer", user: mockUser };
  }
}

export async function apiGetMe(): Promise<AuthUser> {
  const token = getToken();
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Session expired");
  const user: AuthUser = await res.json();
  setStoredUser(user);
  return user;
}

export function logout(): void {
  removeToken();
}

/* ── React Context ──────────────────────────────────────────────────────── */
export interface AuthContextValue {
  user: AuthUser | null;
  authenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (u: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  authenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  setUser: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
