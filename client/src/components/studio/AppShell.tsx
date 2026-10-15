import { Bell, CircleUserRound, LogOut, Sparkles } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CreateWorkspace } from "@/components/studio/CreateWorkspace";
import { MobileNavDock } from "@/components/studio/MobileNavDock";
import { PhaseProgressStrip } from "@/components/studio/PhaseProgressStrip";
import { WorkspaceSwitcher } from "@/components/studio/WorkspaceSwitcher";
import { StudioNavContext } from "@/components/studio/StudioNavigationContext";
import { TodayPage } from "@/components/studio/TodayPage";
import { LibraryPage } from "@/components/studio/LibraryPage";
import { BrandPage } from "@/components/studio/BrandPage";
import { AccountPage } from "@/components/studio/AccountPage";
import { ErrorState } from "@/components/ui/Feedback";
import { WorkspaceShellSkeleton } from "@/components/ui/Skeletons";
import { PRIMARY_NAV_ITEMS } from "@/config/navigation";
import { PRODUCT_CONFIG } from "@/config/product";
import { UI_COPY } from "@/config/ui-copy";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import type { Workspace } from "@/lib/contracts";
import { studioQueryKeys } from "@/lib/query-keys";
import { endPrivateSession } from "@/lib/session-security";

export function useWorkspaceSelection(workspaces: Workspace[] | undefined) {
  const requested = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("workspace");
  return workspaces?.find((item) => item.id === requested) ?? workspaces?.[0];
}

