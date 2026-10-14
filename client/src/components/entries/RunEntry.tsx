import { RunDetail } from "@/components/studio/RunDetail";
import { StudioFrame } from "./StudioFrame";

export function RunEntry({ runId }: { runId: string }) {
  return (
    <StudioFrame title="Run detail">
      {(workspace) => <RunDetail runId={runId} workspace={workspace} />}
    </StudioFrame>
  );
}
