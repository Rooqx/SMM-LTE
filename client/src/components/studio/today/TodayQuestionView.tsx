import { ArrowRight, HelpCircle, LoaderCircle } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import type { AnswerChoice, PendingQuestion } from "@/lib/contracts";

interface TodayQuestionViewProps {
  question: PendingQuestion;
  onSubmit: (answer: AnswerChoice) => Promise<void>;
  isSubmitting?: boolean;
}

/** Native controls make AI questions accessible and keep exclusive choices exclusive. */
export function TodayQuestionView({ question, onSubmit, isSubmitting = false }: TodayQuestionViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const [showPurpose, setShowPurpose] = useState(false);
  const [validationError, setValidationError] = useState("");
  const multiple = question.selection_mode === "multiple";
  const choices = question.options.filter((option) => option.id !== "custom");
  const trimmedText = customText.trim();

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");
    if (!selectedIds.length && !trimmedText) {
      setValidationError("Choose an option or write your own answer.");
      return;
    }
    if (multiple) {
      await onSubmit(selectedIds.length
        ? { type: "multiple", optionIds: selectedIds, ...(trimmedText ? { text: trimmedText } : {}) }
        : { type: "custom", text: trimmedText });
    } else {
      await onSubmit(trimmedText
        ? { type: "custom", text: trimmedText }
        : { type: "option", optionId: selectedIds[0]! });
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset aria-describedby={validationError ? "today-answer-error" : undefined}>
        <legend className="mb-2 text-xs text-white/60">{multiple ? "Select everything that applies" : "Choose one answer"}</legend>
        <div className="grid gap-2">
          {choices.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <label className={`flex min-h-[54px] cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-acid-400 ${selected ? "border-acid-400 bg-acid-400/[.07]" : "border-white/10 bg-ink-950/45 hover:border-white/20"}`} key={option.id}>
                <input checked={selected} className="mt-1 size-4 accent-acid-400" name={`answer-${question.id}`} onChange={() => {
                  setSelectedIds((current) => multiple
                    ? selected ? current.filter((id) => id !== option.id) : [...current, option.id]
                    : [option.id]);
                  if (!multiple) setCustomText("");
                  setValidationError("");
                }} type={multiple ? "checkbox" : "radio"} value={option.id} />
                <span className="min-w-0"><strong className="block text-xs font-medium text-white">{option.label}</strong>
                  {option.description ? <span className="mt-0.5 block text-[10px] leading-4 text-white/45">{option.description}</span> : null}
                </span>
              </label>
            );
          })}
          {multiple && choices.length > 1 ? (
            <button className="w-fit rounded-lg px-2 py-1 text-xs text-acid-400 hover:bg-white/[.06]" onClick={() => setSelectedIds(selectedIds.length === choices.length ? [] : choices.map((option) => option.id))} type="button">
              {selectedIds.length === choices.length ? "Clear selections" : "Select all"}
            </button>
          ) : null}
          {question.allow_custom ? (
            <label className="block rounded-xl border border-white/10 bg-ink-950/45 px-3 py-2.5 text-xs font-medium text-white">Your own answer
              <textarea className="mt-2 min-h-[76px] w-full resize-y rounded-xl border border-white/10 bg-ink-950/65 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-acid-400 focus:outline-none" maxLength={10000} onChange={(event) => {
                setCustomText(event.target.value);
                if (!multiple && event.target.value) setSelectedIds([]);
                setValidationError("");
              }} placeholder={multiple ? "Add a detail the suggestions missed…" : "Write your answer here…"} value={customText} />
            </label>
          ) : null}
        </div>
      </fieldset>
      {validationError ? <p className="mt-3 rounded-xl border border-coral-400/30 bg-coral-400/10 p-3 text-xs text-coral-400" id="today-answer-error" role="alert">{validationError}</p> : null}
      {showPurpose && question.purpose ? <p className="mt-3 rounded-[10px] bg-white/[.04] p-3 text-[10px] leading-4 text-white/50">{question.purpose}</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {question.purpose ? <button aria-expanded={showPurpose} className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] px-3 text-[11px] font-medium text-white/45 hover:bg-white/[.04] hover:text-white" onClick={() => setShowPurpose((current) => !current)} type="button"><HelpCircle aria-hidden className="size-4" /> Why I’m asking</button> : <span />}
        <button aria-label="Submit answer" className="inline-flex min-h-10 items-center gap-1.5 rounded-[11px] bg-acid-400 px-3.5 text-[11px] font-semibold text-ink-950 hover:bg-white disabled:opacity-50" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}Use this answer <ArrowRight aria-hidden className="size-4" /></button>
      </div>
    </form>
  );
}
