import { PRIMARY_NAV_ITEMS } from "@/config/navigation";

interface MobileNavDockProps {
  currentPath: string;
  workspaceId?: string | undefined;
}

function withWorkspace(href: string, workspaceId?: string): string {
  if (!workspaceId) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}workspace=${encodeURIComponent(workspaceId)}`;
}

export function MobileNavDock({ currentPath, workspaceId }: MobileNavDockProps) {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed inset-x-2.5 bottom-[calc(.625rem+env(safe-area-inset-bottom,0px))] z-40 block rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1">
        {PRIMARY_NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/" ? currentPath === "/" : currentPath.startsWith(href);

          return (
            <a
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[8px] transition ${
                active
                  ? "bg-acid-400/10 font-semibold text-acid-400"
                  : "text-white/45 hover:text-white/80"
              }`}
              href={withWorkspace(href, workspaceId)}
              key={href}
            >
              <Icon
                aria-hidden
                className="size-4"
              />
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
