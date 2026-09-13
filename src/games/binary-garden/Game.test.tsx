import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import BinaryGardenGame from './Game'
import { conflictCells, UNKNOWN, type GardenPuzzle } from './logic'
import { createGardenPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<BinaryGardenGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const cellAt = (view: ReturnType<typeof render>, index: number) =>
  (view.container.querySelectorAll('.garden-cell')[index] as HTMLElement)

const clicksFor = (value: number) => (value === 1 ? 2 : 1)

interface ConflictPlan {
  index: number
  value: number
  setup: Array<{ index: number; value: number }>
}

const planConflict = (puzzle: GardenPuzzle): ConflictPlan | null => {
  const { givens, size } = puzzle
  const grid = [...givens]
  const holes = givens.map((value, at) => (value === UNKNOWN ? at : -1)).filter((at) => at >= 0)
  const hurts = (index: number, value: number) => {
    grid[index] = value
    const hurt = conflictCells(grid, size).includes(index)
    grid[index] = UNKNOWN
    return hurt
  }
  for (const index of holes) {
    for (const value of [0, 1]) {
      if (hurts(index, value)) return { index, value, setup: [] }
    }
  }
  for (const first of holes) {
    for (const firstValue of [0, 1]) {
      if (hurts(first, firstValue)) continue
      for (const second of holes) {
        if (second === first) continue
        for (const secondValue of [0, 1]) {
          if (!hurts(second, secondValue)) continue
          return { index: second, value: secondValue, setup: [{ index: first, value: firstValue }] }
        }
      }
    }
  }
  return null
}

describe('binary garden interactions', () => {
  it('cycles a hole through empty, zero and one while reporting score', () => {
    const { givens } = createGardenPuzzle(1)
    const { emit, view } = renderGame(1)
    const hole = givens.indexOf(UNKNOWN)
    expect(hole).toBeGreaterThanOrEqual(0)
    const given = cellAt(view, givens.findIndex((value) => value !== UNKNOWN)) as HTMLButtonElement
    expect(given.disabled).toBe(true)
    const cell = cellAt(view, hole)
    expect(cell.textContent).toBe('')
    fireEvent.click(cell)
    expect(cell.textContent).toBe('0')
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'score' }))
    fireEvent.click(cell)
    expect(cell.textContent).toBe('1')
    fireEvent.click(cell)
    expect(cell.textContent).toBe('')
    expect(view.container.querySelector('.garden-cell.is-given')).not.toBeNull()
  })

  it('marks conflicting placements red on chapter one and clears when emptied', () => {
    const plan = planConflict(createGardenPuzzle(1))
    expect(plan).not.toBeNull()
    if (!plan) return
    const { view } = renderGame(1)
    for (const step of plan.setup) {
      const setupCell = cellAt(view, step.index)
      for (let at = 0; at < clicksFor(step.value); at += 1) fireEvent.click(setupCell)
    }
    const cell = cellAt(view, plan.index)
    for (let at = 0; at < clicksFor(plan.value); at += 1) fireEvent.click(cell)
    expect(cell.className).toContain('is-conflict')
    fireEvent.click(cell)
    expect(cell.className).not.toContain('is-conflict')
  })

  it('hides conflict marks under mist while still counting mistakes', () => {
    const plan = planConflict(createGardenPuzzle(45))
    expect(plan).not.toBeNull()
    if (!plan) return
    const { view } = renderGame(45)
    for (const step of plan.setup) {
      const setupCell = cellAt(view, step.index)
      for (let at = 0; at < clicksFor(step.value); at += 1) fireEvent.click(setupCell)
    }
    const cell = cellAt(view, plan.index)
    for (let at = 0; at < clicksFor(plan.value); at += 1) fireEvent.click(cell)
    expect(view.container.querySelector('.garden-cell.is-conflict')).toBeNull()
    expect(view.container.textContent).toMatch(/失误 [1-3]\/3/)
  })

  it('fails the run once mistakes exceed the chapter budget of three', () => {
    const plan = planConflict(createGardenPuzzle(34))
    expect(plan).not.toBeNull()
    if (!plan) return
    const { emit, view } = renderGame(34)
    for (const step of plan.setup) {
      const setupCell = cellAt(view, step.index)
      for (let at = 0; at < clicksFor(step.value); at += 1) fireEvent.click(setupCell)
    }
    const cell = cellAt(view, plan.index)
    for (let round = 0; round < 80; round += 1) {
      if (emit.mock.calls.some(([event]) => event.type === 'failed')) break
      fireEvent.click(cell)
    }
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
    expect(view.container.querySelector('.garden-flash.is-bad')?.textContent).toContain('失误超限')
  })

  it('completes the level when every hole is planted with the unique solution', () => {
    const { givens, solution } = createGardenPuzzle(1)
    const { emit, view } = renderGame(1)
    givens.forEach((given, index) => {
      if (given !== UNKNOWN) return
      const cell = cellAt(view, index)
      if (solution[index] === 1) fireEvent.click(cell)
      fireEvent.click(cell)
    })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.garden-flash')?.textContent).toContain('花园盛开')
  })

  it('opens chapter-two beds with a locked hint line', () => {
    const puzzle = createGardenPuzzle(12)
    expect(puzzle.hint).toBeDefined()
    const { view } = renderGame(12)
    const hintCells = [...view.container.querySelectorAll('.garden-cell.is-hint')]
    expect(hintCells).toHaveLength(puzzle.size)
    for (const cell of hintCells) {
      expect((cell as HTMLButtonElement).disabled).toBe(true)
      expect(cell.textContent).not.toBe('')
    }
    expect(view.container.textContent).toContain('提示线')
  })

  it('freezes all input while paused', () => {
    const { givens } = createGardenPuzzle(1)
    const { view } = renderGame(1, true)
    const cell = cellAt(view, givens.indexOf(UNKNOWN))
    expect(cell.disabled).toBe(true)
    fireEvent.click(cell)
    expect(cell.textContent).toBe('')
    expect((view.getByText('重开本关').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
