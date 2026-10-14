import type { ConversationMemory } from "../db/workflow-store.js";
import type { RecipeStep } from "../orchestration/recipes/types.js";
import type { WorkspaceContext } from "../skills/prompt-compiler.js";

export type MemoryMessage = {
  ordinal: number;
  role: "user" | "assistant" | "tool" | "system";
  kind: string;
  content: string;
  data: Record<string, unknown>;
};

export type AssembledMemory = {
  context: WorkspaceContext[];
  missingRequiredContext: string[];
  summary: ConversationMemory["summary"];
  recentMessages: MemoryMessage[];
  omittedRecentMessages: number;
};

function serializedLength(value: unknown): number {
  return JSON.stringify(value).length;
}

/** Selects deterministic, step-scoped memory without semantic/vector retrieval. */
export class MemoryAssembler {
  constructor(
    readonly contextMaxChars: number,
    readonly conversationMaxChars: number,
  ) {}

  assemble(input: {
    step: RecipeStep;
    pinnedContext: WorkspaceContext[];
    conversation: ConversationMemory;
  }): AssembledMemory {
    const contextByKey = new Map(input.pinnedContext.map((item) => [item.key, item]));
    const context = input.step.requiredContextKeys
      .map((key) => contextByKey.get(key))
      .filter((item): item is WorkspaceContext => Boolean(item));
    const missingRequiredContext = input.step.requiredContextKeys
      .filter((key) => !contextByKey.has(key));
    if (serializedLength(context) > this.contextMaxChars) {
      // Required constraints are never silently cut to fit a prompt.
      throw new Error(
        `Required context exceeds the ${this.contextMaxChars}-character memory budget`,
      );
    }

    const summary = input.conversation.summary;
    const summarySize = summary ? serializedLength(summary) : 0;
    if (summarySize > this.conversationMaxChars) {
      throw new Error(
        `Conversation summary exceeds the ${this.conversationMaxChars}-character memory budget`,
      );
    }
    let remaining = this.conversationMaxChars - summarySize;
    const selected: MemoryMessage[] = [];
    // Preserve the newest information. The omission count is explicit so the
    // model cannot mistake a bounded window for the complete conversation.
    for (const message of [...input.conversation.messages].reverse()) {
      const candidate: MemoryMessage = {
        ordinal: Number(message.ordinal),
        role: message.role,
        kind: message.kind,
        content: message.content,
        data: message.data,
      };
      const size = serializedLength(candidate);
      if (size > remaining) break;
      selected.push(candidate);
      remaining -= size;
    }
    selected.reverse();
    return {
      context,
      missingRequiredContext,
      summary,
      recentMessages: selected,
      omittedRecentMessages: input.conversation.messages.length - selected.length,
    };
  }
}
