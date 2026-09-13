import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { createCasketPuzzle } from './levels'
import CalcCasketGame from './Game'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<CalcCasketGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  const digitButtons = [...view.container.querySelectorAll('.casket-digits .casket-key')] as HTMLButtonElement[]
  const digitOf = (digit: number) => digitButtons[digit - 1]
  return { emit, view, digitOf }
}

const cellAt = (view: ReturnType<typeof render>, index: number) =>
  view.container.querySelectorAll('.casket-cell')[index] as HTMLButtonElement

const fillCell = (view: ReturnType<typeof render>, digitOf: (digit: number) => HTMLButtonElement, index: number, digit: number) => {
  fireEvent.click(cellAt(view, index))
  fireEvent.click(digit > 0 ? digitOf(digit) : view.getByText('擦除').closest('button') as HTMLButtonElement)
}

describe('calc casket game', () => {
  it('announces readiness, renders the board and fills digits by click', () => {
    const { emit, view, digitOf } = renderGame(1)
    expect(emit).toHaveBeenNthCalledWith(1, { type: 'ready' })
    expect(emit).toHaveBeenNthCalledWith(2, { type: 'started' })
    expect(view.container.querySelectorAll('.casket-cell')).toHaveLength(16)
    expect(view.container.querySelectorAll('.casket-clue').length).toBeGreaterThan(0)
    fillCell(view, digitOf, 0, 2)
    expect(cellAt(view, 0).className).toContain('is-filled')
    expect(cellAt(view, 0).textContent).toContain('2')
    expect(view.container.querySelector('.casket-live')?.textContent).toContain('第1行第1列填入 2')
    fireEvent.click(view.getByText('擦除').closest('button') as HTMLButtonElement)
    expect(cellAt(view, 0).className).not.toContain('is-filled')
    expect(view.container.querySelector('.casket-live')?.textContent).toContain('已擦除')
  })

  it('flags row conflicts as mistakes and announces the clash', () => {
    const { view, digitOf } = renderGame(1)
    fillCell(view, digitOf, 0, 3)
    fillCell(view, digitOf, 1, 3)
    expect(cellAt(view, 1).className).toContain('is-bad')
    expect(view.container.querySelector('.casket-live')?.textContent).toContain('与笼或行列冲突')
  })

  it('completes the casket when the full solution is entered', () => {
    const puzzle = createCasketPuzzle(1)
    const { emit, view, digitOf } = renderGame(1)
    puzzle.solution.forEach((value, index) => fillCell(view, digitOf, index, value))
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.container.querySelector('.casket-banner.is-complete')?.textContent).toContain('迷匣开启')
  }, 20000)

  it('fails after the third mistake on budget chapters and freezes input', () => {
    const { emit, view, digitOf } = renderGame(34)
    for (const index of [0, 1, 2, 3]) fillCell(view, digitOf, index, 1)
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.any(Number) })
    expect(view.container.querySelector('.casket-banner.is-failed')?.textContent).toContain('迷匣封死')
    expect(digitOf(1).disabled).toBe(true)
    const restart = view.getByText('重开').closest('button') as HTMLButtonElement
    expect(restart.disabled).toBe(true)
  }, 20000)

  it('freezes selection and digits while paused', () => {
    const { view, digitOf } = renderGame(1, true)
    expect(digitOf(2).disabled).toBe(true)
    expect((view.getByText('擦除').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cellAt(view, 3))
    expect(cellAt(view, 3).className).not.toContain('is-selected')
    fireEvent.keyDown(view.container.querySelector('.casket-game') as HTMLElement, { key: '2' })
    expect(cellAt(view, 3).className).not.toContain('is-filled')
  })
})
