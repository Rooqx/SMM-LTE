import { Circle } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const positive = [
    "healthy",
    "ready",
    "completed",
    "approved",
    "accepted",
    "active",
  ].includes(normalized);
  const pending = ["queued", "running", "pending", "draft"].includes(
    normalized,
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[.68rem] font-bold uppercase tracking-[.12em]",
        positive && "border-acid-400/20 bg-acid-400/10 text-acid-400",
        pending && "border-sky-400/20 bg-sky-400/10 text-sky-400",
        !positive &&
          !pending &&
          "border-coral-400/20 bg-coral-400/10 text-coral-400",
      )}
    >
      <Circle aria-hidden className="size-2 fill-current" />
      {titleCase(status)}
    </span>
  );
}
