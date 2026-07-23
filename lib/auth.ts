"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig, request } from "./request";

const SESSION_COOKIE = "app_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// SameSite=None + Partitioned (CHIPS) when embedded in iframe, Lax otherwise.
function sessionCookieOptions(embedded = false) {
  return {
    httpOnly: true,
    secure: true,
    path: "/",
    maxAge: SESSION_MAX_AGE,
    ...(embedded
      ? { sameSite: "none" as const, partitioned: true }
      : { sameSite: "lax" as const }),
  };
}

function getAppEnvironment(): "development" | "production" {
  return process.env.NODE_ENV === "development" ? "development" : "production";
}

async function authPost<T>(path: string, body: unknown): Promise<T> {
  const { baseId, appId } = await getConfig();
  return request<T>(`/base/${baseId}/app/${appId}${path}`, {
    method: "POST",
    body,
  });
}

// ── Email OTP ───────────────────────────────────────────────────

export async function sendVerificationCode(email: string): Promise<{ expiresIn: number }> {
  return authPost("/auth/send-code", { email, environment: getAppEnvironment() });
}

export async function verifyCode(
  email: string,
  code: string,
  embedded = false
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const data = await authPost<{ token: string; user: { id: string; email: string } }>(
      "/auth/verify-code",
      { email, code, environment: getAppEnvironment() }
    );
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, data.token, sessionCookieOptions(embedded));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification failed",
    };
  }
}

export async function validateSessionToken(
  token: string
): Promise<{ user: AuthUser | null }> {
  return authPost("/auth/validate-session", { token, environment: getAppEnvironment() });
}

// ── OAuth ───────────────────────────────────────────────────────

/**
 * Build the URL the browser navigates to to start an OAuth sign-in flow.
 * The Teable backend redirects to the provider, then back to our callback route.
 */
export async function getOAuthAuthorizeUrl(
  provider: "google" | "teable",
  from?: string,
  popup?: boolean,
  nonce?: string
): Promise<string> {
  const { baseId, appId } = await getConfig();
  const data = await request<{ url: string }>(
    `/base/${baseId}/app/${appId}/auth/oauth/authorize`,
    {
      method: "POST",
      body: { provider, environment: getAppEnvironment(), from, popup, nonce },
    }
  );
  return data.url;
}

/**
 * Exchange a one-time OAuth callback code for an app session token and persist
 * it in a session cookie. The long-lived bearer token never appears in the URL.
 */
export async function exchangeOAuthCode(
  code: string,
  embedded = false
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const data = await authPost<{ token: string }>("/auth/oauth/exchange-code", { code });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, data.token, sessionCookieOptions(embedded));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sign-in failed",
    };
  }
}

/**
 * Persist a session cookie from a token issued by the Teable backend
 * (used by popup relay server actions).
 */
export async function setSessionFromToken(token: string, embedded = false): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(embedded));
}

// ── JWT Verification (HS256 via Web Crypto) ─────────────────────

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const { token: appToken } = await getConfig();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(appToken),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(sig),
      encoder.encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body))
    ) as Record<string, unknown>;
    if (payload.exp && typeof payload.exp === "number" && payload.exp < Date.now() / 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ── Session Management ──────────────────────────────────────────

export interface LoginProfile {
  name?: string;
  avatar?: string;
  provider: string;
}

export interface AuthUser {
  id: string;
  email: string;
  profile?: LoginProfile;
}

export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyJWT(token);
  if (!payload?.sub || !payload?.email) return null;
  try {
    const { user } = await validateSessionToken(token);
    if (user) return user;
  } catch {
    // Treat validation failures as an invalid session so stale access never survives refresh.
  }
  await destroySession();
  return null;
}

const AUTH_ENABLED = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .filter(Boolean).length > 0;

export async function requireAuth(): Promise<AuthUser> {
  if (!AUTH_ENABLED) return { id: "anonymous", email: "" };
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  // Clear with matching attributes (browsers require partitioned cookies to be cleared with partitioned flag)
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(true), maxAge: 0 });
}
