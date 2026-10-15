import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an error]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="panel my-6 rounded-3xl p-8 text-center" role="alert">
          <AlertTriangle aria-hidden className="mx-auto size-9 text-coral-400" />
          <h2 className="mt-4 text-xl font-bold">Something unexpected happened</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/50">
            {this.props.fallbackMessage ??
              this.state.error?.message ??
              "An error occurred while displaying this section."}
          </p>
          <Button className="mt-5" onClick={this.handleReset} tone="secondary">
            <RefreshCw aria-hidden className="size-4" />
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
