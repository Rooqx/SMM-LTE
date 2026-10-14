import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({
  label = "Loading the studio",
}: {
  label?: string;
}) {
  return (
    <div
      aria-live="polite"
      className="grid min-h-64 place-items-center"
      role="status"
    >
      <div className="text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 block size-9 animate-spin rounded-full border-2 border-white/10 border-t-acid-400"
        />
        <p className="text-sm text-white/45">{label}…</p>
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="panel rounded-3xl p-8 text-center" role="alert">
      <AlertTriangle aria-hidden className="mx-auto size-9 text-coral-400" />
      <h2 className="mt-4 text-xl font-bold">
        Something interrupted the signal
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/50">
        {message}
      </p>
      {retry ? (
        <Button className="mt-5" onClick={retry} tone="secondary">
          <RefreshCw aria-hidden className="size-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="soft-panel rounded-3xl p-9 text-center">
      <Inbox aria-hidden className="mx-auto size-9 text-white/25" />
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
