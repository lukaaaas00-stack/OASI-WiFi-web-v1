/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  sendCodeAction,
  verifyCodeAction,
  pollRelayResultAction,
  getOAuthAuthorizeUrlAction,
} from "./actions";

const PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HAS_EMAIL_OTP = PROVIDERS.includes("email-otp");
const HAS_GOOGLE = PROVIDERS.includes("google");
const HAS_TEABLE = PROVIDERS.includes("teable");

function getIsEmbedded(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You don't have permission to access this app.",
  google_failed: "Google sign-in failed. Please try again.",
  teable_failed: "Teable sign-in failed. Please try again.",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<"teable" | "google" | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [embedded, setEmbedded] = useState(false);
  const [oauthUrls, setOauthUrls] = useState<
    Record<"teable" | "google", { url: string; nonce: string } | null>
  >({ teable: null, google: null });

  useEffect(() => {
    setEmbedded(getIsEmbedded());
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    if (errorCode) {
      setError(params.get("message") || ERROR_MESSAGES[errorCode] || "Sign-in failed. Please try again.");
    }
  }, []);

  function prepareOAuthUrl(provider: "teable" | "google") {
    const from = new URLSearchParams(window.location.search).get("from") ?? undefined;
    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    getOAuthAuthorizeUrlAction(provider, from, true, nonce).then((result) => {
      if (result.url) {
        setOauthUrls((prev) => ({ ...prev, [provider]: { url: result.url, nonce } }));
      }
    });
  }

  // Pre-fetch OAuth URLs so popup navigation happens synchronously in the click handler.
  useEffect(() => {
    if (!embedded) return;
    if (HAS_TEABLE) prepareOAuthUrl("teable");
    if (HAS_GOOGLE) prepareOAuthUrl("google");
  }, [embedded]);

  // Poll relay result with nonce after popup opens
  const [relayNonce, setRelayNonce] = useState<string | null>(null);
  useEffect(() => {
    if (!relayNonce) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 60 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (cancelled) break;
        const result = await pollRelayResultAction(relayNonce);
        if (result.success) {
          const from = new URLSearchParams(window.location.search).get("from") ?? undefined;
          const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
          window.location.href = target;
          return;
        }
        if (result.error) {
          setError(result.error);
          setOauthLoadingProvider(null);
          setRelayNonce(null);
          return;
        }
      }
      if (!cancelled) {
        setOauthLoadingProvider(null);
        setRelayNonce(null);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [relayNonce]);

  function startCountdown(seconds: number) {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEmailLoading(true);
    const result = await sendCodeAction(email);
    setEmailLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setStep("code");
      startCountdown(60);
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEmailLoading(true);
    const from = new URLSearchParams(window.location.search).get("from") ?? undefined;
    const result = await verifyCodeAction(email, code, from, embedded);
    if (result?.error) {
      setError(result.error);
      setEmailLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setEmailLoading(true);
    const result = await sendCodeAction(email);
    setEmailLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      startCountdown(60);
    }
  }

  function handleOAuthSignIn(provider: "teable" | "google") {
    setError("");
    setOauthLoadingProvider(provider);
    const from = new URLSearchParams(window.location.search).get("from") ?? undefined;
    if (embedded) {
      const oauth = oauthUrls[provider];
      if (!oauth) {
        setError("Sign-in is not ready yet. Please try again.");
        setOauthLoadingProvider(null);
        return;
      }
      window.open(oauth.url, provider + "-auth", "width=500,height=600,popup=yes");
      setRelayNonce(oauth.nonce);
      setOauthUrls((prev) => ({ ...prev, [provider]: null }));
      prepareOAuthUrl(provider);
    } else {
      getOAuthAuthorizeUrlAction(provider, from).then((result) => {
        if (result.error) { setError(result.error); setOauthLoadingProvider(null); }
        else if (result.url) { window.location.href = result.url; }
      });
    }
  }

  function isOAuthPreparing(provider: "teable" | "google") {
    return embedded && !oauthUrls[provider];
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Sign in to continue"
              : `Enter the verification code sent to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === "email" ? (
            <div className="space-y-4">
              {HAS_EMAIL_OTP && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={emailLoading || Boolean(oauthLoadingProvider)}>
                    {emailLoading ? "Sending..." : "Send verification code"}
                  </Button>
                </form>
              )}

              {HAS_EMAIL_OTP && (HAS_TEABLE || HAS_GOOGLE) && (
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              {(HAS_TEABLE || HAS_GOOGLE) && (
                <div className="space-y-2">
                  {HAS_TEABLE && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={Boolean(oauthLoadingProvider) || emailLoading || isOAuthPreparing("teable")}
                      onClick={() => handleOAuthSignIn("teable")}
                    >
                      {oauthLoadingProvider === "teable" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <img src="/icons/teable.svg" alt="" className="size-4" aria-hidden="true" />
                      )}
                      Sign in with Teable
                    </Button>
                  )}

                  {HAS_GOOGLE && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={Boolean(oauthLoadingProvider) || emailLoading || isOAuthPreparing("google")}
                      onClick={() => handleOAuthSignIn("google")}
                    >
                      {oauthLoadingProvider === "google" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <img src="/icons/google.svg" alt="" className="size-4" aria-hidden="true" />
                      )}
                      Continue with Google
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={emailLoading || code.length !== 6}>
                {emailLoading ? "Verifying..." : "Sign in"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-primary disabled:opacity-50"
                  disabled={countdown > 0 || emailLoading}
                  onClick={handleResend}
                >
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                </button>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
