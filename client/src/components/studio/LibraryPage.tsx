import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  Artifact,
  FinalPost,
  GroupedPostSprint,
  Workspace,
} from "@/lib/contracts";
import { studioQueryKeys } from "@/lib/query-keys";
import { UI_COPY } from "@/config/ui-copy";
import { ErrorState } from "@/components/ui/Feedback";
import { LibraryFastView } from "./library/LibraryFastView";
import { LibraryFoldersView } from "./library/LibraryFoldersView";
import { LibraryHeader } from "./library/LibraryHeader";
import { LibraryReviewView } from "./library/LibraryReviewView";
import { LibraryTabs, type LibraryTabKey } from "./library/LibraryTabs";

interface LibraryPageProps {
  workspace?: Workspace | undefined;
}

const MAX_RETAINED_PAGES = 10;
const ALLOWED_PLATFORMS = new Set(["all", "linkedin", "x", "instagram"]);
const ALLOWED_STATUSES = new Set(["all", "approved", "draft"]);

function filterFromUrl(name: string, allowed: ReadonlySet<string>): string {
  if (typeof window === "undefined") return "all";
  const value = new URLSearchParams(window.location.search).get(name);
  return value && allowed.has(value) ? value : "all";
}

function mergeGroupedSprints(groups: GroupedPostSprint[]): GroupedPostSprint[] {
  const posts = new Map<string, GroupedPostSprint>();
  for (const sprint of groups) {
    const target = posts.get(sprint.sprint) ?? {
      sprint: sprint.sprint,
      weeks: [],
    };
    for (const week of sprint.weeks) {
      const targetWeek = target.weeks.find((item) => item.week === week.week) ?? {
        week: week.week,
        days: [],
      };
      if (!target.weeks.includes(targetWeek)) target.weeks.push(targetWeek);
      for (const day of week.days) {
        const targetDay = targetWeek.days.find((item) => item.date === day.date) ?? {
          date: day.date,
          posts: [],
        };
        if (!targetWeek.days.includes(targetDay)) targetWeek.days.push(targetDay);
        const knownIds = new Set(targetDay.posts.map((post) => post.id));
        targetDay.posts.push(...day.posts.filter((post) => !knownIds.has(post.id)));
      }
    }
    posts.set(sprint.sprint, target);
  }
  return [...posts.values()];
}

