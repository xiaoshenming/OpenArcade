import { describe, expect, it } from 'vitest'
import { hostMessage, parseGameMessage, PROTOCOL } from './protocol'

const channel = '0123456789abcdef'
const envelope = (event: unknown, selectedChannel = channel) => ({
  protocol: PROTOCOL,
  source: 'game',
  channel: selectedChannel,
  event,
})

describe('OpenArcade bridge protocol', () => {
  it('accepts versioned events bound to the active channel', () => {
    expect(parseGameMessage(envelope({ type: 'score', score: 120 }), channel)).toEqual({ type: 'score', score: 120 })
  })

  it('rejects stale channels, invalid scores, and unknown events', () => {
    expect(parseGameMessage(envelope({ type: 'score', score: 10 }, 'fedcba9876543210'), channel)).toBeNull()
    expect(parseGameMessage(envelope({ type: 'score', score: -1 }), channel)).toBeNull()
    expect(parseGameMessage(envelope({ type: 'hacked' }), channel)).toBeNull()
  })

  it('wraps host commands with the active channel', () => {
    expect(hostMessage({ type: 'restart' }, channel)).toEqual({
      protocol: PROTOCOL,
      source: 'host',
      channel,
      command: { type: 'restart' },
    })
  })
})
