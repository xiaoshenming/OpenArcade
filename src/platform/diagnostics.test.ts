import { describe, expect, it, vi } from 'vitest'
import { DIAGNOSTIC_EVENT, reportGameDiagnostic } from './diagnostics'

describe('platform diagnostics', () => {
  it('publishes rejected game events without exposing player data', () => {
    const listener = vi.fn()
    window.addEventListener(DIAGNOSTIC_EVENT, listener, { once: true })
    reportGameDiagnostic('sample', { type: 'score', score: 99 }, 'out-of-order')
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      gameId: 'sample', eventType: 'score', reason: 'out-of-order',
    })
  })
})
