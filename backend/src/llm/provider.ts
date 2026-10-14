import type { LlmAction, LlmExecution } from "../domain/schemas.js";

export type LlmActionType = LlmAction["type"];
export type CannotContinueReason = Extract<
  LlmAction,
  { type: "cannot_continue" }
>["reason"];

export type LlmRequest = {
  developerPrompt: string;
  userPrompt: string;
  /**
   * Actions authorized for this exact recipe step. The provider constrains its
   * structured-output schema to this list, while the orchestration service
   * remains the final authorization boundary.
   */
  allowedActionTypes: readonly LlmActionType[];
  /** Missing user facts are interactive questions, not terminal blockers. */
  allowedCannotContinueReasons: readonly CannotContinueReason[];
  /** Safe opaque identifier used for provider-side request correlation. */
  correlationId: string;
};

export interface LlmProvider {
  execute(request: LlmRequest): Promise<LlmExecution>;
}
