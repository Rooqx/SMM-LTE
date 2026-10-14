import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lightbulb,
  LoaderCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { api } from "@/lib/api";
import type { QuestionPresentation } from "@/lib/contracts";

export interface TodayInterviewViewProps {
  question: QuestionPresentation;
  sessionId: string;
  sessionVersion: number;
  workspaceId: string;
  isSubmitting?: boolean | undefined;
  onSubmit: (input: {
    sessionId: string;
    expectedSessionVersion: number;
    questionId: string;
    questionVersion: number;
    optionSetId: string;
    selectedOptionIds: string[];
    customText?: string | undefined;
  }) => Promise<void>;
  progress?:
    | {
        currentIndex: number;
        totalQuestions: number;
        completedCount: number;
        percentComplete: number;
      }
    | undefined;
}

/**
 * Variant B Guided Briefing UI.
 *
 * Implements accessible, option-first question flows:
 * - Deterministic option presentation with curated fallbacks.
 * - Single-select, multi-select, and hybrid free-text modes.
 * - Keyboard shortcuts (1-9) with active-input protection.
 * - Semantic single/multi-select validation without arbitrary UI caps.
 * - An always-visible, first-class custom answer path.
 * - Non-blocking interaction tracking ensuring option stability.
 */
export function TodayInterviewView({
  question,
  sessionId,
  sessionVersion,
  workspaceId,
  isSubmitting = false,
  onSubmit,
  progress,
}: TodayInterviewViewProps) {
  const isMultiple =
    question.answerMode === "multiple" ||
    question.answerMode === "multiple_with_text";
  const supportsCombinedAnswer =
    question.answerMode === "single_with_text" ||
    question.answerMode === "multiple_with_text";
  const activeOptions = question.activeOptionSet.options;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [showPurpose, setShowPurpose] = useState(false);

  // Tracks user interaction to lock the option set and signal backend
  const hasInteractedRef = useRef(false);
  const errorId = useId();
  const textareaId = useId();

  const markInteraction = useCallback(() => {
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true;
      if (question.activeOptionSet.id) {
        api
          .markOptionSetPresented(workspaceId, question.activeOptionSet.id, {
            sessionId,
            interactionStarted: true,
          })
          .catch(() => {
            // Non-blocking interaction audit event
          });
      }
    }
  }, [workspaceId, question.activeOptionSet.id, sessionId]);

  // Keyboard shortcut listener for option selection (keys 1-9)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const keyNum = parseInt(event.key, 10);
      if (isNaN(keyNum) || keyNum < 1) return;

      const optionIndex = keyNum - 1;
      if (optionIndex < activeOptions.length) {
        event.preventDefault();
        const targetOption = activeOptions[optionIndex];
        if (!targetOption) return;

        markInteraction();
        setValidationError(null);

        if (isMultiple) {
          setSelectedIds((prev) =>
            prev.includes(targetOption.id)
              ? prev.filter((id) => id !== targetOption.id)
              : prev.length < question.maximumSelections
                ? [...prev, targetOption.id]
                : prev,
          );
        } else {
          setSelectedIds([targetOption.id]);
          if (!supportsCombinedAnswer) setCustomText("");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeOptions,
    isMultiple,
    markInteraction,
    question.allowCustom,
    question.maximumSelections,
    supportsCombinedAnswer,
  ]);

  function handleOptionToggle(optionId: string) {
    markInteraction();
    setValidationError(null);

    if (isMultiple) {
      setSelectedIds((prev) => {
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId);
        }
        if (prev.length >= question.maximumSelections) {
          setValidationError(
            `You can select at most ${question.maximumSelections} option${
              question.maximumSelections > 1 ? "s" : ""
            }.`,
          );
          return prev;
        }
        return [...prev, optionId];
      });
    } else {
      setSelectedIds([optionId]);
      if (!supportsCombinedAnswer) setCustomText("");
    }
  }

  const allOptionsSelected =
    activeOptions.length > 0 && selectedIds.length === activeOptions.length;

  function handleSelectAll() {
    markInteraction();
    setValidationError(null);
    setSelectedIds(allOptionsSelected ? [] : activeOptions.map((option) => option.id));
  }

  // Legacy pinned releases may still contain an option that explicitly
  // requires text. New releases use only the always-visible custom field.
  const selectedRequiresText = activeOptions.some(
    (opt) => selectedIds.includes(opt.id) && opt.requiresCustomText,
  );

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const trimmedText = customText.trim();
    const totalSelected = selectedIds.length + (trimmedText ? 1 : 0);

    if (question.minimumSelections > 0 && totalSelected < question.minimumSelections) {
      setValidationError(
        `Please select at least ${question.minimumSelections} option${
          question.minimumSelections > 1 ? "s" : ""
        }.`,
      );
      return;
    }

    if (question.required && totalSelected === 0) {
      setValidationError("Please select at least one option to continue.");
      return;
    }

    if (selectedIds.length > question.maximumSelections) {
      setValidationError(
        `Please select no more than ${question.maximumSelections} option${
          question.maximumSelections > 1 ? "s" : ""
        }.`,
      );
      return;
    }

    if (!trimmedText && (question.customTextRequired || selectedRequiresText)) {
      setValidationError("Please provide details in the text field to complete your answer.");
      return;
    }

    try {
      await onSubmit({
        sessionId,
        expectedSessionVersion: sessionVersion,
        questionId: question.id,
        questionVersion: question.version,
        optionSetId: question.activeOptionSet.id,
        selectedOptionIds: selectedIds,
        ...(trimmedText.length > 0 ? { customText: trimmedText } : {}),
      });
    } catch {
      // Parent controller handles and presents mutation errors
    }
  }

  return (
    <form
      aria-describedby={validationError ? errorId : undefined}
      className="space-y-4"
      onSubmit={handleSubmit}
    >
      {/* Progress header when multi-question progress is available */}
      {progress ? (
        <div className="flex items-center justify-between text-[11px] text-white/50">
          <span>
            Question {progress.currentIndex} of {progress.totalQuestions}
          </span>
          <span className="font-medium text-acid-400">
            {progress.percentComplete}% complete
          </span>
        </div>
      ) : null}

      {/* Progress bar */}
      {progress ? (
        <div
          aria-label="Interview progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress.percentComplete}
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.08]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-acid-400 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(5, progress.percentComplete)}%` }}
          />
        </div>
      ) : null}

      {/* Question context and prompt */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium leading-relaxed text-white">
          {question.prompt}
        </legend>

        <p className="text-[11px] font-medium text-acid-400">
          {isMultiple ? "Select everything that applies" : "Choose one answer"}
        </p>

        {question.supportingText ? (
          <p className="text-xs leading-5 text-white/60">
            {question.supportingText}
          </p>
        ) : null}

        {/* Examples disclosure */}
        {question.examples && question.examples.length > 0 ? (
          <div>
            <button
              aria-expanded={showExamples}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-acid-400 hover:text-white transition-colors"
              onClick={() => setShowExamples((prev) => !prev)}
              type="button"
            >
              <Lightbulb aria-hidden="true" className="size-3.5" />
              <span>{showExamples ? "Hide examples" : "See examples"}</span>
              {showExamples ? (
                <ChevronUp aria-hidden="true" className="size-3" />
              ) : (
                <ChevronDown aria-hidden="true" className="size-3" />
              )}
            </button>
            {showExamples ? (
              <ul className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs text-white/70">
                {question.examples.map((example, idx) => (
                  <li className="flex items-start gap-2" key={idx}>
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-acid-400" />
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Options grid */}
        <div
          aria-label={question.prompt}
          className="grid gap-2 pt-1"
          role={isMultiple ? "group" : "radiogroup"}
        >
          {activeOptions.map((option, index) => {
            const isSelected = selectedIds.includes(option.id);
            const badgeIndex = index + 1;

            return (
              <label
                className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-acid-400 ${
                  isSelected
                    ? "border-acid-400 bg-acid-400/[.08] shadow-[0_0_12px_rgba(198,255,0,0.06)]"
                    : "border-white/10 bg-ink-950/50 hover:border-white/20"
                }`}
                key={option.id}
              >
                <input
                  checked={isSelected}
                  className="sr-only"
                  name={`question-${question.id}`}
                  onChange={() => handleOptionToggle(option.id)}
                  type={isMultiple ? "checkbox" : "radio"}
                  value={option.id}
                />
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-[7px] text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? "bg-acid-400 text-ink-950"
                      : "bg-white/[.06] text-white/50"
                  }`}
                >
                  {isSelected && isMultiple ? (
                    <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
                  ) : (
                    badgeIndex <= 9 ? badgeIndex : "•"
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="block text-xs font-medium text-white">
                      {option.label}
                    </strong>
                  </div>
                  {option.description ? (
                    <span className="mt-0.5 block text-[11px] leading-4 text-white/50">
                      {option.description}
                    </span>
                  ) : null}
                </div>
              </label>
            );
          })}

        </div>

        {isMultiple && question.allowSelectAll ? (
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-acid-400 transition-colors hover:bg-acid-400/10 hover:text-white"
            onClick={handleSelectAll}
            type="button"
          >
            <Check aria-hidden="true" className="size-4" />
            {allOptionsSelected ? "Clear all" : "Select all"}
          </button>
        ) : null}

        {/* Custom text is a real answer path, not a hidden comment field. */}
        {question.allowCustom ? (
          <div className="pt-2">
            <label
              className="mb-1.5 block text-xs font-medium text-white/70"
              htmlFor={textareaId}
            >
              Your own answer
            </label>
            <textarea
              className="min-h-[86px] w-full resize-y rounded-xl border border-white/10 bg-ink-950/70 p-3 text-xs text-white placeholder:text-white/30 focus:border-acid-400 focus:outline-none focus:ring-1 focus:ring-acid-400"
              id={textareaId}
              maxLength={1000}
              onChange={(e) => {
                setCustomText(e.target.value);
                if (!supportsCombinedAnswer && e.target.value.trim()) {
                  setSelectedIds([]);
                }
                setValidationError(null);
                markInteraction();
              }}
              placeholder="Write your own answer…"
              value={customText}
            />
          </div>
        ) : null}
      </fieldset>

      {/* Validation alert */}
      {validationError ? (
        <p
          className="rounded-xl border border-coral-400/30 bg-coral-400/10 p-3 text-xs text-coral-400"
          id={errorId}
          role="alert"
        >
          {validationError}
        </p>
      ) : null}

      {/* Purpose / "Why I'm asking" disclosure */}
      {showPurpose && question.meaning ? (
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-[11px] leading-relaxed text-white/60">
          <strong className="block font-medium text-white/80 mb-1">
            Why autopilot asks this:
          </strong>
          {question.meaning}
        </div>
      ) : null}

      {/* Action footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
        {question.meaning ? (
          <button
            aria-expanded={showPurpose}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-white/50 hover:bg-white/[.05] hover:text-white transition-colors"
            onClick={() => setShowPurpose((prev) => !prev)}
            type="button"
          >
            <HelpCircle aria-hidden="true" className="size-4" />
            <span>Why I’m asking</span>
          </button>
        ) : (
          <div />
        )}

        <button
          aria-label="Submit answer and advance"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-acid-400 px-4 text-xs font-semibold text-ink-950 transition-colors hover:bg-white disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ArrowRight aria-hidden="true" className="size-4" />
          )}
          <span>{isSubmitting ? "Saving..." : "Use this answer"}</span>
        </button>
      </div>
    </form>
  );
}
