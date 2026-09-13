import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import NurikabeSeaGame from './Game'
import { generateSeaPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<NurikabeSeaGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const cellAt = (view: ReturnType<typeof render>, cell: number) =>
  (view.container.querySelectorAll('.nb-cell')[cell] as HTMLElement)

describe('nurikabe sea interactions', () => {
  it('announces ready and started on mount', () => {
    const { emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(emit.mock.calls.some(([event]) => event.type === 'completed' || event.type === 'failed')).toBe(false)
  })

  it('floods a cell into sea and reports the score', () => {
    const puzzle = generateSeaPuzzle(1)
    const { emit, view } = renderGame(1)
    const cell = puzzle.solution.findIndex((flag, at) => flag && !puzzle.given[at] && !puzzle.clues.some((clue) => clue.cell === at))
    expect(cell).toBeGreaterThanOrEqual(0)
    expect(cellAt(view, cell).className).toContain('is-land')
    fireEvent.click(cellAt(view, cell))
    expect(cellAt(view, cell).className).toContain('is-sea')
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'score' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'completed')).toBe(false)
  })

  it('completes the sea chart when every solution cell is flooded', () => {
    const puzzle = generateSeaPuzzle(1)
    const { emit, view } = renderGame(1)
    puzzle.solution.forEach((flag, cell) => {
      if (!flag || puzzle.given[cell]) return
      fireEvent.click(cellAt(view, cell))
    })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'completed' }))
    expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(false)
    expect(view.container.querySelector('.nb-banner.is-gold')?.textContent).toContain('海墓落成')
  })

  it('freezes painting and actions while paused', () => {
    const puzzle = generateSeaPuzzle(1)
    const { view } = renderGame(1, true)
    const cell = puzzle.solution.findIndex((flag, at) => flag && !puzzle.given[at])
    expect((view.getByText('验证海图').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByText('重开本关').closest('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(cellAt(view, cell))
    expect(cellAt(view, cell).className).toContain('is-land')
    expect(cellAt(view, cell).className).not.toContain('is-sea')
  })
})
