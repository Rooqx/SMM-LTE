import { LibraryPage } from "@/components/studio/LibraryPage";
import { StudioFrame } from "./StudioFrame";

export function LibraryEntry() {
  return (
    <StudioFrame title="Library">
      {(workspace) => <LibraryPage workspace={workspace} />}
    </StudioFrame>
  );
}
