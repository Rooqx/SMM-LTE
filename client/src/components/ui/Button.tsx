import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  tone?: "primary" | "secondary" | "danger" | "ghost";
};

export function buttonStyles(
  tone: Props["tone"] = "primary",
  className?: string,
): string {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] px-3.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    tone === "primary" && "bg-acid-400 text-ink-950 hover:bg-white",
    tone === "secondary" &&
      "border border-white/10 bg-white/[.055] text-white hover:border-white/20 hover:bg-white/10",
    tone === "danger" &&
      "border border-coral-400/25 bg-coral-400/10 text-coral-400 hover:bg-coral-400/20",
    tone === "ghost" && "text-white/60 hover:bg-white/[.06] hover:text-white",
    className,
  );
}

export function Button({
  children,
  className,
  disabled,
  loading,
  tone = "primary",
  ...props
}: Props) {
  return (
    <button
      className={buttonStyles(tone, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
