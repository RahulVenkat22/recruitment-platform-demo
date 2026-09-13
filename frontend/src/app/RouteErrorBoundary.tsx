import { Component, type ReactNode } from 'react'
import { ErrorState } from '@/components/shared/ErrorState'

interface RouteErrorBoundaryProps {
  children: ReactNode
  /** Copy for the fallback; the default reads as a page-level failure. */
  title?: string
}

interface RouteErrorBoundaryState {
  error: unknown
}

/**
 * plan.md 7.4: a render error inside a page shows `ErrorState` with a retry
 * instead of blanking the whole app. Mount it with `key={pathname}` so a
 * navigation starts the next page clean.
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { error: error ?? new Error('Unknown error') }
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error !== null) {
      return (
        <ErrorState
          title={this.props.title ?? "This page couldn't be shown"}
          message="Something went wrong while drawing this page. Try again, or go back and reopen it."
          onRetry={this.reset}
          className="py-24"
        />
      )
    }
    return this.props.children
  }
}
