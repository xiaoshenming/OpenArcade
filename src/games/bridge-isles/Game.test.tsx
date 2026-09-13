import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import { generateBridgePuzzle, type BridgePuzzle } from './logic'
import BridgeIslesGame from './Game'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<BridgeIslesGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const isleButton = (view: ReturnType<typeof render>, isleId: number) =>
  view.getByLabelText(new RegExp(`^岛屿 ${isleId + 1}：`)) as HTMLButtonElement

const waterButton = (view: ReturnType<typeof render>, cell: number) =>
  view.getByLabelText(new RegExp(`^水面 ${cell + 1}`)) as HTMLButtonElement

// 生成谜面按构造永不交叉（树边不成环、加边前查交叉），水面格只属于一条航道，单击即精准切换
const toggleRun = (view: ReturnType<typeof render>, puzzle: BridgePuzzle, runId: number) => {
  fireEvent.click(waterButton(view, puzzle.runs[runId].cells[0]))
}

// 找一条端点需求为 1 的航道：架 1 座合法，再架第 2 座触发 overfull 失误，可无限重复
const overfullLevel = () => {
  for (let level = 1; level <= 33; level += 1) {
    const puzzle = generateBridgePuzzle(level)
    const id = puzzle.runs.findIndex((run, runIndex) => !puzzle.fixed[runIndex] && (puzzle.isles[run.a].need === 1 || puzzle.isles[run.b].need === 1))
    if (id >= 0) return { level, puzzle, runId: id }
  }
  throw new Error('no overfull-able run available for the failure test')
}

describe('bridge isles game', () => {
  it('announces readiness and renders isles, water and the restart control', () => {
    const puzzle = generateBridgePuzzle(1)
    const { emit, view } = renderGame(1)
    expect(emit).toHaveBeenNthCalledWith(1, { type: 'ready' })
    expect(emit).toHaveBeenNthCalledWith(2, { type: 'started' })
    expect(view.container.querySelectorAll('.bi-isle')).toHaveLength(puzzle.isles.length)
    expect(view.container.querySelectorAll('.bi-water').length).toBeGreaterThan(0)
    expect(view.container.querySelector('.bi-restart')).toBeTruthy()
  })

  it('freezes isles, water and restart while paused', () => {
    const { view } = renderGame(1, true)
    expect(isleButton(view, 0).disabled).toBe(true)
    const water = view.container.querySelector('.bi-water') as HTMLButtonElement
    expect(water.disabled).toBe(true)
    const restart = view.container.querySelector('.bi-restart') as HTMLButtonElement
    expect(restart.disabled).toBe(true)
    fireEvent.click(water)
    expect(view.container.querySelectorAll('.bi-rail')).toHaveLength(0)
    fireEvent.click(isleButton(view, 0))
    expect(isleButton(view, 0).className).not.toContain('is-selected')
  })

  it('bridges runs toward a legal network, scores the ops and completes the archipelago', () => {
    const puzzle: BridgePuzzle = generateBridgePuzzle(1)
    const { emit, view } = renderGame(1)
    puzzle.runs.forEach((_, id) => {
      for (let step = puzzle.fixed[id]; step < puzzle.solution[id]; step += 1) toggleRun(view, puzzle, id)
    })
    expect(emit).toHaveBeenCalledWith({ type: 'score', score: expect.any(Number) })
    expect(emit).toHaveBeenCalledWith({ type: 'completed', score: expect.any(Number) })
    expect(view.container.querySelector('.bi-banner.is-gold')?.textContent).toContain('群岛连为一体')
    puzzle.runs.forEach((_, id) => {
      if (!puzzle.solution[id]) return
      expect(waterButton(view, puzzle.runs[id].cells[0]).getAttribute('aria-label')).toContain(`${puzzle.solution[id]} 座桥`)
    })
  }, 20000)

  it('charges a crew member per overfull bridge and fails after the third mistake', () => {
    const { level, puzzle, runId } = overfullLevel()
    const { emit, view } = renderGame(level)
    const cell = puzzle.runs[runId].cells[0]
    fireEvent.click(waterButton(view, cell))
    expect(waterButton(view, cell).getAttribute('aria-label')).toContain('1 座桥')
    for (let mistake = 1; mistake <= 3; mistake += 1) {
      fireEvent.click(waterButton(view, cell))
      if (mistake < 3) expect(view.container.querySelector('.bi-banner.is-coral')).toBeNull()
    }
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.any(Number) })
    expect(view.container.querySelector('.bi-banner.is-coral')?.textContent).toContain('船员耗尽')
    expect(view.container.querySelector('.bi-legend')?.textContent).toContain('船员耗尽')
  }, 20000)
})
