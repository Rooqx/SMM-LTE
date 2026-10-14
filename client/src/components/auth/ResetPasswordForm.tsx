import { CheckCircle2, KeyRound } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { PasswordVisibilityButton } from "@/components/ui/PasswordVisibilityButton";
import {
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/config/auth";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This reset link is missing or invalid. Request a new one.");
      return;
    }
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
      const response = await authClient.resetPassword({ newPassword: password, token });
      if (response.error) throw new Error();
      setComplete(true);
    } catch {
      setError("This reset link is invalid or expired. Request a new one.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="mt-8 rounded-2xl border border-acid-400/20 bg-acid-400/[.06] p-5">
        <CheckCircle2 aria-hidden className="size-6 text-acid-400" />
        <p className="mt-3 text-sm text-white/70">Your password has been updated. Other sessions were revoked by the secure reset flow.</p>
        <a className="mt-4 inline-block text-sm font-semibold text-acid-400 hover:text-white" href="/login">Sign in</a>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <PasswordField label="New password" onChange={setPassword} value={password} />
      <PasswordField label="Confirm new password" onChange={setConfirmation} value={confirmation} />
      {error ? <p className="rounded-xl border border-coral-400/25 bg-coral-400/10 px-4 py-3 text-sm text-coral-400" role="alert">{error}</p> : null}
      <button className="h-13 w-full rounded-2xl bg-acid-400 px-5 font-bold text-ink-950 hover:bg-white disabled:opacity-60" disabled={busy} type="submit">
        {busy ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}

function PasswordField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const [visible, setVisible] = useState(false);
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-semibold text-white/70">{label}</span>
      <span className="relative block">
        <KeyRound aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/35" />
        <input autoComplete="new-password" className="h-13 w-full rounded-2xl border border-white/10 bg-white/[.045] pl-12 pr-14 text-base text-white" id={id} onChange={(event) => onChange(event.target.value)} required type={visible ? "text" : "password"} value={value} />
        <PasswordVisibilityButton
          fieldLabel={label}
          onToggle={() => setVisible((current) => !current)}
          visible={visible}
        />
      </span>
    </label>
  );
}
