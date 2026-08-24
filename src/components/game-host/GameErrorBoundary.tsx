import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './HostState'

interface Props {
  children: ReactNode
  resetKey: string
  onError: (error: Error, details: ErrorInfo) => void
}

interface State { error: Error | null }

export class GameErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    this.props.onError(error, details)
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return <ErrorState message="这个游戏遇到了运行错误，宿主仍然安全。" onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
