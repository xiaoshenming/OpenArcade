import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import StarSudokuGame from './Game'
import { createSudokuPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<StarSudokuGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const cellAt = (view: ReturnType<typeof render>, index: number) =>
  (view.container.querySelectorAll('.sudoku-cell')[index] as HTMLElement)

const labelOf = (givens: readonly number[], index: number, size: number, value = givens[index]) => {
  const row = Math.floor(index / size) + 1
  const col = (index % size) + 1
  return `第${row}行第${col}列${value ? `：${value}` : '，空'}`
}

describe('star sudoku keyboard controls', () => {
  it('moves the selection with arrow keys and fills digits on a 4x4 board', () => {
    const { givens, solution } = createSudokuPuzzle(1)
    const { view, emit } = renderGame(1)
    expect(view.container.querySelector('.is-selected')).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(view.container.querySelector('.is-selected')?.getAttribute('aria-label')).toBe(labelOf(givens, 0, 4))
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(view.container.querySelector('.is-selected')?.getAttribute('aria-label')).toBe(labelOf(givens, 4, 4))

    const empty = givens.findIndex((value) => value === 0)
    fireEvent.click(cellAt(view, empty))
    fireEvent.keyDown(window, { key: String(solution[empty]) })
    const cell = cellAt(view, empty)
    expect(cell.className).toContain('is-entry')
    expect(cell.textContent).toBe(String(solution[empty]))
    expect(cell.getAttribute('aria-label')).toBe(labelOf(givens, empty, 4, solution[empty]))
    expect(emit).toHaveBeenCalledWith({ type: 'score', score: 1000 })

    fireEvent.keyDown(window, { key: '9' })
    expect(cellAt(view, empty).textContent).toBe(String(solution[empty]))
    expect(view.queryByText('笔记')).toBeNull()
  })

  it('freezes a wrong entry for three seconds with a countdown badge and thaws it afterwards', () => {
    vi.useFakeTimers()
    try {
      const { givens, solution } = createSudokuPuzzle(9)
      const { view } = renderGame(9)
      const empty = givens.findIndex((value) => value === 0)
      const wrong = solution[empty] === 6 ? 1 : solution[empty] + 1
      fireEvent.click(cellAt(view, empty))
      fireEvent.keyDown(window, { key: String(wrong) })

      const frozen = cellAt(view, empty)
      expect(frozen.className).toContain('is-frozen')
      expect(frozen.getAttribute('aria-label')).toBe(`${labelOf(givens, empty, 6, wrong)}，冻结剩 3 秒`)
      expect(view.container.querySelector('.sudoku-freeze')?.textContent).toBe('❄3')
      expect(view.container.querySelector('.sudoku-live')?.textContent).toContain('错误')
      expect(view.container.querySelector('.sudoku-live')?.textContent).toContain('冻结 3 秒')

      fireEvent.keyDown(window, { key: String(solution[empty]) })
      expect(cellAt(view, empty).textContent).toContain(String(wrong))
      expect(cellAt(view, empty).className).toContain('is-frozen')

      act(() => { vi.advanceTimersByTime(1000) })
      expect(view.container.querySelector('.sudoku-freeze')?.textContent).toBe('❄2')
      act(() => { vi.advanceTimersByTime(1000) })
      expect(view.container.querySelector('.sudoku-freeze')?.textContent).toBe('❄1')
      act(() => { vi.advanceTimersByTime(1000) })
      expect(cellAt(view, empty).className).not.toContain('is-frozen')
      expect(view.container.querySelector('.sudoku-freeze')).toBeNull()
      fireEvent.keyDown(window, { key: String(solution[empty]) })
      expect(cellAt(view, empty).textContent).toBe(String(solution[empty]))
      expect(view.container.querySelector('.sudoku-live')?.textContent).toContain('正确')

      expect(view.queryByText('笔记')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  }, 20000)

  it('announces correct fills through the polite live region without freezing on chapter one', () => {
    const { givens, solution } = createSudokuPuzzle(1)
    const { view } = renderGame(1)
    const empty = givens.findIndex((value) => value === 0)
    fireEvent.click(cellAt(view, empty))
    fireEvent.keyDown(window, { key: String(solution[empty]) })
    expect(view.container.querySelector('.sudoku-live')?.textContent).toContain('正确')
    expect(view.container.querySelector('.sudoku-live')?.textContent).not.toContain('冻结')
    const empty2 = givens.findIndex((value, index) => value === 0 && index !== empty)
    fireEvent.click(cellAt(view, empty2))
    fireEvent.keyDown(window, { key: String(solution[empty2] === 4 ? 1 : solution[empty2] + 1) })
    expect(view.container.querySelector('.sudoku-live')?.textContent).toContain('错误')
  })

  it('toggles note mode with N and places pencil notes on a 9x9 board', () => {
    const { givens } = createSudokuPuzzle(21)
    const { view } = renderGame(21)
    const noteButton = () => view.getByText('笔记').closest('button') as HTMLElement

    fireEvent.keyDown(window, { key: 'n' })
    expect(noteButton().className).toContain('is-active')
    const empty = givens.findIndex((value) => value === 0)
    fireEvent.click(cellAt(view, empty))
    fireEvent.keyDown(window, { key: '5' })
    const notes = cellAt(view, empty).querySelectorAll('.sudoku-notes i.on')
    expect(notes).toHaveLength(1)
    expect(notes[0].textContent).toBe('5')
    expect(cellAt(view, empty).className).not.toContain('is-entry')

    fireEvent.keyDown(window, { key: 'N' })
    expect(noteButton().className).not.toContain('is-active')
  }, 20000)

  it('ignores the keyboard while paused and disables the restart button', () => {
    const { view } = renderGame(1, true)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(view.container.querySelector('.is-selected')).toBeNull()
    expect((view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
