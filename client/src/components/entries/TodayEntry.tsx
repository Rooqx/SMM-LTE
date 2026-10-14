import { TodayPage } from "@/components/studio/TodayPage";
import { StudioFrame } from "./StudioFrame";

/** Hydration boundary for the central Today orchestration surface. */
export function TodayEntry() {
  return (
    <StudioFrame title="Today">
      {(workspace) => <TodayPage workspace={workspace} />}
    </StudioFrame>
  );
}
