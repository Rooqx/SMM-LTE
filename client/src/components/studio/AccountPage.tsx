import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/Feedback";
import { UI_COPY } from "@/config/ui-copy";
import { authClient, useSession } from "@/lib/auth-client";
import type { Workspace } from "@/lib/contracts";
import { endPrivateSession } from "@/lib/session-security";
import { AccountHeader } from "./account/AccountHeader";
import { AccountIdentityPanel } from "./account/AccountIdentityPanel";
import { AccountSessions } from "./account/AccountSessions";
import { AccountWorkspacePanel } from "./account/AccountWorkspacePanel";
import { PwaInstallCard } from "./account/PwaInstallCard";
import type {
  ActiveSession,
  SignInMethod,
} from "./account/account-types";

const accountQueryKey = (userId: string) =>
  ["account", userId, "methods"] as const;
const sessionsQueryKey = (userId: string) =>
  ["account", userId, "sessions"] as const;

export function AccountPage({
  workspace,
}: {
  workspace: Workspace | undefined;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const userId = session.data?.user.id ?? "";
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const methods = useQuery({
    queryKey: accountQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<SignInMethod[]> => {
      const response = await authClient.listAccounts();
      if (response.error) throw new Error("Sign-in methods are unavailable.");
      return (response.data ?? []).map((account) => ({
        id: account.id,
        providerId: account.providerId,
        ...(account.createdAt
          ? { createdAt: new Date(account.createdAt) }
          : {}),
      }));
    },
  });

  const sessions = useQuery({
    queryKey: sessionsQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActiveSession[]> => {
      const response = await authClient.listSessions();
      if (response.error) throw new Error("Active sessions are unavailable.");
      return (response.data ?? []).map((item) => ({
        id: item.id,
        token: item.token,
        expiresAt: new Date(item.expiresAt),
        ...(item.updatedAt ? { updatedAt: new Date(item.updatedAt) } : {}),
        ...(item.userAgent ? { userAgent: item.userAgent } : {}),
      }));
    },
  });

  async function revokeSession(token: string) {
    const response = await authClient.revokeSession({ token });
    if (response.error) throw new Error("Session revocation failed.");
    await queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
  }

  async function revokeOtherSessions() {
    const response = await authClient.revokeOtherSessions();
    if (response.error) throw new Error("Session revocation failed.");
    await queryClient.invalidateQueries({ queryKey: sessionsQueryKey(userId) });
  }

  async function secureSignOut() {
    setSignOutError("");
    setSigningOut(true);
    try {
      await endPrivateSession(queryClient);
      window.location.assign("/login");
    } catch {
      setSignOutError("Sign-out failed. Please try again.");
      setSigningOut(false);
    }
  }

  if (session.isPending) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.account.title}</h1>
        <LoadingState label="Loading your secure account…" />
      </>
    );
  }

  if (session.error || !session.data?.user || !session.data.session) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.account.title}</h1>
        <ErrorState message="Your account session could not be loaded." />
      </>
    );
  }

  return (
    <div>
      <AccountHeader />
      <div className="account-grid grid items-start gap-3.5 min-[720px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="account-panel">
          <AccountIdentityPanel
            email={session.data.user.email}
            methods={methods.data ?? []}
            methodsPending={methods.isPending}
            name={session.data.user.name}
          >
            <AccountSessions
              currentToken={session.data.session.token}
              embedded
              onRevokeOthers={revokeOtherSessions}
              onRevokeSession={revokeSession}
              pending={sessions.isPending}
              sessions={sessions.data ?? []}
              timezone={workspace?.timezone ?? "UTC"}
            />
          </AccountIdentityPanel>
          {methods.isError ? (
            <p className="text-xs text-coral-400" role="alert">
              Sign-in methods could not be loaded.
            </p>
          ) : null}
        </div>
        <div className="account-panel">
          <AccountWorkspacePanel userId={userId} workspace={workspace} />
          {sessions.isError ? (
            <p className="text-xs text-coral-400" role="alert">
              Active sessions could not be loaded.
            </p>
          ) : null}
        </div>
      </div>
      <details className="panel mt-3.5 rounded-[18px] p-4">
        <summary className="min-h-10 cursor-pointer list-none text-[10px] font-medium text-white/55">App installation and session controls</summary>
        <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 min-[720px]:grid-cols-2">
          <PwaInstallCard />
          <section className="rounded-[18px] border border-coral-400/15 bg-coral-400/[.035] p-4">
            <h3 className="text-xs font-medium">End this session</h3>
            <p className="mt-1 text-[10px] leading-4 text-white/42">Private cached data is cleared before sign-out completes.</p>
            <Button className="mt-4 w-full" loading={signingOut} onClick={secureSignOut} tone="danger"><LogOut aria-hidden className="size-4" />{UI_COPY.account.signOut}</Button>
            {signOutError ? <p className="mt-3 text-xs text-coral-400" role="alert">{signOutError}</p> : null}
          </section>
        </div>
      </details>
    </div>
  );
}
