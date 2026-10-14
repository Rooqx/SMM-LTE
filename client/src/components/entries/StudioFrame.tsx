import type { ReactNode } from "react";
import type { Workspace } from "@/lib/contracts";
import { AppShell } from "@/components/studio/AppShell";
import { StudioProvider } from "@/components/studio/StudioProvider";

export function StudioFrame({
  title,
  children,
}: {
  title: string;
  children: (workspace: Workspace | undefined) => ReactNode;
}) {
  return (
    <StudioProvider>
      <AppShell pageTitle={title}>{children}</AppShell>
    </StudioProvider>
  );
}
