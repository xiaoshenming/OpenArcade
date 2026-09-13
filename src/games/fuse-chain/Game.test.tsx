import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import FuseChainGame from './Game'
import { createFusePuzzle } from './levels'
import { failedScore, scoreFor, simulateChain } from './logic'

afterEach(cleanup)

interface EmitMock {
  mock: { calls: [GameEvent][] }
}

const cellAria = (level: number, cell: number) => {
  const puzzle = createFusePuzzle(level)
  const row = Math.floor(cell / puzzle.spec.cols) + 1
  const col = (cell % puzzle.spec.cols) + 1
  return new RegExp(`第${row}行第${col}列`)
}

const readout = (view: ReturnType<typeof render>) => view.container.querySelector('.fuse-readout')?.textContent ?? ''

const eventScore = (emit: EmitMock, type: 'completed' | 'failed') => {
  const event = emit.mock.calls.map(([emitted]) => emitted).find((emitted) => emitted.type === type)
  return event && 'score' in event ? event.score : -1
}

describe('fuse chain session', () => {
  it('announces mount and stays frozen while paused', () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const view = render(<FuseChainGame sessionKey={1} paused muted={false} emit={emit} level={12} />)
    expect(emit.mock.calls.some(([event]) => event.type === 'ready')).toBe(true)
    expect(emit.mock.calls.some(([event]) => event.type === 'started')).toBe(true)
    const puzzle = createFusePuzzle(12)
    const bomb = puzzle.bombs.findIndex((armed) => armed)
    fireEvent.click(view.getByRole('button', { name: cellAria(12, bomb) }))
    expect(readout(view)).toContain('0 次起爆')
    expect(view.container.querySelector('.fuse-live')?.textContent).toBe('')
    expect(emit.mock.calls.filter(([event]) => event.type === 'score')).toHaveLength(0)
  })

  it('refuses locked bombs without spending a detonation', () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const puzzle = createFusePuzzle(34)
    const lock = puzzle.locked.findIndex((isLocked) => isLocked)
    const view = render(<FuseChainGame sessionKey={1} paused={false} muted emit={emit} level={34} />)
    fireEvent.click(view.getByRole('button', { name: cellAria(34, lock) }))
    expect(readout(view)).toContain('0 次起爆')
    expect(view.getByRole('button', { name: cellAria(34, lock) }).className).toContain('is-locked')
    expect(view.container.querySelector('.fuse-live')?.textContent).toContain('锁定')
    expect(emit.mock.calls.filter(([event]) => event.type === 'score')).toHaveLength(0)
  })

  it('chains the witness clicks into a full clear and completes the level', async () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const puzzle = createFusePuzzle(12)
    const view = render(<FuseChainGame sessionKey={1} paused={false} muted={false} emit={emit} level={12} />)
    for (let step = 0; step < puzzle.solution.length; step += 1) {
      const cell = puzzle.solution[step]
      await waitFor(() => {
        fireEvent.click(view.getByRole('button', { name: cellAria(12, cell) }))
        expect(readout(view)).toContain(`${step + 1} 次起爆`)
      }, { timeout: 3000 })
    }
    await waitFor(() => expect(eventScore(emit, 'completed')).toBe(scoreFor(puzzle.solution.length, 3)))
    expect(view.container.querySelector('.fuse-stamp')?.textContent).toContain('连锁全清')
    expect(view.container.querySelector('.fuse-lives')?.getAttribute('aria-label')).toBe('剩余 3 条命')
  })

  it('drains one life per exhausted budget, restores the field, then fails on the third', () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const puzzle = createFusePuzzle(23)
    const budget = puzzle.budget ?? 0
    const blanks = puzzle.bombs.map((_, cell) => cell)
      .filter((cell) => !puzzle.locked[cell] && simulateChain(puzzle.bombs, puzzle.locked, puzzle.spec.cols, puzzle.spec.rows, cell).cleared.length === 0)
    expect(blanks.length).toBeGreaterThan(0)
    const blast = puzzle.solution[0]
    const view = render(<FuseChainGame sessionKey={1} paused={false} muted={false} emit={emit} level={23} />)
    for (let life = 3; life >= 1; life -= 1) {
      for (let step = 0; step < budget - 1; step += 1) fireEvent.click(view.getByRole('button', { name: cellAria(23, blanks[0]) }))
      fireEvent.click(view.getByRole('button', { name: cellAria(23, blast) }))
      if (life > 1) {
        expect(view.container.querySelector('.fuse-lives')?.getAttribute('aria-label')).toBe(`剩余 ${life - 1} 条命`)
        expect(view.container.querySelectorAll('.fuse-cell.is-armed')).toHaveLength(puzzle.spec.bombs)
        expect(readout(view)).toContain(`0 / ${budget} 次起爆`)
        expect(view.container.querySelector('.fuse-stamp')).toBeNull()
      }
    }
    expect(eventScore(emit, 'failed')).toBe(failedScore(budget * 3))
    expect(emit.mock.calls.some(([event]) => event.type === 'completed')).toBe(false)
    expect(view.container.querySelector('.fuse-stamp')?.textContent).toContain('引信耗尽')
  })

  it('restarts the level from the button mid-chain', () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const puzzle = createFusePuzzle(12)
    const cell = puzzle.solution[0]
    const view = render(<FuseChainGame sessionKey={1} paused={false} muted emit={emit} level={12} />)
    fireEvent.click(view.getByRole('button', { name: cellAria(12, cell) }))
    expect(readout(view)).toContain('1 次起爆')
    fireEvent.click(view.getByRole('button', { name: '重开本关' }))
    expect(readout(view)).toContain('0 次起爆')
    expect(view.container.querySelectorAll('.fuse-cell.is-armed')).toHaveLength(puzzle.spec.bombs)
    expect(view.container.querySelector('.fuse-stamp')).toBeNull()
  })
})
