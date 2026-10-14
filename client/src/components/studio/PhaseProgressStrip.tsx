import { getPhaseConfig } from "@/config/phases";

interface PhaseProgressStripProps {
  currentPhase: number;
}

export function PhaseProgressStrip({ currentPhase }: PhaseProgressStripProps) {
  const phases = [1, 2, 3, 4, 5, 6].map((num) => ({
    ...getPhaseConfig(num),
    isCompleted: num < currentPhase,
    isActive: num === currentPhase,
    isFuture: num > currentPhase,
  }));

  const activePhaseConfig = getPhaseConfig(currentPhase);
  const boundedPhase = Math.min(Math.max(currentPhase, 1), 6);
  const progress = Math.max(5, ((boundedPhase - 1) / 6) * 100 + 8);

  return (
    <div className="w-full border-b border-white/[.07] bg-white/[.035]">
      <div className="mx-auto hidden max-w-none px-5 py-3 md:block">
        <div className="grid grid-cols-6 gap-1.5">
          {phases.map((phase) => (
            <div className="min-w-0" key={phase.number}>
              <div
                className={`mb-1.5 h-1 rounded-full ${
                  phase.isCompleted
                    ? "bg-acid-400/70"
                    : phase.isActive
                      ? "bg-acid-400"
                      : "bg-white/10"
                }`}
              />
              <strong className={`block truncate text-[10px] font-medium ${phase.isFuture ? "text-white/45" : "text-white/90"}`}>
                {phase.label}
              </strong>
              <span className="block truncate text-[9px] text-white/38">
                {phase.supportingLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-3.5 py-2.5 md:hidden">
        <div
          aria-label={`Phase ${boundedPhase} progress`}
          className="grid size-[34px] shrink-0 place-items-center rounded-full p-1"
          style={{ background: `conic-gradient(#c8ff4d ${progress}%, rgba(255,255,255,.10) 0)` }}
        >
          <div className="grid size-[26px] place-items-center rounded-full bg-ink-900 text-[9px] font-semibold text-white">
            {boundedPhase}
          </div>
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-[11px] font-medium text-white">
            {activePhaseConfig.label}
          </strong>
          <span className="block truncate text-[10px] text-white/45">
            Phase {boundedPhase} of 6 · {activePhaseConfig.shortDescription}
          </span>
        </div>
      </div>
    </div>
  );
}
