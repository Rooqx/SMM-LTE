import { randomUUID } from "node:crypto";
import type { LlmProvider, LlmRequest } from "./provider.js";

export class MockProvider implements LlmProvider {
  async execute(request: LlmRequest) {
    const parsedInput = JSON.parse(request.userPrompt) as {
      skill?: string;
      phase?: number;
      input?: Record<string, unknown>;
      runtime_permissions?: {
        artifact_kinds?: string[];
        context_updates?: string[];
      };
    };
    const content = `Mock execution for ${parsedInput.skill ?? "unknown-skill"}.`;
    const artifactKind = parsedInput.runtime_permissions?.artifact_kinds?.[0];

    const contextUpdates = (parsedInput.runtime_permissions?.context_updates ?? []).map((key) => ({
      key,
      markdown: `Mock synthesized context for ${key}.`,
      data: { synthesized_from_intake: Boolean(parsedInput.input?.compiled_intake) },
    }));

    return {
      action: {
        type: "propose_output" as const,
        message: content,
        artifacts: artifactKind
          ? [{
            kind: artifactKind,
            slug: `mock-${parsedInput.skill ?? "skill"}`,
            title: "Mock skill output",
            content,
            metadata: {},
          }]
          : [],
        contextUpdates,
        finalPosts: [],
      },
      provider: "mock",
      model: "deterministic-mock",
      providerResponseId: randomUUID(),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}
