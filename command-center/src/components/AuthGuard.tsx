/**
 * command-center/src/components/AuthGuard.tsx
 * ─────────────────────────────────────────────
 * Wraps protected routes. Redirects to /login if not authenticated.
 */

import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../lib/auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
