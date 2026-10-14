import { ArrowRight, CheckCircle2, KeyRound, Mail, UserRound } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { PasswordVisibilityButton } from "@/components/ui/PasswordVisibilityButton";
import {
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/config/auth";
import { UI_COPY } from "@/config/ui-copy";
import { authClient, signUp } from "@/lib/auth-client";
import { safeLocalPath } from "@/lib/utils";

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      setError(PASSWORD_LENGTH_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await signUp.email({
        callbackURL: safeLocalPath(nextPath),
        email: email.trim().toLowerCase(),
        name: name.trim(),
        password,
      });
      // Keep account-existence details private. The confirmation is useful for
      // successful registrations and does not disclose why another attempt failed.
      if (response.error) {
        setSubmitted(true);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Account creation is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError("");
    try {
      await authClient.sendVerificationEmail({
        callbackURL: safeLocalPath(nextPath),
        email: email.trim().toLowerCase(),
      });
    } catch {
      // The visible confirmation remains intentionally generic.
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-acid-400/20 bg-acid-400/[.06] p-5">
        <CheckCircle2 aria-hidden className="size-6 text-acid-400" />
        <p className="mt-3 text-sm leading-6 text-white/70">
          {UI_COPY.auth.verificationConfirmation}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button className="font-semibold text-acid-400 hover:text-white" disabled={busy} onClick={resendVerification} type="button">
            Resend verification
          </button>
          <a className="font-semibold text-white/60 hover:text-white" href={`/login?next=${encodeURIComponent(nextPath)}`}>
            Return to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <AuthInput autoComplete="name" icon={UserRound} label="Your name" onChange={setName} required type="text" value={name} />
      <AuthInput autoComplete="email" icon={Mail} label="Email" onChange={setEmail} required type="email" value={email} />
      <AuthInput autoComplete="new-password" icon={KeyRound} label="Password" onChange={setPassword} required type="password" value={password} />
      <AuthInput autoComplete="new-password" icon={KeyRound} label="Confirm password" onChange={setConfirmation} required type="password" value={confirmation} />
      {error ? <p className="rounded-xl border border-coral-400/25 bg-coral-400/10 px-4 py-3 text-sm text-coral-400" role="alert">{error}</p> : null}
      <button className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-acid-400 px-5 font-bold text-ink-950 transition hover:bg-white disabled:opacity-60" disabled={busy} type="submit">
        <ArrowRight aria-hidden className="size-5" />
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-xs text-white/40">
        Already registered? <a className="font-semibold text-acid-400 hover:text-white" href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</a>
      </p>
    </form>
  );
}

function AuthInput({ autoComplete, icon: Icon, label, onChange, required, type, value }: {
  autoComplete: string;
  icon: typeof Mail;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type: "email" | "password" | "text";
  value: string;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const id = `register-${label.toLowerCase().replaceAll(" ", "-")}`;
  const isPassword = type === "password";
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-semibold text-white/70">{label}</span>
      <span className="relative block">
        <Icon aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/35" />
        <input autoComplete={autoComplete} className={`h-13 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-12 text-base text-white ${isPassword ? "pr-14" : "pr-4"}`} id={id} onChange={(event) => onChange(event.target.value)} required={required} type={isPassword && passwordVisible ? "text" : type} value={value} />
        {isPassword ? (
          <PasswordVisibilityButton
            fieldLabel={label}
            onToggle={() => setPasswordVisible((visible) => !visible)}
            visible={passwordVisible}
          />
        ) : null}
      </span>
    </label>
  );
}
