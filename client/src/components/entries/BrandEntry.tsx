import { BrandPage } from "@/components/studio/BrandPage";
import { StudioFrame } from "./StudioFrame";

export function BrandEntry() {
  return (
    <StudioFrame title="Brand">
      {(workspace) => <BrandPage workspace={workspace} />}
    </StudioFrame>
  );
}
