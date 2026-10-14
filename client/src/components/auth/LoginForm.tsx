import { ArrowRight, Globe, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { PasswordVisibilityButton } from "@/components/ui/PasswordVisibilityButton";
import { UI_COPY } from "@/config/ui-copy";
import { signIn } from "@/lib/auth-client";
import { safeLocalPath } from "@/lib/utils";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });

      if (response.error) {
        throw new Error(UI_COPY.auth.invalidCredentialsError);
      }

      // Revalidate in the browser as a defense in depth against an unsafe prop.
      window.location.assign(safeLocalPath(nextPath));
    } catch {
      setError(UI_COPY.auth.invalidCredentialsError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setSocialLoading(true);
    setError("");
    try {
      await signIn.social({
        provider: "google",
        callbackURL: safeLocalPath(nextPath),
      });
    } catch {
      setError("Google sign-in is not configured or unavailable.");
      setSocialLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <form className="space-y-4" onSubmit={submit}>
        <label className="block" htmlFor="login-email">
          <span className="mb-2 block text-sm font-semibold text-white/70">
            {UI_COPY.auth.emailLabel}
          </span>
          <span className="relative block">
            <Mail
              aria-hidden
              className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/35"
            />
            <input
              autoComplete="username"
              className="h-13 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-12 pr-14 text-base text-white placeholder:text-white/25 transition hover:border-white/20 focus:border-acid-400/70"
              id="login-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </span>
        </label>

        <label className="block" htmlFor="login-password">
          <span className="mb-2 flex items-center justify-between text-sm font-semibold text-white/70">
            <span>{UI_COPY.auth.passwordLabel}</span>
          </span>
          <span className="relative block">
            <KeyRound
              aria-hidden
              className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/35"
            />
            <input
              autoComplete="current-password"
              className="h-13 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-12 pr-4 text-base text-white placeholder:text-white/25 transition hover:border-white/20 focus:border-acid-400/70"
              id="login-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type={passwordVisible ? "text" : "password"}
              value={password}
            />
            <PasswordVisibilityButton
              fieldLabel={UI_COPY.auth.passwordLabel}
              onToggle={() => setPasswordVisible((visible) => !visible)}
              visible={passwordVisible}
            />
          </span>
        </label>

        {error ? (
          <p
            className="rounded-xl border border-coral-400/25 bg-coral-400/10 px-4 py-3 text-sm text-coral-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-acid-400 px-5 font-bold text-ink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting || socialLoading}
          type="submit"
        >
          {submitting ? (
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
          ) : (
            <ArrowRight
              aria-hidden
              className="size-5 transition-transform group-hover:translate-x-1"
            />
          )}
          {submitting ? "Signing in…" : UI_COPY.auth.signInAction}
        </button>
      </form>

      <div className="relative my-6 text-center">
        <div aria-hidden className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <span className="relative bg-ink-900 px-3 text-xs uppercase tracking-wider text-white/40">
          Or
        </span>
      </div>

      <button
        className="flex h-13 w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] px-5 font-semibold text-white transition hover:bg-white/[.07] hover:border-white/20 disabled:opacity-50"
        disabled={submitting || socialLoading}
        onClick={handleGoogleSignIn}
        type="button"
      >
        {socialLoading ? (
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        ) : (
          <Globe aria-hidden className="size-5 text-sky-400" />
        )}
        {UI_COPY.auth.googleSignInAction}
      </button>

      <p className="text-center text-xs leading-5 text-white/35">
        Protected by Better Auth with secure HttpOnly session cookies.
      </p>
      <div className="flex items-center justify-center gap-3 text-xs">
        <a
          className="text-white/55 underline decoration-white/20 underline-offset-4 hover:text-white"
          href={`/forgot-password?next=${encodeURIComponent(nextPath)}`}
        >
          {UI_COPY.auth.forgotPasswordAction}
        </a>
        <span aria-hidden className="text-white/20">·</span>
        <a
          className="font-semibold text-acid-400 hover:text-white"
          href={`/register?next=${encodeURIComponent(nextPath)}`}
        >
          {UI_COPY.auth.createAccountAction}
        </a>
      </div>
    </div>
  );
}
