import type { KeyboardEvent } from "react";
import { UI_COPY } from "@/config/ui-copy";

export type LibraryTabKey = "fast" | "folders" | "review";

const TAB_ORDER: LibraryTabKey[] = ["fast", "folders", "review"];

interface LibraryTabsProps {
  activeTab: LibraryTabKey;
  onChangeTab: (tab: LibraryTabKey) => void;
  pendingReviewCount?: number | undefined;
}

export function LibraryTabs({
  activeTab,
  onChangeTab,
  pendingReviewCount = 0,
}: LibraryTabsProps) {
  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: LibraryTabKey,
  ) {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    if (!nextTab) return;
    onChangeTab(nextTab);
    document.getElementById(`library-tab-${nextTab}`)?.focus();
  }

  const tabs = [
    {
      key: "fast" as const,
      label: UI_COPY.library.tabs.fast,
    },
    {
      key: "folders" as const,
      label: UI_COPY.library.tabs.folders,
    },
    {
      key: "review" as const,
      label: UI_COPY.library.tabs.review,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
  ];

  return (
    <div
      aria-label="Library views"
      className="mb-4 flex gap-[5px] overflow-x-auto border-b border-white/10 pb-3.5 scrollbar-none"
      role="tablist"
    >
      {tabs.map(({ key, label, badge }) => {
        const isSelected = activeTab === key;
        return (
          <button
            aria-controls={isSelected ? `library-panel-${key}` : undefined}
            aria-selected={isSelected}
            className={`flex min-h-[38px] items-center whitespace-nowrap rounded-[9px] px-[11px] py-[7px] text-[10px] font-medium transition ${
              isSelected
                ? "bg-white/[.07] text-white"
                : "text-white/45 hover:bg-white/[.04] hover:text-white"
            }`}
            id={`library-tab-${key}`}
            key={key}
            onClick={() => onChangeTab(key)}
            onKeyDown={(event) => handleKeyDown(event, key)}
            role="tab"
            tabIndex={isSelected ? 0 : -1}
            type="button"
          >
            <span>{label}{typeof badge === "number" ? ` · ${badge}` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
