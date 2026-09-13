import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import StarChefGame from './Game'
import { scoreFor } from './logic'
import { createChefLevel } from './levels'

afterEach(cleanup)

const renderGame = (level: number, paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<StarChefGame sessionKey={1} paused={paused} muted emit={emit} level={level} />)
  return { emit, view }
}

const shelfButton = (view: ReturnType<typeof render>, level: number, id: number) => {
  const shelf = createChefLevel(level).shelf
  const index = shelf.findIndex((item) => item.id === id)
  expect(index, `shelf item ${id} missing`).toBeGreaterThanOrEqual(0)
  return view.getAllByRole('option')[index] as HTMLElement
}

const addIngredients = (view: ReturnType<typeof render>, level: number, ids: readonly number[]) => {
  for (const id of ids) fireEvent.click(shelfButton(view, level, id))
}

const eventsOf = (emit: ReturnType<typeof vi.fn>, type: GameEvent['type']) =>
  emit.mock.calls.filter((call: unknown[]) => (call[0] as GameEvent).type === type)

describe('star chef game', () => {
  it('mounts with ready/started and scores the first added ingredient', () => {
    const level = createChefLevel(1)
    const { view, emit } = renderGame(1)
    expect(emit).toHaveBeenCalledWith({ type: 'ready' })
    expect(emit).toHaveBeenCalledWith({ type: 'started' })
    expect(view.container.querySelector('.chef-board')).not.toBeNull()
    addIngredients(view, 1, [level.dishes[0].solution[0] as number])
    const button = shelfButton(view, 1, level.dishes[0].solution[0] as number)
    expect(button.className).toContain('is-picked')
    expect(emit).toHaveBeenCalledWith({ type: 'score', score: scoreFor(1, 2, 0) })
    expect(eventsOf(emit, 'failed')).toHaveLength(0)
  })

  it('disables the whole kitchen while paused and ignores clicks', () => {
    const level = createChefLevel(1)
    const { view, emit } = renderGame(1, true)
    expect(view.container.textContent).toContain('0 / 10 步')
    for (const option of view.getAllByRole('option')) {
      expect(option.hasAttribute('disabled')).toBe(true)
      fireEvent.click(option)
    }
    for (const selector of ['.chef-serve', '.chef-clear', '.chef-restart']) {
      expect((view.container.querySelector(selector) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(view.container.querySelector(selector) as HTMLElement)
    }
    expect(view.container.textContent).toContain('0 / 10 步')
    addIngredients(view, 1, level.dishes[0].solution)
    expect(view.container.textContent).toContain('0 / 10 步')
    expect(eventsOf(emit, 'score')).toHaveLength(0)
    expect(eventsOf(emit, 'completed')).toHaveLength(0)
  })

  it('charges a life per wrong serve and fails after three mistakes', () => {
    const level = createChefLevel(1)
    const { view, emit } = renderGame(1)
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      fireEvent.click(view.container.querySelector('.chef-serve') as HTMLElement)
      expect(view.container.textContent).toContain(`命 ${3 - attempt}/3`)
    }
    expect(eventsOf(emit, 'failed')).toHaveLength(1)
    expect(view.container.querySelector('.chef-banner.is-lose')).not.toBeNull()
    expect((view.container.querySelector('.chef-serve') as HTMLButtonElement).disabled).toBe(true)
    addIngredients(view, 1, level.dishes[0].solution)
    expect(view.container.textContent).toContain('0 / 10 步')
  })

  it('switches to the second dish on the dual-seat finale and completes both', () => {
    const level = createChefLevel(45)
    const { view, emit } = renderGame(45)
    addIngredients(view, 45, level.dishes[0].solution)
    fireEvent.click(view.container.querySelector('.chef-serve') as HTMLElement)
    const second = level.dishes[1]
    expect(view.container.textContent).toContain('第 2/2 道')
    expect(view.container.querySelector('.chef-target')?.getAttribute('aria-label')).toBe(
      `菜谱目标 甜${second.target.sweet} 辣${second.target.spicy} 鲜${second.target.umami}`,
    )
    expect(view.container.textContent).toContain('盘中甜0辣0鲜0')
    addIngredients(view, 45, second.solution)
    fireEvent.click(view.container.querySelector('.chef-serve') as HTMLElement)
    expect(view.container.querySelector('.chef-banner.is-win')).not.toBeNull()
    const completed = eventsOf(emit, 'completed')
    expect(completed).toHaveLength(1)
    expect((completed[0][0] as { score: number }).score).toBe(scoreFor(6, 6, 0))
    expect(eventsOf(emit, 'failed')).toHaveLength(0)
  })
})
