import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Bot, Clock3, Database, FolderSync, Palette } from "lucide-react";
import type { SyntheticEvent } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { PRODUCT_CONFIG } from "@/config/product";
import { api, ApiError } from "@/lib/api";
import type { Workspace } from "@/lib/contracts";
import { studioQueryKeys } from "@/lib/query-keys";
import { safeRandomUUID } from "@/lib/utils";

function formBoolean(data: FormData, name: string): boolean {
  return data.get(name) === "on";
}

export function AccountWorkspacePanel({ workspace, userId }: { workspace: Workspace | undefined; userId: string }) {
  const queryClient = useQueryClient();
  const exportKey = useRef(safeRandomUUID());
  const workspaceTimezoneRef = useRef<HTMLInputElement>(null);
  const preferences = useQuery({ queryKey: studioQueryKeys.preferences(userId), queryFn: ({ signal }) => api.getPreferences({ signal }), enabled: Boolean(userId) });
  const savePreferences = useMutation({
    mutationFn: (data: FormData) => {
      if (!preferences.data) throw new Error("Preferences are still loading.");
      return api.updatePreferences({
        expectedVersion: preferences.data.version,
        timezone: String(data.get("timezone") ?? "UTC"),
        theme: String(data.get("theme") ?? "dark") as "dark" | "light" | "system",
        emailNotifications: formBoolean(data, "emailNotifications"),
        autopilotEnabled: formBoolean(data, "autopilotEnabled"),
        reviewRemindersEnabled: formBoolean(data, "reviewRemindersEnabled"),
      });
    },
    onSuccess: (next) => queryClient.setQueryData(studioQueryKeys.preferences(userId), next),
    onError: (error) => { if (error instanceof ApiError && error.status === 409) void preferences.refetch(); },
  });
  const updateWorkspace = useMutation({
    mutationFn: (timezone: string) => {
      if (!workspace) throw new Error("Select a workspace first.");
      return api.updateWorkspace(workspace.id, { expectedVersion: workspace.version, timezone });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: studioQueryKeys.workspaces }); },
  });
  const exportJob = useMutation({
    mutationFn: () => api.enqueueObsidianExportJob(workspace!.id, exportKey.current),
    onSuccess: () => { exportKey.current = safeRandomUUID(); },
  });
  const exportStatus = useQuery({
    queryKey: studioQueryKeys.obsidianJob(exportJob.data?.id),
    queryFn: ({ signal }) => api.getObsidianExportJob(exportJob.data!.id, { signal }),
    enabled: Boolean(exportJob.data?.id),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 2_000 : false,
  });

  function submitPreferences(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    savePreferences.mutate(new FormData(event.currentTarget));
  }

  const exportState = exportStatus.data?.status ?? exportJob.data?.status;

  return (
    <section className="panel rounded-[18px] p-4">
      <div className="section-line mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-white">{PRODUCT_CONFIG.shortName} preferences</h3>
        <span className="text-[9px] text-white/42">{workspace?.name ?? "No workspace"}</span>
      </div>

      {preferences.isPending ? <p className="p-6 text-center text-xs text-white/45" role="status">Loading preferences…</p> : null}
      {preferences.isError || (!preferences.isPending && !preferences.data) ? <p className="p-6 text-center text-xs text-coral-400" role="alert">Preferences could not be loaded.</p> : null}
      {preferences.data ? (
        <form className="settings-list grid gap-2" key={preferences.data.version} onSubmit={submitPreferences}>
          <SettingToggle
            ariaLabel={PRODUCT_CONFIG.shortName}
            defaultChecked={preferences.data.autopilot_enabled}
            description="Continue safe background work after you leave."
            icon={Bot}
            label={`Keep ${PRODUCT_CONFIG.shortName} active`}
            name="autopilotEnabled"
          />
          <SettingToggle
            ariaLabel="Review reminders"
            defaultChecked={preferences.data.review_reminders_enabled}
            description="Notify me only when a decision is needed."
            icon={BellRing}
            label="Review reminders"
            name="reviewRemindersEnabled"
          />

          <div className="setting-row rounded-xl border border-white/10 bg-ink-900/80 p-2.5">
            <div className="grid min-h-[58px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5">
              <span className="row-icon grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400">
                <Clock3 aria-hidden className="size-4" />
              </span>
              <span>
                <strong className="block text-[10px] font-medium text-white">Workspace timezone</strong>
                <span className="block text-[9px] text-white/42">{workspace?.timezone ?? "UTC"} · Monday week start</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Workspace timezone"
                  className="h-[34px] w-36 rounded-lg border border-white/10 bg-ink-950 px-2.5 text-[10px] text-white outline-none focus:border-acid-400/50"
                  defaultValue={workspace?.timezone ?? "UTC"}
                  disabled={!workspace}
                  maxLength={80}
                  ref={workspaceTimezoneRef}
                />
                <Button
                  className="min-h-[34px] px-2.5 text-[9px]"
                  disabled={!workspace}
                  loading={updateWorkspace.isPending}
                  onClick={() => updateWorkspace.mutate(workspaceTimezoneRef.current?.value ?? "")}
                  tone="secondary"
                  type="button"
                >
                  Update
                </Button>
              </div>
            </div>
          </div>

          <div className="setting-row rounded-xl border border-white/10 bg-ink-900/80 p-2.5">
            <div className="grid min-h-[58px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5">
              <span className="row-icon grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400">
                <Database aria-hidden className="size-4" />
              </span>
              <span>
                <strong className="block text-[10px] font-medium text-white">Obsidian export</strong>
                <span className="block text-[9px] capitalize text-white/42">
                  Optional · not connected
                </span>
              </span>
              <Button
                className="min-h-[34px] gap-1 px-2.5 text-[9px]"
                disabled={!workspace || ["queued", "running"].includes(exportState ?? "")}
                loading={exportJob.isPending}
                onClick={() => exportJob.mutate()}
                tone="secondary"
                type="button"
              >
                <FolderSync aria-hidden className="size-3.5" />
                Queue export
              </Button>
            </div>
            {exportState ? (
              <p className="mt-1 text-[9px] text-white/50">Export status: {exportState}</p>
            ) : null}
          </div>

          <details className="rounded-xl border border-white/10 bg-white/[.02] p-3">
            <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 text-[10px] text-white/55">
              <Palette aria-hidden className="size-4" /> More preferences
            </summary>
            <div className="mt-3 grid gap-3 border-t border-white/[.08] pt-3">
              <SettingToggle
                defaultChecked={preferences.data.email_notifications}
                description="Receive account and review updates by email."
                icon={BellRing}
                label="Email notifications"
                name="emailNotifications"
              />
              <label className="grid gap-1 text-[9px] text-white/45">
                Theme
                <select className="min-h-10 rounded-[10px] border border-white/10 bg-ink-950 px-3 text-[10px] text-white" defaultValue={preferences.data.theme} name="theme">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">Follow device</option>
                </select>
              </label>
              <label className="grid gap-1 text-[9px] text-white/45">
                Account timezone
                <input
                  aria-label="Account timezone"
                  className="min-h-10 rounded-[10px] border border-white/10 bg-ink-950 px-3 text-[10px] text-white"
                  defaultValue={preferences.data.timezone}
                  maxLength={80}
                  name="timezone"
                  required
                />
              </label>
            </div>
          </details>
          <Button loading={savePreferences.isPending} tone="secondary" type="submit">
            Save preferences
          </Button>
          {savePreferences.isSuccess ? <p className="text-[10px] text-acid-400" role="status">Preferences saved.</p> : null}
          {savePreferences.isError ? <p className="text-[10px] text-coral-400" role="alert">Preferences changed elsewhere or could not be saved. Review and try again.</p> : null}
        </form>
      ) : null}

      <div className="section-line mb-2 mt-4 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-white">Workspace</h3>
        <span className="text-[9px] text-white/42">Personal account</span>
      </div>
      <div className="connection flex min-h-[52px] items-center justify-between gap-3 border-t border-white/[.08] py-2.5">
        <span>
          <strong className="block text-[10px] font-medium text-white">
            {workspace?.name ?? "No workspace selected"}
          </strong>
          <span className="block text-[9px] text-white/42">
            Owner · {workspace?.timezone ?? "UTC"}
          </span>
        </span>
        <span className="row-action rounded-lg bg-white/[.055] px-2.5 py-1 text-[9px] text-white/55">
          Managed here
        </span>
      </div>
    </section>
  );
}

function SettingToggle({
  ariaLabel,
  defaultChecked,
  description,
  icon: Icon,
  label,
  name,
}: {
  ariaLabel?: string | undefined;
  defaultChecked: boolean;
  description: string;
  icon: typeof Bot;
  label: string;
  name: string;
}) {
  return (
    <label className="setting-row grid min-h-[58px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-white/10 bg-ink-900/80 p-2.5">
      <span className="row-icon grid size-[34px] place-items-center rounded-[10px] bg-white/[.055] text-acid-400">
        <Icon aria-hidden className="size-4" />
      </span>
      <span>
        <strong className="block text-[10px] font-medium text-white">{label}</strong>
        <span className="block text-[9px] text-white/42">{description}</span>
      </span>
      <span className="relative h-[22px] w-[38px] rounded-full bg-white/10 p-[3px] has-[:checked]:bg-acid-400">
        <input
          aria-label={ariaLabel ?? label}
          className="peer sr-only"
          defaultChecked={defaultChecked}
          name={name}
          type="checkbox"
        />
        <span className="block size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
