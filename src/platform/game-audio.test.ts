import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGameAudio } from './game-audio'

afterEach(() => vi.unstubAllGlobals())

describe('game audio', () => {
  it('stays silent in environments without AudioContext', () => {
    expect(() => createGameAudio().play('match')).not.toThrow()
  })

  it('synthesizes one oscillator per note and honors mute', () => {
    const started: string[] = []
    class FakeAudioContext {
      currentTime = 0
      destination = {}
      createGain() {
        return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (next: unknown) => next }
      }
      createOscillator() {
        const oscillator = { type: '', frequency: { value: 0 }, connect: (next: unknown) => next, start: () => started.push(oscillator.frequency.value.toString()), stop: () => {} }
        return oscillator
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const audio = createGameAudio()
    audio.play('win')
    audio.setMuted(true)
    audio.play('win')
    expect(started).toEqual(['523', '659', '784', '1047'])
  })
})
