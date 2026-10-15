import type { ReactNode } from "react";
import type { Workspace } from "@/lib/contracts";
import { AppShell } from "@/components/studio/AppShell";
import { StudioProvider } from "@/components/studio/StudioProvider";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export function StudioFrame({
  title,
  children,
}: {
  title: string;
  children: (workspace: Workspace | undefined) => ReactNode;
}) {
  return (
    <StudioProvider>
      <ErrorBoundary>
        <AppShell pageTitle={title}>{children}</AppShell>
      </ErrorBoundary>
    </StudioProvider>
  );
}
