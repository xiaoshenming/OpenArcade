import { describe, expect, it } from 'vitest'
import { hostMessage, parseGameMessage, PROTOCOL } from './protocol'

describe('OpenArcade bridge protocol', () => {
  it('accepts versioned game events', () => {
    expect(parseGameMessage({ protocol: PROTOCOL, source: 'game', event: { type: 'score', score: 120 } })).toEqual({ type: 'score', score: 120 })
  })

  it('rejects malformed and unknown messages', () => {
    expect(parseGameMessage({ protocol: 'legacy', source: 'game', event: { type: 'score', score: 10 } })).toBeNull()
    expect(parseGameMessage({ protocol: PROTOCOL, source: 'game', event: { type: 'hacked' } })).toBeNull()
  })

  it('wraps host commands in the same protocol envelope', () => {
    expect(hostMessage({ type: 'restart' })).toEqual({ protocol: PROTOCOL, source: 'host', command: { type: 'restart' } })
  })
})
