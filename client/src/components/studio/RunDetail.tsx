import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { Artifact, Run, Workspace } from "@/lib/contracts";
import { studioQueryKeys } from "@/lib/query-keys";
import {
  formatDate,
  isRunActive,
  markdownFilename,
  titleCase,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ContextChanges } from "./ContextChanges";

export function RunDetail({
  runId,
  workspace,
}: {
  runId: string;
  workspace?: Workspace | undefined;
}) {
  const runQuery = useQuery({
    queryKey: studioQueryKeys.run(runId),
    queryFn: ({ signal }) => api.getRun(runId, { signal }),
    refetchInterval: (query) =>
      isRunActive((query.state.data as Run | undefined)?.status ?? "")
        ? 2_000
        : false,
  });
  if (runQuery.isLoading)
    return (
      <>
        <h1 className="sr-only">Run detail</h1>
        <LoadingState label="Following the run" />
      </>
    );
  if (runQuery.error)
    return (
      <>
        <h1 className="sr-only">Run detail</h1>
        <ErrorState
          message={runQuery.error.message}
          retry={() => void runQuery.refetch()}
        />
      </>
    );
  if (!runQuery.data)
    return (
      <>
        <h1 className="sr-only">Run detail</h1>
        <ErrorState message="The run could not be found." />
      </>
    );
  const requestedWorkspace = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("workspace");
  if (requestedWorkspace && requestedWorkspace !== runQuery.data.workspace_id) {
    return (
      <>
        <h1 className="sr-only">Run detail</h1>
        <ErrorState message="This run does not belong to the workspace selected in the URL." />
      </>
    );
  }
  return <RunContent run={runQuery.data} workspace={workspace} />;
}