export function LibraryPage({ workspace }: LibraryPageProps) {
  const queryClient = useQueryClient();

  // Read initial view and filters from URL (?view=...&platform=...&status=...&q=...)
  const [activeTab, setActiveTab] = useState<LibraryTabKey>(() => {
    if (typeof window === "undefined") return "fast";
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") || params.get("tab");
    if (view === "folders") return "folders";
    if (view === "review") return "review";
    return "fast";
  });

  const [selectedPlatform, setSelectedPlatform] = useState<string>(() =>
    filterFromUrl("platform", ALLOWED_PLATFORMS),
  );

  const [selectedStatus, setSelectedStatus] = useState<string>(() =>
    filterFromUrl("status", ALLOWED_STATUSES),
  );

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("q") || "").slice(0, 200);
  });
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

  // Stale revision conflict state for Review view
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const revisionIntentRef = useRef<{ signature: string; key: string } | null>(
    null,
  );

  // Sync tab change with URL search parameters
  function handleTabChange(tab: LibraryTabKey) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", tab);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function handleSelectPlatform(platform: string) {
    setSelectedPlatform(platform);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (platform === "all") url.searchParams.delete("platform");
      else url.searchParams.set("platform", platform);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function handleSelectStatus(status: string) {
    setSelectedStatus(status);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (status === "all") url.searchParams.delete("status");
      else url.searchParams.set("status", status);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function handleSearchChange(query: string) {
    const boundedQuery = query.slice(0, 200);
    setSearchQuery(boundedQuery);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (!boundedQuery.trim()) url.searchParams.delete("q");
      else url.searchParams.set("q", boundedQuery.trim());
      window.history.replaceState({}, "", url.toString());
    }
  }

  // 1. Final posts query with cursor-based infinite pagination and backend search
  const finalPostsQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.finalPosts(workspace?.id, {
      platform: selectedPlatform,
      status: selectedStatus,
      search: deferredSearchQuery,
    }),
    queryFn: ({ pageParam, signal }) => {
      if (!workspace?.id) return { items: [] as FinalPost[], nextCursor: null };
      return api.listFinalPosts(workspace.id, {
        ...(selectedPlatform !== "all" ? { platform: selectedPlatform } : {}),
        ...(selectedStatus !== "all"
          ? { status: selectedStatus as "draft" | "approved" }
          : {}),
        ...(deferredSearchQuery ? { search: deferredSearchQuery } : {}),
        cursor: pageParam ?? null,
        limit: 20,
      }, { signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspace?.id),
  });

  // 2. Grouped final posts query (for Folders view)
  const groupedPostsQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.finalPosts(workspace?.id, { view: "grouped" }),
    queryFn: ({ pageParam, signal }) => {
      if (!workspace?.id) return { items: [], nextCursor: null, groups: [] };
      return api.listFinalPosts(workspace.id, {
        view: "grouped",
        cursor: pageParam,
        limit: 50,
      }, { signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspace?.id),
  });

  // 3. Draft artifacts query (for Needs review view and tab badge)
  const draftArtifactsQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.artifacts(workspace?.id, { status: "draft" }),
    queryFn: ({ pageParam, signal }) => {
      if (!workspace?.id) return { items: [] as Artifact[], nextCursor: null };
      return api.listArtifacts(workspace.id, {
        status: "draft",
        cursor: pageParam,
        limit: 30,
      }, { signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspace?.id),
  });

  // 4. All artifacts query (for strategy/deliverables section in Folders view)
  const allArtifactsQuery = useInfiniteQuery({
    queryKey: studioQueryKeys.artifacts(workspace?.id, { status: "all" }),
    queryFn: ({ pageParam, signal }) => {
      if (!workspace?.id) return { items: [] as Artifact[], nextCursor: null };
      return api.listArtifacts(workspace.id, {
        cursor: pageParam,
        limit: 30,
      }, { signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspace?.id),
  });

  const approveMutation = useMutation({
    mutationFn: (artifact: Artifact) => api.decideRun(artifact.run_id, "approve"),
    onMutate: () => setDecisionError(null),
    onSuccess: async () => {
      setConflictError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["final-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow"] }),
      ]);
    },
    onError: (error) => {
      setDecisionError(
        error instanceof Error
          ? error.message
          : "The approval could not be saved. Please try again.",
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (artifact: Artifact) => api.decideRun(artifact.run_id, "reject"),
    onMutate: () => setDecisionError(null),
    onSuccess: async () => {
      setConflictError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow"] }),
      ]);
    },
    onError: (error) => {
      setDecisionError(
        error instanceof Error
          ? error.message
          : "The rejection could not be saved. Please try again.",
      );
    },
  });

  // Revise mutation with conflict handling and metadata-derived expected revision
  const reviseMutation = useMutation({
    onMutate: () => setDecisionError(null),
    mutationFn: (args: { artifact: Artifact; instructions: string }) => {
      const rawMeta = args.artifact.metadata as
        | Record<string, unknown>
        | null
        | undefined;
      const expectedReviewRevision =
        typeof rawMeta?.review_revision === "number"
          ? rawMeta.review_revision
          : typeof rawMeta?.revision === "number"
            ? rawMeta.revision
            : args.artifact.version;

      const signature = JSON.stringify({
        runId: args.artifact.run_id,
        expectedReviewRevision,
        instructions: args.instructions,
      });
      const idempotencyKey =
        revisionIntentRef.current?.signature === signature
          ? revisionIntentRef.current.key
          : typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `rev-${Date.now()}`;
      revisionIntentRef.current = { signature, key: idempotencyKey };

      return api.reviseRun(args.artifact.run_id, {
        expectedReviewRevision,
        instructions: args.instructions,
        idempotencyKey,
      });
    },
    onSuccess: async () => {
      revisionIntentRef.current = null;
      setConflictError(null);
      setDecisionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow"] }),
      ]);
    },
    onError: (err: unknown) => {
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: unknown }).status
          : undefined;
      if (typeof status === "number" && status < 500 && status !== 429) {
        revisionIntentRef.current = null;
      }
      const isConflict = status === 409;

      if (isConflict) {
        setConflictError(
          "Stale revision detected: This deliverable was updated by another session. We refreshed the latest version.",
        );
        void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      } else {
        setDecisionError(
          err instanceof Error
            ? err.message
            : "The revision could not be requested. Please try again.",
        );
      }
    },
  });

  if (!workspace) {
    return (
      <>
        <h1 className="sr-only">{UI_COPY.library.title}</h1>
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-8 text-center text-sm text-white/50">
          Please select or create a workspace to view your creative library.
        </div>
      </>
    );
  }

  const posts =
    finalPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const draftArtifacts =
    draftArtifactsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const allArtifacts =
    allArtifactsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const groupedSprints = mergeGroupedSprints(
    groupedPostsQuery.data?.pages.flatMap((page) => page.groups ?? []) ?? [],
  );
  const reachedPostPageLimit =
    (finalPostsQuery.data?.pages.length ?? 0) >= MAX_RETAINED_PAGES &&
    Boolean(finalPostsQuery.hasNextPage);
  const reachedGroupedPageLimit =
    (groupedPostsQuery.data?.pages.length ?? 0) >= MAX_RETAINED_PAGES &&
    Boolean(groupedPostsQuery.hasNextPage);
  const reachedDraftPageLimit =
    (draftArtifactsQuery.data?.pages.length ?? 0) >= MAX_RETAINED_PAGES &&
    Boolean(draftArtifactsQuery.hasNextPage);
  const reachedArtifactPageLimit =
    (allArtifactsQuery.data?.pages.length ?? 0) >= MAX_RETAINED_PAGES &&
    Boolean(allArtifactsQuery.hasNextPage);
  const activeError =
    activeTab === "fast"
      ? finalPostsQuery.error
      : activeTab === "folders"
        ? (groupedPostsQuery.error ?? allArtifactsQuery.error)
        : draftArtifactsQuery.error;

  function retryActiveView() {
    if (activeTab === "fast") {
      void finalPostsQuery.refetch();
    } else if (activeTab === "folders") {
      void Promise.all([groupedPostsQuery.refetch(), allArtifactsQuery.refetch()]);
    } else {
      void draftArtifactsQuery.refetch();
    }
  }

  const isDeciding =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    reviseMutation.isPending;

  return (
    <div>
      <LibraryHeader
        totalPosts={posts.length}
      />

      <LibraryTabs
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        pendingReviewCount={draftArtifacts.length}
      />

      {activeError ? (
        <ErrorState
          message={activeError.message}
          retry={retryActiveView}
        />
      ) : null}

      {!activeError && activeTab === "fast" && (
        <LibraryFastView
          hasNextPage={Boolean(finalPostsQuery.hasNextPage) && !reachedPostPageLimit}
          isFetchingNextPage={finalPostsQuery.isFetchingNextPage}
          isLoading={finalPostsQuery.isPending}
          onLoadMore={() => void finalPostsQuery.fetchNextPage()}
          pageLimitReached={reachedPostPageLimit}
          onSearchChange={handleSearchChange}
          onSelectPlatform={handleSelectPlatform}
          onSelectStatus={handleSelectStatus}
          posts={posts}
          searchQuery={searchQuery}
          selectedPlatform={selectedPlatform}
          selectedStatus={selectedStatus}
        />
      )}

      {!activeError && activeTab === "folders" && (
        <LibraryFoldersView
          artifacts={allArtifacts}
          groupedSprints={groupedSprints}
          hasMore={
            (Boolean(groupedPostsQuery.hasNextPage) && !reachedGroupedPageLimit) ||
            (Boolean(allArtifactsQuery.hasNextPage) && !reachedArtifactPageLimit)
          }
          isLoadingMore={
            groupedPostsQuery.isFetchingNextPage ||
            allArtifactsQuery.isFetchingNextPage
          }
          isLoading={groupedPostsQuery.isPending}
          onLoadMore={() => {
            if (groupedPostsQuery.hasNextPage && !reachedGroupedPageLimit) {
              void groupedPostsQuery.fetchNextPage();
            }
            if (allArtifactsQuery.hasNextPage && !reachedArtifactPageLimit) {
              void allArtifactsQuery.fetchNextPage();
            }
          }}
          pageLimitReached={
            reachedGroupedPageLimit || reachedArtifactPageLimit
          }
        />
      )}

      {!activeError && activeTab === "review" && (
        <LibraryReviewView
          conflictError={conflictError}
          actionError={decisionError}
          draftArtifacts={draftArtifacts}
          isDeciding={isDeciding}
          isLoading={draftArtifactsQuery.isPending}
          hasMore={Boolean(draftArtifactsQuery.hasNextPage) && !reachedDraftPageLimit}
          isLoadingMore={draftArtifactsQuery.isFetchingNextPage}
          onApprove={async (artifact) => {
            await approveMutation.mutateAsync(artifact);
          }}
          onDismissConflict={() => setConflictError(null)}
          onDismissActionError={() => setDecisionError(null)}
          onLoadMore={() => void draftArtifactsQuery.fetchNextPage()}
          onReject={async (artifact) => {
            await rejectMutation.mutateAsync(artifact);
          }}
          onRevise={async (artifact, instructions) => {
            await reviseMutation.mutateAsync({ artifact, instructions });
          }}
          pageLimitReached={reachedDraftPageLimit}
        />
      )}
    </div>
  );
}
