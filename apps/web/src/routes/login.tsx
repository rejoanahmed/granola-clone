import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { authClient } from "@web/lib/auth-client";
import type { LoginSearch } from "@web/lib/route-search";
import { SESSION_QUERY_KEY } from "@web/services/auth";
import { type FormEvent, useState } from "react";

// Email OTP is the only credential; there is no password anywhere. With no mail provider wired,
// the API logs the OTP to its console — that is where you read it in local development.
export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    // Only a path, never an absolute URL: accepting one would turn sign-in into an open redirect.
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : null,
  }),
});

type Step = "email" | "otp";

function LoginPage() {
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setBusy(false);
    if (sendError) {
      setError(sendError.message ?? "Could not send the code");
      return;
    }
    setStep("otp");
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({
      email,
      otp,
    });
    if (signInError) {
      setBusy(false);
      setError(signInError.message ?? "That code did not work");
      return;
    }

    // All three, in this order: drop the cached session, re-run `beforeLoad` so the root context
    // picks it up, then navigate — the `/organiser` guard reads that context and would bounce back.
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    await router.invalidate();
    await router.navigate({ to: redirect ?? "/" });
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="font-semibold text-2xl">Sign in</h1>
      <p className="mt-1 text-muted text-sm">
        We email you a six-digit code. No password to remember.
      </p>

      {step === "email" ? (
        <form className="mt-6 grid gap-3" onSubmit={sendOtp}>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Email</span>
            <input
              autoComplete="email"
              className="evb-field"
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <button className="evb-button" disabled={busy} type="submit">
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form className="mt-6 grid gap-3" onSubmit={verifyOtp}>
          <p className="text-muted text-sm">
            Code sent to <span className="text-ink">{email}</span>.
          </p>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Six-digit code</span>
            <input
              autoComplete="one-time-code"
              className="evb-field font-mono tracking-widest"
              inputMode="numeric"
              onChange={(event) => setOtp(event.currentTarget.value)}
              required
              value={otp}
            />
          </label>
          <button className="evb-button" disabled={busy} type="submit">
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            className="text-muted text-sm underline"
            onClick={() => {
              setStep("email");
              setOtp("");
              setError(null);
            }}
            type="button"
          >
            Use a different email
          </button>
        </form>
      )}

      {error ? <p className="mt-4 text-bad text-sm">{error}</p> : null}
    </main>
  );
}
