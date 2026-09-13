import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import KakuroRunGame from './Game'
import { createRunPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<KakuroRunGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

/** 白格按钮按 ctx.whiteCells 的索引顺序渲染。 */
const cellAt = (view: ReturnType<typeof render>, at: number) =>
  (view.container.querySelectorAll('.run-cell')[at] as HTMLElement)

const valueAt = (view: ReturnType<typeof render>, at: number) =>
  (cellAt(view, at).querySelector('span')?.textContent ?? '')

const keyAt = (view: ReturnType<typeof render>, digit: number) => {
  const key = [...view.container.querySelectorAll('.run-digits .run-key')].find((node) => node.textContent === String(digit))
  if (!key) throw new Error(`missing digit key ${digit}`)
  return key as HTMLElement
}

describe('kakuro run interactions', () => {
  it('announces ready and started on mount', () => {
    const { emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(emit.mock.calls.some(([event]) => event.type === 'completed' || event.type === 'failed')).toBe(false)
  })

  it('selects a white cell, fills the correct digit and reports the score', () => {
    const { ctx, givens, solution } = createRunPuzzle(1)
    const { emit, view } = renderGame(1)
    const at = ctx.whiteCells.findIndex((cell) => !givens[cell])
    expect(at).toBeGreaterThanOrEqual(0)
    const digit = solution[ctx.whiteCells[at]]
    fireEvent.click(cellAt(view, at))
    expect(cellAt(view, at).className).toContain('is-selected')
    fireEvent.click(keyAt(view, digit))
    expect(cellAt(view, at).className).toContain('is-entry')
    expect(valueAt(view, at)).toBe(String(digit))
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'score' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'completed')).toBe(false)
  })

  it('counts wrong digits as mistakes and fails once the chapter budget is spent', () => {
    const { ctx, givens, solution } = createRunPuzzle(23)
    const { emit, view } = renderGame(23)
    const at = ctx.whiteCells.findIndex((cell) => !givens[cell])
    const truth = solution[ctx.whiteCells[at]]
    const wrongs = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => digit !== truth)
    fireEvent.click(cellAt(view, at))
    for (let round = 0; round < 3; round += 1) fireEvent.click(keyAt(view, wrongs[round]))
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'completed')).toBe(false)
    expect(view.container.querySelector('.run-banner.is-failed')?.textContent).toContain('失误超限')
  })

  it('completes the run when every white cell matches the solution', () => {
    const { ctx, givens, solution } = createRunPuzzle(1)
    const { emit, view } = renderGame(1)
    ctx.whiteCells.forEach((cell, at) => {
      if (givens[cell]) return
      fireEvent.click(cellAt(view, at))
      fireEvent.click(keyAt(view, solution[cell]))
    })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.run-banner.is-complete')?.textContent).toContain('和径贯通')
  })

  it('freezes input and keypad while paused', () => {
    const { ctx, givens, solution } = createRunPuzzle(1)
    const { view } = renderGame(1, true)
    const at = ctx.whiteCells.findIndex((cell) => !givens[cell])
    const digit = solution[ctx.whiteCells[at]]
    expect((keyAt(view, digit) as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cellAt(view, at))
    fireEvent.click(keyAt(view, digit))
    expect(valueAt(view, at)).toBe('')
    expect(cellAt(view, at).className).not.toContain('is-selected')
  })
})
