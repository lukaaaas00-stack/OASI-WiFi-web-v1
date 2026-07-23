import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first || undefined;
}

/**
 * The app runs behind the App Runtime proxy, where `req.url` reflects the
 * internal listen address (e.g. http://0.0.0.0:8080) rather than the public
 * domain. Resolve the public origin from the forwarded headers set by the
 * proxy, falling back to the Host header.
 */
export function getPublicOrigin(req: NextRequest): string {
  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  const host = firstHeaderValue(req.headers.get("host"));
  if (host) {
    const proto =
      forwardedProto ?? (/^(localhost|127\.|0\.0\.0\.0)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

/** Build an absolute URL on the app's public origin (use for redirects). */
export function publicUrl(req: NextRequest, pathWithQuery: string): URL {
  return new URL(pathWithQuery, getPublicOrigin(req));
}
