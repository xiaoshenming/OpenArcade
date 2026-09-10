import { describe, expect, it, vi } from 'vitest'
import { DIAGNOSTIC_EVENT, installDiagnosticSink, reportGameDiagnostic } from './diagnostics'

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

describe('diagnostic sink', () => {
  it('warns with game-scoped format', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const off = installDiagnosticSink()
    reportGameDiagnostic('sample', { type: 'score', score: 99 }, 'score-out-of-range')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('[openarcade:sample] score-out-of-range: score')
    off()
    warn.mockRestore()
  })

  it('stops warning after unsubscribe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const off = installDiagnosticSink()
    off()
    reportGameDiagnostic('sample', { type: 'score', score: 99 }, 'out-of-order')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
