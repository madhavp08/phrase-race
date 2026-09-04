import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  message: string | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { message: error.message || 'Something went wrong.' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PhraseRace] render error', error, info.componentStack)
  }

  render() {
    if (this.state.message) {
      return (
        <div className="app crash-screen">
          <p className="error-line">{this.state.message}</p>
          <button
            type="button"
            className="icon-btn primary"
            onClick={() => window.location.reload()}
          >
            reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
