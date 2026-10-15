import React from "react";

export function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-white/[.07] ${className}`}
      style={style}
    />
  );
}

/** Skeleton for Today (dashboard) view */
export function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Today briefing" className="space-y-6" role="status">
      {/* Top greeting skeleton */}
      <section className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] pb-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-52 sm:w-64" />
          <SkeletonBlock className="h-4 w-72 sm:w-96" />
        </div>
        <SkeletonBlock className="h-6 w-28 rounded-full" />
      </section>

      {/* Main autopilot mission card skeleton */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
            <div className="flex items-center justify-between border-b border-white/[.08] pb-3">
              <SkeletonBlock className="h-3.5 w-36" />
              <SkeletonBlock className="h-5 w-20 rounded-full" />
            </div>

            <div className="mt-4 space-y-3">
              <SkeletonBlock className="h-6 w-3/4" />
              <SkeletonBlock className="h-4 w-5/6" />
            </div>

            <div className="mt-6 space-y-3 border-t border-white/[.06] pt-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-4 w-28 shrink-0" />
                <SkeletonBlock className="h-4 w-full max-w-sm" />
              </div>
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-4 w-28 shrink-0" />
                <SkeletonBlock className="h-4 w-4/5 max-w-xs" />
              </div>
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-4 w-28 shrink-0" />
                <SkeletonBlock className="h-4 w-3/5 max-w-xs" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-2">
              <SkeletonBlock className="h-4 w-48" />
              <SkeletonBlock className="h-10 w-44 rounded-[11px]" />
            </div>
          </section>

          {/* Activity feed preview skeleton */}
          <section className="rounded-2xl border border-white/10 bg-white/[.02] p-5">
            <SkeletonBlock className="h-4 w-36" />
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBlock className="h-4 w-1/3" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Coach rail skeleton */}
        <aside className="hidden space-y-4 md:block">
          <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4 space-y-3">
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-16 w-full rounded-xl" />
            <div className="space-y-2 pt-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-4/5" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Skeleton for Content Library view */
export function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading library" className="space-y-6" role="status">
      {/* Header skeleton */}
      <section className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] pb-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-48 sm:w-56" />
          <SkeletonBlock className="h-4 w-64 sm:w-80" />
        </div>
        <SkeletonBlock className="h-6 w-32 rounded-full" />
      </section>

      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <SkeletonBlock className="h-9 w-24 rounded-xl" />
        <SkeletonBlock className="h-9 w-24 rounded-xl" />
        <SkeletonBlock className="h-9 w-28 rounded-xl" />
      </div>

      {/* Filter / spotlight card skeleton */}
      <section className="rounded-[18px] border border-white/10 bg-white/[.02] p-4">
        <div className="flex justify-between gap-2">
          <SkeletonBlock className="h-3.5 w-28" />
          <SkeletonBlock className="h-3.5 w-20" />
        </div>
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
      </section>

      {/* Cards list skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.015] p-4"
            key={i}
          >
            <div className="flex items-center gap-3 flex-1">
              <SkeletonBlock className="size-8 shrink-0 rounded-lg" />
              <div className="space-y-1.5 flex-1 max-w-md">
                <SkeletonBlock className="h-4 w-3/4" />
                <SkeletonBlock className="h-3 w-1/2" />
              </div>
            </div>
            <SkeletonBlock className="h-8 w-20 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Brand Context view */
export function BrandSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading brand context" className="space-y-6" role="status">
      {/* Header skeleton */}
      <section className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] pb-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-40 sm:w-48" />
          <SkeletonBlock className="h-4 w-60 sm:w-72" />
        </div>
        <SkeletonBlock className="h-7 w-24 rounded-full" />
      </section>

      {/* Two-column layout: Area list + Detail */}
      <div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left area pills skeleton */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock className="h-11 w-full rounded-xl" key={i} />
          ))}
        </div>

        {/* Right detail document card skeleton */}
        <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[.08] pb-3">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-5 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-6 w-1/2" />
          <div className="space-y-2.5 pt-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-5/6" />
            <SkeletonBlock className="h-4 w-4/5" />
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Skeleton for You / Account view */
export function AccountSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading account" className="space-y-6" role="status">
      {/* Header skeleton */}
      <section className="flex items-center gap-4 border-b border-white/[.08] pb-4">
        <SkeletonBlock className="size-14 shrink-0 rounded-full" />
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
      </section>

      {/* Two panels layout */}
      <div className="grid items-start gap-3.5 min-[720px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        {/* Identity panel skeleton */}
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5 space-y-4">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>

        {/* Preferences panel skeleton */}
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5 space-y-4">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Top-level shell skeleton while connecting to workspace */
export function WorkspaceShellSkeleton({ pageTitle }: { pageTitle?: string }) {
  return (
    <div aria-busy="true" aria-label="Connecting to workspace" className="space-y-6" role="status">
      <h1 className="sr-only">{pageTitle ?? "Loading workspace"}</h1>
      {/* Hero section */}
      <section className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] pb-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-48 sm:w-60" />
          <SkeletonBlock className="h-4 w-64 sm:w-80" />
        </div>
        <SkeletonBlock className="h-6 w-24 rounded-full" />
      </section>

      {/* Card placeholder */}
      <section className="rounded-2xl border border-white/10 bg-white/[.02] p-6 space-y-4">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-4 w-1/2" />
        <div className="pt-4">
          <SkeletonBlock className="h-10 w-36 rounded-xl" />
        </div>
      </section>
    </div>
  );
}
