import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { advance, createPulseState, DT, trySwitch, wantsSwitch } from './logic'
import { generateCourse } from './levels'
import PulseRunnerGame from './Game'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

interface Loop {
  run: (maxFrames: number, tick: (deltaMs: number) => void, settled: () => boolean) => number
}

const installLoop = (): Loop => {
  let frame: ((now: number) => void) | null = null
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => { frame = null })
  return {
    run: (maxFrames, tick, settled) => {
      const warmup = performance.now() + 100000
      let now = warmup
      for (let index = 0; index < maxFrames && frame; index += 1) {
        tick(index === 0 ? warmup - performance.now() + 8 : 8)
        now += 8
        act(() => { frame?.(now) })
        if (settled()) return index + 1
      }
      return maxFrames
    },
  }
}

const renderGame = (emit: (event: GameEvent) => void, level = 1) =>
  render(<PulseRunnerGame sessionKey={1} paused={false} muted emit={emit} level={level} />)

const saw = (emit: ReturnType<typeof vi.fn>, type: GameEvent['type']) =>
  emit.mock.calls.some(([event]) => event.type === type)

describe('pulse runner game loop', () => {
  it('crashes into mismatched gates and fails when the player never presses a switch', () => {
    const loop = installLoop()
    const emit = vi.fn<(event: GameEvent) => void>()
    const view = renderGame(emit)
    const frames = loop.run(60000, () => {}, () => saw(emit, 'failed'))
    expect(saw(emit, 'failed'), `no failure within ${frames} frames`).toBe(true)
    expect(saw(emit, 'completed')).toBe(false)
    expect(view.getByText('脉冲中断')).toBeTruthy()
  }, 60000)

  it('clears the level when the player presses at the right moments', () => {
    const course = generateCourse(1)
    const spec = course.level
    let mirror = createPulseState()
    let acc = 0
    const loop = installLoop()
    const emit = vi.fn<(event: GameEvent) => void>()
    const view = renderGame(emit)
    const frames = loop.run(
      60000,
      (deltaMs) => {
        acc += Math.min(0.08, deltaMs / 1000)
        while (acc >= DT && mirror.over === null) {
          acc -= DT
          if (wantsSwitch(mirror, spec, course)) {
            fireEvent.keyDown(window, { code: 'Space' })
            mirror = trySwitch(mirror, spec).state
          }
          mirror = advance(mirror, spec, course, DT).state
        }
      },
      () => mirror.over !== null,
    )
    expect(mirror.over, `mirror stuck at ${mirror.x}m after ${frames} frames`).toBe('completed')
    expect(mirror.lives).toBe(3)
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.getByText('冲线成功')).toBeTruthy()
  }, 60000)
})
