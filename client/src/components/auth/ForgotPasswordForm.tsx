import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { UI_COPY } from "@/config/ui-copy";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // The same result is displayed to prevent account enumeration.
    } finally {
      setSubmitted(true);
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-acid-400/20 bg-acid-400/[.06] p-5">
        <CheckCircle2 aria-hidden className="size-6 text-acid-400" />
        <p className="mt-3 text-sm leading-6 text-white/70">{UI_COPY.auth.recoveryConfirmation}</p>
        <a className="mt-4 inline-block text-sm font-semibold text-acid-400 hover:text-white" href="/login">Return to sign in</a>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <label className="block" htmlFor="recovery-email">
        <span className="mb-2 block text-sm font-semibold text-white/70">Email</span>
        <span className="relative block">
          <Mail aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/35" />
          <input autoComplete="email" className="h-13 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-12 pr-4 text-base text-white" id="recovery-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </span>
      </label>
      <button className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-acid-400 px-5 font-bold text-ink-950 transition hover:bg-white disabled:opacity-60" disabled={busy} type="submit">
        <ArrowRight aria-hidden className="size-5" />
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-xs"><a className="text-white/50 hover:text-white" href="/login">Back to sign in</a></p>
    </form>
  );
}
