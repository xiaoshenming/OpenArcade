import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { WHITE, edgeTotal, loopEdges } from './logic'
import { createSlalomPuzzle } from './levels'
import SlalomLoopGame from './Game'

// 通过覆写圈示构造「非唯一」盘面，验证游戏判定不再依赖存储解
const clueOverride = vi.hoisted(() => ({ clues: null as null | number[] }))
vi.mock('./levels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./levels')>()
  return {
    ...actual,
    createSlalomPuzzle: (level: number) => {
      const puzzle = actual.createSlalomPuzzle(level)
      return clueOverride.clues ? { ...puzzle, clues: clueOverride.clues } : puzzle
    },
  }
})

afterEach(() => {
  cleanup()
  clueOverride.clues = null
})

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<SlalomLoopGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const edgeButton = (view: ReturnType<typeof render>, edge: number, cols: number) => {
  const hCount = (cols - 1) * cols
  const label = edge < hCount
    ? `第${Math.floor(edge / (cols - 1)) + 1}行第${(edge % (cols - 1)) + 1}格右侧连线，空`
    : `第${Math.floor((edge - hCount) / cols) + 1}行第${((edge - hCount) % cols) + 1}格下侧连线，空`
  return view.getByLabelText(label) as HTMLButtonElement
}

describe('slalom loop game', () => {
  it('announces readiness, renders clues and toggles edges by pointer and keyboard', () => {
    const puzzle = createSlalomPuzzle(1)
    const { view, emit } = renderGame(1)
    expect(emit).toHaveBeenNthCalledWith(1, { type: 'ready' })
    expect(emit).toHaveBeenNthCalledWith(2, { type: 'started' })
    expect(view.container.querySelectorAll('.slalom-edge')).toHaveLength(edgeTotal(6, 6))
    expect(view.container.querySelectorAll('.slalom-clue.is-white, .slalom-clue.is-black').length)
      .toBe(puzzle.clues.filter((clue) => clue > 0).length)
    const first = view.container.querySelector('.slalom-edge') as HTMLButtonElement
    fireEvent.pointerDown(first)
    expect(first.className).toContain('is-on')
    fireEvent.keyDown(first, { key: ' ' })
    expect(first.className).not.toContain('is-on')
  })

  it('freezes all input while paused', () => {
    const { view } = renderGame(1, true)
    const edge = view.container.querySelector('.slalom-edge') as HTMLButtonElement
    expect(edge.disabled).toBe(true)
    fireEvent.pointerDown(edge)
    expect(edge.className).not.toContain('is-on')
    expect((view.getByText('重开').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('completes the level when the drawn loop matches the solution', () => {
    const puzzle = createSlalomPuzzle(1)
    const solution = loopEdges(puzzle.solution, puzzle.spec.cols, puzzle.spec.rows)
    const { view, emit } = renderGame(1)
    for (const edge of solution) fireEvent.pointerDown(edgeButton(view, edge, puzzle.spec.cols))
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.container.querySelector('.slalom-banner.is-complete')).not.toBeNull()
    expect(view.container.querySelectorAll('.slalom-edge.is-on:disabled')).toHaveLength(solution.length)
  })

  it('clears illegal loops as mistakes and fails at the third on chapter three', () => {
    const { view, emit } = renderGame(23)
    const wrong = [0, 7, 56, 57]
    for (let round = 0; round < 3; round += 1) {
      for (const edge of wrong) fireEvent.pointerDown(edgeButton(view, edge, 8))
      expect(view.container.querySelector('.slalom-live')?.textContent).toContain('闭环不合规则')
    }
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.any(Number) })
    expect(view.container.querySelector('.slalom-banner.is-failed')).not.toBeNull()
  }, 20000)

  it('completes on any rule-legal loop that covers every clue, not only the stored solution', () => {
    // 清空圈示后，任何合法闭环（格 0/1/7/6 的 2x2 小环，边 0/31/5/30）都应获胜——不再要求与存储解一致
    clueOverride.clues = new Array<number>(36).fill(0)
    const { view, emit } = renderGame(1)
    for (const edge of [0, 31, 5, 30]) fireEvent.pointerDown(edgeButton(view, edge, 6))
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.container.querySelector('.slalom-banner.is-complete')).not.toBeNull()
    expect(view.container.querySelectorAll('.slalom-edge.is-on:disabled')).toHaveLength(4)
  })

  it('still clears closed loops that break a clue rule as mistakes', () => {
    // 白圈要求直行，而 2x2 小环在格 0 处转折 → 违规环路照旧记失误
    const clues = new Array<number>(36).fill(0)
    clues[0] = WHITE
    clueOverride.clues = clues
    const { view, emit } = renderGame(1)
    for (const edge of [0, 31, 5, 30]) fireEvent.pointerDown(edgeButton(view, edge, 6))
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    expect(view.container.querySelector('.slalom-live')?.textContent).toContain('闭环不合规则')
  })
})
