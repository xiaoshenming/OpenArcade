import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import EchoMazeGame from './Game'
import { bfsDistances, DIRS, WALL_BIT, type Dir } from './logic'
import { getEchoLevel } from './levels'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

const KEY_OF: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }

const renderGame = (level = 1, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<EchoMazeGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const readoutOf = (view: ReturnType<typeof render>) => view.container.querySelector('.echo-readout')?.textContent ?? ''

const padOf = (view: ReturnType<typeof render>, dir: Dir) =>
  view.container.querySelector(`.echo-pad-button.pad-${dir}`) as HTMLButtonElement

const pingOf = (view: ReturnType<typeof render>) => view.container.querySelector('.echo-ping') as HTMLButtonElement

const pathToExit = (level: number): Dir[] => {
  const spec = getEchoLevel(level)
  const dist = bfsDistances(spec.cols, spec.rows, spec.walls, spec.exit)
  const path: Dir[] = []
  let cell = spec.start
  while (cell.x !== spec.exit.x || cell.y !== spec.exit.y) {
    const here = dist[cell.y * spec.cols + cell.x] as number
    const dir = (Object.keys(DIRS) as Dir[]).find((candidate) => {
      if (spec.walls[cell.y * spec.cols + cell.x] & WALL_BIT[candidate]) return false
      const nx = cell.x + DIRS[candidate].x
      const ny = cell.y + DIRS[candidate].y
      if (nx < 0 || ny < 0 || nx >= spec.cols || ny >= spec.rows) return false
      return (dist[ny * spec.cols + nx] as number) === here - 1
    })
    expect(dir, `no downhill step from ${cell.x}:${cell.y}`).toBeDefined()
    path.push(dir as Dir)
    cell = { x: cell.x + DIRS[dir as Dir].x, y: cell.y + DIRS[dir as Dir].y }
  }
  return path
}

describe('echo maze game', () => {
  it('mounts with ready/started and completes along the shortest path to the exit', () => {
    const spec = getEchoLevel(1)
    const { view, emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(view.container.querySelector('.echo-board')).not.toBeNull()
    for (const dir of pathToExit(1)) fireEvent.click(padOf(view, dir))
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: 1000 })
    const completed = emit.mock.calls.filter((call: unknown[]) => (call[0] as GameEvent).type === 'completed')
    expect(completed).toHaveLength(1)
    expect(view.container.querySelector('.echo-veil.is-win')?.textContent).toContain('回声抵达')
    expect(view.container.textContent).toContain(`步 ${spec.par}`)
  })

  it('freezes pulses and movement while paused', () => {
    const { view, emit } = renderGame(1, true)
    expect(readoutOf(view)).toContain('脉冲 6/6 · 步 0/')
    expect(pingOf(view).disabled).toBe(true)
    for (const dir of Object.keys(KEY_OF) as Dir[]) {
      expect(padOf(view, dir).disabled).toBe(true)
      fireEvent.click(padOf(view, dir))
      fireEvent.keyDown(window, { key: KEY_OF[dir] })
    }
    fireEvent.keyDown(window, { key: ' ' })
    expect(readoutOf(view)).toContain('脉冲 6/6 · 步 0/')
    expect(emit).not.toHaveBeenCalledWith({ type: 'score', score: expect.anything() })
    expect(emit).not.toHaveBeenCalledWith({ type: 'completed', score: expect.anything() })
  })

  it('keeps the maze navigable after the pulses run dry', () => {
    const spec = getEchoLevel(1)
    const { view, emit } = renderGame(1)
    for (let used = 0; used < spec.pulses; used += 1) fireEvent.click(pingOf(view))
    expect(readoutOf(view)).toContain('脉冲 0/6')
    expect(pingOf(view).disabled).toBe(true)
    expect(view.container.querySelector('.echo-wall')).not.toBeNull()
    const first = pathToExit(1)[0] as Dir
    fireEvent.keyDown(window, { key: KEY_OF[first] })
    fireEvent.click(padOf(view, first))
    expect(readoutOf(view)).toContain('脉冲 0/6 · 步 2/')
    expect(emit).not.toHaveBeenCalledWith({ type: 'completed', score: expect.anything() })
    expect(view.container.querySelector('.echo-veil')).toBeNull()
  })
})
