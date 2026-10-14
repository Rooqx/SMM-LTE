import { Eye, EyeOff } from "lucide-react";

interface PasswordVisibilityButtonProps {
  fieldLabel: string;
  onToggle: () => void;
  visible: boolean;
}

/** Accessible, reusable control for revealing a password locally in the browser. */
export function PasswordVisibilityButton({
  fieldLabel,
  onToggle,
  visible,
}: PasswordVisibilityButtonProps) {
  const action = visible ? "Hide" : "Show";

  return (
    <button
      aria-label={`${action} ${fieldLabel.toLowerCase()}`}
      aria-pressed={visible}
      className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-white/45 transition hover:bg-white/[.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid-400"
      onClick={onToggle}
      type="button"
    >
      {visible ? (
        <EyeOff aria-hidden className="size-4" />
      ) : (
        <Eye aria-hidden className="size-4" />
      )}
    </button>
  );
}
