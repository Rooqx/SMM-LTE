import { Laptop, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { UI_COPY } from "@/config/ui-copy";
import type { ActiveSession } from "./account-types";
import { formatDate } from "@/lib/utils";

interface Props {
  currentToken: string;
  onRevokeOthers: () => Promise<void>;
  onRevokeSession: (token: string) => Promise<void>;
  pending: boolean;
  sessions: ActiveSession[];
  timezone: string;
  embedded?: boolean | undefined;
}

export function AccountSessions({
  currentToken,
  onRevokeOthers,
  onRevokeSession,
  pending,
  sessions,
  timezone,
  embedded = false,
}: Props) {
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [error, setError] = useState("");
  const otherSessions = sessions.filter(({ token }) => token !== currentToken);

  async function revoke(token: string) {
    setError("");
    try {
      await onRevokeSession(token);
      setConfirmToken(null);
    } catch {
      setError("That session could not be signed out. Please try again.");
    }
  }

  async function revokeOthers() {
    setError("");
    try {
      await onRevokeOthers();
      setConfirmOthers(false);
    } catch {
      setError("Other sessions could not be signed out. Please try again.");
    }
  }

  return (
    <section className={embedded ? "mt-3 border-t border-white/10 pt-3" : "panel rounded-[18px] p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium">{UI_COPY.account.activeSessions}</h3>
          <p className="mt-0.5 text-[9px] text-white/42">{sessions.length} connected devices</p>
        </div>
        {otherSessions.length > 0 ? (
          confirmOthers ? (
            <div className="flex gap-2">
              <Button onClick={revokeOthers} tone="danger">
                Confirm
              </Button>
              <Button onClick={() => setConfirmOthers(false)} tone="ghost">
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={() => setConfirmOthers(true)} tone="secondary">
              Sign out others
            </Button>
          )
        ) : null}
      </div>

      <div className="mt-2 grid gap-1">
        {pending ? (
          <p aria-live="polite" className="text-sm text-white/40" role="status">
            Loading active sessions…
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-white/40">
            No active session details are available.
          </p>
        ) : (
          sessions.map((session) => {
            const current = session.token === currentToken;
            const mobile = /mobile|android|iphone/i.test(session.userAgent ?? "");
            const DeviceIcon = mobile ? Smartphone : Laptop;
            return (
              <article
                className="border-b border-white/8 py-2.5 last:border-0"
                key={session.id}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-white/[.055]">
                    <DeviceIcon aria-hidden className="size-4 text-white/55" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[10px] font-medium">
                        {describeDevice(session.userAgent)}
                      </h4>
                      {current ? (
                        <span className="rounded-full bg-acid-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-acid-400">
                          This device
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[9px] text-white/35">
                      Expires {formatDate(session.expiresAt, timezone)}
                    </p>
                    {!current ? (
                      <div className="mt-3">
                        {confirmToken === session.token ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-white/50">
                              Sign this device out?
                            </span>
                            <Button
                              onClick={() => revoke(session.token)}
                              tone="danger"
                            >
                              Confirm
                            </Button>
                            <Button
                              onClick={() => setConfirmToken(null)}
                              tone="ghost"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-xs font-semibold text-coral-400 hover:text-white"
                            onClick={() => setConfirmToken(session.token)}
                            type="button"
                          >
                            Sign out this device
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
      {error ? (
        <p className="mt-4 text-xs text-coral-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function describeDevice(userAgent?: string) {
  if (!userAgent) return "Unknown device";
  const browser = /firefox/i.test(userAgent)
    ? "Firefox"
    : /edg/i.test(userAgent)
      ? "Edge"
      : /chrome/i.test(userAgent)
        ? "Chrome"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Browser";
  const platform = /iphone|ipad/i.test(userAgent)
    ? "iOS"
    : /android/i.test(userAgent)
      ? "Android"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /mac os/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : "device";
  return `${browser} on ${platform}`;
}
