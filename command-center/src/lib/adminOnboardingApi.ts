/**
 * command-center/src/lib/adminOnboardingApi.ts
 * ─────────────────────────────────────────────
 * Admin DER Onboarding API Client (Phase 10 / Prompt 10.1).
 * Interfaces with /api/admin/onboarding/* on the Broker.
 */

import { apiGet, apiPost, BROKER_URL } from "./apiClient";

export interface OnboardingApplication {
  id: string;
  userId: string;
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  status:
    | "REGISTERED"
    | "PROFILE_INCOMPLETE"
    | "PENDING_VERIFICATION"
    | "APPROVED"
    | "MICROGRID_PROVISIONED"
    | "AGENT_PROVISIONED"
    | "ACTIVE"
    | "REJECTED"
    | "SUSPENDED";
  siteName: string | null;
  location: string | null;
  derType: string | null;
  capacityKw?: number | null;
  batteryCapacityKwh?: number | null;
  generationCost?: number | null;
  hasPrivateInfo?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reason?: string | null;
  microgridId?: string | null;
  agentId?: string | null;
  derId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningResult {
  message: string;
  status: string;
  provisioning: {
    microgridId: string;
    derId: string;
    agentId: string;
    busId: string;
  };
}

export async function listOnboardingApplications(
  status?: string,
  page = 1,
  limit = 50
): Promise<OnboardingApplication[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));

  return apiGet<OnboardingApplication[]>(
    BROKER_URL,
    `/api/admin/onboarding?${params.toString()}`
  );
}

export async function getOnboardingApplication(id: string): Promise<OnboardingApplication> {
  return apiGet<OnboardingApplication>(
    BROKER_URL,
    `/api/admin/onboarding/${encodeURIComponent(id)}`
  );
}

export async function approveOnboarding(
  id: string,
  reason = "Administrative approval"
): Promise<{ message: string; status: string; onboarding: OnboardingApplication }> {
  return apiPost(
    BROKER_URL,
    `/api/admin/onboarding/${encodeURIComponent(id)}/approve`,
    { reason }
  );
}

export async function rejectOnboarding(
  id: string,
  reason: string
): Promise<{ message: string; status: string; onboarding: OnboardingApplication }> {
  return apiPost(
    BROKER_URL,
    `/api/admin/onboarding/${encodeURIComponent(id)}/reject`,
    { reason }
  );
}

export async function suspendOnboarding(
  id: string,
  reason: string
): Promise<{ message: string; status: string; onboarding: OnboardingApplication }> {
  return apiPost(
    BROKER_URL,
    `/api/admin/onboarding/${encodeURIComponent(id)}/suspend`,
    { reason }
  );
}

export async function triggerProvisioning(
  id: string,
  busId?: string,
  phase?: string,
  agentType?: string
): Promise<ProvisioningResult> {
  return apiPost<ProvisioningResult>(
    BROKER_URL,
    `/api/admin/onboarding/${encodeURIComponent(id)}/provision`,
    { busId, phase, agentType }
  );
}
