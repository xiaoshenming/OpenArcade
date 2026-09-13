import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { areNeighbors, generateCloudPuzzle, REVEAL_MS, validatePath, type CloudPuzzle } from './logic'
import Game from './Game'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type View = ReturnType<typeof render>

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<Game sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const boardOf = (view: View) => view.container.querySelector('.cy-board') as HTMLElement

const mockBoard = (view: View, puzzle: CloudPuzzle) => {
  const span = puzzle.cols * 100
  boardOf(view).getBoundingClientRect = () =>
    ({
      left: 0, top: 0, width: span, height: puzzle.rows * 100, right: span, bottom: puzzle.rows * 100,
      x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect
}

const pointOf = (puzzle: CloudPuzzle, cell: number) => ({
  clientX: (cell % puzzle.cols) * 100 + 50,
  clientY: Math.floor(cell / puzzle.cols) * 100 + 50,
})

const firePointer = (
  view: View,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  puzzle: CloudPuzzle,
  cell: number,
  button = 0,
) => {
  fireEvent(
    boardOf(view),
    new MouseEvent(type, { bubbles: true, cancelable: true, button, ...pointOf(puzzle, cell) }),
  )
}

const tap = (view: View, puzzle: CloudPuzzle, cell: number) => {
  firePointer(view, 'pointerdown', puzzle, cell)
  firePointer(view, 'pointerup', puzzle, cell)
}

const dragOver = (view: View, puzzle: CloudPuzzle, press: number, pass: number) => {
  firePointer(view, 'pointerdown', puzzle, press)
  firePointer(view, 'pointermove', puzzle, pass)
  firePointer(view, 'pointerup', puzzle, pass)
}

const readout = (view: View) => view.container.querySelector('.cy-readout strong')?.textContent ?? ''
const pathCells = (view: View) => view.container.querySelectorAll('.cy-cell.is-path').length

const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const

const longWalk = (puzzle: CloudPuzzle, want: number): readonly number[] => {
  const path = [puzzle.start]
  const seen = new Set([puzzle.start])
  const search = (cell: number): boolean => {
    if (path.length >= want) return true
    for (const [dr, dc] of DIRS) {
      const row = Math.floor(cell / puzzle.cols) + dr
      const col = (cell % puzzle.cols) + dc
      if (row < 0 || col < 0 || row >= puzzle.rows || col >= puzzle.cols) continue
      const next = row * puzzle.cols + col
      if (seen.has(next) || puzzle.storms[next]) continue
      path.push(next)
      seen.add(next)
      if (search(next)) return true
      path.pop()
      seen.delete(next)
    }
    return false
  }
  expect(search(puzzle.start), `no ${want}-cell walk from ${puzzle.start}`).toBe(true)
  return path
}

const greedyWalk = (puzzle: CloudPuzzle, from: number, target: number): readonly number[] | null => {
  const walk = [from]
  const seen = new Set([from])
  let head = from
  for (let guard = 0; guard < 120 && head !== target; guard += 1) {
    const dr = Math.floor(target / puzzle.cols) - Math.floor(head / puzzle.cols)
    const dc = (target % puzzle.cols) - (head % puzzle.cols)
    const next = dr !== 0 && Math.abs(dr) >= Math.abs(dc) ? head + Math.sign(dr) * puzzle.cols : head + Math.sign(dc)
    if (seen.has(next) || puzzle.storms[next]) return null
    walk.push(next)
    seen.add(next)
    head = next
  }
  return head === target ? walk : null
}

describe('cloud-yard input layer', () => {
  it('clamps a single far click that crosses the budget border and still judges the submit', () => {
    const puzzle = generateCloudPuzzle(1)
    const { emit, view } = renderGame(1)
    mockBoard(view, puzzle)
    const walk = longWalk(puzzle, puzzle.budget + 4)
    const head = puzzle.budget - 3
    for (let step = 1; step <= head; step += 1) tap(view, puzzle, walk[step])
    expect(readout(view)).toContain(`${head} / ${puzzle.budget} 步`)
    expect(areNeighbors(walk[head], walk[head + 1], puzzle.cols)).toBe(true)

    let landing = -1
    for (let extra = 4; extra <= 8 && landing < 0; extra += 1) {
      const route = greedyWalk(puzzle, walk[head], walk[head + extra])
      if (route && route.every((cell, index) => cell === walk[head + index])) landing = extra
    }
    expect(landing, 'greedy walk must follow the prepared route').toBeGreaterThan(0)

    tap(view, puzzle, walk[head + landing])
    expect(readout(view)).toContain(`${puzzle.budget} / ${puzzle.budget} 步`)
    expect(pathCells(view)).toBe(puzzle.budget + 1)

    const clamped = walk.slice(0, puzzle.budget + 1)
    fireEvent.click(view.getByText('收笔'))
    if (validatePath(puzzle, clamped) === 'ok') {
      expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
      expect(view.container.querySelector('.cy-game')?.className).toContain('is-won')
    } else {
      expect(view.container.querySelector('.cy-rule')?.textContent).toContain('护盾 2')
      expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    }
  })

  it('backtracks automatically when a drag passes over the last visited cell', () => {
    const puzzle = generateCloudPuzzle(1)
    const { view } = renderGame(1)
    mockBoard(view, puzzle)
    const walk = longWalk(puzzle, 6)
    tap(view, puzzle, walk[1])
    tap(view, puzzle, walk[2])
    expect(readout(view)).toContain(`2 / ${puzzle.budget} 步`)
    expect(pathCells(view)).toBe(3)

    dragOver(view, puzzle, walk[2], walk[1])
    expect(readout(view)).toContain(`1 / ${puzzle.budget} 步`)
    expect(pathCells(view)).toBe(2)

    tap(view, puzzle, walk[2])
    expect(readout(view)).toContain(`2 / ${puzzle.budget} 步`)
    expect(pathCells(view)).toBe(3)
  })

  it('hides fog anchors after the reveal window but keeps them visible while paused', () => {
    vi.useFakeTimers()
    const fog = generateCloudPuzzle(27)
    expect(fog.fog).toBe(true)

    const { view } = renderGame(27)
    const root = view.container.querySelector('.cy-game') as HTMLDivElement
    expect(root.className).toContain('is-fog')
    expect(root.className).not.toContain('is-veiled')
    act(() => { vi.advanceTimersByTime(REVEAL_MS) })
    expect(root.className).toContain('is-veiled')

    const held = renderGame(27, true)
    const frozen = held.view.container.querySelector('.cy-game') as HTMLDivElement
    act(() => { vi.advanceTimersByTime(REVEAL_MS + 1000) })
    expect(frozen.className).toContain('is-fog')
    expect(frozen.className).not.toContain('is-veiled')
  })
})
