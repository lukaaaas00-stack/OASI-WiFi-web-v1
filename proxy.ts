import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "./lib/auth";

const SESSION_COOKIE = "app_session";

const PUBLIC_PATHS = [
  "/login",
  "/auth/google/callback",
  "/auth/teable/callback",
  "/api/beacon",
];

const AUTH_PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, secure: true, sameSite: "lax" });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, secure: true, sameSite: "none", partitioned: true });
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (AUTH_PROVIDERS.length === 0) {
    return NextResponse.next();
  }

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return redirectToLogin(request);
  }

  if (!(await verifyJWT(sessionCookie.value))) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
