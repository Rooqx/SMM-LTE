import { AccountPage } from "@/components/studio/AccountPage";
import { StudioFrame } from "./StudioFrame";

export function AccountEntry() {
  return (
    <StudioFrame title="You">
      {(workspace) => <AccountPage workspace={workspace} />}
    </StudioFrame>
  );
}
