import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { studioQueryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/Button";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a workspace name.").max(160),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
      "Use up to 64 lowercase letters, numbers, and hyphens.",
    ),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid IANA timezone, such as Africa/Lagos."),
});
type Values = z.infer<typeof schema>;

interface CreateWorkspaceProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function CreateWorkspace({ isOpen, onClose }: CreateWorkspaceProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (onClose && !value) onClose();
      setInternalOpen(value);
    },
    [onClose],
  );

  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) => api.createWorkspace(values),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: studioQueryKeys.workspaces });
      setOpen(false);
      window.location.assign(`/?workspace=${workspace.id}`);
    },
  });

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const initialFocus = dialog?.querySelector<HTMLElement>("input");
    initialFocus?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open, setOpen]);

  function updateSlug(name: string) {
    setValue(
      "slug",
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      { shouldValidate: true },
    );
  }

  if (!open) {
    if (isOpen !== undefined) return null;
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        New workspace
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-describedby="new-workspace-description"
        aria-labelledby="new-workspace-title"
        aria-modal="true"
        className="panel relative w-full max-w-lg rounded-[1.75rem] p-6 sm:p-8"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close dialog"
          className="absolute right-5 top-5 rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white"
          onClick={() => setOpen(false)}
          type="button"
        >
          <X aria-hidden className="size-5" />
        </button>
        <p className="eyebrow">New orchestration space</p>
        <h2
          className="mt-3 font-display text-3xl font-semibold"
          id="new-workspace-title"
        >
          Create a workspace
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-white/45"
          id="new-workspace-description"
        >
          A workspace keeps one brand’s context, runs, approvals, and artifacts
          together.
        </p>
        <form
          className="mt-7 space-y-4"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/65">
              Name
            </span>
            <input
              aria-describedby={errors.name ? "workspace-name-error" : undefined}
              aria-invalid={Boolean(errors.name)}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[.045] px-4"
              {...register("name", {
                onChange: (event) => updateSlug(event.target.value),
              })}
              placeholder="Acme Social"
            />
            {errors.name ? (
              <span
                className="mt-1 block text-xs text-coral-400"
                id="workspace-name-error"
              >
                {errors.name.message}
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/65">
              Slug
            </span>
            <input
              aria-describedby={errors.slug ? "workspace-slug-error" : undefined}
              aria-invalid={Boolean(errors.slug)}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[.045] px-4"
              {...register("slug")}
              placeholder="acme-social"
            />
            {errors.slug ? (
              <span
                className="mt-1 block text-xs text-coral-400"
                id="workspace-slug-error"
              >
                {errors.slug.message}
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/65">
              Timezone
            </span>
            <input
              aria-describedby={
                errors.timezone ? "workspace-timezone-error" : undefined
              }
              aria-invalid={Boolean(errors.timezone)}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[.045] px-4"
              {...register("timezone")}
            />
            {errors.timezone ? (
              <span
                className="mt-1 block text-xs text-coral-400"
                id="workspace-timezone-error"
              >
                {errors.timezone.message}
              </span>
            ) : null}
          </label>
          {mutation.error ? (
            <p
              className="rounded-xl border border-coral-400/20 bg-coral-400/10 p-3 text-sm text-coral-400"
              role="alert"
            >
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "Could not create the workspace."}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 pt-3">
            <Button onClick={() => setOpen(false)} tone="ghost" type="button">
              Cancel
            </Button>
            <Button loading={mutation.isPending} type="submit">
              Create workspace
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
