import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { createSpinArenaState } from './levels'
import { stepArena, type ArenaInput, type ArenaState, type Dot } from './logic'
import Game from './Game'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const saw = (emit: ReturnType<typeof vi.fn>, type: GameEvent['type']) =>
  emit.mock.calls.some(([event]) => event.type === type)

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
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

interface Loop {
  run: (maxFrames: number, tick: (deltaMs: number) => void, settled: () => boolean) => number
}

const renderGame = (level: number, emit: (event: GameEvent) => void) =>
  render(<Game sessionKey={1} paused={false} muted emit={emit} level={level} />)

const botInput = (state: ArenaState): ArenaInput => {
  const head = state.player
  let ax = -head.x / 40
  let ay = -head.y / 40
  let best = Infinity
  let target: Dot | null = null
  for (const dot of state.dots) {
    if (dot.taken) continue
    const gap = Math.hypot(dot.x - head.x, dot.y - head.y)
    if (gap < best) {
      best = gap
      target = dot
    }
  }
  if (target) {
    ax += (target.x - head.x) / Math.max(1, best)
    ay += (target.y - head.y) / Math.max(1, best)
  }
  for (const foe of state.enemies) {
    if (!foe.alive) continue
    const dx = head.x - foe.x
    const dy = head.y - foe.y
    const gap = Math.hypot(dx, dy) || 1
    if (gap < 40) {
      ax += (dx / gap) * (40 - gap) * 0.25
      ay += (dy / gap) * (40 - gap) * 0.25
    }
  }
  const len = Math.hypot(ax, ay) || 1
  return { ax: ax / len, ay: ay / len }
}

const KEYS = { '1': 'ArrowUp', '2': 'ArrowDown', '3': 'ArrowLeft', '4': 'ArrowRight' } as const
type Key = (typeof KEYS)[keyof typeof KEYS]

const keysFor = (input: ArenaInput): Key[] => {
  const keys: Key[] = []
  if (input.ay < -0.4) keys.push(KEYS[1])
  if (input.ay > 0.4) keys.push(KEYS[2])
  if (input.ax < -0.4) keys.push(KEYS[3])
  if (input.ax > 0.4) keys.push(KEYS[4])
  return keys
}

describe('spin arena game loop', () => {
  it('writes the verdict into the hud so the result panel becomes reachable', () => {
    const loop = installLoop()
    const emit = vi.fn<(event: GameEvent) => void>()
    const view = renderGame(1, emit)
    const frames = loop.run(20000, () => {}, () => saw(emit, 'failed'))
    expect(frames, `no verdict within ${frames} frames`).toBeLessThan(20000)
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.any(Number) })
    expect(view.getByText('陀螺离场')).toBeTruthy()
    expect(view.container.querySelector('.spin-panel.is-lose')).toBeTruthy()
    const again = view.getByText('再来一次').closest('button') as HTMLButtonElement
    expect(again).not.toBeDisabled()
  }, 60000)

  it('reaches the win panel when a dot-chasing pilot survives on the arrow keys', () => {
    const loop = installLoop()
    const emit = vi.fn<(event: GameEvent) => void>()
    const view = renderGame(1, emit)
    let mirror = createSpinArenaState(1)
    let acc = 0
    let pressed: Key[] = []
    const press = (keys: Key[]) => {
      for (const key of pressed) if (!keys.includes(key)) fireEvent.keyUp(window, { key })
      for (const key of keys) if (!pressed.includes(key)) fireEvent.keyDown(window, { key })
      pressed = keys
    }
    const frames = loop.run(
      30000,
      (deltaMs) => {
        acc += Math.min(0.08, deltaMs / 1000)
        while (acc >= 1 / 60 && mirror.status === 'running') {
          acc -= 1 / 60
          const keys = keysFor(botInput(mirror))
          press(keys)
          let ax = 0
          let ay = 0
          if (keys.includes(KEYS[4])) ax += 1
          if (keys.includes(KEYS[3])) ax -= 1
          if (keys.includes(KEYS[2])) ay += 1
          if (keys.includes(KEYS[1])) ay -= 1
          const len = Math.hypot(ax, ay)
          mirror = stepArena(mirror, len > 0 ? { ax: ax / len, ay: ay / len } : { ax: 0, ay: 0 }, 1 / 60)
        }
        if (mirror.status !== 'running') press([])
      },
      () => saw(emit, 'completed'),
    )
    expect(mirror.status, `mirror stuck after ${frames} frames`).toBe('completed')
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.getByText('守环成功')).toBeTruthy()
    expect(view.container.querySelector('.spin-panel.is-win')).toBeTruthy()
  }, 60000)
})
