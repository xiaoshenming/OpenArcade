import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import ConstellationLinkGame from './Game'
import { degreesFor, scoreFor } from './logic'
import { createConstellationPuzzle, type ConstellationPuzzle } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<ConstellationLinkGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const starAt = (view: ReturnType<typeof render>, cell: number) => view.container.querySelector(`[data-cell="${cell}"]`) as HTMLElement

const connect = (view: ReturnType<typeof render>, a: number, b: number) => {
  const selected = view.container.querySelector('.constellation-star.is-selected') as HTMLElement | null
  if (selected) fireEvent.click(selected)
  fireEvent.click(starAt(view, a))
  fireEvent.click(starAt(view, b))
}

const completedCalls = (emit: ReturnType<typeof vi.fn>) => emit.mock.calls.filter((call: unknown[]) => (call[0] as GameEvent).type === 'completed')

const overDegreeStar = (level: number) => {
  const puzzle = createConstellationPuzzle(level)
  for (let slot = 0; slot < puzzle.sky.stars.length; slot += 1) {
    const cell = puzzle.sky.stars[slot]
    const incident = puzzle.sky.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => edge.a === cell || edge.b === cell)
    if (incident.length > puzzle.clues[slot]) return { puzzle, cell, clue: puzzle.clues[slot], incident }
  }
  throw new Error(`level ${level} has no over-degree star`)
}

const fillToClue = (view: ReturnType<typeof render>, puzzle: ConstellationPuzzle, cell: number, clue: number, incident: { index: number }[]) => {
  const degrees = degreesFor(puzzle.sky, [])
  const slot = puzzle.sky.stars.indexOf(cell)
  for (const { index } of incident) {
    if (degrees[slot] >= clue) break
    const { a, b } = puzzle.sky.edges[index]
    const slotA = puzzle.sky.stars.indexOf(a)
    const slotB = puzzle.sky.stars.indexOf(b)
    if (degrees[slotA] >= puzzle.clues[slotA] || degrees[slotB] >= puzzle.clues[slotB]) continue
    connect(view, a, b)
    degrees[slotA] += 1
    degrees[slotB] += 1
  }
  expect(degrees[slot]).toBe(clue)
}

