import { BadgeCheck } from "lucide-react";
import { UI_COPY } from "@/config/ui-copy";

interface LibraryHeaderProps {
  totalPosts?: number | undefined;
}

export function LibraryHeader({ totalPosts }: LibraryHeaderProps) {
  return (
    <header className="mb-[18px] flex items-start justify-between gap-4 max-[440px]:block">
      <div>
        <h1 className="text-2xl font-medium leading-[1.2] tracking-normal text-white">
          {UI_COPY.library.title}
        </h1>
        <p className="mt-[5px] text-xs leading-[1.5] text-white/50">
          {UI_COPY.library.subtitle}
        </p>
      </div>

      {typeof totalPosts === "number" ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-acid-400/10 px-[9px] py-[7px] text-[10px] font-medium text-acid-400 max-[440px]:mt-2.5">
          <BadgeCheck aria-hidden className="size-3.5" />
          <span>{totalPosts} ready this week</span>
        </span>
      ) : null}
    </header>
  );
}
