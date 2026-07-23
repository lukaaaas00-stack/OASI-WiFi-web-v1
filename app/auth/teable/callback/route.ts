import { exchangeOAuthCode } from "@/lib/auth";
import { publicUrl } from "@/lib/public-url";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const POPUP_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Signing in</title>\n<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#333;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{text-align:center;padding:2.5rem;max-width:360px}.icon{width:48px;height:48px;margin:0 auto 1rem;border-radius:50%;background:#eef2ff;display:flex;align-items:center;justify-content:center}.spinner{width:26px;height:26px;border:3px solid #c7d2fe;border-top-color:#4f46e5;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}h2{font-size:1.125rem;font-weight:600;margin-bottom:.5rem}p{font-size:.875rem;color:#666}</style>\n</head>\n<body><div class=\"card\"><div class=\"icon\"><div class=\"spinner\" aria-hidden=\"true\"></div></div><h2>Returning to the app</h2><p>This window will close automatically.</p></div>\n<script>setTimeout(function(){window.close()},600)</script>\n</body></html>";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("popup") === "1") {
    return new NextResponse(POPUP_HTML, { headers: { "Content-Type": "text/html" } });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(publicUrl(req, "/login?error=teable_failed"));
  }
  const result = await exchangeOAuthCode(code);
  if (!result.success) {
    const url = publicUrl(req, "/login");
    url.searchParams.set("error", "teable_failed");
    url.searchParams.set("message", result.error);
    return NextResponse.redirect(url);
  }
  const from = req.nextUrl.searchParams.get("from") ?? "/";
  const target = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  return NextResponse.redirect(publicUrl(req, target));
}