describe('constellation link game', () => {
  it('mounts, connects the unique solution and reports completion', () => {
    const puzzle = createConstellationPuzzle(1)
    const { view, emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(view.container.querySelectorAll('.constellation-star')).toHaveLength(puzzle.sky.stars.length)
    for (const edge of puzzle.solution) {
      const { a, b } = puzzle.sky.edges[edge]
      connect(view, a, b)
    }
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: 1000 })
    expect(completedCalls(emit)).toHaveLength(1)
    expect(view.container.querySelector('.constellation-stamp.is-won')).not.toBeNull()
    const { a, b } = puzzle.sky.edges[puzzle.solution[0]]
    connect(view, a, b)
    expect(completedCalls(emit)).toHaveLength(1)
  })

  it('freezes input while paused', () => {
    const { view, emit } = renderGame(1, true)
    const star = starAt(view, createConstellationPuzzle(1).sky.stars[0])
    expect(star.hasAttribute('disabled')).toBe(true)
    fireEvent.click(star)
    expect(view.container.querySelector('.is-selected')).toBeNull()
    expect(emit).not.toHaveBeenCalledWith({ type: 'score', score: expect.anything() })
  })

  it('counts a mistake when linking into a saturated star and keeps going', () => {
    const { puzzle, cell, clue, incident } = overDegreeStar(1)
    const { view, emit } = renderGame(1)
    fillToClue(view, puzzle, cell, clue, incident)
    const scoreEvents = () => emit.mock.calls.filter((call: unknown[]) => (call[0] as GameEvent).type === 'score')
    const before = scoreEvents().length
    const { a: x, b: y } = puzzle.sky.edges[incident[incident.length - 1].index]
    connect(view, x, y)
    expect(view.container.querySelector('.constellation-live')?.textContent).toContain('失误 1')
    expect(scoreEvents()).toHaveLength(before + 1)
    const lastScore = (scoreEvents()[before][0] as { score: number }).score
    expect(lastScore).toBe(scoreFor(clue, 1, puzzle.par))
    expect(emit).not.toHaveBeenCalledWith({ type: 'failed', score: expect.anything() })
    expect(view.container.querySelector('.constellation-stamp')).toBeNull()
  })

  it('points the saturated hint at the selected star instead of the clicked target', () => {
    const { puzzle, cell, clue, incident } = overDegreeStar(1)
    const { view } = renderGame(1)
    fillToClue(view, puzzle, cell, clue, incident)
    const stale = view.container.querySelector('.constellation-star.is-selected') as HTMLElement | null
    if (stale) fireEvent.click(stale)
    expect(view.container.querySelector('.constellation-star.is-selected')).toBeNull()
    fireEvent.click(starAt(view, cell))
    const { a, b } = puzzle.sky.edges[incident[incident.length - 1].index]
    const target = a === cell ? b : a
    fireEvent.click(starAt(view, target))
    const announce = view.container.querySelector('.constellation-live')?.textContent ?? ''
    expect(announce).toContain('这颗星连线已满')
    expect(announce).toContain('失误 1')
    expect(announce).not.toContain(`第${Math.floor(target / puzzle.sky.cols) + 1}行第${(target % puzzle.sky.cols) + 1}列`)
    const selected = view.container.querySelector('.constellation-star.is-selected') as HTMLElement
    expect(selected.dataset.cell).toBe(String(cell))
  })

  it('fails the level after three saturated mistakes in the boundary chapter', () => {
    const { puzzle, cell, clue, incident } = overDegreeStar(23)
    const { view, emit } = renderGame(23)
    fillToClue(view, puzzle, cell, clue, incident)
    const { a: p, b: q } = puzzle.sky.edges[incident[incident.length - 1].index]
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(starAt(view, p))
      fireEvent.click(starAt(view, q))
      if (attempt < 2) fireEvent.click(starAt(view, q))
    }
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.anything() })
    expect(view.container.querySelector('.constellation-stamp.is-lost')).not.toBeNull()
  })

  it('fails the level once the link budget is exhausted in the budget chapter', () => {
    const puzzle = createConstellationPuzzle(34)
    const { view, emit } = renderGame(34)
    expect(puzzle.budget).toBeDefined()
    const spare = puzzle.sky.edges.find((_, index) => !puzzle.solution.includes(index))
    expect(spare).toBeDefined()
    const { a, b } = spare as { a: number; b: number }
    const failedCalls = () => emit.mock.calls.filter((call: unknown[]) => (call[0] as GameEvent).type === 'failed')
    for (let cycle = 0; cycle < (puzzle.budget as number) + 2 && !failedCalls().length; cycle += 1) {
      connect(view, a, b)
      if (failedCalls().length) break
      fireEvent.click(starAt(view, a))
    }
    expect(failedCalls()).toHaveLength(1)
    expect(view.container.querySelector('.constellation-stamp.is-lost')).not.toBeNull()
    expect(view.container.querySelector('.constellation-stamp')?.textContent).toContain('预算耗尽')
  })

  it('restarts the board from the restart button', () => {
    const puzzle = createConstellationPuzzle(1)
    const { view } = renderGame(1)
    const { a, b } = puzzle.sky.edges[puzzle.solution[0]]
    connect(view, a, b)
    expect(view.container.querySelector('.constellation-tie')).not.toBeNull()
    fireEvent.click(view.container.querySelector('.constellation-restart') as HTMLElement)
    expect(view.container.querySelector('.constellation-tie')).toBeNull()
    expect(view.container.querySelector('.constellation-readout')?.textContent).toContain('0/')
  })
})
