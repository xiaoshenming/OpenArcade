import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import SuguruPeakGame from './Game'
import { createPeakPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<SuguruPeakGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const cellAt = (view: ReturnType<typeof render>, index: number) =>
  (view.container.querySelectorAll('.peak-cell')[index] as HTMLElement)

const keyAt = (view: ReturnType<typeof render>, digit: number) => {
  const key = [...view.container.querySelectorAll('.peak-digits .peak-key')].find((node) => node.textContent === String(digit))
  if (!key) throw new Error(`missing digit key ${digit}`)
  return key as HTMLElement
}

const fillSolution = (view: ReturnType<typeof render>, puzzle: ReturnType<typeof createPeakPuzzle>) => {
  puzzle.givens.forEach((given, index) => {
    if (given) return
    fireEvent.click(cellAt(view, index))
    fireEvent.click(keyAt(view, puzzle.solution[index]))
  })
}

describe('suguru peak interactions', () => {
  it('announces ready and started on mount', () => {
    const { emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(emit.mock.calls.some(([event]) => event.type === 'completed' || event.type === 'failed')).toBe(false)
  })

  it('fills a hole with the keypad and reports the rising score', () => {
    const { ctx, givens, solution } = createPeakPuzzle(1)
    const { emit, view } = renderGame(1)
    const index = givens.findIndex((given) => !given)
    expect(index).toBeGreaterThanOrEqual(0)
    fireEvent.click(cellAt(view, index))
    expect(cellAt(view, index).className).toContain('is-selected')
    fireEvent.click(keyAt(view, solution[index]))
    expect(cellAt(view, index).className).toContain('is-entry')
    expect(cellAt(view, index).textContent).toBe(String(solution[index]))
    expect(emit).toHaveBeenCalledWith({ type: 'score', score: 1000 })
    expect(ctx.regionOf[index]).toBeGreaterThanOrEqual(0)
  })

  it('counts wrong digits as mistakes without failing chapter one', () => {
    const { givens, solution } = createPeakPuzzle(1)
    const { emit, view } = renderGame(1)
    const index = givens.findIndex((given) => !given)
    const wrong = solution[index] === 1 ? 2 : 1
    fireEvent.click(cellAt(view, index))
    fireEvent.click(keyAt(view, wrong))
    expect(cellAt(view, index).className).toContain('is-wrong')
    expect(emit).toHaveBeenCalledWith({ type: 'score', score: 940 })
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.peak-live')?.textContent).toContain('冲突')
  })

  it('completes the climb when every hole matches the solution', () => {
    const puzzle = createPeakPuzzle(1)
    const { emit, view } = renderGame(1)
    fillSolution(view, puzzle)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.peak-banner.is-complete')?.textContent).toContain('峰块贯通')
  })

  it('freezes input and keypad while paused', () => {
    const { givens, solution } = createPeakPuzzle(1)
    const { view } = renderGame(1, true)
    const index = givens.findIndex((given) => !given)
    expect((keyAt(view, solution[index]) as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cellAt(view, index))
    fireEvent.click(keyAt(view, solution[index]))
    expect(cellAt(view, index).textContent).toBe('')
    expect(cellAt(view, index).className).not.toContain('is-selected')
  })
})
