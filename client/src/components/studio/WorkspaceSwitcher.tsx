import { Check, ChevronsUpDown, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Workspace } from "@/lib/contracts";

interface WorkspaceSwitcherProps {
  currentWorkspace?: Workspace | undefined;
  workspaces: Workspace[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (workspace: Workspace) => void;
  onCreateNew: () => void;
  compact?: boolean;
}

function workspaceInitials(name?: string): string {
  if (!name) return "WS";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelect,
  onCreateNew,
  compact = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      const selectedItem = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      );
      const firstItem = menuRef.current?.querySelector<HTMLElement>(
        '[role^="menuitem"]',
      );
      (selectedItem ?? firstItem)?.focus();
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ??
        [],
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  }

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-controls={open ? "workspace-menu" : undefined}
        aria-haspopup="menu"
        aria-label="Select workspace"
        className={`flex min-h-[38px] items-center rounded-[10px] border border-white/10 bg-ink-800/70 text-[11px] font-medium text-white/90 transition hover:border-white/20 hover:bg-white/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid-400 ${
          compact ? "size-[38px] justify-center p-0" : "gap-2 px-2.5 py-1.5"
        }`}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        {compact ? (
          <ChevronsUpDown aria-hidden className="size-4 text-white/65" />
        ) : (
          <>
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-acid-400/12 text-[9px] font-bold text-acid-400">
              {workspaceInitials(currentWorkspace?.name)}
            </span>
            <span className="max-w-[140px] truncate sm:max-w-[180px]">
              {currentWorkspace?.name ?? "Select workspace"}
            </span>
            <ChevronsUpDown aria-hidden className="size-3.5 text-white/40" />
          </>
        )}
      </button>

      {open ? (
        <div
          aria-label="Workspaces"
          className="panel absolute left-0 z-50 mt-2 w-64 origin-top-left rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur-xl focus:outline-none"
          id="workspace-menu"
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
          tabIndex={-1}
        >
          <div
            className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40"
            role="presentation"
          >
            Workspaces
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5 scrollbar-thin">
            {workspaces.map((ws) => {
              const isSelected = ws.id === currentWorkspace?.id;
              return (
                <button
                  aria-checked={isSelected}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium transition ${
                    isSelected
                      ? "bg-acid-400/15 text-acid-400 font-semibold"
                      : "text-white/80 hover:bg-white/[.06] hover:text-white"
                  }`}
                  key={ws.id}
                  onClick={() => {
                    onSelect(ws);
                    setOpen(false);
                  }}
                  role="menuitemradio"
                  tabIndex={-1}
                  type="button"
                >
                  <span className="truncate">{ws.name}</span>
                  {isSelected ? (
                    <Check aria-hidden className="size-3.5 shrink-0 text-acid-400" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {hasMore ? (
            <button
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-2.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-400/10 disabled:opacity-60"
              disabled={isLoadingMore}
              onClick={() => onLoadMore?.()}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              {isLoadingMore ? (
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              ) : null}
              {isLoadingMore ? "Loading…" : "Load more workspaces"}
            </button>
          ) : null}

          <div className="my-1 border-t border-white/10" role="separator" />

          <button
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-white/70 transition hover:bg-white/[.08] hover:text-white"
            onClick={() => {
              setOpen(false);
              onCreateNew();
            }}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            <Plus aria-hidden className="size-3.5 text-white/50" />
            Create new workspace
          </button>
        </div>
      ) : null}
    </div>
  );
}
