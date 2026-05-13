import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SurfaceState } from './SurfaceState'

interface AppViewBoundaryProps {
  viewKey: string
  title: string
  children: ReactNode
}

interface AppViewBoundaryState {
  error: Error | null
}

export class AppViewBoundary extends Component<AppViewBoundaryProps, AppViewBoundaryState> {
  state: AppViewBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): AppViewBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Atlas panel failed: ${this.props.viewKey}`, error, info.componentStack)
  }

  componentDidUpdate(previousProps: AppViewBoundaryProps) {
    if (previousProps.viewKey !== this.props.viewKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <SurfaceState
        tone="error"
        title={`${this.props.title} could not render`}
        detail="The rest of Atlas is still available. Switch tabs or reset this panel after checking the console."
      >
        <button type="button" onClick={() => this.setState({ error: null })}>
          Reset panel
        </button>
      </SurfaceState>
    )
  }
}
