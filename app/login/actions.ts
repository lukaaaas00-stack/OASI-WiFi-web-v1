"use server";

import { redirect } from "next/navigation";
import {
  sendVerificationCode,
  verifyCode,
  setSessionFromToken,
  getOAuthAuthorizeUrl,
} from "@/lib/auth";
import { getConfig, request as apiRequest } from "@/lib/request";

const PROVIDERS = new Set(
  (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function ensureProvider(type: string): string | null {
  if (PROVIDERS.has(type)) return null;
  return `Sign-in method "${type}" is not enabled`;
}

// ── Email OTP ───────────────────────────────────────────────────

export async function sendCodeAction(email: string): Promise<{ error?: string }> {
  const disabled = ensureProvider("email-otp");
  if (disabled) return { error: disabled };
  if (!email) return { error: "Email is required" };
  try {
    await sendVerificationCode(email);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send code" };
  }
}

export async function verifyCodeAction(
  email: string,
  code: string,
  from?: string,
  embedded = false
): Promise<{ error?: string }> {
  const disabled = ensureProvider("email-otp");
  if (disabled) return { error: disabled };
  if (!email || !code) return { error: "Email and code are required" };
  const result = await verifyCode(email, code, embedded);
  if (!result.success) {
    return { error: result.error };
  }
  const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  redirect(target);
}

// ── OAuth ───────────────────────────────────────────────────────

export async function getOAuthAuthorizeUrlAction(
  provider: "google" | "teable",
  from?: string,
  popup?: boolean,
  nonce?: string
): Promise<{ url?: string; error?: string }> {
  const disabled = ensureProvider(provider);
  if (disabled) return { error: disabled };
  try {
    const url = await getOAuthAuthorizeUrl(provider, from, popup, nonce);
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start sign-in" };
  }
}

// ── OAuth relay (popup stores result on server, iframe polls it) ─

export async function pollRelayResultAction(
  nonce: string
): Promise<{ success?: boolean; error?: string | null }> {
  try {
    const { baseId, appId } = await getConfig();
    const data = await apiRequest<{ token: string | null; error: string | null }>(
      `/base/${baseId}/app/${appId}/auth/relay-result?nonce=${encodeURIComponent(nonce)}`
    );
    if (data.token) {
      await setSessionFromToken(data.token, true);
      return { success: true };
    }
    if (data.error) {
      return { error: data.error };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to check sign-in status" };
  }
}

