"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ShowcaseErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">
            {this.props.name} failed to render
          </p>
          <p className="mt-1 font-mono text-xs text-red-500">
            {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
