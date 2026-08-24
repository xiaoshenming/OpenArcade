import type { GameEvent } from '../sdk'

export interface ScorePolicy {
  max: number
  eventsPerSecond: number
}

export interface PolicyDecision {
  accepted: boolean
  reason?: 'out-of-order' | 'duplicate-terminal' | 'score-limit' | 'rate-limit'
}

export class GameSessionPolicy {
  private state: 'loading' | 'ready' | 'running' | 'terminal' = 'loading'
  private restartRequested = false
  private eventTimes: number[] = []

  constructor(private readonly policy: ScorePolicy, readonly sessionId = 'local') {}

  accept(event: GameEvent, now = Date.now()): PolicyDecision {
    this.eventTimes = this.eventTimes.filter((time) => now - time < 1000)
    if (this.eventTimes.length >= this.policy.eventsPerSecond) return { accepted: false, reason: 'rate-limit' }
    this.eventTimes.push(now)

    if ('score' in event && (!Number.isInteger(event.score) || event.score < 0 || event.score > this.policy.max)) {
      return { accepted: false, reason: 'score-limit' }
    }
    if (event.type === 'ready') {
      if (this.state !== 'loading') return { accepted: false, reason: 'out-of-order' }
      this.state = 'ready'
      return { accepted: true }
    }
    if (event.type === 'started') {
      if (this.state !== 'ready') return { accepted: false, reason: 'out-of-order' }
      this.state = 'running'
      return { accepted: true }
    }
    if (event.type === 'score') {
      return this.state === 'running' ? { accepted: true } : { accepted: false, reason: 'out-of-order' }
    }
    if (event.type === 'failed') {
      if (this.state === 'terminal') return { accepted: false, reason: 'duplicate-terminal' }
      this.state = 'terminal'
      return { accepted: true }
    }
    if (event.type === 'completed') {
      if (this.state === 'terminal') return { accepted: false, reason: 'duplicate-terminal' }
      if (this.state !== 'running') return { accepted: false, reason: 'out-of-order' }
      this.state = 'terminal'
      return { accepted: true }
    }
    if (this.restartRequested) return { accepted: false, reason: 'out-of-order' }
    this.restartRequested = true
    return { accepted: true }
  }
}
