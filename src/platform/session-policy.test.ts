import { describe, expect, it } from 'vitest'
import { GameSessionPolicy } from './session-policy'

const createPolicy = () => new GameSessionPolicy({ max: 1000, eventsPerSecond: 3 })

describe('host game session policy', () => {
  it('enforces lifecycle order and one terminal event', () => {
    const policy = createPolicy()
    expect(policy.accept({ type: 'score', score: 10 }, 0).accepted).toBe(false)
    expect(policy.accept({ type: 'ready' }, 100).accepted).toBe(true)
    expect(policy.accept({ type: 'started' }, 200).accepted).toBe(true)
    expect(policy.accept({ type: 'completed', score: 100 }, 2000).accepted).toBe(true)
    expect(policy.accept({ type: 'completed', score: 100 }, 3000).reason).toBe('duplicate-terminal')
  })

  it('records startup failures as terminal without requiring started', () => {
    const policy = createPolicy()
    expect(policy.accept({ type: 'failed', score: 0 }).accepted).toBe(true)
    expect(policy.accept({ type: 'failed', score: 0 }, 2000).reason).toBe('duplicate-terminal')
  })

  it('rejects invalid host-owned score values', () => {
    const policy = createPolicy()
    policy.accept({ type: 'ready' })
    policy.accept({ type: 'started' })
    expect(policy.accept({ type: 'score', score: 1001 }, 2000).reason).toBe('score-limit')
    expect(policy.accept({ type: 'score', score: -1 }, 3000).reason).toBe('score-limit')
    expect(policy.accept({ type: 'score', score: 1.5 }, 4000).reason).toBe('score-limit')
  })

  it('rate limits event floods', () => {
    const policy = createPolicy()
    policy.accept({ type: 'ready' }, 100)
    policy.accept({ type: 'started' }, 200)
    policy.accept({ type: 'score', score: 10 }, 300)
    expect(policy.accept({ type: 'score', score: 20 }, 400).reason).toBe('rate-limit')
  })
})