function withWorkspace(href: string, workspaceId?: string): string {
  if (!workspaceId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;
}

function personInitials(name?: string | null): string {
  if (!name) return "YOU";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function pathForTitle(title: string): string {
  switch (title.toLowerCase()) {
    case "library":
      return "/library";
    case "brand":
      return "/brand";
    case "you":
      return "/you";
    default:
      return "/";
  }
}

function titleForPath(path: string): string {
  if (path === "/library" || path.startsWith("/library/")) return "Library";
  if (path === "/brand" || path.startsWith("/brand/")) return "Brand";
  if (path === "/you" || path.startsWith("/you/")) return "You";
  return "Today";
}

export function AppShell({
  children,
  pageTitle,
}: {
  children?: ((workspace?: Workspace) => ReactNode) | ReactNode;
  pageTitle: string;
}) {
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();
  const session = useSession();
  const notifRef = useRef<HTMLDivElement>(null);
  const notifTriggerRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  // Client-side SPA route tracking with 0ms active indicator feedback
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window === "undefined") return pathForTitle(pageTitle);
    return window.location.pathname || pathForTitle(pageTitle);
  });

  const workspacesQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.workspaces,
    queryFn: ({ pageParam, signal }) =>
      api.listWorkspaces({ cursor: pageParam, limit: 30 }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.workspaces) ?? [];
  const workspace = useWorkspaceSelection(workspaces);
  const initials = personInitials(session.data?.user.name);

  // Handle browser Back / Forward history
  useEffect(() => {
    function onPopState() {
      setCurrentPath(window.location.pathname || "/");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function outside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotificationsOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (notificationsOpen) {
        setNotificationsOpen(false);
        notifTriggerRef.current?.focus();
      }
      if (profileOpen) {
        setProfileOpen(false);
        profileTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen, profileOpen]);

  function navigate(targetHref: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(targetHref, origin);
    const targetPath = url.pathname;

    if (workspace?.id && !url.searchParams.has("workspace")) {
      url.searchParams.set("workspace", workspace.id);
    }

    // Instant 0ms active indicator
    setCurrentPath(targetPath);

    if (typeof window !== "undefined") {
      const fullHref = `${url.pathname}${url.search}`;
      window.history.pushState(null, "", fullHref);
      const newTitle = titleForPath(targetPath);
      document.title = `${newTitle} · ${PRODUCT_CONFIG.name}`;
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  function handleNavClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    if (currentPath === href) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    navigate(href);
  }

  function selectWorkspace(selected: Workspace) {
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", selected.id);
    window.location.assign(`${url.pathname}${url.search}`);
  }

  async function logout() {
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

  const switcherProps = {
    currentWorkspace: workspace,
    hasMore: Boolean(workspacesQuery.hasNextPage),
    isLoadingMore: workspacesQuery.isFetchingNextPage,
    onCreateNew: () => setCreateWorkspaceOpen(true),
    onLoadMore: () => void workspacesQuery.fetchNextPage(),
    onSelect: selectWorkspace,
    workspaces,
  };

  const activeTitle = titleForPath(currentPath);

  function renderView(ws: Workspace | undefined) {
    const normalized = currentPath.toLowerCase();
    if (normalized === "/library" || normalized.startsWith("/library/")) {
      return <LibraryPage workspace={ws} />;
    }
    if (normalized === "/brand" || normalized.startsWith("/brand/")) {
      return <BrandPage workspace={ws} />;
    }
    if (normalized === "/you" || normalized.startsWith("/you/")) {
      return <AccountPage workspace={ws} />;
    }
    if (normalized === "/" || normalized === "") {
      return <TodayPage workspace={ws} />;
    }
    if (children) {
      return typeof children === "function" ? children(ws) : children;
    }
    return <TodayPage workspace={ws} />;
  }

  return (
    <StudioNavContext.Provider value={{ currentPath, navigate }}>
      <div className="min-h-screen bg-ink-950 text-white antialiased">
        <header className="sticky top-0 z-40 hidden border-b border-white/[.08] bg-ink-900/95 backdrop-blur-xl md:block">
          <div className="flex min-h-16 items-center gap-4 px-5">
            <a
              className="group flex items-center gap-2.5 whitespace-nowrap text-[13px] font-medium"
              href={withWorkspace("/", workspace?.id)}
              onClick={(e) => handleNavClick(e, "/")}
              title={PRODUCT_CONFIG.name}
            >
              <span className="grid size-8 place-items-center rounded-[10px] bg-acid-400 text-ink-950 transition-transform group-hover:scale-105">
                <Sparkles aria-hidden className="size-4" />
              </span>
              <span>{PRODUCT_CONFIG.name}</span>
            </a>
            <WorkspaceSwitcher {...switcherProps} />

            <nav aria-label="Primary" className="ml-auto flex items-center gap-0.5">
              {PRIMARY_NAV_ITEMS.filter((item) => item.key !== "you").map(({ href, icon: Icon, label }) => {
                const active = href === "/" ? currentPath === "/" : currentPath === href || currentPath.startsWith(`${href}/`);
                return (
                  <a
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[38px] items-center gap-1.5 rounded-[9px] px-2.5 text-[11px] font-medium transition ${
                      active ? "bg-white/[.07] text-white" : "text-white/48 hover:bg-white/[.05] hover:text-white/85"
                    }`}
                    href={withWorkspace(href, workspace?.id)}
                    onClick={(e) => handleNavClick(e, href)}
                    key={href}
                  >
                    <Icon aria-hidden className="size-4" />
                    <span>{label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="relative" ref={notifRef}>
              <button
                aria-controls="decision-alerts-popover"
                aria-expanded={notificationsOpen}
                aria-label="Notifications"
                className="grid size-[38px] place-items-center rounded-[10px] border border-white/10 bg-ink-800/70 text-white/65 transition hover:border-white/20 hover:text-white"
                onClick={() => setNotificationsOpen((current) => !current)}
                ref={notifTriggerRef}
                type="button"
              >
                <Bell aria-hidden className="size-4" />
              </button>
              {notificationsOpen ? (
                <section aria-label="Notifications popover" className="panel absolute right-0 z-50 mt-2 w-80 rounded-2xl p-4 shadow-2xl" id="decision-alerts-popover">
                  <p className="border-b border-white/10 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/70">{UI_COPY.shell.notificationsTitle}</p>
                  <div className="py-4 text-center">
                    <Bell aria-hidden className="mx-auto mb-2 size-6 text-white/35" />
                    <p className="text-xs leading-5 text-white/55">{UI_COPY.shell.notificationsUnavailable}</p>
                    <a
                      className="mt-3 inline-flex min-h-10 items-center rounded-[10px] px-3 text-xs font-medium text-acid-400 hover:bg-acid-400/10"
                      href={withWorkspace("/", workspace?.id)}
                      onClick={(e) => {
                        setNotificationsOpen(false);
                        handleNavClick(e, "/");
                      }}
                    >
                      Open Today
                    </a>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="relative" ref={profileRef}>
              <button
                aria-controls="account-popover"
                aria-expanded={profileOpen}
                aria-label="User account"
                className="grid size-[34px] place-items-center rounded-full bg-white text-[10px] font-semibold text-ink-950 transition hover:bg-acid-400"
                onClick={() => setProfileOpen((current) => !current)}
                ref={profileTriggerRef}
                type="button"
              >
                {initials}
              </button>
              {profileOpen ? (
                <section aria-label="Account menu" className="panel absolute right-0 z-50 mt-2 w-52 rounded-2xl p-1.5 shadow-2xl" id="account-popover">
                  <a
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/[.06] hover:text-white"
                    href={withWorkspace("/you", workspace?.id)}
                    onClick={(e) => {
                      setProfileOpen(false);
                      handleNavClick(e, "/you");
                    }}
                  >
                    <CircleUserRound aria-hidden className="size-4 text-white/50" />
                    {UI_COPY.shell.userAccount}
                  </a>
                  <div className="my-1 border-t border-white/10" />
                  <button className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-coral-400 hover:bg-coral-400/10" disabled={signingOut} onClick={logout} type="button">
                    <LogOut aria-hidden className="size-4" />
                    {signingOut ? "Signing out…" : UI_COPY.shell.signOutAction}
                  </button>
                  {signOutError ? <p className="px-3 py-2 text-xs text-coral-400" role="alert">{signOutError}</p> : null}
                </section>
              ) : null}
            </div>
          </div>
        </header>

        <header className="sticky top-0 z-40 flex min-h-[58px] items-center gap-2.5 border-b border-white/[.08] bg-ink-900/95 px-3.5 backdrop-blur-xl md:hidden">
          <a
            className="flex flex-1 items-center gap-2 whitespace-nowrap text-[13px] font-medium"
            href={withWorkspace("/", workspace?.id)}
            onClick={(e) => handleNavClick(e, "/")}
          >
            <span className="grid size-8 place-items-center rounded-[10px] bg-acid-400 text-ink-950">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <span>{PRODUCT_CONFIG.shortName}</span>
          </a>
          <WorkspaceSwitcher compact {...switcherProps} />
          <a
            aria-label="Your account"
            className="grid size-[34px] place-items-center rounded-full bg-white text-[10px] font-semibold text-ink-950"
            href={withWorkspace("/you", workspace?.id)}
            onClick={(e) => handleNavClick(e, "/you")}
          >
            {initials}
          </a>
        </header>

        {currentPath === "/" ? <PhaseProgressStrip currentPhase={workspace?.current_phase ?? 1} /> : null}

        <main className="mx-auto w-full max-w-[900px] px-3.5 py-5 sm:px-6 sm:py-7 mobile-dock-clearance" id="main-content" tabIndex={-1}>
          {workspacesQuery.isPending ? (
            <WorkspaceShellSkeleton pageTitle={activeTitle} />
          ) : workspacesQuery.isError ? (
            <><h1 className="sr-only">{activeTitle}</h1><ErrorState message={workspacesQuery.error.message} /></>
          ) : (
            renderView(workspace)
          )}
        </main>

        <MobileNavDock currentPath={currentPath} onNavigate={navigate} workspaceId={workspace?.id} />
        <CreateWorkspace isOpen={createWorkspaceOpen} onClose={() => setCreateWorkspaceOpen(false)} />
      </div>
    </StudioNavContext.Provider>
  );
}
