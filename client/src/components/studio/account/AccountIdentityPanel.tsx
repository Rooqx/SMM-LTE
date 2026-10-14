import { KeyRound, Link2, UserRound } from "lucide-react";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PasswordVisibilityButton } from "@/components/ui/PasswordVisibilityButton";
import {
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/config/auth";
import { UI_COPY } from "@/config/ui-copy";
import { authClient } from "@/lib/auth-client";
import type { SignInMethod } from "./account-types";

interface Props {
  email: string;
  name: string;
  methods: SignInMethod[];
  methodsPending: boolean;
  children?: ReactNode;
}

export function AccountIdentityPanel({
  email,
  children,
  methods,
  methodsPending,
  name,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const hasCredential = methods.some(
    ({ providerId }) => providerId === "credential",
  );
  const hasGoogle = methods.some(({ providerId }) => providerId === "google");

  async function changePassword(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (
      newPassword.length < PASSWORD_MIN_LENGTH ||
      newPassword.length > PASSWORD_MAX_LENGTH
    ) {
      setPasswordError(PASSWORD_LENGTH_MESSAGE);
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (response.error) throw new Error();
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated and other sessions signed out.");
    } catch {
      setPasswordError("Password change failed. Check your current password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function linkGoogle() {
    setLinkError("");
    try {
      const response = await authClient.linkSocial({
        callbackURL: "/you",
        provider: "google",
      });
      if (response.error) throw new Error();
    } catch {
      setLinkError("Google linking is unavailable or is not configured.");
    }
  }

  return (
    <section className="panel rounded-[18px] p-4">
      <div className="profile-block border-b border-white/10 px-2 pb-4 pt-2 text-center">
        <span className="profile-avatar mx-auto mb-2.5 grid size-[58px] place-items-center rounded-full bg-white text-[15px] font-medium text-ink-950">
          {(name || email).slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-[13px] font-medium text-white">
            {name || "Workspace owner"}
          </strong>
          <span className="mt-0.5 block truncate text-[9px] text-white/45">
            <span>{email}</span> · Owner
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="section-line mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-white">{UI_COPY.account.signInMethods}</h3>
          <span className="text-[9px] text-white/42">{methods.length} connected</span>
        </div>
        <div className="mt-2 grid gap-1">
          {methodsPending ? (
            <p aria-live="polite" className="text-sm text-white/40" role="status">
              Loading sign-in methods…
            </p>
          ) : methods.length === 0 ? (
            <p className="text-sm text-white/40">
              No sign-in method details are available.
            </p>
          ) : (
            methods.map((method) => (
              <div
                className="connection flex min-h-[52px] items-center justify-between border-b border-white/8 px-1 py-2 last:border-0"
                key={method.id}
              >
                <span>
                  <strong className="flex items-center gap-2 text-[10px] font-medium capitalize text-white">
                    {method.providerId === "credential" ? (
                      <KeyRound aria-hidden className="size-3.5 text-white/45" />
                    ) : (
                      <UserRound aria-hidden className="size-3.5 text-white/45" />
                    )}
                    {method.providerId === "credential"
                      ? "Email and password"
                      : method.providerId}
                  </strong>
                  <span className="block text-[9px] text-white/40">Verified</span>
                </span>
                <span className="status-tag rounded-lg bg-acid-400/10 px-2 py-1 text-[8px] font-medium text-acid-400">
                  Connected
                </span>
              </div>
            ))
          )}
        </div>
        {!hasGoogle ? (
          <Button className="mt-3 w-full" onClick={linkGoogle} tone="secondary">
            <Link2 aria-hidden className="size-4" /> Connect Google
          </Button>
        ) : null}
        {linkError ? (
          <p className="mt-3 text-xs text-coral-400" role="alert">
            {linkError}
          </p>
        ) : null}
      </div>

      {children}

      {hasCredential ? (
        <details className="mt-3 border-t border-white/10 pt-3">
          <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 text-[10px] font-medium text-white/55"><KeyRound aria-hidden className="size-4" /> Password and security</summary>
          <form className="mt-3" onSubmit={changePassword}>
            <p className="text-[9px] leading-4 text-white/40">Updating your password signs out every other active session.</p>
            <div className="mt-3 space-y-3"><PasswordInput autoComplete="current-password" label="Current password" onChange={setCurrentPassword} value={currentPassword} /><PasswordInput autoComplete="new-password" label="New password" onChange={setNewPassword} value={newPassword} /></div>
            {passwordError ? <p className="mt-3 text-xs text-coral-400" role="alert">{passwordError}</p> : null}
            {passwordMessage ? <p className="mt-3 text-xs text-acid-400" role="status">{passwordMessage}</p> : null}
            <Button className="mt-3 w-full" loading={passwordBusy} tone="secondary">Update password</Button>
          </form>
        </details>
      ) : null}
    </section>
  );
}

function PasswordInput({
  autoComplete,
  label,
  onChange,
  value,
}: {
  autoComplete: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-xs font-semibold text-white/55">
        {label}
      </span>
      <span className="relative block">
        <input
          autoComplete={autoComplete}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[.04] pl-3 pr-14 text-sm text-white"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <PasswordVisibilityButton
          fieldLabel={label}
          onToggle={() => setVisible((current) => !current)}
          visible={visible}
        />
      </span>
    </label>
  );
}