function RunContent({
  run,
  workspace,
}: {
  run: Run;
  workspace?: Workspace | undefined;
}) {
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const decision = useMutation({
    mutationFn: (value: "approve" | "reject") =>
      api.decideRun(run.id, value, note || undefined),
    onSuccess: async (updated) => {
      queryClient.setQueryData(studioQueryKeys.run(run.id), updated);
      // A decision can update canonical context and advance the workspace phase.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studioQueryKeys.workspaces }),
        queryClient.invalidateQueries({
          queryKey: studioQueryKeys.context(run.workspace_id),
        }),
      ]);
    },
  });
  const output = run.output;
  const pendingApproval = run.approvals.find(
    (approval) => approval.status === "pending",
  );
  const awaitingDecision = run.output_status === "pending";

  return (
    <div className="space-y-7">
      <section className="panel relative overflow-hidden rounded-[2rem] p-6 sm:p-9">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-acid-400/8 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={run.status} />
              {run.output_status ? (
                <StatusBadge status={run.output_status} />
              ) : null}
            </div>
            <h1 className="display-title mt-5 text-4xl sm:text-6xl">
              {titleCase(run.skill_name)}
            </h1>
            <p className="mt-4 text-sm text-white/38">
              Run {run.id} · Started {formatDate(run.created_at, workspace?.timezone)}
            </p>
          </div>
          {isRunActive(run.status) ? (
            <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[.07] px-4 py-3 text-sm font-semibold text-sky-400">
              <RefreshCw aria-hidden className="size-4 animate-spin" />
              Live updates on
            </div>
          ) : null}
        </div>
        <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
          <RunFact label="Phase" value={`${run.phase} of 6`} />
          <RunFact label="Artifacts" value={String(run.artifacts.length)} />
          <RunFact
            label="Approval gate"
            value={
              pendingApproval ? titleCase(pendingApproval.gate) : "None pending"
            }
          />
        </div>
      </section>
      {output?.message ? (
        <section className="panel rounded-[1.75rem] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-acid-400/10 text-acid-400">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <div>
              <p className="eyebrow">Orchestrator response</p>
              <h3 className="font-display text-xl font-bold">Run summary</h3>
            </div>
          </div>
          <div className="prose prose-invert mt-6 max-w-none text-sm leading-7 text-white/65">
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {output.message}
            </ReactMarkdown>
          </div>
          {output.next_action === "request_user_input" ? (
            <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/[.06] p-4">
              <div className="flex gap-3">
                <MessageSquareText
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-sky-400"
                />
                <div>
                  <strong className="text-sm">
                    Your manager needs another answer
                  </strong>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Return to Today to answer the current backend-selected
                    question for this workspace.
                  </p>
                  {workspace ? (
                    <a
                      className="mt-3 inline-flex text-xs font-bold text-sky-400"
                      href={`/?workspace=${encodeURIComponent(workspace.id)}&run=${encodeURIComponent(run.id)}`}
                    >
                      Continue in Today →
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <ContextChanges updates={output?.context_updates ?? []} />
      {awaitingDecision ? (
        <section className="rounded-[1.75rem] border border-coral-400/20 bg-coral-400/[.055] p-6 sm:p-8">
          <p className="eyebrow text-coral-400">Human decision required</p>
          <h3 className="mt-2 font-display text-2xl font-bold">
            {pendingApproval
              ? "Review this output before the phase moves forward."
              : "Review this output before it becomes canonical."}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Approval applies staged context updates and marks draft artifacts
            approved.
            {pendingApproval
              ? " It also passes the phase gate."
              : " This exploratory run will not advance the phase."}{" "}
            Rejection preserves the audit trail without changing canonical
            context.
          </p>
          <label className="mt-5 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
              Decision note (optional)
            </span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-ink-950/40 p-4 text-sm"
              maxLength={2_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What should the team know about this decision?"
              value={note}
            />
          </label>
          {decision.error ? (
            <p className="mt-3 text-sm text-coral-400" role="alert">
              {decision.error.message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              loading={decision.isPending}
              onClick={() => decision.mutate("approve")}
            >
              <Check aria-hidden className="size-4" />
              Approve output
            </Button>
            <Button
              loading={decision.isPending}
              onClick={() => decision.mutate("reject")}
              tone="danger"
            >
              <X aria-hidden className="size-4" />
              Reject output
            </Button>
          </div>
        </section>
      ) : null}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow">Deliverables</p>
            <h3 className="mt-2 font-display text-2xl font-bold">
              Artifacts from this run
            </h3>
          </div>
        </div>
        {run.artifacts.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {run.artifacts.map((artifact) => (
              <ArtifactCard artifact={artifact} key={artifact.id} />
            ))}
          </div>
        ) : (
          <div className="soft-panel rounded-3xl p-8 text-center text-sm text-white/40">
            Artifacts will appear here when the run completes.
          </div>
        )}
      </section>
      <details className="panel rounded-2xl">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-bold">
          Raw run metadata
          <ChevronDown aria-hidden className="size-4 text-white/35" />
        </summary>
        <pre className="scrollbar-thin overflow-x-auto border-t border-white/8 p-5 text-xs leading-6 text-white/45">
          {JSON.stringify({ input: run.input, output: run.output }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);
  const filename = useMemo(
    () => markdownFilename(artifact.slug),
    [artifact.slug],
  );
  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([artifact.content], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="panel overflow-hidden rounded-[1.5rem]">
      <header className="flex items-start gap-3 border-b border-white/8 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-sky-400">
          <FileText aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display font-bold">{artifact.title}</p>
          <p className="mt-1 text-xs text-white/35">
            {titleCase(artifact.kind)} · v{artifact.version}
          </p>
        </div>
        <StatusBadge status={artifact.status ?? "draft"} />
      </header>
      <div className="scrollbar-thin max-h-[25rem] overflow-y-auto p-5">
        <div className="prose prose-invert max-w-none text-sm leading-7 text-white/65">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {artifact.content}
          </ReactMarkdown>
        </div>
      </div>
      <footer className="flex gap-2 border-t border-white/8 p-3">
        <Button className="flex-1" onClick={copy} tone="ghost">
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Clipboard aria-hidden className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button className="flex-1" onClick={download} tone="ghost">
          <Download aria-hidden className="size-4" />
          Markdown
        </Button>
      </footer>
    </article>
  );
}

function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-panel rounded-2xl p-4">
      <span className="text-xs font-semibold text-white/35">{label}</span>
      <strong className="mt-1 block font-display text-lg">{value}</strong>
    </div>
  );
}
