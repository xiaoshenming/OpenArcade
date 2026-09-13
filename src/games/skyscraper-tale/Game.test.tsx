import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import SkyscraperTaleGame from './Game'
import { createSkyPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<SkyscraperTaleGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const cellAt = (view: ReturnType<typeof render>, index: number) =>
  (view.container.querySelectorAll('.sky-cell')[index] as HTMLElement)

const keyAt = (view: ReturnType<typeof render>, digit: number) =>
  ([...view.container.querySelectorAll('.sky-digits .sky-key')].find((key) => key.textContent === String(digit)) as HTMLElement)

const eraseAt = (view: ReturnType<typeof render>) =>
  (view.getByText('擦除').closest('button') as HTMLElement)

describe('skyscraper tale interactions', () => {
  it('selects a cell, lights its four clue edges and fills a height from the keypad', () => {
    const { emit, view } = renderGame(1)
    const cell = cellAt(view, 5)
    fireEvent.click(cell)
    expect(cell.className).toContain('is-selected')
    expect(view.container.querySelectorAll('.sky-clue.is-lit')).toHaveLength(4)
    fireEvent.click(keyAt(view, 2))
    expect(cell.textContent).toBe('2')
    expect(cell.className).toContain('is-entry')
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'score' }))
  })

  it('marks duplicate heights red and clears the mark when erased', () => {
    const { view } = renderGame(1)
    fireEvent.click(cellAt(view, 0))
    fireEvent.click(keyAt(view, 3))
    fireEvent.click(cellAt(view, 1))
    fireEvent.click(keyAt(view, 3))
    expect(cellAt(view, 0).className).toContain('is-wrong')
    expect(cellAt(view, 1).className).toContain('is-wrong')
    fireEvent.click(eraseAt(view))
    expect(cellAt(view, 1).className).not.toContain('is-wrong')
    expect(cellAt(view, 0).className).not.toContain('is-wrong')
    expect(cellAt(view, 0).textContent).toBe('3')
  })

  it('fails the run when chapter-four mistakes exceed the budget of three', () => {
    const { emit, view } = renderGame(34)
    fireEvent.click(cellAt(view, 0))
    fireEvent.click(keyAt(view, 1))
    fireEvent.click(cellAt(view, 1))
    for (let round = 0; round < 12 && !emit.mock.calls.some(([event]) => event.type === 'failed'); round += 1) {
      fireEvent.click(keyAt(view, 1))
      if (emit.mock.calls.some(([event]) => event.type === 'failed')) break
      fireEvent.click(eraseAt(view))
    }
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
    expect(view.container.querySelector('.sky-flash.is-bad')?.textContent).toContain('失误超限')
  })

  it('completes the city when the unique solution is fully built', () => {
    const { solution } = createSkyPuzzle(1)
    const { emit, view } = renderGame(1)
    solution.forEach((value, index) => {
      fireEvent.click(cellAt(view, index))
      fireEvent.click(keyAt(view, value))
    })
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: 1000 })
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.sky-flash')?.textContent).toContain('云顶封顶')
  })

  it('stops the run when the summit time limit runs out', () => {
    vi.useFakeTimers()
    try {
      const { emit } = renderGame(45)
      act(() => {
        vi.advanceTimersByTime(641000)
      })
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
    } finally {
      vi.useRealTimers()
    }
  }, 20000)

  it('moves the selection with arrow keys and freezes all input while paused', () => {
    const { view } = renderGame(1)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(cellAt(view, 1).className).toContain('is-selected')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(cellAt(view, 5).className).toContain('is-selected')
    expect(cellAt(view, 1).className).not.toContain('is-selected')
    cleanup()
    const paused = renderGame(1, true)
    expect((cellAt(paused.view, 0) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cellAt(paused.view, 0))
    expect(cellAt(paused.view, 0).textContent).toBe('')
    expect((paused.view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
