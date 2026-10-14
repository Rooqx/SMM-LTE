import { ShieldCheck } from "lucide-react";
import { UI_COPY } from "@/config/ui-copy";

export function AccountHeader() {
  return (
    <header className="secondary-head mb-4 flex items-start justify-between gap-3.5 max-[440px]:block">
      <div>
        <h1 className="text-xl font-medium leading-snug text-white">{UI_COPY.account.title}</h1>
        <p className="mt-1 max-w-2xl text-[11px] leading-[1.5] text-white/50">
          {UI_COPY.account.subtitle}
        </p>
      </div>
      <span className="count-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[.055] px-2.5 py-1.5 text-[9px] font-medium text-acid-400 max-[440px]:mt-2.5">
        <ShieldCheck aria-hidden className="size-3.5" />
        {UI_COPY.account.secureSession}
      </span>
    </header>
  );
}
